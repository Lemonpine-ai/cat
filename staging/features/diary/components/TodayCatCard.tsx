"use client";

import { useCallback, useState } from "react";
import type { DiaryCatProfile, PainLevel, CatHealthLog } from "../types/diary";
import { PAIN_LEVEL_MENT, PAIN_LEVEL_LABEL } from "../lib/cuteMentMap";
import { getCuteMent } from "../lib/cuteMentMap";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "../styles/Diary.module.css";
import slider from "../styles/PainSlider.module.css";

/* ── 통증 5단계 설정 ── */
const PAIN_STEPS: { level: PainLevel; emoji: string }[] = [
  { level: 1, emoji: "😸" },
  { level: 2, emoji: "😊" },
  { level: 3, emoji: "🤔" },
  { level: 4, emoji: "😿" },
  { level: 5, emoji: "🚨" },
];

type TodayCatCardProps = {
  /** 선택된 고양이 프로필 */
  cat: DiaryCatProfile;
  /** 오늘의 건강 기록 (없으면 null) */
  todayHealth: CatHealthLog | null;
  /** 집 ID (DB 저장용) */
  homeId: string;
  /** 저장 성공 시 상위로 알림 */
  onPainSaved?: (painLevel: PainLevel) => void;
};

/**
 * 오늘의 냥이 카드 — 큰 사진 + 상태 멘트 + 통증 슬라이더 + AI 정확도 배지
 * 통증 지수와 '95% 정확도' 문구가 가장 눈에 띄게 배치됨.
 */
export function TodayCatCard({
  cat,
  todayHealth,
  homeId,
  onPainSaved,
}: TodayCatCardProps) {
  /* 통증 지수 로컬 상태 — DB 값 or null(미측정) */
  const [painLevel, setPainLevel] = useState<PainLevel | null>(
    todayHealth?.pain_level ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  /** 통증 단계 클릭/슬라이더 변경 시 */
  const handleSelectPain = useCallback((level: PainLevel) => {
    setPainLevel(level);
  }, []);

  /** 슬라이더 range 변경 핸들러 */
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value) as PainLevel;
      setPainLevel(val);
    },
    [],
  );

  /** DB에 통증 지수 저장 (upsert) */
  const handleSavePain = useCallback(async () => {
    if (!painLevel || saving) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const today = new Date().toISOString().slice(0, 10);

      /* cat_health_logs에 upsert — 같은 고양이+날짜면 업데이트 */
      const { error } = await supabase
        .from("cat_health_logs")
        .upsert(
          {
            cat_id: cat.id,
            home_id: homeId,
            record_date: today,
            pain_level: painLevel,
          },
          { onConflict: "cat_id,record_date" },
        );

      if (error) {
        setToast(`저장 실패: ${error.message}`);
      } else {
        setToast("통증 지수 저장 완료! 🐾");
        onPainSaved?.(painLevel);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "저장 중 오류";
      setToast(msg);
    } finally {
      setSaving(false);
      /* 3초 후 토스트 제거 */
      setTimeout(() => setToast(""), 3000);
    }
  }, [painLevel, saving, cat.id, homeId, onPainSaved]);

  /* 고양이 상태에 따른 귀여운 멘트 */
  const statusMent = cat.status ? getCuteMent(cat.status) : "오늘도 건강한 하루다옹 🐾";

  return (
    <div className={styles.todayCard}>
      {/* ── 큰 사진 ── */}
      {cat.photo_front_url ? (
        <img
          className={styles.todayCardPhoto}
          src={cat.photo_front_url}
          alt={`${cat.name} 사진`}
        />
      ) : (
        <div className={styles.todayCardPhotoPlaceholder}>🐱</div>
      )}

      {/* ── 카드 본문 ── */}
      <div className={styles.todayCardBody}>
        {/* 이름 + 상태 멘트 */}
        <h2 className={styles.todayCardName}>
          {cat.name}의 오늘 🐾
        </h2>
        <p className={styles.todayCardMent}>{statusMent}</p>

        {/* ── 통증 지수 슬라이더 (핵심 UI) ── */}
        <div className={slider.sliderWrapper}>
          {/* 헤더: 제목 + AI 정확도 배지 */}
          <div className={slider.sliderHeader}>
            <span className={slider.sliderTitle}>🩺 통증 지수</span>
            {/* AI 정확도 배지 — 가장 눈에 띄어야 함 */}
            <span className={slider.accuracyBadge}>
              <span className={slider.accuracyDot} />
              AI 분석 정확도 95%
            </span>
          </div>

          {/* 5단계 스텝 버튼 */}
          <div className={slider.stepsRow}>
            {PAIN_STEPS.map(({ level, emoji }) => (
              <button
                key={level}
                type="button"
                className={slider.step}
                onClick={() => handleSelectPain(level)}
                aria-label={`통증 ${level}단계: ${PAIN_LEVEL_LABEL[level]}`}
              >
                <div
                  className={[
                    slider.stepCircle,
                    slider[`stepCircle${level}`],
                    painLevel === level ? slider.stepCircleActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {emoji}
                </div>
                <span
                  className={`${slider.stepLabel} ${
                    painLevel === level ? slider.stepLabelActive : ""
                  }`}
                >
                  {PAIN_LEVEL_LABEL[level]}
                </span>
              </button>
            ))}
          </div>

          {/* 레인지 슬라이더 (보조 입력) */}
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={painLevel ?? 1}
            onChange={handleSliderChange}
            className={slider.rangeInput}
            aria-label="통증 지수 슬라이더"
          />

          {/* 선택 결과 멘트 */}
          <div className={slider.resultMent}>
            {painLevel
              ? PAIN_LEVEL_MENT[painLevel]
              : "통증 지수를 선택해주세요 🐾"}
          </div>

          {/* 저장 버튼 */}
          <button
            type="button"
            className={styles.memoSaveBtn}
            style={{ width: "100%", marginTop: "0.25rem" }}
            onClick={handleSavePain}
            disabled={!painLevel || saving}
          >
            {saving ? "저장 중..." : "통증 지수 저장하기"}
          </button>
        </div>

        {/* ── 기존 통증 기록 배지 (이미 기록된 경우) ── */}
        {todayHealth?.pain_level && !toast ? (
          <div
            className={`${styles.painBadge} ${
              todayHealth.pain_level >= 4
                ? styles.painBadgeSevere
                : todayHealth.pain_level >= 3
                  ? styles.painBadgeModerate
                  : todayHealth.pain_level >= 2
                    ? styles.painBadgeMild
                    : ""
            }`}
            style={{ marginTop: "0.75rem" }}
          >
            <div
              className={`${styles.painCircle} ${
                todayHealth.pain_level >= 4
                  ? styles.painCircleSevere
                  : todayHealth.pain_level >= 3
                    ? styles.painCircleModerate
                    : todayHealth.pain_level >= 2
                      ? styles.painCircleMild
                      : ""
              }`}
            >
              {todayHealth.pain_level}
            </div>
            <div className={styles.painInfo}>
              <div className={styles.painLabel}>
                오늘 통증 지수: {PAIN_LEVEL_LABEL[todayHealth.pain_level]}
              </div>
              <div className={styles.painAccuracy}>
                <span className={styles.painAccuracyDot} />
                AI 분석 정확도 95%
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 토스트 ── */}
      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
