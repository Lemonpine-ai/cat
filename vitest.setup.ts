/**
 * Vitest 글로벌 setup (fix R7-1 — QA-6차 R1 후속).
 *
 * 배경:
 *  cat-identity 테스트 트랙이 logger.error / logger.warn 을 의도적으로 호출하여
 *  negative-path 분기를 검증한다. 호출 자체는 정상이지만, logger 가 console.error /
 *  console.warn 으로 출력하기 때문에 실제 stderr 가 발생하여 vitest 출력이 시끄러워진다.
 *  QA-6차 R1 은 "211 PASS + stderr noise 0" 을 동시 요구 — 두 조건을 모두 만족해야 함.
 *
 *  ⚠️ 의도된 출력이지 실패가 아니다. 그러나 R1 명세상 stderr 0 도 유지해야 하므로
 *     본 setup 에서 logger 모듈을 글로벌 noop mock 으로 등록해 console 출력을 차단한다.
 *
 * 채택 방식 (시도 후 가장 깔끔한 것 선택):
 *  - vi.mock("@/lib/observability/logger", ...) — vitest 가 setupFiles 의 vi.mock 을
 *    각 테스트 파일 모듈 그래프에 자동 hoist. 별도 가드 / 환경변수 / spy 복원 불필요.
 *  - 단 PII 마스킹 자체 검증은 src/lib/observability/__tests__/logger.test.ts 가
 *    파일 첫 줄에서 vi.unmock("@/lib/observability/logger") 로 mock 을 해제하여
 *    실제 logger 동작을 검증한다 (해당 파일 자체는 console.warn/error 를 spyOn 으로
 *    흡수하므로 stderr noise 0 유지).
 *
 * 다른 후보 비교:
 *  - console.error/warn spyOn 글로벌 — logger.test.ts 가 자체 spyOn + mockRestore 를
 *    호출하므로 충돌 가능. mock 격리가 더 깨끗.
 *  - logger.ts 가드 (process.env.VITEST) — src/ 프로덕션 코드 1줄 변경 필요.
 *    fix R7 범위는 테스트 인프라 — src/ 변경 없는 setupFiles 방식이 무손상 원칙에 부합.
 */

import { vi } from "vitest";

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
