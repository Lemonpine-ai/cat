"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./CameraDeviceManager.module.css";

type CameraDevice = {
  id: string;
  device_name: string;
  is_paired: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
};

type PairingModalState =
  | { kind: "closed" }
  | { kind: "creating" }
  | { kind: "ready"; pairingCode: string; deviceId: string; expiresAt: number };

const PAIRING_CODE_VALID_DURATION_MS = 5 * 60 * 1000;
/** 한 home 당 등록 가능한 최대 카메라 기기 수 */
const MAX_DEVICES_PER_HOME = 6;

/**
 * 대시보드 카메라 기기 관리 섹션.
 * 페어링 코드 생성 → 기기 목록 표시 → 연결 상태 확인.
 */
export function CameraDeviceManager({ homeId }: { homeId: string }) {
  /* supabase 클라이언트를 useMemo로 안정화 — 매 렌더마다 새 인스턴스 생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [pairingModal, setPairingModal] = useState<PairingModalState>({
    kind: "closed",
  });
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [newDeviceName, setNewDeviceName] = useState("새 카메라");
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 이름 편집 중인 기기 ID (null 이면 편집 모드 아님) */
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  /** Realtime 콜백에서 최신 페어링 중 기기 id 참조 (클로저 끊김 방지) */
  const pairingDeviceIdRef = useRef<string | null>(null);

  const fetchCameraDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from("camera_devices")
      .select("id, device_name, is_paired, is_active, last_seen_at, created_at")
      .eq("home_id", homeId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCameraDevices(data);
    }
    setIsLoadingDevices(false);
  }, [supabase, homeId]);

  useEffect(() => {
    void fetchCameraDevices();
  }, [fetchCameraDevices]);

  useEffect(() => {
    pairingDeviceIdRef.current =
      pairingModal.kind === "ready" ? pairingModal.deviceId : null;
  }, [pairingModal]);

  /** 남는 폰에서 페어링 완료 시 DB 가 갱신되면 코드 카드를 자동으로 닫습니다. */
  useEffect(() => {
    const channel = supabase
      .channel(`camera-devices-realtime-${homeId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "camera_devices",
          filter: `home_id=eq.${homeId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; is_paired: boolean };
          void fetchCameraDevices();
          if (row.is_paired && pairingDeviceIdRef.current === row.id) {
            setPairingModal({ kind: "closed" });
            pairingDeviceIdRef.current = null;
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, homeId, fetchCameraDevices]);

  useEffect(() => {
    if (pairingModal.kind !== "ready") return;

    const updateCountdown = () => {
      const remainingMs = pairingModal.expiresAt - Date.now();
      if (remainingMs <= 0) {
        setCountdownSeconds(0);
        setPairingModal({ kind: "closed" });
        void fetchCameraDevices();
        return;
      }
      setCountdownSeconds(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();
    const tickInterval = setInterval(updateCountdown, 1000);
    return () => clearInterval(tickInterval);
  }, [pairingModal, fetchCameraDevices]);

  async function generatePairingCode() {
    if (!newDeviceName.trim()) {
      setErrorMessage("카메라 이름을 입력해 주세요.");
      return;
    }

    setPairingModal({ kind: "creating" });
    setErrorMessage(null);

    /* ── 기기 수 제한: 6대 초과 시 가장 오래된 비활성 기기를 삭제 ── */
    const { data: existingDevices } = await supabase
      .from("camera_devices")
      .select("id, is_active, is_paired, created_at")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (existingDevices && existingDevices.length >= MAX_DEVICES_PER_HOME) {
      /* 비활성(방송 중 아닌) 기기 중 가장 오래된 것부터 삭제 */
      const inactive = existingDevices.filter((d) => !d.is_active);
      const toRemove = inactive.length > 0 ? inactive[0] : existingDevices[0];
      await deleteDevice(toRemove.id);
    }

    const pairingCode = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const expiresAt = new Date(Date.now() + PAIRING_CODE_VALID_DURATION_MS);

    const { data: device, error: deviceError } = await supabase
      .from("camera_devices")
      .insert({
        home_id: homeId,
        device_name: newDeviceName.trim(),
        pairing_code: pairingCode,
        pairing_code_expires_at: expiresAt.toISOString(),
        is_paired: false,
      })
      .select("id")
      .single();

    if (deviceError || !device) {
      setErrorMessage(deviceError?.message ?? "코드 생성에 실패했어요.");
      setPairingModal({ kind: "closed" });
      return;
    }

    setPairingModal({
      kind: "ready",
      pairingCode,
      deviceId: device.id,
      expiresAt: expiresAt.getTime(),
    });
    setNewDeviceName("새 카메라");
    void fetchCameraDevices();
  }

  async function deleteDevice(deviceId: string) {
    /*
     * 연쇄 삭제: ICE 후보 → 세션 → 기기.
     * device_id 컬럼은 PostgREST 에서 접근 불가하므로,
     * SECURITY DEFINER RPC 로 DB 내부에서 처리한다.
     */
    const { data, error } = await supabase.rpc("delete_device_cascade", {
      p_device_id: deviceId,
    });

    if (error) {
      console.error("[CameraDeviceManager] 기기 삭제 RPC 실패:", error.message);
    }
    /* RPC 결과 확인 — 실패해도 목록은 갱신 */
    const result = data as { success?: boolean; error?: string } | null;
    if (result && !result.success) {
      console.warn("[CameraDeviceManager] 기기 삭제 실패:", result.error);
    }

    void fetchCameraDevices();
  }

  /** 기기 이름 인라인 편집 시작 */
  function startEditingName(device: CameraDevice) {
    setEditingDeviceId(device.id);
    setEditingName(device.device_name);
  }

  /** 기기 이름 저장 (Enter / blur) — 중복 호출 방지 */
  async function saveDeviceName(deviceId: string) {
    if (editingDeviceId !== deviceId) return;
    setEditingDeviceId(null);
    const trimmed = editingName.trim();
    if (!trimmed) return;
    await supabase
      .from("camera_devices")
      .update({ device_name: trimmed })
      .eq("id", deviceId);
    void fetchCameraDevices();
  }

  function formatLastSeen(lastSeenAt: string | null): string {
    if (!lastSeenAt) return "없음";
    const diffSeconds = Math.floor(
      (Date.now() - new Date(lastSeenAt).getTime()) / 1000,
    );
    if (diffSeconds < 60) return `${diffSeconds}초 전`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}분 전`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}시간 전`;
    return `${Math.floor(diffSeconds / 86400)}일 전`;
  }

  const countdownMinutes = Math.floor(countdownSeconds / 60);
  const countdownSecondsDisplay = String(countdownSeconds % 60).padStart(2, "0");

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>📡 카메라 기기</h2>
        <button
          className={styles.btnAddCamera}
          onClick={() =>
            setPairingModal((prev) =>
              prev.kind === "closed" ? { kind: "creating" } : { kind: "closed" },
            )
          }
        >
          + 카메라 추가
        </button>
      </div>

      {errorMessage ? (
        <p className={styles.errorText} role="alert">{errorMessage}</p>
      ) : null}

      {pairingModal.kind !== "closed" ? (
        <div className={styles.pairingCard}>
          {pairingModal.kind === "creating" ? (
            <div className={styles.pairingForm}>
              <label className={styles.label} htmlFor="new-device-name">
                카메라 이름
              </label>
              <input
                id="new-device-name"
                className={styles.input}
                type="text"
                maxLength={30}
                placeholder="예: 거실 카메라"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                autoFocus
              />
              <div className={styles.pairingFormButtons}>
                <button
                  className={styles.btnCancel}
                  onClick={() => setPairingModal({ kind: "closed" })}
                >
                  취소
                </button>
                <button
                  className={styles.btnGenerate}
                  onClick={() => void generatePairingCode()}
                >
                  코드 생성
                </button>
              </div>
            </div>
          ) : pairingModal.kind === "ready" ? (
            <div className={styles.pairingReady}>
              <p className={styles.pairingInstruction}>
                남는 폰에서 <strong>cat-lac-eight.vercel.app/camera/pair</strong> 접속 후<br />
                아래 코드를 입력해 주세요.
              </p>
              <div className={styles.bigCode} aria-label={`페어링 코드: ${pairingModal.pairingCode}`}>
                {pairingModal.pairingCode.split("").map((digit, idx) => (
                  <span key={idx} className={styles.bigCodeDigit}>{digit}</span>
                ))}
              </div>
              <p className={styles.countdown}>
                {countdownSeconds > 0
                  ? `⏱ ${countdownMinutes}:${countdownSecondsDisplay} 후 만료`
                  : "만료됨"}
              </p>
              <button
                className={styles.btnCancel}
                onClick={() => {
                  setPairingModal({ kind: "closed" });
                  void fetchCameraDevices();
                }}
              >
                닫기
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.deviceList}>
        {isLoadingDevices ? (
          <p className={styles.loadingText}>불러오는 중…</p>
        ) : cameraDevices.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden>📷</span>
            <p className={styles.emptyText}>
              아직 등록된 카메라가 없어요.<br />
              &apos;카메라 추가&apos;로 시작해 보세요!
            </p>
          </div>
        ) : (
          cameraDevices.map((device) => (
            <div key={device.id} className={styles.deviceCard}>
              <div className={styles.deviceInfo}>
                <div className={styles.deviceNameRow}>
                  <span
                    className={`${styles.statusDot} ${
                      device.is_active
                        ? styles.statusDotLive
                        : device.is_paired
                          ? styles.statusDotPaired
                          : styles.statusDotUnpaired
                    }`}
                    aria-hidden
                  />
                  {editingDeviceId === device.id ? (
                    <input
                      className={styles.deviceNameInput}
                      type="text"
                      maxLength={30}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveDeviceName(device.id);
                        if (e.key === "Escape") setEditingDeviceId(null);
                      }}
                      onBlur={() => void saveDeviceName(device.id)}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.deviceNameBtn}
                      onClick={() => startEditingName(device)}
                      title="이름 변경"
                    >
                      {device.device_name} ✏️
                    </button>
                  )}
                </div>
                <span className={styles.deviceMeta}>
                  {device.is_active
                    ? "🔴 방송 중"
                    : device.is_paired
                      ? `연결됨 · 최근 ${formatLastSeen(device.last_seen_at)}`
                      : "페어링 대기 중"}
                </span>
              </div>
              <button
                className={styles.btnDelete}
                onClick={() => void deleteDevice(device.id)}
                aria-label={`${device.device_name} 삭제`}
              >
                삭제
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
