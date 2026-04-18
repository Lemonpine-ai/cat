/**
 * ZoneAlertEngine — 비정상 식사 행동 감지 엔진.
 *
 * 식사 Zone(food_bowl) 외부에서 eating 행동이 감지되면 알림 발생.
 * 고양이가 엉뚱한 곳에서 먹는 건 건강 이상 신호일 수 있음.
 *
 * 3분 디바운스 적용 — 같은 알림이 연속 발생하지 않도록.
 */

import type { CameraZone, BboxCenter } from "@/types/zone";

/** 식사 zone 외 eating 감지 알림 */
export type EatOutsideAlert = {
  /** 감지된 bbox 위치 */
  position: BboxCenter;
  /** 알림 발생 시각 */
  detectedAt: number;
  /** 알림 메시지 */
  message: string;
};

/** 디바운스 간격 (3분 = 180,000ms) */
const DEBOUNCE_MS = 180_000;

export class ZoneAlertEngine {
  /** device별 마지막 알림 시각 (디바운스용) */
  private lastAlertMap: Map<string, number> = new Map();

  /**
   * 식사 Zone 외부에서 eating bbox가 있는지 확인.
   *
   * @param bboxes  - 현재 eating 행동으로 분류된 bbox 중심점들
   * @param zones   - 카메라에 등록된 zone 목록
   * @param deviceId - 디바운스 키로 사용할 디바이스 ID
   * @returns 알림 또는 null
   */
  checkEating(
    bboxes: BboxCenter[],
    zones: CameraZone[],
    deviceId: string,
  ): EatOutsideAlert | null {
    /* eating bbox가 없으면 검사 불필요 */
    if (bboxes.length === 0) return null;

    /* 식사 zone 목록 추출 */
    const foodZones = zones.filter((z) => z.zone_type === "food_bowl");

    /* 식사 zone이 아예 없으면 알림 불가 (기준이 없음) */
    if (foodZones.length === 0) return null;

    /* 모든 eating bbox가 식사 zone 안에 있는지 확인 */
    for (const bbox of bboxes) {
      const isInFoodZone = foodZones.some((zone) => {
        const r = zone.rect;
        return (
          bbox.x >= r.x &&
          bbox.x <= r.x + r.width &&
          bbox.y >= r.y &&
          bbox.y <= r.y + r.height
        );
      });

      if (!isInFoodZone) {
        /* 식사 zone 밖에서 eating 감지 — 디바운스 확인 */
        const now = Date.now();
        const lastAlert = this.lastAlertMap.get(deviceId) ?? 0;

        if (now - lastAlert < DEBOUNCE_MS) {
          return null; // 3분 내 중복 알림 방지
        }

        this.lastAlertMap.set(deviceId, now);

        return {
          position: bbox,
          detectedAt: now,
          message: "밥그릇 영역 밖에서 식사 행동이 감지되었습니다.",
        };
      }
    }

    return null;
  }

  /** 리소스 정리 */
  destroy(): void {
    this.lastAlertMap.clear();
  }
}
