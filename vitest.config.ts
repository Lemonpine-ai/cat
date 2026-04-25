/**
 * Phase B (R3) — vitest 설정.
 *
 * 범위 (M-R2-B 대응, 옵션 A — include 명시 축소):
 *  - R2 에서 와일드카드 `staging/tests/**\/*.test.ts` 는 Phase A 레거시 테스트 2개
 *    (`behaviorClasses.invariants.test.ts`, `effectiveClass.parity.test.ts`) 를 매치시켜
 *    vitest "No test found in suite" 에러를 유발.
 *  - R3: describe/it 래퍼가 있는 Phase B 테스트 파일만 명시 나열.
 *  - Phase A 2개 파일은 `runInvariants()` / `checkParity()` export 만 있는 runner-agnostic 형태 —
 *    vitest 에서 제외, 별도 node CLI 로 실행 가능한 상태로 보존.
 *
 * ⚠️ Dev 유지보수 (Arch R3 §5 #6):
 *  - 신규 테스트 파일 추가 시 **본 include 배열을 반드시 업데이트**. 누락되면 CI 에서 조용히 빠진다.
 *
 * R4 추가 규칙 (Arch R4 §2.4):
 *  - `staging/tests/helpers/*.ts` 는 describe/it 이 없는 **테스트 헬퍼** — include 에 추가하지 않는다
 *    (vitest "No test found in suite" 에러 회피). 타입 체크는 tsconfig.staging-check.json 에서만 수행.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // R5 권고 2: driver renderHook 테스트 체인이 `useBehaviorEventLogger` 를 통해
  //   `@/lib/supabase/client` 를 import. tsconfig paths 와 동일하게 vite alias 도 매핑 필요.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: [
      "staging/tests/confirmFrames.test.ts",
      "staging/tests/maxDurationGuard.test.ts",
      "staging/tests/inferenceScheduler.parity.test.ts",
      "staging/tests/broadcasterYoloDriver.test.ts",
      // R3 신규 (Driver 분할 대응 — lifecycle / sampling 단위 테스트):
      "staging/tests/yoloWorkerLifecycle.test.ts",
      "staging/tests/yoloSampling.test.ts",
      // R5 권고 2 (driver 훅 renderHook 통합 — OFF→ON transient flush):
      "staging/tests/broadcasterYoloDriver.renderHook.test.ts",
      // R6 T11 (metadata freeze — driver/logger 계약 고정):
      "staging/tests/metadataFreeze.test.ts",
      // R7 §6.1 (latency tracker 단위 — delta 엣지 + reset):
      "staging/tests/yoloLatencyTracker.test.ts",
      // R8 §2 (metadata mirror 마커 자동 검증 — staging + src/ 양쪽 grep):
      "staging/tests/metadataFreezeMirror.test.ts",
      // cat-identity Tier 1 fix R1 #5 (validate / hook / hsv 단위):
      "src/lib/cat/__tests__/catDraftValidation.test.ts",
      "src/lib/cat/__tests__/useCatRegistration.test.ts",
      "src/lib/cat/__tests__/extractHsvFromPhoto.test.ts",
      // cat-identity Tier 1 fix R4-1 (보안 — magic byte / strip union / upload INVALID_FORMAT):
      "src/lib/cat/__tests__/detectImageMagic.test.ts",
      "src/lib/cat/__tests__/stripExifFromImage.test.ts",
      "src/lib/cat/__tests__/uploadCatProfilePhoto.test.ts",
      // cat-identity Tier 1 fix R4-2 (사용자 흐름 — submittingRef / alreadyExisted / UPLOAD_FAILED 액션):
      "src/app/cats/new/__tests__/CatRegistrationScreen.test.tsx",
    ],
    exclude: ["node_modules", "tests", "staging/tests/node_modules"],
    // jsdom 으로 전환: sampling 테스트가 document.hidden / visibilitychange / setInterval 을 사용.
    environment: "jsdom",
    // Phase A 레거시 + 기존 R2 테스트가 `declare const describe: any` 패턴으로 전역 API 기대 →
    // vitest `globals: true` 로 inject. 신규 R3 테스트도 import 로 쓰지만 양립 가능.
    globals: true,
  },
});
