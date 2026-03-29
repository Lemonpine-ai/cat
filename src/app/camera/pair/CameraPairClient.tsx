"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./CameraPairClient.module.css";

type PairingPhase = "input" | "pairing" | "success" | "error";

const DEVICE_TOKEN_STORAGE_KEY = "catvisor_device_token";
const DEVICE_ID_STORAGE_KEY = "catvisor_device_id";
const DEVICE_NAME_STORAGE_KEY = "catvisor_device_name";
const DEVICE_HOME_ID_STORAGE_KEY = "catvisor_home_id";
const CODE_LENGTH = 4;

/**
 * 4자리 코드 입력 → Supabase 함수로 검증 → device_token 로컬스토리지 저장 → 방송 페이지 이동.
 */
export function CameraPairClient() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [pairingPhase, setPairingPhase] = useState<PairingPhase>("input");
  const [pairedDeviceName, setPairedDeviceName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(CODE_LENGTH).fill(null));

  const handleDigitChange = useCallback(
    (index: number, rawValue: string) => {
      const singleDigit = rawValue.replace(/\D/g, "").slice(-1);
      setDigits((prev) => {
        const next = [...prev];
        next[index] = singleDigit;
        return next;
      });

      if (singleDigit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  async function submitPairingCode() {
    const pairingCode = digits.join("");
    if (pairingCode.length < CODE_LENGTH) {
      setErrorMessage("4자리 숫자를 모두 입력해 주세요.");
      return;
    }

    setPairingPhase("pairing");
    setErrorMessage(null);

    const normalizedPairingCode = pairingCode.trim();
    const { data, error } = await supabase.rpc("pair_camera_device", {
      input_pairing_code: normalizedPairingCode,
    });

    if (error || !data || data.error) {
      setErrorMessage(data?.error ?? error?.message ?? "서버 오류가 발생했어요.");
      setPairingPhase("error");
      return;
    }

    localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, data.device_token);
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, data.device_id);
    localStorage.setItem(DEVICE_NAME_STORAGE_KEY, data.device_name);
    localStorage.setItem(DEVICE_HOME_ID_STORAGE_KEY, data.home_id);

    setPairedDeviceName(data.device_name);
    setPairingPhase("success");

    setTimeout(() => router.replace("/camera/broadcast"), 1500);
  }

  function resetPairing() {
    setDigits(Array(CODE_LENGTH).fill(""));
    setPairingPhase("input");
    setErrorMessage(null);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden>📷</div>
        <h1 className={styles.title}>카메라 연결</h1>
        <p className={styles.desc}>
          대시보드의 <strong>카메라 추가</strong> 버튼을 눌러<br />
          표시된 <strong>4자리 코드</strong>를 입력해 주세요.
        </p>

        {pairingPhase === "success" ? (
          <div className={styles.successBox}>
            <span className={styles.successIcon}>✅</span>
            <p className={styles.successText}>
              <strong>{pairedDeviceName}</strong> 연결 완료!<br />
              방송 화면으로 이동 중…
            </p>
          </div>
        ) : (
          <>
            <div className={styles.codeInputRow} aria-label="4자리 코드 입력">
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  className={`${styles.digitInput} ${pairingPhase === "error" ? styles.digitInputError : ""}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={pairingPhase === "pairing"}
                  autoFocus={idx === 0}
                  aria-label={`코드 ${idx + 1}번째 자리`}
                />
              ))}
            </div>

            {errorMessage ? (
              <p className={styles.errorText} role="alert">{errorMessage}</p>
            ) : null}

            {pairingPhase === "error" ? (
              <button className={styles.btnRetry} onClick={resetPairing}>
                다시 입력
              </button>
            ) : (
              <button
                className={styles.btnConnect}
                onClick={() => void submitPairingCode()}
                disabled={pairingPhase === "pairing" || digits.join("").length < CODE_LENGTH}
              >
                {pairingPhase === "pairing" ? (
                  <span className={styles.spinner} aria-hidden />
                ) : null}
                {pairingPhase === "pairing" ? "연결 중…" : "연결하기"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
