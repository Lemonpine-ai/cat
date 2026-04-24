/**
 * Phase B (R8 §2 / R9 §3 / R12 commit 3) — metadata mirror 마커 자동 검증 (strict).
 *
 * 의도:
 *  - R7-S (R12 commit 3) 로 staging mirror 본체가 src/lib/behavior/buildBehaviorEventMetadata.ts
 *    로 이관되고, src/ logger (`useBehaviorEventLogger.ts`) 는 본 helper 를 호출.
 *  - 본 테스트는 양쪽 파일 (src/ helper + src/ logger) 에 동일 마커
 *    `// metadata-freeze-spec: r10-1` 가 존재하는지 fs.readFileSync + includes 로 검증.
 *  - 한쪽이라도 마커 부재 시 즉시 fail → src/ 안에서 helper ↔ logger 동치 계약 유지.
 *
 * R12 변경 (staging → src/):
 *  - R9 §3 strict fail 의미 유지. 대상만 staging mirror → src/ helper 로 이동.
 *  - staging/lib/behavior/buildBehaviorEventMetadata.ts 는 re-export shim 이므로 마커 부재 — 검증 제외.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MARKER = "metadata-freeze-spec: r10-1";
// R12 commit 3: mirror 본체가 src/ 로 이관됨. 검증 대상 = src/ helper.
const SRC_HELPER_PATH = path.resolve(
  __dirname,
  "../../src/lib/behavior/buildBehaviorEventMetadata.ts",
);
const SRC_LOGGER_PATH = path.resolve(
  __dirname,
  "../../src/hooks/useBehaviorEventLogger.ts",
);

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

describe("Phase B metadata mirror 마커 자동 검증 (R8 §2 / R9 §3 strict / R12 commit 3)", () => {
  it("src/ helper (buildBehaviorEventMetadata) 에 마커 존재", () => {
    const content = readFileSafe(SRC_HELPER_PATH);
    expect(content, `helper 파일 부재: ${SRC_HELPER_PATH}`).not.toBeNull();
    expect(content, `helper 마커 '${MARKER}' 부재 — R12 drift 회귀`).toContain(MARKER);
  });

  it("src/ logger 에 마커 존재 (R9 §3 strict — 부재 시 즉시 fail)", () => {
    // R9 §3: R8 T5 적용으로 src/ 마커 이미 존재 → strict fail 안전. 본체 변경으로 마커가 사라지면 즉시 fail.
    const content = readFileSafe(SRC_LOGGER_PATH);
    expect(content, `src/ logger 파일 부재: ${SRC_LOGGER_PATH}`).not.toBeNull();
    expect(content, `src/ logger 마커 '${MARKER}' 부재 — R9 §3 strict regression`).toContain(MARKER);
  });
});
