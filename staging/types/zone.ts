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

/**
 * zone 타입별 설정 — 체류 시간, care_kind 매핑, 색상.
 * lucideIcon: lucide-react 컴포넌트명 (카카오톡 스타일 깔끔한 아이콘)
 */
export const ZONE_TYPE_CONFIG: Record<
  ZoneType,
  {
    label: string;
    lucideIcon: string;          // lucide-react 아이콘명
    dwellSeconds: number;        // 이 시간 이상 머물면 활동으로 인식
    eventMergeSeconds: number;   // 이 시간 내 재방문은 같은 1회로 합침
    careKind: "meal" | "water_change" | "litter_clean" | null;
    defaultColor: string;
    /** 디자이너 확정 — 타입별 테마 색상 (Tailwind 호환) */
    themeColor: string;
  }
> = {
  food_bowl: {
    label: "밥그릇",
    lucideIcon: "UtensilsCrossed",
    dwellSeconds: 10,
    eventMergeSeconds: 300,      // 5분
    careKind: "meal",
    defaultColor: "rgba(245,101,101,0.4)",
    themeColor: "#F56565",
  },
  water_bowl: {
    label: "물그릇",
    lucideIcon: "Droplets",
    dwellSeconds: 5,
    eventMergeSeconds: 300,
    careKind: "water_change",
    defaultColor: "rgba(66,153,225,0.4)",
    themeColor: "#4299E1",
  },
  litter_box: {
    label: "화장실",
    lucideIcon: "Sparkles",
    dwellSeconds: 15,
    eventMergeSeconds: 0,
    careKind: "litter_clean",
    defaultColor: "rgba(159,122,234,0.4)",
    themeColor: "#9F7AEA",
  },
  cat_tower: {
    label: "캣타워",
    lucideIcon: "Castle",
    dwellSeconds: 30,
    eventMergeSeconds: 0,
    careKind: null,
    defaultColor: "rgba(72,187,120,0.4)",
    themeColor: "#48BB78",
  },
  custom: {
    label: "기타",
    lucideIcon: "PenLine",
    dwellSeconds: 10,
    eventMergeSeconds: 0,
    careKind: null,
    defaultColor: "rgba(160,174,192,0.4)",
    themeColor: "#A0AEC0",
  },
};

/** 카메라당 최대 zone 개수 */
export const MAX_ZONES_PER_DEVICE = 12;

/** zone rect 최소 크기 (너무 작으면 오탐) */
export const MIN_ZONE_SIZE = 0.05;
