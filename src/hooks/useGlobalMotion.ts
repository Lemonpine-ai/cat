"use client";

/**
 * useGlobalMotion -- 전체 프레임 기반 글로벌 움직임 감지 훅.
 *
 * zone 설정 없이도 카메라 영상에서 움직임 유무를 판단.
 * 2초마다 프레임을 캡처하여 이전 프레임과 비교.
 * 변화율 임계값 이상이면 "움직임 있음"으로 판단.
 */

import { useEffect, useRef, useState } from "react";

/** 분석용 축소 프레임 크기 */
const FRAME_W = 160;
const FRAME_H = 120;
/** 분석 주기 (ms) */
const INTERVAL_MS = 2000;
/** 픽셀 변화 임계값 (RGB 합산) */
const PIXEL_DIFF = 45;
/** 전체 프레임 변화율 임계값 (8%) */
const CHANGE_THRESHOLD = 0.08;

type UseGlobalMotionOptions = {
  /** video 엘리먼트 참조 */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 카메라 연결 상태 */
  isConnected: boolean;
};

/**
 * 전체 프레임 움직임 감지.
 * @returns hasMotion - 현재 움직임 유무
 */
export function useGlobalMotion({
  videoRef,
  isConnected,
}: UseGlobalMotionOptions): boolean {
  const [hasMotion, setHasMotion] = useState(false);
  const canvasRef = useRef<OffscreenCanvas | null>(null);
  const ctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setHasMotion(false);
      prevFrameRef.current = null;
      return;
    }

    /* 캔버스 초기화 (한 번만) */
    if (!canvasRef.current) {
      canvasRef.current = new OffscreenCanvas(FRAME_W, FRAME_H);
      ctxRef.current = canvasRef.current.getContext("2d");
    }

    const id = setInterval(() => {
      const video = videoRef.current;
      const ctx = ctxRef.current;
      if (!video || !ctx || video.readyState < 2 || document.hidden) return;

      /* 프레임 캡처 (축소) */
      ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
      const curr = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
      const prev = prevFrameRef.current;

      if (!prev) {
        prevFrameRef.current = curr;
        return;
      }

      /* 변화율 계산 */
      let changed = 0;
      const total = FRAME_W * FRAME_H;
      for (let i = 0; i < total; i++) {
        const idx = i * 4;
        const d =
          Math.abs(prev.data[idx] - curr.data[idx]) +
          Math.abs(prev.data[idx + 1] - curr.data[idx + 1]) +
          Math.abs(prev.data[idx + 2] - curr.data[idx + 2]);
        if (d > PIXEL_DIFF) changed++;
      }

      setHasMotion(changed / total >= CHANGE_THRESHOLD);
      prevFrameRef.current = curr;
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [isConnected, videoRef]);

  /* 언마운트 시 리소스 정리 */
  useEffect(() => {
    return () => {
      prevFrameRef.current = null;
      canvasRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  return hasMotion;
}
