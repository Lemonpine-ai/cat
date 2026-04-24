/**
 * Phase B (R3) — 방송폰 YOLO 추론 mount 컴포넌트.
 *
 * 역할:
 *  - `CameraBroadcastClient` 상위에서 "flag ON + 방송 중" 일 때만 렌더.
 *  - UI 는 없고(null) driver 훅만 실행 → WebRTC 송출 경로와 분리.
 *  - OFF 경로는 렌더되지 않으므로 worker/INSERT 가 0 (CLAUDE.md #13).
 *
 * ⚠️ src/ 반영 시 필수 작업 (CLAUDE.md #13, Phase B Arch R2 §3.3):
 *  1. `src/hooks/useBehaviorDetection.ts` 를 호출하는 **뷰어폰** 경로에서
 *     `onBehaviorChange` 를 flag ON 시 `undefined` 로 게이트.
 *  2. 미실행 시 방송폰 INSERT + 뷰어 4명 INSERT 동시 발생 → Supabase Nano pool(=15)
 *     즉시 고갈 → 전면 timeout (2026-04-22 장애 재현).
 *  3. 런타임 L3 방어: dev 환경에서 `window.__catBehaviorLoggerArmed__` 전역 sentinel.
 *
 * 사용 예시: `staging/docs/phase_b_src_migration_checklist.md` §2 참조.
 *
 * Dev 판단:
 *  - enabled 는 내부에서 "homeId && cameraId 둘 다 truthy" 로 결정. 부모는 렌더 여부만.
 *  - `initStatus === "failed"` 시 console.warn 1회 (UI 토스트는 Phase C 결정).
 */

"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useBroadcasterYoloDriver } from "../hooks/useBroadcasterYoloDriver";
import YoloDriverDiagBadge from "./YoloDriverDiagBadge";

export interface CameraBroadcastYoloMountProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  homeId: string | null;
  cameraId: string | null;
  identifiedCatId?: string | null;
  supabaseClient?: SupabaseClient;
  /** useGlobalMotion 결과 (옵셔널). idle 스로틀링에 사용. */
  motionActive?: boolean;
}

/**
 * UI 없는 "driver 실행용" invisible 컴포넌트.
 * - React tree 안에 존재해야 훅이 돌기 때문에 컴포넌트로 감싸는 것.
 * - homeId/cameraId 중 하나라도 없으면 enabled=false → worker 생성 안 함.
 */
export default function CameraBroadcastYoloMount({
  videoRef,
  homeId,
  cameraId,
  identifiedCatId,
  supabaseClient,
  motionActive,
}: CameraBroadcastYoloMountProps): React.JSX.Element | null {
  const enabled = Boolean(homeId && cameraId);
  const driver = useBroadcasterYoloDriver({
    videoRef,
    enabled,
    homeId,
    cameraId,
    identifiedCatId,
    supabaseClient,
    motionActive,
  });
  const { initStatus } = driver;

  // initStatus === "failed" 시 console.warn 1회만 (중복 로그 방지).
  const warnedRef = useRef<boolean>(false);
  useEffect(() => {
    if (initStatus === "failed" && !warnedRef.current) {
      warnedRef.current = true;
      console.warn(
        "[CATvisor][CameraBroadcastYoloMount] ONNX 초기화 5회 재시도 모두 실패. " +
          "AI 추론이 중단된 상태입니다. 페이지를 새로고침하거나 flag 를 OFF 로 돌려주세요.",
      );
    }
    // "ready" 로 전환되면 다음 실패 주기에 다시 경고 낼 수 있게 리셋.
    if (initStatus === "ready") {
      warnedRef.current = false;
    }
  }, [initStatus]);

  // R6 T6: dev 환경 전용 진단 배지 — prod 빌드에는 NODE_ENV 빌드타임 치환으로 null 반환.
  //   오버레이 UI 는 Phase C 이후 별도 설계. 방송 DOM 경로에는 영향 0 (pointerEvents: none).
  if (process.env.NODE_ENV === "development") {
    return <YoloDriverDiagBadge driver={driver} />;
  }
  return null;
}
