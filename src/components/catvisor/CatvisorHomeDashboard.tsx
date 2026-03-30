"use client";

import Image from "next/image";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Droplets, MessageCircle, Trash2, X } from "lucide-react";
import { CameraDeviceManager } from "@/components/catvisor/CameraDeviceManager";
import { CameraLiveViewer } from "@/components/catvisor/CameraLiveViewer";
import { RecentCatActivityLog } from "@/components/catvisor/RecentCatActivityLog";
import { TodaySummaryCards } from "@/components/catvisor/TodaySummaryCards";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatDailySummaryItem } from "@/types/catDailySummary";
import type { ActivityLogListItem } from "@/types/catLog";
import styles from "./CatvisorHomeDashboard.module.css";

type EnvironmentKind = "water_change" | "litter_clean";


type CameraTileData = {
  id: string;
  placeLabel: string;
  catLabel: string | null;
  isOnline: boolean;
  imageUrl: string;
};

const CAMERA_TILES: CameraTileData[] = [
  {
    id: "cam-1",
    placeLabel: "거실",
    catLabel: null,
    isOnline: true,
    imageUrl: "https://picsum.photos/seed/cam1/480/360",
  },
  {
    id: "cam-2",
    placeLabel: "캣타워",
    catLabel: null,
    isOnline: false,
    imageUrl: "https://picsum.photos/seed/cam2/480/360",
  },
  {
    id: "cam-3",
    placeLabel: "화장실",
    catLabel: null,
    isOnline: false,
    imageUrl: "https://picsum.photos/seed/cam3/480/360",
  },
  {
    id: "cam-4",
    placeLabel: "냠냠 구역",
    catLabel: null,
    isOnline: false,
    imageUrl: "https://picsum.photos/seed/cam4/480/360",
  },
];

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
  initialDailySummary: CatDailySummaryItem[];
  initialTodayMedicineCount: number;
  initialTodayMealCount: number;
  /** 가장 최근 식수 교체 ISO 타임스탬프 (없으면 null) */
  initialLastWaterChangeAt: string | null;
  /** 가장 최근 화장실 청소 ISO 타임스탬프 (없으면 null) */
  initialLastLitterCleanAt: string | null;
};

/**
 * 마지막 관리 타임스탬프를 받아 '0분 전', 'n분 전', 'n시간 전', 'n일 전'으로 변환합니다.
 */
export function formatElapsedTimeLabel(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "기록 없음";
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "0분 전";
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "0분 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
}

/**
 * 카메라 중심 홈 — 흐름: 고양이 카드 → 오늘 요약 → 환경 → 카메라 기기 관리 → 활동.
 */
