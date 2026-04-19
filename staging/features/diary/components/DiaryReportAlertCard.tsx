/**
 * 리포트 상단 경고 카드
 *
 * - DiaryStats 기반으로 생성된 HealthAlert 리스트에서
 *   가장 심각한 severity 를 대표로 표시
 * - severity별 아이콘/색상
 * - "자세히 보기" 링크 → 드로어 열기 콜백
 */
"use client";

import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { HealthAlert } from "../types/diaryStats";
import styles from "../styles/DiaryReportAlertCard.module.css";

type Props = {
  alerts: HealthAlert[];
  /** "자세히 보기" 클릭 시 드로어 열기 */
  onOpenDrawer?: () => void;
};

/* severity 우선순위 — 숫자 클수록 심각 */
const SEVERITY_RANK = { info: 1, warning: 2, danger: 3 } as const;

const ICON_MAP = {
  info: <Info size={22} />,
  warning: <AlertTriangle size={22} />,
  danger: <ShieldAlert size={22} />,
} as const;

/**
 * 경고가 없으면 null 반환 (리포트 상단 공간 확보 X).
 */
export function DiaryReportAlertCard({ alerts, onOpenDrawer }: Props) {
  if (alerts.length === 0) return null;

  /* 가장 심각한 경고 선정 */
  const top = [...alerts].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )[0];

  const rest = alerts.length - 1;

  return (
    <div className={styles.card} data-severity={top.severity}>
      <span className={styles.icon}>{ICON_MAP[top.severity]}</span>
      <div className={styles.body}>
        <strong>{top.title}</strong>
        <p>{top.message}</p>
        {rest > 0 ? (
          <span className={styles.more}>그 외 {rest}건의 알림이 더 있어요</span>
        ) : null}
      </div>
      {onOpenDrawer ? (
        <button type="button" className={styles.link} onClick={onOpenDrawer}>
          자세히 보기
        </button>
      ) : null}
    </div>
  );
}
