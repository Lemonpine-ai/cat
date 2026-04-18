"use client";

/** ZoneSetupPanel — zone 설정 패널 (영상 위 오버레이) */

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { ZoneEditorOverlay } from "@/components/zone/ZoneEditorOverlay";
import { ZoneTypeSelector } from "@/components/zone/ZoneTypeSelector";
import { useZoneManager } from "@/hooks/useZoneManager";
import { ZONE_TYPE_CONFIG } from "@/types/zone";
import type { ZoneType, ZoneRect } from "@/types/zone";

type ZoneSetupPanelProps = {
  deviceId: string;
  homeId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
};

export function ZoneSetupPanel({ deviceId, homeId, videoRef: _videoRef, onClose }: ZoneSetupPanelProps) {
  const [selectedType, setSelectedType] = useState<ZoneType>("food_bowl");
  const { zones, isLoading, addZone, removeZone } = useZoneManager({ homeId, deviceId });

  /* 드래그 완료 → zone 추가 */
  async function handleZoneDrawn(rect: ZoneRect) {
    await addZone(selectedType, rect);
  }

  const existingZoneRects = zones.map((z) => ({ rect: z.rect, color: z.color }));

  return (
    <div className="absolute inset-0 z-20 flex flex-col">
      {/* 드래그 캔버스 */}
      <ZoneEditorOverlay onZoneDrawn={handleZoneDrawn} existingZones={existingZoneRects} />

      {/* 상단 바 — 타입 선택 + 닫기 */}
      <div className="pointer-events-auto relative z-30 flex items-center justify-between bg-black/70 px-3 py-2 backdrop-blur-sm">
        <ZoneTypeSelector selected={selectedType} onSelect={setSelectedType} />
        <button
          type="button"
          onClick={onClose}
          className="ml-2 flex size-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          aria-label="zone 설정 닫기"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* 하단 zone 목록 */}
      <div className="pointer-events-auto mt-auto max-h-32 overflow-y-auto bg-black/70 px-3 py-2 backdrop-blur-sm">
        {isLoading ? (
          <p className="text-xs text-slate-400">로딩 중...</p>
        ) : zones.length === 0 ? (
          <p className="text-xs text-slate-400">화면을 드래그하여 영역을 추가하세요</p>
        ) : (
          <ul className="space-y-1">
            {zones.map((zone) => {
              const config = ZONE_TYPE_CONFIG[zone.zone_type];
              return (
                <li key={zone.id} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
                  <span className="flex items-center gap-1.5 text-xs text-white">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: config.themeColor }} />
                    {zone.name}
                    <span className="text-slate-400">({config.label})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeZone(zone.id)}
                    className="text-slate-400 hover:text-red-400"
                    aria-label={`${zone.name} 삭제`}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
