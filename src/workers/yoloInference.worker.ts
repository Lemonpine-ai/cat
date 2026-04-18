/// <reference lib="webworker" />
/**
 * YOLO 추론 Web Worker
 * - onnxruntime-web으로 ONNX 모델 실행
 * - 백엔드 우선순위: WebGPU → WebGL → WASM
 * - 메시지 프로토콜: init / infer / dispose
 * - ImageBitmap은 transferable (메모리 복사 없음)
 *
 * 사전 요구사항:
 *   npm install onnxruntime-web
 */

import * as ort from "onnxruntime-web";
// Next.js Turbopack worker 번들러가 경로 별칭(@/…)을 resolve 못하는 경우가 있어
// 상대 경로로 고정한다. (staging/workers → staging/lib, staging/types)
import {
  letterbox,
  imageDataToTensor,
  parseYoloOutput,
  applyNMS,
} from "../lib/ai/yoloPostprocess";
import type {
  WorkerInMessage,
  WorkerOutMessage,
  BehaviorDetection,
} from "../types/behavior";

// Worker 전역 타입 (self 컨텍스트)
declare const self: DedicatedWorkerGlobalScope;

let session: ort.InferenceSession | null = null;
let currentBackend = "unknown";

/**
 * 백엔드 우선순위로 세션 생성 시도
 * - WebGPU → WebGL → WASM 순으로 fallback
 */
async function createSession(modelUrl: string): Promise<ort.InferenceSession> {
  const candidates: Array<{ name: string; providers: string[] }> = [
    { name: "webgpu", providers: ["webgpu"] },
    { name: "webgl", providers: ["webgl"] },
    { name: "wasm", providers: ["wasm"] },
  ];

  let lastError: unknown = null;
  for (const c of candidates) {
    try {
      const s = await ort.InferenceSession.create(modelUrl, {
        executionProviders: c.providers,
        graphOptimizationLevel: "all",
      });
      currentBackend = c.name;
      return s;
    } catch (err) {
      lastError = err;
      // 다음 백엔드로 폴백
    }
  }
  throw new Error(
    `모든 백엔드 생성 실패: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Warmup: 더미 입력으로 1회 추론하여 JIT 컴파일 완료
 * - 첫 실추론이 10배 느린 현상 방지
 */
async function warmup(s: ort.InferenceSession): Promise<void> {
  const dummy = new Float32Array(3 * 640 * 640);
  const tensor = new ort.Tensor("float32", dummy, [1, 3, 640, 640]);
  const inputName = s.inputNames[0];
  await s.run({ [inputName]: tensor });
}

/**
 * 추론 실행: ImageBitmap → BehaviorDetection[]
 */
async function runInference(bitmap: ImageBitmap): Promise<BehaviorDetection[]> {
  if (!session) throw new Error("세션이 초기화되지 않음");

  try {
    // letterbox + 텐서 변환
    const lb = letterbox(bitmap, 640);
    const inputTensor = imageDataToTensor(lb.imageData);
    const tensor = new ort.Tensor("float32", inputTensor, [1, 3, 640, 640]);

    // 추론
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const results = await session.run({ [inputName]: tensor });
    const outputTensor = results[outputName];
    const output = outputTensor.data as Float32Array;

    // ONNX 출력 shape 런타임 검증
    // - YOLOv8: [1, 4+nc, 8400] (채널 우선) 또는 [1, 8400, 4+nc] (앵커 우선)
    // - dims[1] > dims[2] 이면 [1, 8400, 4+nc] 이므로 transpose 필요
    const dims = outputTensor.dims;
    const needsTranspose = dims.length === 3 && dims[1] > dims[2];
    // 하드코딩 대신 런타임 실측값 사용 → 입력 해상도/클래스 수 변경에도 안전
    // - needsTranspose=true ([1, 8400, 4+nc]): numAnchors=dims[1], numChannels=dims[2]
    // - needsTranspose=false ([1, 4+nc, 8400]): numChannels=dims[1], numAnchors=dims[2]
    const numChannels = needsTranspose ? dims[2] : dims[1];
    const numAnchors = needsTranspose ? dims[1] : dims[2];

    // 후처리: 파싱 + NMS
    const parsed = parseYoloOutput(
      output,
      lb.padX,
      lb.padY,
      lb.scale,
      lb.originalW,
      lb.originalH,
      0.25, // conf threshold
      needsTranspose,
      numAnchors,
      numChannels,
    );
    const filtered = applyNMS(parsed, 0.45);

    return filtered;
  } finally {
    // 예외 발생 여부와 상관없이 ImageBitmap 메모리 해제 (누수 방지)
    bitmap.close();
  }
}

/**
 * 타입 안전 메시지 전송
 */
function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

// 메시지 수신 핸들러
self.addEventListener("message", async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      session = await createSession(msg.modelUrl);
      await warmup(session);
      post({ type: "ready", backend: currentBackend });
      return;
    }
    if (msg.type === "infer") {
      const detections = await runInference(msg.bitmap);
      post({ type: "result", frameId: msg.frameId, detections });
      return;
    }
    if (msg.type === "dispose") {
      await session?.release();
      session = null;
      return;
    }
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export {};
