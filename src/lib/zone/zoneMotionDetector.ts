/**
 * zoneMotionDetector — 영상 프레임에서 zone 영역 내 움직임을 감지.
 *
 * 동작 원리:
 * 1. 2초마다 video에서 320x240 축소 프레임 캡처
 * 2. 이전 프레임과 pixel diff 비교
 * 3. 각 zone 영역 내 변화율 계산
 * 4. 변화율 15%+ 이면 "활동 중"
 * 5. 체류시간 충족 시 이벤트 기록 (디바운스 적용)
 */

import type { CameraZone, ZoneRect } from "@/types/zone";
import { ZONE_TYPE_CONFIG } from "@/types/zone";

/** 분석용 프레임 크기 (작을수록 CPU 절약) */
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
/** 변화 감지 임계값 (RGB 합계 차이) */
const PIXEL_DIFF_THRESHOLD = 50;
/** 변화율 임계값 (15%) */
const CHANGE_RATIO_THRESHOLD = 0.15;

/** zone별 활동 상태 추적 */
type ZoneState = {
  /** 활동 시작 시각 (null이면 비활성) */
  activeStartAt: number | null;
  /** 마지막 이벤트 기록 시각 (디바운스용) */
  lastLoggedAt: number;
};

export type ZoneActivityEvent = {
  zone: CameraZone;
  careKind: string;
  startedAt: number;
};

export class ZoneMotionDetector {
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  /** zone 분석용 이전 프레임 */
  private prevFrame: ImageData | null = null;
  /** 전체 화면 분석용 이전 프레임 (모드 전환 시 오탐 방지) */
  private prevFullFrame: ImageData | null = null;
  private zoneStates: Map<string, ZoneState> = new Map();
  private zones: CameraZone[] = [];

  constructor() {
    this.canvas = new OffscreenCanvas(FRAME_WIDTH, FRAME_HEIGHT);
    this.ctx = this.canvas.getContext("2d")!;
  }

  /** zone 목록 업데이트 */
  setZones(zones: CameraZone[]) {
    this.zones = zones;
    /* 새 zone은 상태 초기화 */
    for (const zone of zones) {
      if (!this.zoneStates.has(zone.id)) {
        this.zoneStates.set(zone.id, { activeStartAt: null, lastLoggedAt: 0 });
      }
    }
  }

  /**
   * video 프레임 분석 — 2초마다 호출.
   * 활동이 감지되고 체류시간을 충족하면 이벤트 반환.
   */
  analyzeFrame(video: HTMLVideoElement): ZoneActivityEvent[] {
    if (video.readyState < 2) return []; /* 영상 로딩 안 됨 */

    /* 프레임 캡처 (320x240 축소) */
    this.ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const currentFrame = this.ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    if (!this.prevFrame) {
      this.prevFrame = currentFrame;
      return [];
    }

    const now = Date.now();
    const events: ZoneActivityEvent[] = [];

    for (const zone of this.zones) {
      const config = ZONE_TYPE_CONFIG[zone.zone_type];
      const state = this.zoneStates.get(zone.id);
      if (!state) continue;

      /* zone 영역 내 변화율 계산 */
      const changeRatio = this.calcZoneChangeRatio(
        this.prevFrame,
        currentFrame,
        zone.rect,
      );

      const isActive = changeRatio >= CHANGE_RATIO_THRESHOLD;

      if (isActive) {
        /* 활동 시작 기록 */
        if (state.activeStartAt === null) {
          state.activeStartAt = now;
        }

        /* 체류시간 충족 확인 */
        const dwellMs = config.dwellSeconds * 1000;
        const elapsed = now - state.activeStartAt;

        if (elapsed >= dwellMs) {
          /* 디바운스: 밥그릇은 5분 합치기, 나머지는 체류시간의 2배 */
          const cooldownMs = config.eventMergeSeconds > 0
            ? config.eventMergeSeconds * 1000
            : dwellMs * 2;

          if (now - state.lastLoggedAt > cooldownMs && config.careKind) {
            state.lastLoggedAt = now;
            events.push({
              zone,
              careKind: config.careKind,
              startedAt: state.activeStartAt,
            });
          }
        }
      } else {
        /* 움직임 없음 → 활동 종료 */
        state.activeStartAt = null;
      }
    }

    this.prevFrame = currentFrame;
    return events;
  }

  /** 현재 활성 zone ID 목록 (UI 하이라이트용) */
  getActiveZoneIds(): Set<string> {
    const active = new Set<string>();
    this.zoneStates.forEach((state, id) => {
      if (state.activeStartAt !== null) active.add(id);
    });
    return active;
  }

  /** zone 영역 내 pixel diff 변화율 계산 */
  private calcZoneChangeRatio(
    prev: ImageData,
    curr: ImageData,
    rect: ZoneRect,
  ): number {
    /* 정규화 좌표 → 실제 픽셀 좌표 */
    const x0 = Math.floor(rect.x * FRAME_WIDTH);
    const y0 = Math.floor(rect.y * FRAME_HEIGHT);
    const x1 = Math.min(FRAME_WIDTH, Math.floor((rect.x + rect.width) * FRAME_WIDTH));
    const y1 = Math.min(FRAME_HEIGHT, Math.floor((rect.y + rect.height) * FRAME_HEIGHT));

    let totalPixels = 0;
    let changedPixels = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * FRAME_WIDTH + x) * 4;
        const dr = Math.abs(prev.data[idx] - curr.data[idx]);
        const dg = Math.abs(prev.data[idx + 1] - curr.data[idx + 1]);
        const db = Math.abs(prev.data[idx + 2] - curr.data[idx + 2]);

        totalPixels++;
        if (dr + dg + db > PIXEL_DIFF_THRESHOLD) changedPixels++;
      }
    }

    return totalPixels > 0 ? changedPixels / totalPixels : 0;
  }

  /** 리소스 정리 */
  destroy() {
    this.prevFrame = null;
    this.prevFullFrame = null;
    this.zoneStates.clear();
    this.zones = [];
  }
}
