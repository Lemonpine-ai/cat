"use client";

/**
 * 일기장 헤더 — 제목 + FGS 플레이스홀더
 * - 1마리: "{고양이이름}의 일기장"
 * - 2마리+: "다보냥 일기장"
 * - FGS 건강 점수 준비 중 안내
 */

import React from "react";
import { BookOpen, Stethoscope } from "lucide-react";

type DiaryHeaderProps = {
  /** 고양이 이름 (현재 선택된 고양이) */
  catName: string;
  /** 고양이 수 (1마리면 이름 표시, 2+ 이면 "다보냥") */
  catCount: number;
};

export function DiaryHeader({ catName, catCount }: DiaryHeaderProps) {
  /* 제목 결정 */
  /* 이름이 비어있으면 "다보냥 일기장"으로 표시 */
  const title = catCount === 1 && catName ? `${catName}의 일기장` : "다보냥 일기장";

  return (
    <div style={wrapStyle}>
      {/* 제목 행 */}
      <div style={titleRowStyle}>
        <BookOpen size={20} style={{ color: "#b45309" }} />
        <h2 style={titleStyle}>{title}</h2>
      </div>

      {/* FGS 건강 점수 플레이스홀더 */}
      <div style={fgsStyle}>
        <Stethoscope size={14} style={{ color: "#8a9e9b" }} />
        <span>건강 점수: 준비 중 🩺</span>
      </div>
    </div>
  );
}

/* ── 인라인 스타일 ── */

const wrapStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "0.35rem",
};

const titleRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.45rem",
};

const titleStyle: React.CSSProperties = {
  fontSize: "1.1rem", fontWeight: 800, color: "#1a1a1a",
  margin: 0,
};

const fgsStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.3rem",
  fontSize: "0.75rem", fontWeight: 600, color: "#8a9e9b",
};
