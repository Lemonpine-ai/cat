/**
 * 행동 인식 추론 훅 (Viewer 측 전용)
 * - Web Worker로 YOLO 추론 (메인 스레드 블록 방지)
 * - 500ms 간격 샘플링 (2 FPS) — 배터리/CPU 보호
 * - 3프레임 연속 동일 클래스 확정 → 깜빡임 방지
 * - visibilitychange: 탭 숨김 시 자동 중단
 * - 반환: currentBehavior (확정된 행동), lastDetections (raw)
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BehaviorDetection } from "@/types/behavior";
import type { WorkerInMessage, WorkerOutMessage } from "@/types/behavior";

const MODEL_URL = "/models/cat_behavior_yolov8n.onnx";
const INFER_INTERVAL_MS = 500; // 2 FPS
const CONFIRM_FRAMES = 3; // 3프레임 연속 동일 → 확정

type UseBehaviorDetectionArgs = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  /**
   * 확정된 행동이 "전환"되는 시점에만 호출 (같은 행동 유지 중에는 미발화).
   * - 새 행동 시작 → detection 전달
   * - 행동 종료(null로 전환) → null 전달
   * - DB 로깅 훅(useBehaviorEventLogger)에서 활용
   */
  onBehaviorChange?: (detection: BehaviorDetection | null) => void;
};

export type UseBehaviorDetectionResult = {
  currentBehavior: BehaviorDetection | null;
  isInferring: boolean;
  backend: string | null;
  lastDetections: BehaviorDetection[];
};

