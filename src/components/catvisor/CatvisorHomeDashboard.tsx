"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraDeviceManager } from "@/components/catvisor/CameraDeviceManager";
import { MultiCameraGrid } from "@/components/catvisor/MultiCameraGrid";
import type { CameraAggregateStatus } from "@/components/catvisor/MultiCameraGrid";
import { RecentCatActivityLog } from "@/components/catvisor/RecentCatActivityLog";
import { CareStatusGrid } from "@/components/home/CareStatusGrid";
import { CatStatusBoard } from "@/components/status/CatStatusBoard";
import type { CatStatus } from "@/components/status/CatStatusBoard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ActivityLogListItem } from "@/types/catLog";
import styles from "./CatvisorHomeDashboard.module.css";

type CareKind = "water_change" | "litter_clean" | "meal" | "medicine";

type CatLookupForActivity = {
  id: string;
  name: string;
  status: string | null;
};

type CatvisorHomeDashboardProps = {
  children?: ReactNode;
  homeId: string;
  initialActivityLogs: ActivityLogListItem[];
  activityLogsFetchError: string | null;
  catsLookupForActivity: CatLookupForActivity[];
  initialTodayMedicineCount: number;
  initialTodayMealCount: number;
  /** 가장 최근 식수 교체 ISO 타임스탬프 (없으면 null) */
  initialLastWaterChangeAt: string | null;
  /** 가장 최근 화장실 청소 ISO 타임스탬프 (없으면 null) */
  initialLastLitterCleanAt: string | null;
  /** 가장 최근 약 복용 ISO 타임스탬프 (없으면 null) */
  initialLastMedicineAt: string | null;
  /** 고양이 이름 (1마리일 때만 전달, 2마리+면 null) */
  catName: string | null;
};

/**
 * 카메라 중심 홈 — 흐름: 고양이 카드 → 오늘 요약 → 환경 → 카메라 기기 관리 → 활동.
 */
