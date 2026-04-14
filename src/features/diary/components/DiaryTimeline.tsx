"use client";

/**
 * 타임라인 UI — 시간대별(오전/오후/저녁) 돌봄 기록 표시
 * 각 엔트리: 도트 + 귀여운 문장 + 시각 라벨 / 빈 상태 안내
 */

import React, { useMemo } from "react";
import { Sunrise, Sun, Moon, Circle } from "lucide-react";
import type { DiaryTimelineEntry, TimeSection } from "@/types/diary";

/** 시간대별 설정 */
const SECTION_CONFIG: Record<TimeSection, { icon: React.ElementType; label: string; emoji: string }> = {
  morning: { icon: Sunrise, label: "오전", emoji: "🌅" },
  afternoon: { icon: Sun, label: "오후", emoji: "☀️" },
  evening: { icon: Moon, label: "저녁", emoji: "🌙" },
};
const SECTION_ORDER: TimeSection[] = ["morning", "afternoon", "evening"];

type DiaryTimelineProps = { entries: DiaryTimelineEntry[] };

/** 타임라인 컴포넌트 */
export function DiaryTimeline({ entries }: DiaryTimelineProps) {
  /* 시간대별 그룹핑 — Hook은 항상 동일 순서로 호출 (Rules of Hooks 준수) */
  const grouped = useMemo(() => {
    const g: Record<TimeSection, DiaryTimelineEntry[]> = { morning: [], afternoon: [], evening: [] };
    for (const e of entries) g[e.section].push(e);
    return g;
  }, [entries]);

  /* 빈 상태 안내 — Hook 호출 이후에 early return */
  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#5c7d79", fontSize: "0.88rem", lineHeight: 1.7 }}>
        오늘은 아직 기록이 없어요. 집사가 돌아오면 기록해 줄게! 🐾
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {SECTION_ORDER.map((sec) => {
        const items = grouped[sec];
        if (items.length === 0) return null;
        const { icon: Icon, emoji, label } = SECTION_CONFIG[sec];
        return (
          <div key={sec}>
            {/* 섹션 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem" }}>
              <Icon size={16} style={{ color: "#5c7d79" }} />
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#3d5a56" }}>
                {emoji} {label}
              </span>
            </div>
            {/* 엔트리 목록 */}
            <div style={listStyle}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", paddingLeft: "0.5rem" }}>
                  <Circle size={8} fill="#4fd1c5" stroke="none" style={{ flexShrink: 0, marginTop: 6 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "0.85rem", color: "#1a1a1a", lineHeight: 1.6 }}>{item.sentence}</span>
                    <span style={{ fontSize: "0.7rem", color: "#8a9e9b", marginLeft: "0.5rem" }}>{item.timeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* 타임라인 좌측 세로선 */
const listStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "0.5rem",
  paddingLeft: "0.25rem", borderLeft: "2px solid #d6f5f1", marginLeft: "0.35rem",
};
