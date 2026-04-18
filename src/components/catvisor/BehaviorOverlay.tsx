/**
 * 행동 인식 오버레이 UI
 * - CameraSlot 우상단에 라벨 칩 표시
 * - 현재 확정된 행동 + emoji + confidence%
 * - 행동 전환 시 aria-live 로 접근성 안내
 * - 행동 없으면 렌더 안 함 (레이아웃 차지 X)
 */

"use client";

import { useEffect, useRef } from "react";
import type { BehaviorDetection } from "@/types/behavior";
import { getBehaviorClass } from "@/lib/ai/behaviorClasses";

type Props = {
  behavior: BehaviorDetection | null;
  isInferring?: boolean;
};

export function BehaviorOverlay({ behavior, isInferring = false }: Props) {
  const lastKeyRef = useRef<string | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);

  // 행동 전환 감지 → aria-live 안내
  useEffect(() => {
    const key = behavior?.classKey ?? null;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    if (liveRef.current && behavior) {
      liveRef.current.textContent = `${behavior.label} 감지`;
    }
  }, [behavior]);

  // 행동이 없고 추론 중도 아니면 빈 노드
  if (!behavior && !isInferring) {
    return <span ref={liveRef} className="sr-only" aria-live="polite" />;
  }

  const cls = behavior ? getBehaviorClass(behavior.classId) : null;
  const pct = behavior ? Math.round(behavior.confidence * 100) : 0;

  return (
    <>
      {/* 스크린리더 전용 실시간 안내 */}
      <span
        ref={liveRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      {/* 좌상단 칩 — 기존 우상단 확대 버튼과 겹치지 않도록 좌측 배치 */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.65)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          backdropFilter: "blur(4px)",
          zIndex: 10,
          pointerEvents: "none",
          transition: "opacity 200ms",
          opacity: behavior ? 1 : 0.5,
        }}
      >
        {cls ? (
          <>
            <span aria-hidden="true" style={{ fontSize: 14 }}>
              {cls.emoji}
            </span>
            <span>{cls.label}</span>
            <span style={{ opacity: 0.75, marginLeft: 2 }}>{pct}%</span>
          </>
        ) : (
          <span style={{ opacity: 0.7 }}>인식 중…</span>
        )}
      </div>
    </>
  );
}
