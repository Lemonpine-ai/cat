/**
 * ViewerReconnectEngine — WebRTC Viewer 무제한 재연결 엔진.
 * disconnected 유예 → ice_restart → full_reconnect 단계별 복구,
 * getStats keepalive, visibilitychange 복귀 처리를 담당.
 * 상위 컴포넌트는 onAction 콜백으로 실제 동작을 수행한다.
 */

/* 재연결 액션 타입 */
export type ReconnectAction =
  | { type: "ice_restart" }
  | { type: "full_reconnect"; attempt: number; delayMs: number }
  | { type: "connection_recovered" }
  | { type: "keepalive_dead" }
  | { type: "visibility_reconnect" };

/* 설정 */
export type ReconnectConfig = {
  graceMs: number;              // disconnected 유예 (ms)
  maxAutoReconnect: number;     // 무제한 = Infinity
  keepaliveIntervalMs: number;  // getStats 주기 (ms)
  keepaliveTimeoutCount: number; // 연속 stale → dead
};

const DEFAULT_CONFIG: ReconnectConfig = {
  graceMs: 10_000,
  maxAutoReconnect: Infinity,
  keepaliveIntervalMs: 15_000,
  keepaliveTimeoutCount: 2,
};

/* 재연결 백오프 계산 — 시도 횟수에 따라 대기 시간 점진 증가 */
/* 1~3회=3초(빠른 복구), 4~10회=10초(중간), 11회~=30초(네트워크 안정 대기) */
function calcBackoffMs(attempt: number): number {
  if (attempt <= 3) return 3_000;
  if (attempt <= 10) return 10_000;
  return 30_000;
}

export class ViewerReconnectEngine {
  /** 현재 감시 중인 PeerConnection 참조 */
  private pc: RTCPeerConnection | null = null;
  /** 엔진 설정값 (유예 시간, keepalive 주기 등) */
  private config: ReconnectConfig;

  /** 연속 재연결 시도 횟수 — 백오프 계산 + 복구 시 0 초기화 */
  private reconnectAttempt = 0;
  /** disconnected 유예 타이머 — 일시적 끊김은 바로 재연결하지 않음 */
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** full_reconnect 예약 타이머 — 백오프 대기 후 재연결 액션 발행 */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** getStats 주기적 체크 인터벌 — 미디어 수신 여부 감시 */
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  /** 이전 getStats의 bytesReceived — 변화 없으면 stale 판정 */
  private lastBytesReceived = -1;
  /** 연속 stale 횟수 — threshold 도달 시 keepalive_dead 발행 */
  private staleCount = 0;
  /** visibilitychange 이벤트 바인딩 핸들러 — dispose 시 해제 */
  private boundVisibilityHandler: (() => void) | null = null;
  /** 엔진 파괴 여부 — dispose 후 모든 동작 차단 */
  private disposed = false;
  /** 액션 콜백 — 상위 컴포넌트에서 실제 WebRTC 동작(재연결 등) 수행 */
  onAction: ((action: ReconnectAction) => void) | null = null;

