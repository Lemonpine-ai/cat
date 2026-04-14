"use client";

/**
 * 돌봄 요약 바 — 하루 돌봄 횟수 한 줄 표시
 * "🍚 식사 3회 | 💧 음수 5회 | 🚽 배변 2회 | 💊 투약 1회"
 * 0회 항목은 흐리게 표시 (opacity 0.4)
 */

import React from "react";

type DiarySummaryBarProps = {
  /** 식사 횟수 */
  meal: number;
  /** 음수 횟수 */
  water: number;
  /** 배변(화장실 청소) 횟수 */
  litter: number;
  /** 투약 횟수 */
  medicine: number;
};

/** 요약 항목 정의 */
const ITEMS: { key: keyof DiarySummaryBarProps; emoji: string; label: string }[] = [
  { key: "meal", emoji: "🍚", label: "식사" },
  { key: "water", emoji: "💧", label: "음수" },
  { key: "litter", emoji: "🚽", label: "배변" },
  { key: "medicine", emoji: "💊", label: "투약" },
];

export function DiarySummaryBar(props: DiarySummaryBarProps) {
  return (
    <div style={barStyle}>
      {ITEMS.map((item, i) => {
        const count = props[item.key] ?? 0;
        return (
          <React.Fragment key={item.key}>
            {i > 0 && <span style={dividerStyle}>|</span>}
            <span style={{ ...itemStyle, opacity: count === 0 ? 0.4 : 1 }}>
              {item.emoji} {item.label} {count}회
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── 인라인 스타일 ── */

const barStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  flexWrap: "wrap", gap: "0.25rem",
  padding: "0.6rem 0.75rem",
  background: "#f8fffe", borderRadius: "0.75rem",
  border: "1px solid #e0f2ef",
  fontSize: "0.8rem", color: "#3d5a56",
};

const itemStyle: React.CSSProperties = {
  fontWeight: 600, whiteSpace: "nowrap",
};

const dividerStyle: React.CSSProperties = {
  color: "#c4ddd9", margin: "0 0.15rem",
};
