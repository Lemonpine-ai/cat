// ============================================================
// CatCalibrationProgress — 고양이별 학습 진행도 표시
// "보리 8/20, 찹쌀이 5/20" 형태로 노출
// ============================================================

"use client";

import type { CSSProperties } from "react";

type ProgressItem = {
  catId: string;
  name: string;
  count: number;
  target: number;
  done: boolean;
};

type Props = {
  items: ProgressItem[];
};

export function CatCalibrationProgress({ items }: Props) {
  if (items.length === 0) {
    return <div style={emptyStyle}>등록된 고양이가 없습니다.</div>;
  }

  return (
    <ul style={listStyle}>
      {items.map((it) => {
        const pct = Math.min(100, Math.round((it.count / it.target) * 100));
        return (
          <li key={it.catId} style={itemStyle}>
            <span style={nameStyle}>
              {it.name} {it.done ? "✓" : ""}
            </span>
            <span style={countStyle}>
              {it.count}/{it.target}
            </span>
            <div style={barWrapStyle}>
              <div
                style={{
                  ...barFillStyle,
                  width: `${pct}%`,
                  background: it.done ? "#00e676" : "#4a90e2",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- 스타일 ----------
const listStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const itemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 4,
  padding: "6px 10px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 6,
  fontSize: 13,
  color: "#fff",
};
const nameStyle: CSSProperties = { fontWeight: 600 };
const countStyle: CSSProperties = { opacity: 0.8 };
const barWrapStyle: CSSProperties = {
  gridColumn: "1 / -1",
  height: 4,
  background: "rgba(255,255,255,0.1)",
  borderRadius: 2,
  overflow: "hidden",
};
const barFillStyle: CSSProperties = {
  height: "100%",
  transition: "width 0.3s ease",
};
const emptyStyle: CSSProperties = {
  color: "#999",
  fontSize: 13,
  padding: 8,
};
