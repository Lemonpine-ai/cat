"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Droplets, Trash2, MessageCircle, X } from "lucide-react";
import { CameraDeviceManager } from "@/components/catvisor/CameraDeviceManager";
import { CameraLiveViewer } from "@/components/catvisor/CameraLiveViewer";
import { RecentCatActivityLog } from "@/components/catvisor/RecentCatActivityLog";
import { TodaySummaryCards } from "@/components/catvisor/TodaySummaryCards";
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
  initialDailySummary,
  initialTodayMedicineCount,
}: CatvisorHomeDashboardProps) {
  const [waterEtaLabel, setWaterEtaLabel] = useState("기록 없음");
  const [litterEtaLabel, setLitterEtaLabel] = useState("기록 없음");

  /** 하단 토스트 메시지. 빈 문자열이면 숨김. */
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingEnvironmentKind, setPendingEnvironmentKind] =
    useState<EnvironmentKind | null>(null);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);

  const [selectedCamera, setSelectedCamera] = useState<CameraTileData | null>(null);

  const envTitleId = useId();
  const cameraTitleId = useId();
  const noteFieldId = useId();

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

  /** Esc 키로 환경 모달 닫기 */
  useEffect(() => {
    if (!envModalOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeEnvModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [envModalOpen]);

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

  function openEnvModal(kind: EnvironmentKind) {
    setPendingEnvironmentKind(kind);
    setEnvModalOpen(true);
  }

  function closeEnvModal() {
    setEnvModalOpen(false);
    setPendingEnvironmentKind(null);
  }

  async function handleSubmitEnvironment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingEnvironmentKind || envSaving) return;

    const form = event.currentTarget;
    const noteEl = form.elements.namedItem("note");
    const noteValue = noteEl instanceof HTMLTextAreaElement ? noteEl.value.trim() : "";

    setEnvSaving(true);
    try {
      // 로컬 상태 즉시 반영
      const nowLabel = "방금 전";
      if (pendingEnvironmentKind === "water_change") {
        setWaterEtaLabel(nowLabel);
      } else {
        setLitterEtaLabel(nowLabel);
      }

      // 모달 먼저 닫기 (사용자 경험: 즉시 반응)
      closeEnvModal();

      // 성공 토스트 표시
      const kindLabel =
        pendingEnvironmentKind === "water_change" ? "식수 교체" : "화장실 청소";
      showToast(
        `기록 완료! ${kindLabel}${noteValue ? ` — "${noteValue}"` : ""} 💚 고양이들이 아주 좋아할 거예요!`,
      );
    } catch (unknownError) {
      const message =
        unknownError instanceof Error ? unknownError.message : "저장에 실패했습니다.";
      showToast(`저장 중 오류가 발생했어요: ${message}`);
    } finally {
      setEnvSaving(false);
    }
  }

  function handleVoiceBroadcast(tile: CameraTileData) {
    showToast(`「${tile.placeLabel}」 음성 송출은 스트림 연동 후 사용할 수 있어요.`);
  }

  const envModalTitle =
    pendingEnvironmentKind === "water_change"
      ? "💧 식수 교체 완료"
      : pendingEnvironmentKind === "litter_clean"
        ? "🧹 화장실 청소 완료"
        : "환경 기록";

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {children}

        {/* 오늘의 활동 요약 */}
        <TodaySummaryCards
          initialSummary={initialDailySummary}
          homeId={homeId}
          initialTodayMedicineCount={initialTodayMedicineCount}
        />

        {/* ① 환경 칩 */}
        <div className={styles.envRow} role="group" aria-label="환경 관리 기록">
          <button
            type="button"
            className={styles.envChip}
            onClick={() => openEnvModal("water_change")}
          >
            <Droplets size={20} color="#4fd1c5" strokeWidth={1.75} aria-hidden />
            <span className={styles.envChipText}>
              <span className={styles.envChipLabel}>식수</span>
              <span className={styles.envChipEta}>{waterEtaLabel}</span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.envChip} ${styles.envChipLitter}`}
            onClick={() => openEnvModal("litter_clean")}
          >
            <Trash2 size={20} color="#ffab91" strokeWidth={1.75} aria-hidden />
            <span className={styles.envChipText}>
              <span className={styles.envChipLabel}>화장실</span>
              <span className={styles.envChipEta}>{litterEtaLabel}</span>
            </span>
          </button>
        </div>

        {/* ② 카메라 — 기기 관리 + 라이브 뷰어 + 2×2 타일 */}
        <section className={styles.cameraSection} aria-label="카메라 뷰">
          {/* 등록된 카메라 기기 목록 및 페어링 코드 발급 */}
          {homeId ? <CameraDeviceManager homeId={homeId} /> : null}

          {/* 라이브 방송이 있으면 자동 연결해서 영상을 보여줌 */}
          <CameraLiveViewer />

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

      {/* ── 환경 기록 모달 (div 기반, <dialog> 미사용) ── */}
      {envModalOpen ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEnvModal();
          }}
        >
          <form
            className={styles.modalSheet}
            onSubmit={(e) => { void handleSubmitEnvironment(e); }}
            aria-labelledby={envTitleId}
            noValidate
          >
            <h2 id={envTitleId} className={styles.modalTitle}>
              {envModalTitle}
            </h2>
            <p className={styles.modalDesc}>
              지금 시점을 기준으로 완료했습니다. 메모를 남겨도 좋아요.
            </p>
            <div>
              <label className={styles.fieldLabel} htmlFor={noteFieldId}>
                메모 (선택)
              </label>
              <textarea
                id={noteFieldId}
                name="note"
                rows={2}
                maxLength={500}
                placeholder="예: 새 그릇으로 교체함"
                className={styles.textarea}
              />
            </div>
            <button
              type="submit"
              className={styles.btnConfirm}
              disabled={envSaving}
            >
              {envSaving ? "저장 중…" : "저장 완료 🐾"}
            </button>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={closeEnvModal}
            >
              취소
            </button>
          </form>
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
