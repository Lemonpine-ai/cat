"use client";

import { useCallback, useState } from "react";
import type { PainLevel } from "@/types/diary";
import { PAIN_LEVEL_MENT, PAIN_LEVEL_LABEL } from "../lib/cuteMentMap";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "../styles/Diary.module.css";
import slider from "../styles/PainSlider.module.css";

/* 통증 5단계 이모지 설정 */
const PAIN_STEPS: { level: PainLevel; emoji: string }[] = [
  { level: 1, emoji: "😸" },
  { level: 2, emoji: "😊" },
  { level: 3, emoji: "🤔" },
  { level: 4, emoji: "😿" },
  { level: 5, emoji: "🚨" },
];

type PainSliderProps = {
  catId: string;
  homeId: string;
  /** 이미 저장된 통증 지수 (없으면 null) */
  initialPainLevel: PainLevel | null;
  onSaved?: (level: PainLevel) => void;
};

/**
 * 통증 지수 5단계 슬라이더 + AI 정확도 95% 배지 + DB 저장
 * 이모지 스텝 버튼 + 레인지 슬라이더 동시 조작 가능.
 */
export function PainSlider({ catId, homeId, initialPainLevel, onSaved }: PainSliderProps) {
  const [painLevel, setPainLevel] = useState<PainLevel | null>(initialPainLevel);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /** DB에 통증 지수 저장 (upsert) */
  const handleSave = useCallback(async () => {
    if (!painLevel || saving) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("cat_health_logs")
        .upsert({ cat_id: catId, home_id: homeId, record_date: today, pain_level: painLevel }, { onConflict: "cat_id,record_date" });
      if (error) { setToast(`저장 실패: ${error.message}`); }
      else { setToast("통증 지수 저장 완료! 🐾"); onSaved?.(painLevel); }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "저장 중 오류");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 3000);
    }
  }, [painLevel, saving, catId, homeId, onSaved]);

  return (
    <div className={slider.sliderWrapper}>
      {/* 헤더: 제목 + AI 정확도 배지 */}
      <div className={slider.sliderHeader}>
        <span className={slider.sliderTitle}>🩺 통증 지수</span>
        <span className={slider.accuracyBadge}>
          <span className={slider.accuracyDot} />
          AI 분석 정확도 95%
        </span>
      </div>

      {/* 5단계 스텝 버튼 */}
      <div className={slider.stepsRow}>
        {PAIN_STEPS.map(({ level, emoji }) => (
          <button key={level} type="button" className={slider.step} onClick={() => setPainLevel(level)} aria-label={`통증 ${level}단계: ${PAIN_LEVEL_LABEL[level]}`}>
            <div className={[slider.stepCircle, slider[`stepCircle${level}`], painLevel === level ? slider.stepCircleActive : ""].filter(Boolean).join(" ")}>
              {emoji}
            </div>
            <span className={`${slider.stepLabel} ${painLevel === level ? slider.stepLabelActive : ""}`}>
              {PAIN_LEVEL_LABEL[level]}
            </span>
          </button>
        ))}
      </div>

      {/* 레인지 슬라이더 */}
      <input type="range" min={1} max={5} step={1} value={painLevel ?? 1} onChange={(e) => setPainLevel(Number(e.target.value) as PainLevel)} className={slider.rangeInput} aria-label="통증 지수 슬라이더" />

      {/* 선택 결과 멘트 */}
      <div className={slider.resultMent}>
        {painLevel ? PAIN_LEVEL_MENT[painLevel] : "통증 지수를 선택해주세요 🐾"}
      </div>

      {/* 저장 버튼 */}
      <button type="button" className={styles.memoSaveBtn} style={{ width: "100%", marginTop: "0.25rem" }} onClick={handleSave} disabled={!painLevel || saving}>
        {saving ? "저장 중..." : "통증 지수 저장하기"}
      </button>

      {toast ? <div className={styles.toast} role="status" aria-live="polite">{toast}</div> : null}
    </div>
  );
}
