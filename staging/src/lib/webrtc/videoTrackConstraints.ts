/**
 * videoTrackConstraints — WebRTC 송출 비디오 트랙의 해상도/프레임레이트 프로파일.
 *
 * - HIGH: 활동 중/딤 해제 상태에서 쓰는 고화질(720p, 24fps ideal / 30 max)
 * - LOW:  딤/idle 상태에서 쓰는 저전력(480p, 10fps ideal / 12 max)
 *
 * applyConstraints 는 기기별/브라우저별로 지원 여부가 다르므로
 * 반드시 존재 여부 가드 + OverconstrainedError fallback 를 거친다.
 */

/** thermal(발열) 프로파일 유형 */
export type ThermalProfile = "HIGH" | "LOW";

/**
 * 프로파일별 MediaTrackConstraints 사양.
 *
 * satisfies 로 "누락된 프로파일이 있으면 컴파일 에러"가 나도록 보강.
 */
export const VIDEO_PROFILES = {
  HIGH: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
  },
  LOW: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 10, max: 12 },
  },
} as const satisfies Record<ThermalProfile, MediaTrackConstraints>;

/** applyVideoTrackProfile 결과 */
export interface ProfileApplyResult {
  /** 최종 적용 성공 여부 (fallback 적용 포함) */
  ok: boolean;
  /** 성공 시 적용된 최종 트랙 설정 */
  appliedSettings?: MediaTrackSettings;
  /** 실패 시 사용자 대면 메시지 또는 내부 진단용 문자열 */
  error?: string;
}

/**
 * 비디오 트랙에 지정 프로파일을 적용한다.
 *
 * 엣지 케이스:
 *   1) 트랙이 이미 ended 상태 → 스킵
 *   2) applyConstraints 미지원 브라우저 → 스킵(ok=false, error 보고)
 *   3) OverconstrainedError → frameRate.max=15 fallback 로 한 번만 재시도
 *
 * @param track  적용 대상 비디오 트랙 (MediaStreamTrack)
 * @param profile HIGH | LOW
 */
export async function applyVideoTrackProfile(
  track: MediaStreamTrack,
  profile: ThermalProfile,
): Promise<ProfileApplyResult> {
  /* 죽은 트랙이면 아무것도 하지 않는다 */
  if (!track || track.readyState === "ended") {
    return { ok: false, error: "track ended or missing" };
  }

  /* applyConstraints 미지원 (구형 WebView 등) */
  if (typeof track.applyConstraints !== "function") {
    return { ok: false, error: "applyConstraints unsupported" };
  }

  const desired = VIDEO_PROFILES[profile];

  try {
    await track.applyConstraints(desired);
    return {
      ok: true,
      appliedSettings: track.getSettings?.() ?? undefined,
    };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : (err as Error)?.name;

    /* Overconstrained → frameRate 만 풀어서 한 번만 재시도 */
    if (name === "OverconstrainedError") {
      try {
        await track.applyConstraints({ frameRate: { max: 15 } });
        return {
          ok: true,
          appliedSettings: track.getSettings?.() ?? undefined,
          error: "applied fallback (frameRate.max=15)",
        };
      } catch (fallbackErr) {
        const fbName =
          fallbackErr instanceof DOMException
            ? fallbackErr.name
            : (fallbackErr as Error)?.name;
        return {
          ok: false,
          error: `fallback failed: ${fbName ?? "unknown"}`,
        };
      }
    }

    return { ok: false, error: name ?? "apply failed" };
  }
}
