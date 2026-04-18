/**
 * ZoneBboxDetector — bbox 중심점 기반 zone 진입/퇴장/체류 감지.
 *
 * YOLO 등 객체 감지 모델의 bbox 중심점을 받아서
 * zone 영역 안에 있는지 판정하고, 체류 시간을 추적합니다.
 *
 * 동작 원리:
 * 1. bbox 중심점이 zone rect 안에 있는지 판정 (정규화 좌표 0~1)
 * 2. 진입 시 타이머 시작 → 체류시간 충족 시 이벤트 발생
 * 3. 퇴장 시 duration 계산 후 exit 이벤트 발생
 * 4. eventMergeSeconds 내 재진입은 기존 체류로 이어서 계산 (병합)
 */

import type { CameraZone, BboxCenter, ZoneEventType } from "@/types/zone";
import { ZONE_TYPE_CONFIG } from "@/types/zone";

/** zone 활동 이벤트 — useZoneDetection에서 DB INSERT에 사용 */
export type ZoneActivityEvent = {
  zone: CameraZone;
  eventType: ZoneEventType;
  careKind: string | null;
  startedAt: number;           // 진입 시각 (ms timestamp)
  durationSeconds: number | null; // 체류 시간 (초), enter 시에는 null
};

/** zone별 내부 상태 */
type ZoneState = {
  /** zone 안에 bbox가 있는지 여부 */
  isInside: boolean;
  /** 진입 시각 (ms). null이면 zone 밖 */
  enteredAt: number | null;
  /** 마지막 퇴장 시각 (ms). 재진입 병합 판정용 */
  lastExitAt: number | null;
  /** 체류 완료(dwell_complete) 이벤트를 이미 발행했는지 */
  dwellFired: boolean;
  /** 마지막 이벤트 발행 시각 (디바운스용) */
  lastEventAt: number;
};

export class ZoneBboxDetector {
  /** zone별 상태 추적 맵 */
  private zoneStates: Map<string, ZoneState> = new Map();

  /**
   * bbox 중심점 배열과 zone 목록을 받아 이벤트를 반환.
   * 2초마다 호출되는 것을 전제로 설계.
   *
   * @param bboxes - 현재 프레임의 bbox 중심점 배열 (0~1 정규화)
   * @param zones  - 카메라에 등록된 zone 목록
   * @returns 발생한 이벤트 배열
   */
  checkEntry(bboxes: BboxCenter[], zones: CameraZone[]): ZoneActivityEvent[] {
    const now = Date.now();
    const events: ZoneActivityEvent[] = [];

    for (const zone of zones) {
      const config = ZONE_TYPE_CONFIG[zone.zone_type];
      const state = this.getOrCreateState(zone.id);

      /* bbox 중 하나라도 zone 안에 있으면 "안에 있음" */
      const isInsideNow = bboxes.some((bbox) =>
        this.pointInZone(bbox, zone),
      );

      if (isInsideNow && !state.isInside) {
        /* ── 진입 ── */
        const mergeMs = config.eventMergeSeconds * 1000;
        const canMerge =
          mergeMs > 0 &&
          state.lastExitAt !== null &&
          now - state.lastExitAt <= mergeMs;

        if (canMerge && state.enteredAt !== null) {
          /* 병합: 이전 진입 시각 유지, dwellFired도 유지 */
          state.isInside = true;
          state.lastExitAt = null;
        } else {
          /* 새 진입 */
          state.isInside = true;
          state.enteredAt = now;
          state.dwellFired = false;
          state.lastExitAt = null;

          events.push({
            zone,
            eventType: "enter",
            careKind: null,
            startedAt: now,
            durationSeconds: null,
          });
        }
      } else if (!isInsideNow && state.isInside) {
        /* ── 퇴장 ── */
        state.isInside = false;
        state.lastExitAt = now;

        const duration = state.enteredAt !== null
          ? Math.round((now - state.enteredAt) / 1000)
          : null;

        events.push({
          zone,
          eventType: "exit",
          careKind: null,
          startedAt: state.enteredAt ?? now,
          durationSeconds: duration,
        });
      } else if (isInsideNow && state.isInside && !state.dwellFired) {
        /* ── 체류 중 — dwell 시간 충족 확인 ── */
        if (state.enteredAt !== null) {
          const elapsedSec = (now - state.enteredAt) / 1000;

          if (elapsedSec >= config.dwellSeconds) {
            state.dwellFired = true;
            state.lastEventAt = now;

            events.push({
              zone,
              eventType: "dwell_complete",
              careKind: config.careKind,
              startedAt: state.enteredAt,
              durationSeconds: Math.round(elapsedSec),
            });
          }
        }
      }
    }

    return events;
  }

  /** 현재 활성(진입 중) zone ID 집합 — UI 하이라이트용 */
  getActiveZoneIds(): Set<string> {
    const active = new Set<string>();
    this.zoneStates.forEach((state, id) => {
      if (state.isInside) active.add(id);
    });
    return active;
  }

  /** 리소스 정리 */
  destroy(): void {
    this.zoneStates.clear();
  }

  /**
   * bbox 중심점이 zone rect 안에 있는지 판정.
   * 모든 좌표는 0~1 정규화.
   */
  private pointInZone(bbox: BboxCenter, zone: CameraZone): boolean {
    const r = zone.rect;
    return (
      bbox.x >= r.x &&
      bbox.x <= r.x + r.width &&
      bbox.y >= r.y &&
      bbox.y <= r.y + r.height
    );
  }

  /** zone 상태 가져오기 (없으면 초기 상태 생성) */
  private getOrCreateState(zoneId: string): ZoneState {
    let state = this.zoneStates.get(zoneId);
    if (!state) {
      state = {
        isInside: false,
        enteredAt: null,
        lastExitAt: null,
        dwellFired: false,
        lastEventAt: 0,
      };
      this.zoneStates.set(zoneId, state);
    }
    return state;
  }
}
