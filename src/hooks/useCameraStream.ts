"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 카메라 스트림 획득·전환·정리를 담당하는 훅.
 * getUserMedia 획득, 전/후면 전환, 트랙 정리, NotReadable 재시도를 캡슐화.
 */

/* ─── 유틸 ─── */

/** ms 만큼 대기하는 프로미스 */
function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** getUserMedia 에러 → 사용자 안내 메시지 변환 */
function mapGetUserMediaErrorToUserMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : (err as Error)?.name;
  if (name === "NotAllowedError") {
    return "카메라 권한이 거부됐어요. 브라우저 주소창 옆 자물쇠 아이콘을 눌러 허용해 주세요.";
  }
  if (name === "NotFoundError") {
    return "카메라 장치를 찾을 수 없어요.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return (
      "카메라가 다른 앱·브라우저 탭에서 사용 중이에요. " +
      "다른 탭의 다보냥/카메라를 닫거나, 인스타·줌 등 카메라를 끈 뒤 잠시 후 다시 눌러 주세요."
    );
  }
  if (name === "OverconstrainedError") {
    return "요청한 카메라 설정을 만족할 수 없어요. 잠시 후 다시 시도해 주세요.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "카메라를 시작할 수 없어요.";
}

/** DOMException / Error 에서 name 추출 */
function mediaErrorName(err: unknown): string {
  if (err instanceof DOMException) return err.name;
  if (err instanceof Error) return err.name;
  return "";
}

/* ─── 훅 본체 ─── */

interface UseCameraStreamOptions {
  /** 초기 카메라 방향 — 기본값 "environment" (후면, 화소·광각 우위) */
  initialFacingMode?: "environment" | "user";
}

