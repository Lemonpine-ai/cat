"use client";

/**
 * ZoneDisplayOverlay — 저장된 zone들을 카메라 영상 위에 컬러 박스로 표시.
 * 각 zone의 이름과 아이콘을 라벨로 보여줌.
 */

import type { CameraZone } from "@/types/zone";
import { ZONE_TYPE_CONFIG } from "@/types/zone";

type ZoneDisplayOverlayProps = {
  zones: CameraZone[];
  /** 활성화된 zone ID (현재 고양이가 머물고 있는 zone) */
  activeZoneIds?: Set<string>;
};

export function ZoneDisplayOverlay({
  zones,
  activeZoneIds = new Set(),
}: ZoneDisplayOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {zones.map((zone) => {
        const config = ZONE_TYPE_CONFIG[zone.zone_type];
        const isActive = activeZoneIds.has(zone.id);

        return (
          <div
            key={zone.id}
            className="absolute border-2 transition-all duration-300"
            style={{
              left: `${zone.rect.x * 100}%`,
              top: `${zone.rect.y * 100}%`,
              width: `${zone.rect.width * 100}%`,
              height: `${zone.rect.height * 100}%`,
              backgroundColor: zone.color,
              opacity: isActive ? 0.85 : 0.65,
              borderColor: isActive ? "#4FD1C5" : "transparent",
              /* 활성 시 살짝 펄스 애니메이션 */
              animation: isActive ? "pulse 2s infinite" : "none",
            }}
          >
            {/* zone 라벨 — 좌상단에 작게 표시 */}
            <span
              className="absolute -top-5 left-0 whitespace-nowrap rounded-full bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white"
            >
              {config.icon} {zone.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
