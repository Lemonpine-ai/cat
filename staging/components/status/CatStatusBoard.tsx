"use client";

/**
 * CatStatusBoard -- 고양이 현재 상태 보드.
 * zone 감지 기반 상태 표시. lucide-react 아이콘 사용.
 * 1마리: 이름 표시, 2마리+: 이름 생략 (개체 식별 불가)
 */

import { PawPrint, Moon, WifiOff, UtensilsCrossed, Droplets, Sparkles, Castle, Camera } from "lucide-react";
import { ZONE_TYPE_CONFIG } from "@/types/zone";
import type { ZoneType } from "@/types/zone";
import type { ReactNode } from "react";

/** 고양이 현재 상태 */
export type CatStatus =
  | { kind: "in_zone"; zoneType: ZoneType; zoneName: string }
  | { kind: "moving" }
  | { kind: "resting" }
  | { kind: "offline" };

type Props = { status: CatStatus; catName: string | null; cameraCount: number };

/** zone 타입별 lucide 아이콘 */
const ZONE_ICON: Record<ZoneType, ReactNode> = {
  food_bowl: <UtensilsCrossed size={16} strokeWidth={2} />,
  water_bowl: <Droplets size={16} strokeWidth={2} />,
  litter_box: <Sparkles size={16} strokeWidth={2} />,
  cat_tower: <Castle size={16} strokeWidth={2} />,
  custom: <PawPrint size={16} strokeWidth={2} />,
};

/** 상태 -> 아이콘 */
function icon(s: CatStatus): ReactNode {
  if (s.kind === "in_zone") return ZONE_ICON[s.zoneType];
  if (s.kind === "moving") return <PawPrint size={16} strokeWidth={2} />;
  if (s.kind === "resting") return <Moon size={16} strokeWidth={2} />;
  return <WifiOff size={16} strokeWidth={2} />;
}

/** 상태 -> 메시지 */
function msg(s: CatStatus, name: string | null): string {
  const p = name ? `${name}: ` : "";
  if (s.kind === "in_zone") {
    const m: Record<ZoneType, string> = {
      food_bowl: `${p}밥 먹는 중`, water_bowl: `${p}물 마시는 중`,
      litter_box: `${p}화장실 가는 중`, cat_tower: `${p}캣타워에서 쉬는 중`,
      custom: `${p}${s.zoneName}에 있는 중`,
    };
    return m[s.zoneType];
  }
  if (s.kind === "moving") return `${p}활동 중`;
  if (s.kind === "resting") return `${p}편하게 쉬는 중`;
  return "카메라 연결을 기다리는 중...";
}

/** 상태 -> 배경색 */
function bg(s: CatStatus): string {
  if (s.kind === "in_zone") return ZONE_TYPE_CONFIG[s.zoneType].defaultColor;
  if (s.kind === "moving") return "rgba(77,182,172,0.2)";
  if (s.kind === "resting") return "rgba(179,136,255,0.15)";
  return "rgba(158,158,158,0.15)";
}

export function CatStatusBoard({ status, catName, cameraCount }: Props) {
  const isLive = status.kind !== "offline";
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-3 transition-all duration-500"
      style={{ backgroundColor: bg(status) }}
    >
      {/* 초록 점 인디케이터 */}
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${
        isLive ? "animate-pulse bg-[#4FD1C5] shadow-[0_0_6px_rgba(79,209,197,0.6)]" : "bg-gray-400"
      }`} />
      {/* 아이콘 */}
      <span className="text-[var(--color-primary-dark)]">{icon(status)}</span>
      {/* 메시지 */}
      <p className="text-sm font-semibold text-[var(--color-primary-dark)]">{msg(status, catName)}</p>
      {/* 카메라 수 */}
      {cameraCount > 0 && (
        <span className="ml-auto flex items-center gap-1 rounded-full bg-[#4FD1C5]/20 px-2 py-0.5 text-[0.6rem] font-bold text-[#1e8f83]">
          <Camera size={10} strokeWidth={2.5} />
          {cameraCount}
        </span>
      )}
    </div>
  );
}