export function CatvisorHomeDashboard({
  children,
  homeId,
  initialActivityLogs,
  activityLogsFetchError,
  catsLookupForActivity,
  initialDailySummary,
  initialTodayMedicineCount,
  initialTodayMealCount,
  initialLastWaterChangeAt,
  initialLastLitterCleanAt,
}: CatvisorHomeDashboardProps) {
  const [lastWaterChangeAt, setLastWaterChangeAt] = useState<string | null>(initialLastWaterChangeAt);
  const [lastLitterCleanAt, setLastLitterCleanAt] = useState<string | null>(initialLastLitterCleanAt);

  // 1분마다 경과 시간 레이블 강제 갱신 (setInterval tick 전용 카운터)
  const [elapsedTick, setElapsedTick] = useState(0);
  const [envSaving, setEnvSaving] = useState<EnvironmentKind | null>(null);

  const waterEtaLabel = formatElapsedTimeLabel(lastWaterChangeAt);
  const litterEtaLabel = formatElapsedTimeLabel(lastLitterCleanAt);

  /** 하단 토스트 메시지. 빈 문자열이면 숨김. */
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedCamera, setSelectedCamera] = useState<CameraTileData | null>(null);

  const cameraTitleId = useId();

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

  // 환경 관리 Realtime 구독 (water_change, litter_clean)
  useEffect(() => {
    if (!homeId) return;
    const supabase = createSupabaseBrowserClient();
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
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [homeId]);

  /** Esc 키로 카메라 모달 닫기 */
  useEffect(() => {
    if (!selectedCamera) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedCamera(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCamera]);

  /** 클릭 즉시 DB에 환경 관리 기록 저장 — 모달 없이 바로 처리 */
  const handleClickEnvCare = useCallback(
    async (careKind: EnvironmentKind) => {
      if (!homeId || envSaving) return;
      setEnvSaving(careKind);
      try {
        const nowIso = new Date().toISOString();
        const supabase = createSupabaseBrowserClient();
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
        } else {
          setLastLitterCleanAt(nowIso);
        }

        const kindLabel = careKind === "water_change" ? "💧 식수 교체" : "🚽 화장실 청소";
        showToast(`${kindLabel} 완료! 0분 전으로 업데이트됐어요 🐾`);
      } catch (unknownError) {
        const message =
          unknownError instanceof Error ? unknownError.message : "저장에 실패했습니다.";
        showToast(`저장 중 오류가 발생했어요: ${message}`);
      } finally {
        setEnvSaving(null);
      }
    },
    [homeId, envSaving],
  );

  function handleVoiceBroadcast(tile: CameraTileData) {
    showToast(`「${tile.placeLabel}」 음성 송출은 스트림 연동 후 사용할 수 있어요.`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {children}

        {/* 오늘의 활동 요약 */}
        <TodaySummaryCards
          initialSummary={initialDailySummary}
          homeId={homeId}
          initialTodayMedicineCount={initialTodayMedicineCount}
          initialTodayMealCount={initialTodayMealCount}
        />

        {/* ① 환경 칩 — 클릭 즉시 저장, 경과 시간 실시간 표시 */}
        <div className={styles.envRow} role="group" aria-label="환경 관리 기록">
          <button
            type="button"
            className={styles.envChip}
            disabled={envSaving === "water_change"}
            onClick={() => void handleClickEnvCare("water_change")}
          >
            <Droplets size={20} color="#4fd1c5" strokeWidth={1.75} aria-hidden />
            <span className={styles.envChipText}>
              <span className={styles.envChipLabel}>식수 교체</span>
              <span className={styles.envChipEta}>{waterEtaLabel}</span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.envChip} ${styles.envChipLitter}`}
            disabled={envSaving === "litter_clean"}
            onClick={() => void handleClickEnvCare("litter_clean")}
          >
            <Trash2 size={20} color="#ffab91" strokeWidth={1.75} aria-hidden />
            <span className={styles.envChipText}>
              <span className={styles.envChipLabel}>화장실 청소</span>
              <span className={styles.envChipEta}>{litterEtaLabel}</span>
            </span>
          </button>
        </div>

        {/* ② 카메라 — 기기 관리 + 라이브 뷰어 + 2×2 타일 */}
        <section className={styles.cameraSection} aria-label="카메라 뷰">
          {/* 등록된 카메라 기기 목록 및 페어링 코드 발급 */}
          {homeId ? <CameraDeviceManager homeId={homeId} /> : null}

          {/* 라이브 방송이 있으면 자동 연결해서 영상을 보여줌
              onWaterChangeRecorded/onLitterCleanRecorded: 카메라 뷰어 버튼 클릭 시 홈 화면도 즉시 동기화 */}
          <CameraLiveViewer
            onWaterChangeRecorded={setLastWaterChangeAt}
            onLitterCleanRecorded={setLastLitterCleanAt}
          />

          <div className={styles.cameraGrid}>
            {CAMERA_TILES.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className={styles.cameraTile}
                onClick={() => setSelectedCamera(tile)}
              >
                <div className={styles.cameraThumb}>
                  <Image
                    src={tile.imageUrl}
                    alt={`${tile.placeLabel}${tile.catLabel ? ` · ${tile.catLabel}` : ""} 카메라 미리보기`}
                    fill
                    sizes="(max-width: 640px) 50vw, 260px"
                    className={styles.cameraImage}
                    priority={tile.id === "cam-1" || tile.id === "cam-2"}
                  />
                  <span className={styles.badgePreview}>미리보기</span>
                  <span
                    className={tile.isOnline ? styles.badgeOnline : styles.badgeOffline}
                    aria-label={tile.isOnline ? "온라인" : "오프라인"}
                  />
                  <div className={styles.cameraOverlay} aria-hidden>
                    <span className={styles.cameraLabel}>{tile.placeLabel}</span>
                    <span className={styles.cameraCatLabel}>
                      {tile.catLabel ?? "공용"}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ③ 최근 활동 */}
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


      {/* ── 카메라 모달 (div 기반) ── */}
      {selectedCamera ? (
        <div
          className={styles.cameraModalOverlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCamera(null);
          }}
        >
          <div
            className={styles.cameraModalCard}
            role="dialog"
            aria-labelledby={cameraTitleId}
          >
            <div className={styles.cameraModalThumb}>
              <Image
                src={selectedCamera.imageUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 92vw, 520px"
                className={styles.cameraModalImage}
              />
            </div>
            <div className={styles.cameraModalBody}>
              <h2 id={cameraTitleId} className={styles.cameraModalTitle}>
                {selectedCamera.placeLabel}
                {selectedCamera.catLabel ? ` · ${selectedCamera.catLabel}` : ""}
              </h2>
              <p className={styles.cameraModalMeta}>
                {selectedCamera.isOnline
                  ? "🟢 온라인 · 스트림 연동 후 실시간 영상이 표시돼요."
                  : "⚪ 오프라인 · 기기 전원·네트워크를 확인해 주세요."}
              </p>
              <button
                type="button"
                className={styles.btnVoice}
                onClick={() => {
                  handleVoiceBroadcast(selectedCamera);
                  setSelectedCamera(null);
                }}
              >
                <MessageCircle size={18} strokeWidth={2} aria-hidden />
                소통하기 (음성 송출)
              </button>
              <button
                type="button"
                className={styles.btnCloseFull}
                onClick={() => setSelectedCamera(null)}
              >
                <X size={16} strokeWidth={2} aria-hidden />
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
