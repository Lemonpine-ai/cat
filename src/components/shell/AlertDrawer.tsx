/**
 * 알림 드로어 — 우측 슬라이드 패널
 *
 * - severity별 색상: info=민트, warning=코랄, danger=빨강
 * - 알림 클릭 → markAsRead 호출 + /diary 페이지로 이동
 * - 배경 오버레이 클릭 시 닫힘
 * - Esc 키로 닫기 + 열려있을 때 body scroll lock
 * - data-open 속성으로 열림/닫힘 (CSS transition 보존)
 */
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import type { HealthAlert } from "@/features/diary/types/diaryStats";
import styles from "./AlertDrawer.module.css";

type AlertDrawerProps = {
  open: boolean;
  alerts: HealthAlert[];
  onClose: () => void;
  markAsRead: (id: string) => Promise<void>;
};

/* severity → 아이콘 */
const ICON_MAP = {
  info: <Info size={18} />,
  warning: <AlertTriangle size={18} />,
  danger: <ShieldAlert size={18} />,
} as const;

/* 상대 시간 라벨 ("방금", "N분 전", "N시간 전") */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  /* 미래 시각(서버/클라이언트 clock skew) 가드 — 음수면 "방금"으로 처리 */
  if (diff < 0) return "방금";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function AlertDrawer({ open, alerts, onClose, markAsRead }: AlertDrawerProps) {
  const router = useRouter();
  /* 최초 한 번이라도 열렸는지 — 첫 마운트 전엔 DOM 안 그림 (성능) */
  const everOpened = useRef(false);
  if (open) everOpened.current = true;

  /* Esc 키 + body scroll lock (열렸을 때만) */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  /* 첫 오픈 이전엔 null — 불필요한 DOM 방지 */
  if (!everOpened.current) return null;

  /* 알림 한 줄 클릭 → 읽음 처리 + 리포트 이동
   * HealthAlert.id 는 타입상 optional 이지만
   *   AlertDrawer 가 받는 alerts 는 항상 useHealthAlerts 의 DB row → id 존재 보장.
   *   (QA R13 REJECT #3 반영 — tempId 제거로 id optional 전환)
   */
  const handleClick = (alert: HealthAlert) => {
    /* fire-and-forget — 실패해도 네비게이션은 진행 */
    if (alert.read_at === null && alert.id) void markAsRead(alert.id);
    onClose();
    /* cat_id 가 없는 home 단위 알림이면 전체 diary 로 (QA R16 REJECT #3 — ?cat=null 방지) */
    const path = alert.cat_id ? `/diary?cat=${alert.cat_id}` : `/diary`;
    router.push(path);
  };

  return (
    <div
      className={styles.overlay}
      data-open={open}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside
        className={styles.drawer}
        data-open={open}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2>건강 알림</h2>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </header>

        {alerts.length === 0 ? (
          <p className={styles.empty}>새로운 알림이 없어요 🐾</p>
        ) : (
          <ul className={styles.list}>
            {/* id 없는 항목은 제외 — title+created_at 자연키 조합 중복 가능
             *   (QA R23 #1 반영: realtime 중복 push 시 key 충돌 원천 차단) */}
            {alerts.filter((a) => a.id).map((a) => (
              <li
                key={a.id}
                className={styles.item}
                data-severity={a.severity}
                data-unread={a.read_at === null}
                onClick={() => handleClick(a)}
              >
                <span className={styles.icon}>{ICON_MAP[a.severity]}</span>
                <div className={styles.body}>
                  <strong>{a.title}</strong>
                  <p>{a.message}</p>
                  <time>{relativeTime(a.created_at)}</time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
