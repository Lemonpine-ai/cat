"use client";

/**
 * ZoneDisplayOverlay — 저장된 zone들을 카메라 영상 위에 컬러 박스로 표시.
 * lucide-react 아이콘으로 깔끔하게 표시 (카카오톡 스타일).
 */

import {
  UtensilsCrossed,
  Droplets,
  Sparkles,
  Castle,
  PenLine,
} from "lucide-react";
import type { CameraZone } from "@/types/zone";
import { ZONE_TYPE_CONFIG } from "@/types/zone";

/** lucide 아이콘명 → 컴포넌트 매핑 */
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  UtensilsCrossed,
  Droplets,
  Sparkles,
  Castle,
  PenLine,
};

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
        const IconComponent = ICON_MAP[config.lucideIcon];

        return (
          <div
            key={zone.id}
            className="absolute rounded-sm transition-all duration-300"
            style={{
              left: `${zone.rect.x * 100}%`,
              top: `${zone.rect.y * 100}%`,
              width: `${zone.rect.width * 100}%`,
              height: `${zone.rect.height * 100}%`,
              backgroundColor: isActive
                ? config.defaultColor.replace("0.4", "0.25")
                : "transparent",
              border: isActive
                ? `2px solid ${config.themeColor}`
                : `1px solid ${config.themeColor}40`,
              animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
            }}
          >
            {/* zone 라벨 — 좌상단에 깔끔하게 표시 */}
            {isActive && (
              <span
                className="absolute -top-5 left-0 flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6rem] font-semibold text-white"
                style={{ backgroundColor: `${config.themeColor}E6` }}
              >
                {IconComponent && <IconComponent size={10} strokeWidth={2.5} />}
                {zone.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
