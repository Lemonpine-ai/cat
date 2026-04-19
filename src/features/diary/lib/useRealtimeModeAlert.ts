/**
 * realtime 모드가 "polling" 으로 전환될 때 info 카드 prepend 훅.
 *
 * DiaryPageClient 400줄 한도 준수를 위해 useEffect 블록만 분리.
 * 원본 동작 불변 — 같은 title 이 이미 선두에 있으면 중복 prepend 금지.
 * realtime 복구 시 다음 runAggregate 가 alerts 를 덮어써 자연스럽게 사라진다.
 */
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RealtimeMode } from "./useRealtimeWithFallback";
import { kstToday } from "./kstRange";
import type { HealthAlert } from "../types/diaryStats";

export function useRealtimeModeAlert(
  realtimeMode: RealtimeMode,
  catId: string,
  setAlerts: Dispatch<SetStateAction<HealthAlert[]>>,
): void {
  useEffect(() => {
    /* realtime/connecting 상태일 땐 알림 없음 */
    if (realtimeMode !== "polling") return;

    /* 호출 시점의 KST 날짜 — 자정 경계에서도 최신 날짜로 카드 저장 */
    const pollingModeAlert: HealthAlert = {
      cat_id: catId,
      severity: "info",
      title: "실시간 동기화 일시 중단",
      message: "네트워크가 불안정해 30초마다 새로고침하고 있어요",
      created_at: new Date().toISOString(),
      read_at: null,
      alert_date: kstToday(),
    };

    setAlerts((prev) => {
      /* 같은 제목이 이미 선두에 있으면 중복 prepend 금지 */
      if (prev[0]?.title === pollingModeAlert.title) return prev;
      return [pollingModeAlert, ...prev];
    });
  }, [realtimeMode, catId, setAlerts]);
}
