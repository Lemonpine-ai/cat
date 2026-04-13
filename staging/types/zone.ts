/**
 * 카메라 영역(zone) 관련 타입 정의.
 * 밥그릇, 물그릇, 화장실, 캣타워 등의 영역을 지정하여
 * 고양이 활동을 자동 감지합니다.
 */

/** zone 종류 — 각 타입별 아이콘/색상/체류시간이 다름 */
export type ZoneType =
  | "food_bowl"
  | "water_bowl"
  | "litter_box"
  | "cat_tower"
  | "custom";

/** zone 직사각형 좌표 (0~1 정규화, 해상도 무관) */
export type ZoneRect = {
  x: number;      // 좌상단 X (0~1)
  y: number;      // 좌상단 Y (0~1)
  width: number;  // 너비 (0~1, 최소 0.05)
  height: number; // 높이 (0~1, 최소 0.05)
};

/** DB에 저장되는 zone 데이터 */
export type CameraZone = {
  id: string;
  device_id: string;
  home_id: string;
  name: string;
  zone_type: ZoneType;
  rect: ZoneRect;
  color: string;
  created_at: string;
};

/** zone 타입별 설정 — 체류 시간, care_kind 매핑, 색상 */
export const ZONE_TYPE_CONFIG: Record<
  ZoneType,
  {
    label: string;
    icon: string;
    dwellSeconds: number;       // 이 시간 이상 머물면 활동으로 인식
    eventMergeSeconds: number;   // 이 시간 내 재방문은 같은 1회로 합침
    careKind: "meal" | "water_change" | "litter_clean" | null;
    defaultColor: string;
  }
> = {
  food_bowl: {
    label: "밥그릇",
    icon: "🍚",
    dwellSeconds: 10,
    eventMergeSeconds: 300,      // 5분
    careKind: "meal",
    defaultColor: "rgba(77,182,172,0.4)",
  },
  water_bowl: {
    label: "물그릇",
    icon: "💧",
    dwellSeconds: 5,
    eventMergeSeconds: 300,
    careKind: "water_change",
    defaultColor: "rgba(3,169,244,0.4)",
  },
  litter_box: {
    label: "화장실",
    icon: "🚽",
    dwellSeconds: 15,
    eventMergeSeconds: 0,        // 합치기 없음
    careKind: "litter_clean",
    defaultColor: "rgba(255,171,145,0.4)",
  },
  cat_tower: {
    label: "캣타워",
    icon: "🏰",
    dwellSeconds: 30,
    eventMergeSeconds: 0,
    careKind: null,             // care_logs에 안 넣음
    defaultColor: "rgba(179,136,255,0.4)",
  },
  custom: {
    label: "기타",
    icon: "📍",
    dwellSeconds: 10,
    eventMergeSeconds: 0,
    careKind: null,
    defaultColor: "rgba(158,158,158,0.4)",
  },
};

/** 카메라당 최대 zone 개수 */
export const MAX_ZONES_PER_DEVICE = 12;

/** zone rect 최소 크기 (너무 작으면 오탐) */
export const MIN_ZONE_SIZE = 0.05;
