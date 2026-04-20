"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCatMomentPublicUrl } from "@/lib/supabase/getCatMomentPublicUrl";
import { toDisplayLabel } from "@/lib/cat/catStatusDisplayLabel";
import { formatRelativeTimeKo } from "@/lib/time/formatRelativeTimeKo";
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

function buildFriendlyMomentSentence(
  catName: string,
  rawStatus: string | null,
  displayLabel: string | null,
): string {
  const raw = rawStatus ?? "";
  if (raw === "식사") {
    return `${catName}가 맘마를 맛있게 먹었어요`;
  }
  if (raw === "그루밍" || displayLabel?.includes("그루밍")) {
    return `${catName}가 그루밍 중이에요 ✨`;
  }
  if (raw === "배변") {
    return `${catName}의 화장실 기록이 있어요`;
  }
  if (displayLabel) {
    return `${catName} · ${displayLabel} — 모먼트가 기록됐어요`;
  }
  return `${catName}의 순간이 포착됐어요`;
}

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
  /* catById 최신값을 ref 로 sync — realtime subscription 콜백에서
   * stale closure 없이 최신 lookup 참조용.
   * 렌더 중 ref write 는 React 19 룰 위반이라 effect 로 이동. */
  useEffect(() => {
    catByIdRef.current = catById;
  }, [catById]);

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
          /* 클라이언트 가드 — catsLookup에 없는 cat_id는 무시 (다른 home 데이터 필터링) */
          if (catByIdRef.current.size > 0 && !catByIdRef.current.has(row.cat_id)) return;
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

  const TITLE_EN = "RECENT ALERTS";
  const TITLE_KO = "최근 알림";

  if (fetchErrorMessage) {
    return (
      <section className={styles.activitySection} aria-label="최근 활동">
        <h2 className={styles.activitySectionTitleFigma}>
          <span>{TITLE_EN}</span>
          <span className={styles.activitySectionTitleKo}>{TITLE_KO}</span>
        </h2>
        <p className={styles.activityEmpty} role="alert">
          활동 로그를 불러오지 못했어요. {fetchErrorMessage}
        </p>
      </section>
    );
  }

  if (logs.length === 0) {
    return (
      <section className={styles.activitySection} aria-label="최근 활동">
        <h2 className={styles.activitySectionTitleFigma}>
          <span>{TITLE_EN}</span>
          <span className={styles.activitySectionTitleKo}>{TITLE_KO}</span>
        </h2>
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
      <h2 className={styles.activitySectionTitleFigma}>
        <span>{TITLE_EN}</span>
        <span className={styles.activitySectionTitleKo}>{TITLE_KO}</span>
      </h2>
      <ul className={styles.activityListFigma} id="cat-activity-log-list">
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
              : `VIEW MORE / 더보기 (+${remainingActivityLogCount})`}
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
  /* 의도된 client-only 포맷. Intl.DateTimeFormat 은 서버/클라이언트
   * 타임존 차이로 hydration mismatch 유발 → effect 내 setState 로
   * client 첫 마운트 후 주입. suppressHydrationWarning 와 짝. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormattedTime(formatActivityTimestamp(entry.captured_at));
  }, [entry.captured_at]);

  const displayStatus = toDisplayLabel(entry.cat_status);
  const relative = formatRelativeTimeKo(entry.captured_at);
  const sentence = buildFriendlyMomentSentence(
    entry.cat_name,
    entry.cat_status,
    displayStatus,
  );

  return (
    <li className={styles.activityRowFigma}>
      <div className={styles.activityIconCircle} aria-hidden>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            width={44}
            height={44}
            className={styles.activityThumbRound}
          />
        ) : (
          <span className={styles.activityEmojiFallback}>🐾</span>
        )}
      </div>
      <div className={styles.activityBody}>
        <p className={styles.activityAlertMain}>
          <span className={styles.activityCatName}>{sentence}</span>
        </p>
        <time
          className={styles.activityRelative}
          dateTime={entry.captured_at}
          suppressHydrationWarning
        >
          {relative} · {formattedTime}
        </time>
      </div>
    </li>
  );
}
