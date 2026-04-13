"use client";

/**
 * 날짜 네비게이션 — [←어제] [4월 13일] [오늘→]
 * 날짜 클릭 시 네이티브 date picker, 미래 날짜 차단
 */

import React, { useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

type DiaryDateNavProps = {
  selectedDate: string;          // YYYY-MM-DD
  onDateChange: (date: string) => void;
};

/** "4월 13일" 형식 (빈 문자열 방어) */
function formatLabel(d: string): string {
  if (!d || !d.includes("-")) return "날짜 미상";
  const [, m, day] = d.split("-");
  const mn = Number(m);
  const dn = Number(day);
  if (Number.isNaN(mn) || Number.isNaN(dn)) return "날짜 미상";
  return `${mn}월 ${dn}일`;
}

/** 날짜 ±1일 이동 (로컬 타임존 기준, invalid 입력 방어) */
function shift(d: string, n: number): string {
  if (!d || !d.includes("-")) return today();
  const [y, m, day] = d.split("-").map(Number);
  if ([y, m, day].some(Number.isNaN)) return today();
  const dt = new Date(y, m - 1, day + n);
  return formatDateStr(dt);
}

/** Date → "YYYY-MM-DD" (로컬 타임존 기준) */
function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 오늘 날짜 (로컬 타임존 기준, 함수로 매번 호출) */
const today = () => formatDateStr(new Date());

export function DiaryDateNav({ selectedDate, onDateChange }: DiaryDateNavProps) {
  const ref = useRef<HTMLInputElement>(null);
  const todayStr = today(); /* 렌더당 1회만 호출 */
  const isToday = selectedDate === todayStr;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0" }}>
      {/* ← 어제 */}
      <button onClick={() => onDateChange(shift(selectedDate, -1))} style={btn} aria-label="이전 날짜">
        <ChevronLeft size={18} />
        <span style={{ fontSize: "0.78rem" }}>어제</span>
      </button>

      {/* 날짜 라벨 + 숨겨진 input */}
      <button onClick={() => ref.current?.showPicker?.()} style={dateBtn} aria-label="날짜 선택">
        <Calendar size={14} style={{ color: "#5c7d79" }} />
        <span>{formatLabel(selectedDate)}</span>
        <input
          ref={ref} type="date" value={selectedDate} max={todayStr}
          onChange={(e) => {
            const val = e.target.value;
            /* 미래 날짜 차단 — max 속성 우회 방어 */
            if (val && val <= todayStr) onDateChange(val);
          }}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          tabIndex={-1}
        />
      </button>

      {/* 오늘 → (오늘 날짜로 직접 이동) */}
      <button
        onClick={() => { if (!isToday) onDateChange(todayStr); }}
        style={{ ...btn, opacity: isToday ? 0.35 : 1 }}
        disabled={isToday} aria-label="오늘로 이동"
      >
        <span style={{ fontSize: "0.78rem" }}>오늘</span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/* ── 스타일 ── */
const btn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.15rem",
  background: "none", border: "none", cursor: "pointer",
  color: "#3d5a56", fontWeight: 600, fontSize: "0.82rem",
};
const dateBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "0.35rem",
  background: "none", border: "1.5px solid #d6f5f1", borderRadius: "999px",
  padding: "0.35rem 0.85rem", cursor: "pointer",
  fontSize: "0.85rem", fontWeight: 700, color: "#1a1a1a", position: "relative",
};