  /** 생성자 — 설정 병합 + 탭 전환 이벤트 리스너 등록 */
  constructor(config?: Partial<ReconnectConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.boundVisibilityHandler = this.handleVisibilityEvent.bind(this);
    /* 탭 전환(백그라운드↔포그라운드) 감지 — 복귀 시 연결 상태 확인 */
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.boundVisibilityHandler);
  }

  /** PC 등록 — 연결 직후 호출 */
  attachPeerConnection(pc: RTCPeerConnection): void {
    this.pc = pc;
    this.reconnectAttempt = 0;
    this.clearGraceTimer();
    this.clearReconnectTimer();
  }

  /** connectionState 변경 처리 — 상위 컴포넌트의 onconnectionstatechange에서 호출 */
  handleConnectionStateChange(state: RTCPeerConnectionState): void {
    if (this.disposed) return;
    if (state === "connected") {
      /* 정상 연결 복구 — 모든 대기 타이머 해제 */
      this.clearGraceTimer();
      this.clearReconnectTimer();
      /* 재연결 시도 중이었으면 복구 알림 발행 */
      if (this.reconnectAttempt > 0) this.onAction?.({ type: "connection_recovered" });
      this.reconnectAttempt = 0;
      return;
    }
    if (state === "disconnected") {
      /* 일시적 끊김 — graceMs 유예 후 ice_restart → full_reconnect 단계별 복구 */
      if (!this.graceTimer) {
        this.graceTimer = setTimeout(() => {
          this.graceTimer = null;
          /* 유예 기간 후에도 여전히 disconnected면 ICE 재시작 시도 */
          if (this.pc?.connectionState === "disconnected") {
            this.onAction?.({ type: "ice_restart" });
            this.scheduleFullReconnect();
          }
        }, this.config.graceMs);
      }
      return;
    }
    /* failed — 기존 타이머 취소 후 즉시 full_reconnect 재예약 */
    if (state === "failed") { this.clearGraceTimer(); this.clearReconnectTimer(); this.scheduleFullReconnect(); return; }
    /* closed — 정상 종료이므로 모든 타이머만 정리 */
    if (state === "closed") { this.clearGraceTimer(); this.clearReconnectTimer(); }
  }

  /** keepalive 시작 — connected 후 호출 */
  startKeepalive(): void {
    this.stopKeepalive();
    this.lastBytesReceived = -1;
    this.staleCount = 0;
    this.keepaliveInterval = setInterval(() => void this.checkKeepalive(), this.config.keepaliveIntervalMs);
  }

  /** keepalive 중지 */
  stopKeepalive(): void {
    if (this.keepaliveInterval) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null; }
    this.staleCount = 0;
  }

  /** 리소스 정리 */
  dispose(): void {
    this.disposed = true;
    this.clearGraceTimer();
    this.clearReconnectTimer();
    this.stopKeepalive();
    if (this.boundVisibilityHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
    this.boundVisibilityHandler = null;
    this.pc = null;
    this.onAction = null;
  }

  /* ── private ── */

  /** 전체 재연결 예약 — 백오프 대기 후 full_reconnect 액션 발행 */
  private scheduleFullReconnect(): void {
    if (this.reconnectTimer) return; /* 이미 예약됐으면 중복 방지 */
    this.reconnectAttempt += 1;
    const delayMs = calcBackoffMs(this.reconnectAttempt);
    this.stopKeepalive(); /* 재연결 대기 중엔 keepalive 불필요 */
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.onAction?.({ type: "full_reconnect", attempt: this.reconnectAttempt, delayMs });
    }, delayMs);
  }

  /** getStats로 inbound-rtp bytesReceived 확인 — 미디어 수신 여부 판단 */
  private async checkKeepalive(): Promise<void> {
    if (this.disposed || !this.pc) return;
    /* 백그라운드 탭에서는 getStats가 부정확할 수 있으므로 스킵 */
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const stats = await this.pc.getStats();
      let totalBytes = 0;
      /* inbound-rtp 리포트에서 수신 바이트 합산 */
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && typeof r.bytesReceived === "number") totalBytes += r.bytesReceived;
      });
      /* 바이트 변화 없으면 stale — 연속 threshold 도달 시 dead 판정 */
      if (this.lastBytesReceived >= 0 && totalBytes <= this.lastBytesReceived) {
        this.staleCount += 1;
        if (this.staleCount >= this.config.keepaliveTimeoutCount) { this.stopKeepalive(); this.onAction?.({ type: "keepalive_dead" }); }
      } else {
        this.staleCount = 0;
      }
      this.lastBytesReceived = totalBytes;
    } catch {
      /* getStats 실패 — PC 닫힘 등 예외 상황도 stale로 카운트 */
      this.staleCount += 1;
      if (this.staleCount >= this.config.keepaliveTimeoutCount) { this.stopKeepalive(); this.onAction?.({ type: "keepalive_dead" }); }
    }
  }

  /** visibilitychange 이벤트 핸들러 — visible 복귀 시 연결 상태 확인 후 재연결 판단 */
  private handleVisibilityEvent(): void {
    if (this.disposed || typeof document === "undefined") return;
    const visible = document.visibilityState === "visible";
    if (!visible) return;
    const state = this.pc?.connectionState;
    /* 정상 연결 중이면 keepalive만 즉시 확인 */
    if (state === "connected") { this.staleCount = 0; void this.checkKeepalive(); return; }
    if (!state) return;
    /* disconnected/failed 등 비정상 → 타이머 초기화 후 재연결 요청 */
    this.clearGraceTimer();
    this.clearReconnectTimer();
    this.onAction?.({ type: "visibility_reconnect" });
  }

  private clearGraceTimer(): void {
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
  }
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}
