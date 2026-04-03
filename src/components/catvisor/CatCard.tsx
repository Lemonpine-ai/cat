"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CAT_STATUS_DB_VALUES,
  STATUS_DISPLAY_LABEL,
  type CatStatusDbValue,
} from "@/lib/cat/catStatusDisplayLabel";
import type { CatProfileRow } from "@/types/cat";
import styles from "./CatvisorHomeDashboard.module.css";

/** 파스텔 변형별 CSS 모듈 클래스 */
const STATUS_BUTTON_VARIANT_CLASS: Record<CatStatusDbValue, string> = {
  꿀잠: styles.catStatusBtnSleep,
  배변: styles.catStatusBtnPoop,
  그루밍: styles.catStatusBtnGroom,
  식사: styles.catStatusBtnMeal,
  우다다: styles.catStatusBtnZoom,
};

type CatCardProps = {
  cat: CatProfileRow;
  homeId: string;
};

/**
 * 단일 고양이 카드 — 집사 버튼으로 `cats.status` 갱신 +
 * `cat_logs` 에 활동 이력을 남겨 오늘의 요약이 집계될 수 있게 합니다.
 */
export function CatCard({ cat, homeId }: CatCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayStatus, setDisplayStatus] = useState<string | null>(cat.status ?? null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeButtonLabel, setActiveButtonLabel] = useState<CatStatusDbValue | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setDisplayStatus(cat.status ?? null);
  }, [cat.status]);

  async function handleStatusButtonClick(dbValue: CatStatusDbValue) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setActiveButtonLabel(dbValue);

    try {
      const supabase = createSupabaseBrowserClient();

      const { error: statusError } = await supabase
        .from("cats")
        .update({ status: dbValue })
        .eq("id", cat.id);

      if (statusError) {
        setErrorMessage(statusError.message);
        return;
      }

      await supabase.from("cat_logs").insert({
        home_id: homeId,
        cat_id: cat.id,
        status: dbValue,
        captured_at: new Date().toISOString(),
      });

      setDisplayStatus(dbValue);
      const displayLabel = STATUS_DISPLAY_LABEL[dbValue];
      setFeedbackMessage(
        `기록 완료! ${cat.name}이(가) 아주 좋아할 거예요 💚`,
      );
      void displayLabel;

      startTransition(() => {
        router.refresh();
      });
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : "저장에 실패했습니다.";
      setErrorMessage(message);
    } finally {
      setActiveButtonLabel(null);
    }
  }

  const isBusy = activeButtonLabel !== null || isPending;
  const displayStatusLabel = displayStatus
    ? (STATUS_DISPLAY_LABEL[displayStatus as CatStatusDbValue] ?? displayStatus)
    : null;

  return (
    <article
      className={`${styles.catCard} ${isMounted ? styles.catCardVisible : ""}`}
    >
      <div className={styles.catCardPhotoWrap}>
        {cat.photo_front_url ? (
          <Image
            src={cat.photo_front_url}
            alt={`${cat.name} 사진`}
            fill
            className={styles.catCardPhoto}
            sizes="(max-width: 640px) 100vw, 180px"
          />
        ) : (
          <div className={styles.catCardPhotoFallback} aria-hidden>
            <CuteCatSilhouetteIcon />
          </div>
        )}
        {displayStatusLabel && (
          <span className={styles.catCardStatusBadge}>{displayStatusLabel}</span>
        )}
      </div>
      <div className={styles.catCardBody}>
        <h3 className={styles.catCardName}>{cat.name}</h3>
        <dl className={styles.catCardMeta}>
          <div className={styles.catCardMetaRow}>
            <dt>성별</dt>
            <dd>{formatCatSexLabel(cat.sex)}</dd>
          </div>
          <div className={styles.catCardMetaRow}>
            <dt>품종</dt>
            <dd>{cat.breed?.trim() ? cat.breed : "미등록"}</dd>
          </div>
        </dl>

        <div className={styles.catStatusBtnGroup} role="group" aria-label={`${cat.name} 활동 기록`}>
          {CAT_STATUS_DB_VALUES.map((dbValue) => (
            <button
              key={dbValue}
              type="button"
              className={`${styles.catStatusBtn} ${STATUS_BUTTON_VARIANT_CLASS[dbValue]}`}
              disabled={isBusy}
              onClick={() => {
                void handleStatusButtonClick(dbValue);
              }}
            >
              {activeButtonLabel === dbValue ? "…" : STATUS_DISPLAY_LABEL[dbValue]}
            </button>
          ))}
        </div>

        {feedbackMessage ? (
          <p className={styles.catCardFeedbackOk} role="status">
            {feedbackMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className={styles.catCardFeedbackErr} role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function formatCatSexLabel(sex: CatProfileRow["sex"]): string {
  if (sex === "male") return "수컷 ♂";
  if (sex === "female") return "암컷 ♀";
  if (sex === "unknown") return "미상";
  return "미등록";
}

function CuteCatSilhouetteIcon() {
  return (
    <svg
      className={styles.catCardFallbackSvg}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="catCardFallbackGrad" x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a7f3d0" />
          <stop offset="0.45" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="62" r="38" fill="url(#catCardFallbackGrad)" opacity="0.75" />
      <path d="M28 42 L22 18 L38 32 Z" fill="#6ee7b7" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M92 42 L98 18 L82 32 Z" fill="#6ee7b7" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="48" cy="58" rx="5" ry="6.5" fill="#065f46" />
      <ellipse cx="72" cy="58" rx="5" ry="6.5" fill="#065f46" />
      <ellipse cx="49" cy="56.5" rx="1.8" ry="2.2" fill="#fff" />
      <ellipse cx="73" cy="56.5" rx="1.8" ry="2.2" fill="#fff" />
      <path d="M52 72 Q60 78 68 72" stroke="#065f46" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="78" rx="5" ry="3.5" fill="#a7f3d0" opacity="0.8" />
    </svg>
  );
}