export function useCameraStream(
  options?: UseCameraStreamOptions,
) {
  const initialFacing = options?.initialFacingMode ?? "environment";

  /* 상태 */
  const [facingMode, setFacingMode] = useState<"environment" | "user">(initialFacing);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /* Refs */
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  /** 동시 getUserMedia 호출 방지 플래그 */
  const acquireInFlightRef = useRef(false);

  /* ── 내부 헬퍼 ── */

  /** 이전 미리보기/방송 트랙을 모두 stop — NotReadableError 방지 */
  const stopLocalPreviewTracksAndClearVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  /** NotReadableError 시 한 번 재시도하는 getUserMedia 래퍼 */
  async function getUserMediaWithNotReadableRetry(
    constraints: MediaStreamConstraints,
  ): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = mediaErrorName(err);
      if (name === "NotReadableError" || name === "TrackStartError") {
        stopLocalPreviewTracksAndClearVideo();
        await delayMs(280);
        return navigator.mediaDevices.getUserMedia(constraints);
      }
      throw err;
    }
  }

  /* ── 공개 API ── */

  /**
   * 카메라 스트림 획득 — 4-tier fallback.
   *
   * S9 등 레거시 Chromium(WebView 59~70) 에서는 `ideal` 해상도 제약도 exact 처럼
   * 해석하여 검은 화면/트랙 ended 상태를 반환하는 사례가 있다.
   * → 느슨한 제약으로 한 단계씩 내려가며 "살아있는" 비디오 트랙을 확보한다.
   *
   *   tier 1: 후면 + 1280x720 + 오디오
   *   tier 2: 후면만 (해상도 제거)
   *   tier 3: video:true 만 (오디오 격리 — 오디오 충돌 회피)
   *   tier 4: video+audio (최후의 보루)
   *
   * 각 tier 는 getUserMedia 실패 또는 `getVideoTracks()[0].readyState === "ended"`
   * 인 경우 다음 tier 로 넘어간다.
   */
  const acquireCamera = useCallback(async () => {
    if (acquireInFlightRef.current) return;
    acquireInFlightRef.current = true;
    setIsAcquiring(true);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("이 브라우저는 카메라를 지원하지 않아요.");
      setIsAcquiring(false);
      acquireInFlightRef.current = false;
      return;
    }

    stopLocalPreviewTracksAndClearVideo();
    await delayMs(120);

    /* 4-tier constraints — 위에서부터 시도, ended 트랙이면 다음 tier 로 */
    const tiers: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      },
      { video: { facingMode: { ideal: facingMode } }, audio: true },
      { video: true, audio: false },
      { video: true, audio: true },
    ];

    /** 한 tier 시도 — 성공 + 비디오 트랙 live 여야 반환, 아니면 정리 후 null */
    /* [s9-cam 진단] tierIndex 인자를 받아 tier 번호를 로그에 포함 */
    async function tryTier(c: MediaStreamConstraints, tierIndex: number): Promise<MediaStream | null> {
      /* [s9-cam 진단] tier 진입 시 constraints 기록 */
      console.info("[s9-cam] tier=" + tierIndex + " attempting constraints=", JSON.stringify(c));
      try {
        const s = await getUserMediaWithNotReadableRetry(c);
        const videoTrack = s.getVideoTracks()[0];
        /* S9 증상: ended 상태로 즉시 반환됨 → 해당 스트림 폐기 후 다음 tier */
        if (!videoTrack || videoTrack.readyState === "ended") {
          /* [s9-cam 진단] ended 트랙 감지 로그 */
          console.warn("[s9-cam] tier=" + tierIndex + " ended-track detected, discarding, trying next");
          s.getTracks().forEach((t) => t.stop());
          return null;
        }
        /* [s9-cam 진단] tier 성공 — 트랙 상태/라벨/세팅 기록 */
        console.info(
          "[s9-cam] tier=" + tierIndex + " acquired video.readyState=",
          videoTrack?.readyState,
          "label=",
          videoTrack?.label,
          "trackSettings=",
          videoTrack?.getSettings ? JSON.stringify(videoTrack.getSettings()) : "n/a",
        );
        return s;
      } catch (err) {
        /* [s9-cam 진단] tier 실패 — 에러 name/message 기록 */
        const e = err as { name?: string; message?: string } | undefined;
        console.warn("[s9-cam] tier=" + tierIndex + " failed:", e?.name, e?.message);
        return null;
      }
    }

    try {
      let stream: MediaStream | null = null;
      let lastError: unknown = null;
      for (let i = 0; i < tiers.length; i += 1) {
        const tier = tiers[i];
        try {
          stream = await tryTier(tier, i + 1);
          if (stream) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!stream) {
        /* [s9-cam 진단] 모든 tier 소진 */
        console.error("[s9-cam] all tiers exhausted — giving up");
        /* 모든 tier 실패 — 마지막 tier 를 한 번 더 시도해 에러 원문 확보 */
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia(
            tiers[tiers.length - 1],
          );
          /* (변경 #2) 폴백 ended 검사 — tryTier 와 동일하게 readyState 확인.
           * S9 등에서는 최후의 폴백도 ended 트랙을 반환할 수 있어 그대로 쓰면
           * pc 에 addTrack 후 검은 화면 송출된다. → 트랙 정리 후 에러 throw. */
          const vt = fallbackStream.getVideoTracks()[0];
          if (!vt || vt.readyState === "ended") {
            console.warn("[s9-cam] fallback ended-track detected, discarding");
            fallbackStream.getTracks().forEach((t) => t.stop());
            throw new Error("카메라가 켜지지 않아요. 잠시 후 다시 시도해 주세요.");
          }
          stream = fallbackStream;
        } catch (err) {
          throw err;
        }
        if (!stream) throw lastError ?? new Error("카메라 스트림을 받지 못했어요.");
      }

      localStreamRef.current = stream;
      /* [s9-cam 진단] stream 을 localStreamRef 에 저장 직후 상태 추적 */
      console.info(
        "[s9-cam] acquire stream stored — localStreamRef set=",
        !!localStreamRef.current,
        "videoTracks=",
        stream.getVideoTracks().length,
        "videoRef=",
        !!localVideoRef.current,
      );
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.info("[s9-cam] acquire srcObject attached to videoRef");
      } else {
        console.warn("[s9-cam] acquire videoRef is null — srcObject attach skipped");
      }
    } catch (err) {
      stopLocalPreviewTracksAndClearVideo();
      setCameraError(mapGetUserMediaErrorToUserMessage(err));
    } finally {
      setIsAcquiring(false);
      acquireInFlightRef.current = false;
      /* [s9-cam 진단] finally 완료 — isAcquiring=false 로 내려간 뒤 phase 전환 effect 가 트리거되는지 확인용 */
      console.info(
        "[s9-cam] acquire finally — isAcquiring=false, streamSet=",
        !!localStreamRef.current,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, stopLocalPreviewTracksAndClearVideo]);

  /**
   * 전면/후면 카메라 전환.
   * 새 카메라를 먼저 획득 → 성공 시 기존 비디오 트랙 교체.
   * 반환값: 새 비디오 트랙 (PeerConnection sender replaceTrack 용) 또는 null.
   */
  const switchCamera = useCallback(async (): Promise<MediaStreamTrack | null> => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false, /* 비디오만 교체, 오디오는 기존 트랙 유지 */
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return null;

      /* 새 카메라 성공 → 기존 비디오 트랙 정리 */
      if (localStreamRef.current) {
        for (const oldTrack of localStreamRef.current.getVideoTracks()) {
          oldTrack.stop();
          localStreamRef.current.removeTrack(oldTrack);
        }
        localStreamRef.current.addTrack(newVideoTrack);
      }

      /* 미리보기 비디오 업데이트 */
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      setFacingMode(nextFacing);
      console.log(`[broadcaster] 카메라 전환: ${nextFacing}`);
      return newVideoTrack;
    } catch (err) {
      console.warn("[broadcaster] 카메라 전환 실패, 기존 카메라 유지:", err);
      return null;
    }
  }, [facingMode]);

  return {
    /** 현재 로컬 미디어 스트림 (null 이면 카메라 미획득) */
    localStream: localStreamRef.current,
    /** 내부 스트림 ref — 시그널링 훅에서 최신 스트림 참조용 */
    localStreamRef,
    facingMode,
    isAcquiring,
    cameraError,
    acquireCamera,
    switchCamera,
    /** 모든 카메라 트랙 정리 — 미리보기·스트림 ref 함께 해제 */
    stopAllTracks: stopLocalPreviewTracksAndClearVideo,
    localVideoRef,
  };
}
