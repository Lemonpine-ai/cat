/**
 * 헤더 알림 벨 컴포넌트
 *
 * - 미확인 알림 있을 때: 빨간 점 + wiggle 애니메이션 반복
 * - 미확인 개수가 0 → 1+ 로 전환될 때(새 알림 도착 신호) 2초간 강제 wiggle
 * - 클릭 시 onOpen 콜백 (부모가 AlertDrawer 제어)
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import styles from "./AlertBell.module.css";

type AlertBellProps = {
  /** 미확인 알림 개수 */
  unreadCount: number;
  /** 클릭 시 드로어 열기 */
  onOpen: () => void;
};

/**
 * 헤더 우측에 배치되는 알림 벨.
 * 100줄 이내 유지.
 */
export function AlertBell({ unreadCount, onOpen }: AlertBellProps) {
  /* 강제 wiggle 플래그 — 기본 false, 0→1+ 전환 시점에만 true */
  const [forceWiggle, setForceWiggle] = useState(false);
  /* 직전 unreadCount 값을 기억해서 "0→N 전환" 시점을 감지 */
  const prevUnreadRef = useRef(0);

  /*
   * 새 알림 도착(= 미확인 0 → 1+ 전환) 시에만 2초 wiggle.
   * - sessionStorage 플래그는 영구적이어서 재발동이 안 되므로 ref로 대체.
   * - 같은 세션 내에서도 새 알림이 오면 다시 흔든다.
   */
  useEffect(() => {
    if (unreadCount > 0 && prevUnreadRef.current === 0) {
      setForceWiggle(true);
      const timer = setTimeout(() => setForceWiggle(false), 2000);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const hasUnread = unreadCount > 0;
  /* 강제 wiggle 구간이거나, 미확인이 있으면 흔들기 */
  const shouldWiggle = forceWiggle || hasUnread;

  return (
    <button
      type="button"
      className={styles.bellButton}
      onClick={onOpen}
      aria-label={`알림 ${unreadCount}개 미확인`}
      data-wiggle={shouldWiggle ? "true" : "false"}
    >
      <Bell size={22} strokeWidth={2} />
      {/* 빨간 점 — 미확인 있을 때만 */}
      {hasUnread ? (
        <span className={styles.dot} aria-hidden="true">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
