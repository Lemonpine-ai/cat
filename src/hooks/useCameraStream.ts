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

  /** 카메라 스트림 획득 (후면 우선, 실패 시 최소 제약 fallback) */
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

    const preferredConstraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: true,
    };
    const minimalConstraints: MediaStreamConstraints = {
      video: true,
      audio: true,
    };

    try {
      let stream: MediaStream | null = null;
      try {
        stream = await getUserMediaWithNotReadableRetry(preferredConstraints);
      } catch {
        stream = await getUserMediaWithNotReadableRetry(minimalConstraints);
      }

      if (!stream) {
        throw new Error("카메라 스트림을 받지 못했어요.");
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      stopLocalPreviewTracksAndClearVideo();
      setCameraError(mapGetUserMediaErrorToUserMessage(err));
    } finally {
      setIsAcquiring(false);
      acquireInFlightRef.current = false;
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
