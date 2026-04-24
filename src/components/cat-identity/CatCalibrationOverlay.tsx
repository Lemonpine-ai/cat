// ============================================================
// CatCalibrationOverlay — 비디오 위에 bbox와 고양이 선택 버튼 오버레이
// 사용자가 bbox 내 객체가 어느 고양이인지 클릭으로 알려줌
// ============================================================

"use client";

import type { CSSProperties } from "react";

type CatOption = { id: string; name: string };

type Props = {
  bbox: { x: number; y: number; w: number; h: number } | null;
  cats: CatOption[];
  onPickCat: (catId: string) => void;
  onSkip: () => void;
  disabled?: boolean;
};

export function CatCalibrationOverlay({
  bbox,
  cats,
  onPickCat,
  onSkip,
  disabled,
}: Props) {
  // bbox 없으면 안내만 표시
  if (!bbox) {
    return (
      <div style={hintStyle}>
        고양이가 프레임 안에 들어와야 샘플을 추가할 수 있어요.
      </div>
    );
  }

  // bbox 좌표 (정규화 0~1 → percent)
  const boxStyle: CSSProperties = {
    position: "absolute",
    left: `${bbox.x * 100}%`,
    top: `${bbox.y * 100}%`,
    width: `${bbox.w * 100}%`,
    height: `${bbox.h * 100}%`,
    border: "2px solid #00e676",
    boxSizing: "border-box",
    pointerEvents: "none",
  };

  return (
    <div style={wrapStyle}>
      <div style={boxStyle} />
      <div style={buttonRowStyle(bbox)}>
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => onPickCat(c.id)}
            disabled={disabled}
            style={btnStyle}
          >
            {c.name}
          </button>
        ))}
        <button onClick={onSkip} disabled={disabled} style={skipBtnStyle}>
          건너뛰기
        </button>
      </div>
    </div>
  );
}

// ---------- 스타일 ----------
const wrapStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};
const hintStyle: CSSProperties = {
  position: "absolute",
  bottom: 12,
  left: 12,
  color: "#fff",
  background: "rgba(0,0,0,0.6)",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 13,
};
function buttonRowStyle(
  bbox: { x: number; y: number; w: number; h: number },
): CSSProperties {
  // bbox 위쪽에 버튼 배치 (bbox 상단 근처)
  return {
    position: "absolute",
    left: `${bbox.x * 100}%`,
    top: `calc(${bbox.y * 100}% - 40px)`,
    display: "flex",
    gap: 6,
    pointerEvents: "auto",
  };
}
const btnStyle: CSSProperties = {
  padding: "6px 10px",
  fontSize: 13,
  background: "#00e676",
  color: "#000",
  border: 0,
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
};
const skipBtnStyle: CSSProperties = {
  ...btnStyle,
  background: "#555",
  color: "#fff",
};
