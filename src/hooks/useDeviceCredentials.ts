"use client";

import { useEffect, useState } from "react";
import type { DeviceIdentity } from "@/hooks/useBroadcasterSignaling";

/* ── storage key 상수 ── */
const DEVICE_TOKEN_STORAGE_KEY = "catvisor_device_token";
const DEVICE_ID_STORAGE_KEY = "catvisor_device_id";
const DEVICE_NAME_STORAGE_KEY = "catvisor_device_name";
const DEVICE_HOME_ID_STORAGE_KEY = "catvisor_home_id";

/** localStorage/sessionStorage 에서 디바이스 인증 정보 읽기 */
function readDeviceCredentialsFromBrowserStorage(): {
  token: string | null;
  name: string | null;
} {
  let token =
    typeof window !== "undefined"
      ? window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY)
      : null;
  let name =
    typeof window !== "undefined"
      ? window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY)
      : null;

  /* sessionStorage fallback — 인앱 브라우저 대응 */
  if (!token && typeof window !== "undefined") {
    token = window.sessionStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    name = window.sessionStorage.getItem(DEVICE_NAME_STORAGE_KEY);
    if (token) {
      try {
        window.localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, token);
        if (name) {
          window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, name);
        }
        const id = window.sessionStorage.getItem(DEVICE_ID_STORAGE_KEY);
        const home = window.sessionStorage.getItem(DEVICE_HOME_ID_STORAGE_KEY);
        if (id) window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        if (home) window.localStorage.setItem(DEVICE_HOME_ID_STORAGE_KEY, home);
      } catch {
        // 인앱 브라우저 storage 동기화 실패
      }
    }
  }

  return { token, name };
}

/**
 * 디바이스 credentials(localStorage 기반) 로딩 훅.
 * 마운트 시 한 번 읽어 deviceIdentity 세팅, credentialsLoaded 플래그로 로딩 완료 신호.
 */
export function useDeviceCredentials() {
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  /** credentials 로딩 완료 여부 — loading vs unpaired 구분 */
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  useEffect(() => {
    const { token: storedToken, name: storedName } =
      readDeviceCredentialsFromBrowserStorage();

    if (storedToken) {
      setDeviceIdentity({
        deviceToken: storedToken,
        deviceName: storedName ?? "카메라",
      });
      // 시그널링 훅 내부에서 deviceToken non-null → idle 자동 전환
    }
    setCredentialsLoaded(true);
  }, []);

  return { deviceIdentity, credentialsLoaded };
}
