"use client";

/** ZoneTypeSelector — zone 타입 5종 선택 버튼 그룹 */

import type { ZoneType } from "@/types/zone";
import { ZONE_TYPE_CONFIG } from "@/types/zone";

const TYPE_EMOJI: Record<ZoneType, string> = {
  food_bowl: "\uD83C\uDF7D",   // 🍽
  water_bowl: "\uD83D\uDCA7",  // 💧
  litter_box: "\uD83D\uDEBD",  // 🚽
  cat_tower: "\uD83C\uDFF0",   // 🏰
  custom: "\u270F",             // ✏
};

type ZoneTypeSelectorProps = {
  selected: ZoneType;
  onSelect: (type: ZoneType) => void;
};

const ZONE_TYPES: ZoneType[] = [
  "food_bowl", "water_bowl", "litter_box", "cat_tower", "custom",
];

export function ZoneTypeSelector({ selected, onSelect }: ZoneTypeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ZONE_TYPES.map((type) => {
        const config = ZONE_TYPE_CONFIG[type];
        const isSelected = type === selected;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
              isSelected
                ? "bg-[#1e8f83] text-white shadow-sm"
                : "bg-white/10 text-slate-300 hover:bg-white/20"
            }`}
          >
            <span>{TYPE_EMOJI[type]}</span>
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
