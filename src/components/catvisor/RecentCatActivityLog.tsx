"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCatMomentPublicUrl } from "@/lib/supabase/getCatMomentPublicUrl";
import { toDisplayLabel } from "@/lib/cat/catStatusDisplayLabel";
import type { ActivityLogListItem } from "@/types/catLog";
import styles from "./CatvisorHomeDashboard.module.css";

/** 접힌 상태에서 보여 줄 최대 줄 수(행) — 한 화면 가시성용 */
const ACTIVITY_PREVIEW_ROW_COUNT = 2;

type CatLookupRow = {
  id: string;
  name: string;
  status: string | null;
};

type RecentCatActivityLogProps = {
  initialLogs: ActivityLogListItem[];
  catsLookup: CatLookupRow[];
  fetchErrorMessage: string | null;
};

function formatActivityTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * 보리 & 찹쌀의 냥-모먼트 — 실시간 구독 + 기본 2줄만 표시, 더 보기로 전체.
 */
export function RecentCatActivityLog({
  initialLogs,
  catsLookup,
  fetchErrorMessage,
}: RecentCatActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLogListItem[]>(initialLogs);
  const [isActivityListExpanded, setIsActivityListExpanded] = useState(false);

  const catById = useMemo(() => {
    const map = new Map<string, CatLookupRow>();
    catsLookup.forEach((cat) => {
      map.set(cat.id, cat);
    });
    return map;
  }, [catsLookup]);

  const catByIdRef = useRef(catById);
  catByIdRef.current = catById;

  useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("cat_logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cat_logs" },
        (payload) => {
          const row = payload.new as {
            id: string;
            captured_at: string;
            cat_id: string;
            storage_path: string | null;
            status: string | null;
          };
          const cat = catByIdRef.current.get(row.cat_id);
          const next: ActivityLogListItem = {
            id: row.id,
            captured_at: row.captured_at,
            cat_id: row.cat_id,
            cat_name: cat?.name?.trim() ? cat.name : "고양이",
            cat_status: row.status ?? cat?.status ?? null,
            storage_path: row.storage_path,
          };
          setLogs((previous) => {
            if (previous.some((item) => item.id === next.id)) {
              return previous;
            }
            return [next, ...previous];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const visibleActivityLogs = useMemo(() => {
    if (isActivityListExpanded || logs.length <= ACTIVITY_PREVIEW_ROW_COUNT) {
      return logs;
    }
    return logs.slice(0, ACTIVITY_PREVIEW_ROW_COUNT);
  }, [logs, isActivityListExpanded]);

  const remainingActivityLogCount = Math.max(
    0,
    logs.length - ACTIVITY_PREVIEW_ROW_COUNT,
  );

  const TITLE = "보리 & 찹쌀의 냥-모먼트 🐾";

  if (fetchErrorMessage) {
    return (
      <section className={styles.activitySection} aria-label="최근 활동">
        <h2 className={styles.activitySectionTitle}>{TITLE}</h2>
        <p className={styles.activityEmpty} role="alert">
          활동 로그를 불러오지 못했어요. {fetchErrorMessage}
        </p>
      </section>
    );
  }

  if (logs.length === 0) {
    return (
      <section className={styles.activitySection} aria-label="최근 활동">
        <h2 className={styles.activitySectionTitle}>{TITLE}</h2>
        <p className={styles.activityEmptyCute}>
          아직 냥-모먼트가 없어요. 📷
          <br />
          카메라를 연결해 첫 순간을 기록해 보세요!
        </p>
      </section>
    );
  }

  return (
    <section className={styles.activitySection} aria-label="최근 활동">
      <h2 className={styles.activitySectionTitle}>{TITLE}</h2>
      <ul className={styles.activityList} id="cat-activity-log-list">
        {visibleActivityLogs.map((entry) => (
          <ActivityLogRow key={entry.id} entry={entry} />
        ))}
      </ul>
      {remainingActivityLogCount > 0 ? (
        <div className={styles.activityExpandBar}>
          <button
            type="button"
            className={styles.activityExpandBtn}
            aria-expanded={isActivityListExpanded}
            aria-controls="cat-activity-log-list"
            onClick={() => {
              setIsActivityListExpanded((previous) => !previous);
            }}
          >
            {isActivityListExpanded
              ? "접기 · 요약만 보기"
              : `냥-모먼트 더 보기 (+${remainingActivityLogCount}개)`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ActivityLogRow({ entry }: { entry: ActivityLogListItem }) {
  const thumbnailUrl = useMemo(() => {
    if (!entry.storage_path?.trim()) return null;
    return getCatMomentPublicUrl(entry.storage_path);
  }, [entry.storage_path]);

  const [formattedTime, setFormattedTime] = useState<string>("");
  useEffect(() => {
    setFormattedTime(formatActivityTimestamp(entry.captured_at));
  }, [entry.captured_at]);

  const displayStatus = toDisplayLabel(entry.cat_status);
  const statusPart = displayStatus ? ` · ${displayStatus}` : "";

  return (
    <li className={styles.activityRow}>
      <div className={styles.activityThumbWrap}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            width={50}
            height={50}
            className={styles.activityThumb}
            unoptimized
          />
        ) : (
          <div className={styles.activityThumbPlaceholder} aria-hidden>
            🐾
          </div>
        )}
      </div>
      <div className={styles.activityBody}>
        <time
          className={styles.activityTime}
          dateTime={entry.captured_at}
          suppressHydrationWarning
        >
          {formattedTime}
        </time>
        <p className={styles.activityText}>
          <span className={styles.activityCatName}>{entry.cat_name}</span>
          {statusPart}
          <span className={styles.activitySep}> — </span>
          <span className={styles.activityAction}>순간 포착 ✨</span>
        </p>
      </div>
    </li>
  );
}