export function useBehaviorDetection({
  videoRef,
  enabled,
  onBehaviorChange,
}: UseBehaviorDetectionArgs): UseBehaviorDetectionResult {
  // 콜백을 ref로 보관 → 콜백 identity 변화가 Worker 메시지 핸들러 재생성을 유발하지 않도록
  const onBehaviorChangeRef = useRef(onBehaviorChange);
  onBehaviorChangeRef.current = onBehaviorChange;
  // 이전 확정 classKey 추적 → 전환 시점만 발화
  const lastEmittedKeyRef = useRef<string>("__none__");
  const [currentBehavior, setCurrentBehavior] =
    useState<BehaviorDetection | null>(null);
  const [lastDetections, setLastDetections] = useState<BehaviorDetection[]>([]);
  const [isInferring, setIsInferring] = useState(false);
  const [backend, setBackend] = useState<string | null>(null);

  // 내부 상태 (리렌더 방지)
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const frameIdRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const recentRef = useRef<string[]>([]); // 최근 N프레임 classKey 히스토리

  /**
   * Worker 메시지 처리
   */
  const handleWorkerMessage = useCallback((ev: MessageEvent<WorkerOutMessage>) => {
    const msg = ev.data;
    if (msg.type === "ready") {
      readyRef.current = true;
      setBackend(msg.backend);
      return;
    }
    if (msg.type === "result") {
      busyRef.current = false;
      // frameId 불일치 → enabled 토글 등으로 버려진 프레임 (이전 결과 혼입 방지)
      if (msg.frameId !== frameIdRef.current) return;
      setLastDetections(msg.detections);
      // 최고 신뢰도 1건 추출
      const top = msg.detections[0] ?? null;
      const key = top?.classKey ?? "__none__";

      // 최근 N프레임 히스토리 업데이트
      const history = recentRef.current;
      history.push(key);
      if (history.length > CONFIRM_FRAMES) history.shift();

      // N프레임 연속 동일 → 확정
      if (
        history.length === CONFIRM_FRAMES &&
        history.every((k) => k === key)
      ) {
        const confirmed = key === "__none__" ? null : top;
        setCurrentBehavior(confirmed);
        // 전환 시점만 콜백 발화 (같은 행동 유지 중에는 미발화)
        if (key !== lastEmittedKeyRef.current) {
          lastEmittedKeyRef.current = key;
          onBehaviorChangeRef.current?.(confirmed);
        }
      }
      return;
    }
    if (msg.type === "error") {
      busyRef.current = false;
      // eslint-disable-next-line no-console
      console.error("[YOLO Worker]", msg.message);
    }
  }, []);

  /**
   * Worker 초기화 (enabled=true일 때만)
   * - enabled=false로 전환되어 early return 하더라도, 이전에 생성된 Worker는
   *   workerRef에 남아 있을 수 있음 → 여기서 직접 terminate해서 GPU/메모리 누수 방지.
   */
  useEffect(() => {
    if (!enabled) {
      // 이전 Worker가 있으면 정리 (effect cleanup이 안 타는 early return 경로 대비)
      const prev = workerRef.current;
      if (prev) {
        const dispose: WorkerInMessage = { type: "dispose" };
        try { prev.postMessage(dispose); } catch { /* 이미 종료됐을 수 있음 */ }
        prev.removeEventListener("message", handleWorkerMessage);
        prev.terminate();
        workerRef.current = null;
      }
      readyRef.current = false;
      busyRef.current = false;
      recentRef.current = [];
      frameIdRef.current = 0;
      lastEmittedKeyRef.current = "__none__";
      return;
    }

    // Worker 생성 (Next.js 16 + Turbopack 호환)
    const worker = new Worker(
      new URL("../workers/yoloInference.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.addEventListener("message", handleWorkerMessage);

    // 모델 로드 지시
    const initMsg: WorkerInMessage = { type: "init", modelUrl: MODEL_URL };
    worker.postMessage(initMsg);

    return () => {
      const dispose: WorkerInMessage = { type: "dispose" };
      try { worker.postMessage(dispose); } catch { /* 이미 종료됐을 수 있음 */ }
      worker.removeEventListener("message", handleWorkerMessage);
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
      busyRef.current = false;
      recentRef.current = [];
      // frameId 리셋 → enabled false→true 재활성 시 이전 프레임 결과 혼입 방지
      frameIdRef.current = 0;
      lastEmittedKeyRef.current = "__none__";
    };
  }, [enabled, handleWorkerMessage]);

  /**
   * 500ms 간격 샘플링 + 가시성 제어
   * - enabled=false로 전환되면 남아있는 interval을 직접 정리 (누수 방지).
   */
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const tick = async () => {
      const video = videoRef.current;
      const worker = workerRef.current;
      if (!video || !worker || !readyRef.current) return;
      if (busyRef.current) return; // 이전 추론 진행 중이면 스킵
      if (video.readyState < 2 || video.videoWidth === 0) return;
      if (document.hidden) return;

      // 현재 프레임 캡처 → postMessage 사이에서 예외가 나도 bitmap 누수 방지용 try/finally
      let bitmap: ImageBitmap | null = null;
      let transferred = false;
      try {
        busyRef.current = true;
        setIsInferring(true);
        // 현재 프레임을 ImageBitmap으로 캡처 (transferable)
        bitmap = await createImageBitmap(video);
        const frameId = ++frameIdRef.current;
        const msg: WorkerInMessage = { type: "infer", frameId, bitmap };
        worker.postMessage(msg, [bitmap]);
        transferred = true; // postMessage 성공 → bitmap 소유권 Worker로 이전
      } catch {
        busyRef.current = false;
      } finally {
        setIsInferring(false);
        // postMessage 실패 시 메인 스레드에서 bitmap 수동 해제 (누수 방지)
        if (bitmap && !transferred) {
          bitmap.close();
        }
      }
    };

    // interval 시작 함수 (visibility 복귀 시 재사용)
    const startInterval = () => {
      if (intervalRef.current !== null) return;
      intervalRef.current = window.setInterval(tick, INFER_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // 초기 기동 (탭이 이미 숨겨진 경우는 스킵)
    if (!document.hidden) startInterval();

    // 탭 숨김 → clearInterval로 setInterval 자체를 중단 (CPU 절약)
    // 탭 복귀 → enabled 상태이면 setInterval 재개
    const onVisibility = () => {
      if (document.hidden) {
        stopInterval();
        recentRef.current = [];
      } else {
        // 복귀 시: 히스토리를 이미 비운 상태이므로 currentBehavior도 초기화해서 stale 방지
        // (lastEmittedKeyRef도 동기화 → 첫 감지가 "전환"으로 올바르게 인식)
        recentRef.current = [];
        setCurrentBehavior(null);
        if (lastEmittedKeyRef.current !== "__none__") {
          lastEmittedKeyRef.current = "__none__";
          onBehaviorChangeRef.current?.(null);
        }
        startInterval();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, videoRef]);

  return { currentBehavior, isInferring, backend, lastDetections };
}
