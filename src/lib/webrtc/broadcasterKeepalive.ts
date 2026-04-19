/**
 * BroadcasterKeepalive — 방송자 측 getStats 기반 송신 Keepalive.
 *
 * 뷰어의 viewerReconnectEngine 에는 inbound-rtp.bytesReceived 로 수신 확인이 있지만,
 * 방송자 측에는 "트래픽이 실제로 나가고 있는가" 를 확인하는 수단이 없다.
 * 네트워크 NAT 타임아웃/이동통신 핸드오버로 pc 는 connected 로 남아있지만
 * 실제 패킷이 빠져나가지 못하는 "좀비 연결" 상태에서 재연결 트리거를 제공.
 *
 * 로직(참조: viewerReconnectEngine.ts):
 *   - 15 초 간격으로 pc.getStats() 호출
 *   - outbound-rtp.bytesSent 총합을 이전 값과 비교
 *   - 2회 연속으로 증가 없으면 onStale 콜백 발행 (상위에서 재연결 트리거)
 *   - 백그라운드 탭(visibility hidden)에서는 getStats 가 부정확해서 skip
 *
 * 사용:
 *   ```
 *   const stop = setupBroadcasterKeepalive(pc, () => restartBroadcast());
 *   // ... pc 가 닫히면:
 *   stop();
 *   ```
 */

export interface BroadcasterKeepaliveOptions {
  /** getStats 호출 주기(ms). 기본 15000. */
  intervalMs?: number;
  /** 몇 번 연속으로 bytesSent 증가 없을 때 stale 판정할지. 기본 2. */
  timeoutCount?: number;
}

/**
 * 방송자 keepalive 설정 — 반환값은 정리 함수.
 *
 * @param pc      감시 대상 PeerConnection (connected 진입 후 호출)
 * @param onStale bytesSent 가 2회 연속 증가하지 않을 때 호출되는 콜백
 *                (상위에서 scheduleAutoReconnect / restartBroadcast 실행)
 */
export function setupBroadcasterKeepalive(
  pc: RTCPeerConnection,
  onStale: () => void,
  options?: BroadcasterKeepaliveOptions,
): () => void {
  const intervalMs = options?.intervalMs ?? 15_000;
  const timeoutCount = options?.timeoutCount ?? 2;

  /** 이전 측정치 — -1 은 "아직 측정 전" */
  let lastBytesSent = -1;
  /** 연속 stale 카운트 — timeoutCount 도달 시 onStale 호출 후 멈춤 */
  let staleCount = 0;
  /** 중복 호출 방지 — onStale 한 번 쏘면 더 이상 감시 안 함 */
  let disposed = false;

  /** 한 번의 getStats 체크 — outbound-rtp 의 bytesSent 총합을 구해 변화 확인 */
  async function checkOnce() {
    if (disposed) return;
    /* 백그라운드 탭에서는 getStats 갱신이 느려 false positive 발생 → 스킵 */
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    /* pc 가 이미 죽었으면 즉시 stale — 상위가 재연결 */
    if (pc.connectionState === "closed" || pc.connectionState === "failed") {
      disposed = true;
      onStale();
      return;
    }

    try {
      const stats = await pc.getStats();
      let totalBytes = 0;
      /** 송신 중인 track 이 1 개 이상 있는지 — 없으면 stale 카운트 스킵 */
      let hasActiveSender = false;
      stats.forEach((r) => {
        if (r.type === "outbound-rtp" && typeof r.bytesSent === "number") {
          totalBytes += r.bytesSent;
        }
        /* track 리포트 — Chromium 기준 remoteSource=false 이고 ended=false 면 로컬 송신 track */
        const tr = r as unknown as { type: string; remoteSource?: boolean; ended?: boolean };
        if (tr.type === "track" && tr.remoteSource === false && tr.ended === false) {
          hasActiveSender = true;
        }
      });

      /* 활성 sender 가 없으면 replaceTrack 직후 등 일시적 상황일 수 있음 — 스킵 */
      if (!hasActiveSender) {
        staleCount = 0;
        lastBytesSent = totalBytes;
        return;
      }

      /* 첫 측정치는 기준선으로만 저장 (비교 대상 없음) */
      if (lastBytesSent < 0) {
        lastBytesSent = totalBytes;
        return;
      }

      /* bytesSent 증가 없으면 stale — 연속 timeoutCount 도달 시 재연결 */
      if (totalBytes <= lastBytesSent) {
        staleCount += 1;
        if (staleCount >= timeoutCount) {
          disposed = true;
          console.warn("[broadcaster] keepalive: bytesSent 동결 감지 → 재연결 트리거");
          onStale();
          return;
        }
      } else {
        staleCount = 0;
      }
      lastBytesSent = totalBytes;
    } catch {
      /* getStats 실패도 stale 로 카운트 — pc 닫힘 등 예외 */
      staleCount += 1;
      if (staleCount >= timeoutCount) {
        disposed = true;
        onStale();
      }
    }
  }

  const timer = setInterval(() => {
    void checkOnce();
  }, intervalMs);

  /** 정리 함수 — pc 종료 시 반드시 호출 */
  return () => {
    disposed = true;
    clearInterval(timer);
  };
}