export function CatvisorHomeDashboard({
  children,
  homeId,
  initialActivityLogs,
  activityLogsFetchError,
  catsLookupForActivity,
  initialTodayMedicineCount,
  initialTodayMealCount,
  initialLastWaterChangeAt,
  initialLastLitterCleanAt,
  initialLastMedicineAt,
  catName,
}: CatvisorHomeDashboardProps) {
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(initialLastWaterChangeAt);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(initialLastLitterCleanAt);
  const [lastMedicineAt, setLastMedicineAt] = useState<string | null>(initialLastMedicineAt);

  // 1분마다 경과 시간 레이블 강제 갱신 (setInterval tick 전용 카운터)
  /* supabase 클라이언트 — useMemo로 안정화 (매 렌더 재생성 방지) */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [elapsedTick, setElapsedTick] = useState(0);
  /* envSaving — ref로 중복 호출 방지 (클로저 안정성), useState는 UI 표시용 */
  const envSavingRef = useRef<CareKind | null>(null);
  const [envSaving, setEnvSaving] = useState<CareKind | null>(null);

  /* 카메라 상태 (CatStatusBoard용) */
  const [cameraStatus, setCameraStatus] = useState<CameraAggregateStatus>({
    connectedCount: 0,
    hasMotion: false,
  });

  /** 카메라 상태 → CatStatus 변환 */
  // TODO: in_zone 상태는 zone UI 구현 시 활성화 예정
  const catStatus: CatStatus =
    cameraStatus.connectedCount === 0
      ? { kind: "offline" }
      : cameraStatus.hasMotion
        ? { kind: "moving" }
        : { kind: "resting" };

  /** 하단 토스트 메시지. 빈 문자열이면 숨김. */
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 토스트를 3초 표시 후 자동 제거 */
  function showToast(message: string) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage("");
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // 1분 주기로 경과 시간 레이블 갱신
  useEffect(() => {
    const intervalId = setInterval(() => {
      setElapsedTick((prev) => prev + 1);
    }, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  // 환경 관리 Realtime 구독 (water_change, litter_clean) — 홈 화면 직접 클릭 시 사용
  useEffect(() => {
    if (!homeId) return;
    const channel = supabase
      .channel(`env_care_realtime_${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cat_care_logs",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as { care_kind: string; created_at: string };
          if (row.care_kind === "water_change") {
            setLastWaterChangeAt(row.created_at);
          } else if (row.care_kind === "litter_clean") {
            setLastLitterCleanAt(row.created_at);
          } else if (row.care_kind === "medicine") {
            setLastMedicineAt(row.created_at);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [homeId]);

  // 방송 기기 Broadcast 구독 — SECURITY DEFINER RPC 삽입 시 postgres_changes 미도달 문제 보완
  useEffect(() => {
    if (!homeId) return;
    const broadcastChannel = supabase
      .channel(`env_care_broadcast_${homeId}`)
      .on(
        "broadcast",
        { event: "env_care_updated" },
        (event) => {
          const payload = event.payload as { care_kind: string; recorded_at: string };
          if (payload.care_kind === "water_change") {
            setLastWaterChangeAt(payload.recorded_at);
          } else if (payload.care_kind === "litter_clean") {
            setLastLitterCleanAt(payload.recorded_at);
          } else if (payload.care_kind === "medicine") {
            /* 약 복용 broadcast 수신 — lastMedicineAt 반영 */
            setLastMedicineAt(payload.recorded_at);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(broadcastChannel);
    };
  }, [homeId]);

  /** 클릭 즉시 DB에 돌봄 기록 저장 — 모달 없이 바로 처리 */
  const handleClickEnvCare = useCallback(
    async (careKind: CareKind) => {
      if (!homeId || envSavingRef.current) return;
      envSavingRef.current = careKind;
      setEnvSaving(careKind);
      try {
        const nowIso = new Date().toISOString();
        const { error: insertError } = await supabase
          .from("cat_care_logs")
          .insert({ home_id: homeId, care_kind: careKind });

        if (insertError) {
          showToast(`저장 오류: ${insertError.message}`);
          return;
        }

        // Realtime 도착보다 먼저 UI 즉시 반영
        if (careKind === "water_change") {
          setLastWaterChangeAt(nowIso);
        } else if (careKind === "litter_clean") {
          setLastLitterCleanAt(nowIso);
        } else if (careKind === "medicine") {
          setLastMedicineAt(nowIso);
        }

        const kindLabels: Record<CareKind, string> = {
          water_change: "💧 식수 교체",
          litter_clean: "🚽 화장실 청소",
          meal: "🍚 맘마 먹기",
          medicine: "💊 약 먹기",
        };
        showToast(`${kindLabels[careKind]} 기록 완료! 🐾`);
      } catch (unknownError) {
        const message =
          unknownError instanceof Error ? unknownError.message : "저장에 실패했습니다.";
        showToast(`저장 중 오류가 발생했어요: ${message}`);
      } finally {
        envSavingRef.current = null;
        setEnvSaving(null);
      }
    },
    [homeId],
  );

  return (
    <div className={styles.page}>
      <div className={`${styles.inner} flex flex-col gap-5`}>
        {children}

        {homeId ? (
          <CareStatusGrid
            revalidateTick={elapsedTick}
            homeId={homeId}
            lastWaterChangeAt={lastWaterChangeAt}
            lastLitterCleanAt={lastLitterCleanAt}
            initialTodayMealCount={initialTodayMealCount}
            initialTodayMedicineCount={initialTodayMedicineCount}
            lastMedicineAt={lastMedicineAt}
            onRequestWaterChange={() => void handleClickEnvCare("water_change")}
            onRequestLitterClean={() => void handleClickEnvCare("litter_clean")}
            onRequestMeal={() => void handleClickEnvCare("meal")}
            onRequestMedicine={() => void handleClickEnvCare("medicine")}
            envSavingWater={envSaving === "water_change"}
            envSavingLitter={envSaving === "litter_clean"}
            envSavingMeal={envSaving === "meal"}
            envSavingMedicine={envSaving === "medicine"}
          />
        ) : null}

        <section className={styles.cameraSection} aria-label="카메라 뷰">
          {homeId ? <CameraDeviceManager homeId={homeId} /> : null}

          <MultiCameraGrid homeId={homeId} onCameraStatusChange={setCameraStatus} />
        </section>

        {/* 고양이 상태 보드 — 카메라 섹션 아래 (homeId 없으면 숨김) */}
        {homeId ? (
          <CatStatusBoard
            status={catStatus}
            catName={catName}
            cameraCount={cameraStatus.connectedCount}
          />
        ) : null}

        <RecentCatActivityLog
          initialLogs={initialActivityLogs}
          fetchErrorMessage={activityLogsFetchError}
          catsLookup={catsLookupForActivity}
        />
      </div>

      {/* ── 하단 토스트 ── */}
      {toastMessage ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
