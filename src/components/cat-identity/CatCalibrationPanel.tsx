// ============================================================
// CatCalibrationPanel — 상위 컨테이너
// Overlay + Progress + "완료" 버튼 묶음
// CameraLiveViewer 연결(live) 상태에서만 활성화
// ============================================================

"use client";

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { CatCalibrationOverlay } from "./CatCalibrationOverlay";
import { CatCalibrationProgress } from "./CatCalibrationProgress";
import { useCatColorCalibration } from "@/hooks/useCatColorCalibration";

type CatItem = { id: string; name: string };

type Props = {
  cats: CatItem[];
  videoRef: RefObject<HTMLVideoElement | null>;
  bbox: { x: number; y: number; w: number; h: number } | null;
  zoneId?: string;
  /** 비디오가 실제 재생 중일 때만 true */
  live: boolean;
  onComplete?: () => void;
};

export function CatCalibrationPanel({
  cats,
  videoRef,
  bbox,
  zoneId,
  live,
  onComplete,
}: Props) {
  // 현재 선택된 고양이 (샘플을 누구에게 귀속시킬지)
  const [activeCatId, setActiveCatId] = useState<string | null>(
    cats[0]?.id ?? null,
  );

  // 하나의 훅이 catId별 Map 버퍼를 내부에서 관리 — 고양이 전환 시 데이터 유지
  const activeCat = useMemo(
    () => cats.find((c) => c.id === activeCatId) ?? null,
    [cats, activeCatId],
  );

  const calib = useCatColorCalibration({
    catId: activeCatId ?? "", // 빈값일 땐 addSample이 먼저 체크
    videoRef,
    bbox,
    zoneId,
  });

  // 사용자가 "이건 OO" 클릭 → active 전환 후 샘플 추가
  // (다른 고양이 전환 시에도 이전 버퍼 유지 — reset 호출 안 함)
  const handlePick = useCallback(
    (catId: string) => {
      if (!live) return;
      if (catId !== activeCatId) {
        setActiveCatId(catId);
        // 전환 프레임은 샘플 생략 (다음 클릭부터 누적)
        return;
      }
      calib.addSample();
    },
    [activeCatId, calib, live],
  );

  const handleSkip = useCallback(() => {
    // 건너뛰기 = 이번 프레임 무시
    // (UX: 오탐/가림 상황에서 사용자가 훈련 데이터 오염 방지)
  }, []);

  const handleComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // 진행도 표시 — 모든 고양이의 실제 누적 수/완료 상태 표시
  const progressItems = useMemo(
    () =>
      cats.map((c) => ({
        catId: c.id,
        name: c.name,
        count: calib.state.countsByCat[c.id] ?? 0,
        target: calib.state.target,
        done: calib.state.doneByCat[c.id] ?? false,
      })),
    [
      cats,
      calib.state.countsByCat,
      calib.state.doneByCat,
      calib.state.target,
    ],
  );

  // 모든 고양이가 완료되어야 최종 "완료하기" 활성화
  const allDone = useMemo(
    () => cats.length > 0 && cats.every((c) => calib.state.doneByCat[c.id]),
    [cats, calib.state.doneByCat],
  );

  return (
    <div style={wrapStyle}>
      {/* 비디오 오버레이 영역 — 부모가 position:relative video wrap 제공해야 함 */}
      <CatCalibrationOverlay
        bbox={bbox}
        cats={cats}
        onPickCat={handlePick}
        onSkip={handleSkip}
        disabled={!live || calib.state.saving}
      />

      {/* 진행 상황 패널 */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          색상 학습
          {activeCat && <span style={activeTagStyle}>현재: {activeCat.name}</span>}
        </div>
        <CatCalibrationProgress items={progressItems} />
        {calib.state.error && <div style={errStyle}>{calib.state.error}</div>}
        <button
          onClick={handleComplete}
          disabled={!allDone}
          style={doneBtnStyle}
        >
          {allDone ? "완료하기" : "모든 고양이 20장 채워야 완료 가능"}
        </button>
      </div>
    </div>
  );
}

// ---------- 스타일 ----------
const wrapStyle: CSSProperties = { position: "relative", width: "100%" };
const panelStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "rgba(0,0,0,0.7)",
  borderRadius: 8,
  color: "#fff",
};
const headerStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between",
};
const activeTagStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.8,
  fontWeight: 400,
};
const errStyle: CSSProperties = {
  marginTop: 8,
  color: "#ff7272",
  fontSize: 12,
};
const doneBtnStyle: CSSProperties = {
  marginTop: 10,
  width: "100%",
  padding: "8px 0",
  background: "#00e676",
  color: "#000",
  border: 0,
  borderRadius: 6,
  fontWeight: 700,
  cursor: "pointer",
};
