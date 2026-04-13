"use client";

/**
 * CatStatusBoard — 메인 대시보드에서 고양이 현재 상태를 보여주는 보드.
 *
 * zone detection 결과를 기반으로:
 * - "밥 먹는 중 🍚" / "화장실 가는 중 🚽" / "캣타워에서 낮잠 중 😴"
 * - zone 밖 + 움직임 없음 → "편하게 쉬는 중 💤"
 * - zone 밖 + 움직임 있음 → "돌아다니는 중 🐾"
 * - 카메라 미연결 → "카메라 연결을 기다리는 중..."
 *
 * 다묘 가정(2마리+): 고양이 이름 표시 안 함 (개체 식별 불가)
 * 1마리 가정: 고양이 이름 표시
 */

import { ZONE_TYPE_CONFIG } from "../../types/zone";
import type { ZoneType } from "../../types/zone";

/** 고양이 현재 상태 */
export type CatStatus =
  | { kind: "in_zone"; zoneType: ZoneType; zoneName: string }
  | { kind: "moving" }
  | { kind: "resting" }
  | { kind: "offline" };

type CatStatusBoardProps = {
  /** 현재 상태 */
  status: CatStatus;
  /** 고양이 이름 (1마리일 때만 표시, 2마리+면 null) */
  catName: string | null;
  /** 카메라 연결 수 */
  cameraCount: number;
};

/** 상태별 메시지 생성 */
function getStatusMessage(status: CatStatus, catName: string | null): string {
  const prefix = catName ? `${catName}: ` : "";

  switch (status.kind) {
    case "in_zone": {
      const config = ZONE_TYPE_CONFIG[status.zoneType];
      const messages: Record<ZoneType, string> = {
        food_bowl: `${prefix}밥 먹는 중 ${config.icon}`,
        water_bowl: `${prefix}물 마시는 중 ${config.icon}`,
        litter_box: `${prefix}화장실 가는 중 ${config.icon}`,
        cat_tower: `${prefix}캣타워에서 쉬는 중 ${config.icon}`,
        custom: `${prefix}${status.zoneName}에 있는 중 ${config.icon}`,
      };
      return messages[status.zoneType];
    }
    case "moving":
      return `${prefix}돌아다니는 중 🐾`;
    case "resting":
      return `${prefix}편하게 쉬는 중 💤`;
    case "offline":
      return "카메라 연결을 기다리는 중...";
  }
}

/** 상태별 배경 색상 */
function getStatusColor(status: CatStatus): string {
  switch (status.kind) {
    case "in_zone":
      return ZONE_TYPE_CONFIG[status.zoneType].defaultColor;
    case "moving":
      return "rgba(77,182,172,0.2)";
    case "resting":
      return "rgba(179,136,255,0.15)";
    case "offline":
      return "rgba(158,158,158,0.15)";
  }
}

export function CatStatusBoard({
  status,
  catName,
  cameraCount,
}: CatStatusBoardProps) {
  const message = getStatusMessage(status, catName);
  const bgColor = getStatusColor(status);
  const isLive = status.kind !== "offline";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-3 transition-all duration-500"
      style={{ backgroundColor: bgColor }}
    >
      {/* 상태 인디케이터 */}
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          isLive
            ? "animate-pulse bg-[#4FD1C5] shadow-[0_0_6px_rgba(79,209,197,0.6)]"
            : "bg-gray-400"
        }`}
      />

      {/* 상태 메시지 */}
      <p className="text-sm font-semibold text-[var(--color-primary-dark)]">
        {message}
      </p>

      {/* 카메라 수 뱃지 */}
      {cameraCount > 0 && (
        <span className="ml-auto rounded-full bg-[#4FD1C5]/20 px-2 py-0.5 text-[0.6rem] font-bold text-[#1e8f83]">
          CAM {cameraCount}
        </span>
      )}
    </div>
  );
}
