/**
 * clipRecorder — 이벤트 기반 20초 영상 녹화.
 *
 * 동작: 이벤트 발생 → MediaRecorder.start() → 20초 후 stop() → Blob 반환.
 * 상시 녹화 안 함 (배터리/발열 보호).
 * S9/G7 호환: VP8 코덱, 500kbps.
 */

import { CLIP_DURATION_SECONDS } from "../../types/clip";

/** 지원되는 코덱 목록 (우선순위) */
const CODECS = [
  "video/webm; codecs=vp8",
  "video/webm",
  "video/mp4",
];

/** 사용 가능한 코덱 찾기 */
function findSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const codec of CODECS) {
    if (MediaRecorder.isTypeSupported(codec)) return codec;
  }
  return null;
}

export class ClipRecorder {
  private stream: MediaStream;
  private isRecording = false;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  /** MediaRecorder 사용 가능 여부 */
  static isSupported(): boolean {
    return findSupportedMimeType() !== null;
  }

  /** 현재 녹화 중인지 */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * 20초 영상 녹화 후 Blob 반환.
   * 이미 녹화 중이면 null 반환 (중복 방지).
   */
  async recordClip(): Promise<Blob | null> {
    /* 중복 녹화 방지 */
    if (this.isRecording) return null;

    /* 트랙 상태 검증 — 끊긴 스트림이면 녹화 안 함 */
    const tracks = this.stream.getTracks();
    if (tracks.length === 0 || tracks.some((t) => t.readyState !== "live")) {
      console.warn("[ClipRecorder] 트랙이 없거나 종료됨 — 녹화 스킵");
      return null;
    }

    const mimeType = findSupportedMimeType();
    if (!mimeType) {
      console.warn("[ClipRecorder] MediaRecorder 미지원 — 녹화 스킵");
      return null;
    }

    this.isRecording = true;

    return new Promise<Blob | null>((resolve) => {
      try {
        const recorder = new MediaRecorder(this.stream, {
          mimeType,
          videoBitsPerSecond: 500_000, /* 500kbps — 20초에 ~1.2MB */
        });

        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          this.isRecording = false;
          if (chunks.length === 0) {
            resolve(null);
            return;
          }
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob);
        };

        recorder.onerror = () => {
          this.isRecording = false;
          console.error("[ClipRecorder] 녹화 오류 발생");
          resolve(null);
        };

        /* 녹화 시작 → 20초 후 자동 중지 */
        recorder.start();
        setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          } else {
            this.isRecording = false;
            resolve(null);
          }
        }, CLIP_DURATION_SECONDS * 1000);
      } catch (err) {
        this.isRecording = false;
        console.error("[ClipRecorder] 녹화 시작 실패:", err);
        resolve(null);
      }
    });
  }

  /** 스트림 교체 (카메라 전환 시) */
  updateStream(newStream: MediaStream) {
    this.stream = newStream;
  }
}
