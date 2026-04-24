/**
 * Phase B (R8 §2 / R9 §3) — metadata mirror 마커 자동 검증 (strict).
 *
 * 의도:
 *  - R7 §4 옵션 R 채택으로 staging mirror (`buildBehaviorEventMetadata.ts`) 와 src/ logger
 *    (`useBehaviorEventLogger.ts`) 의 metadata 조립 블록은 1:1 동치를 약속.
 *  - 본 테스트는 양쪽 파일에 동일 마커 `// metadata-freeze-spec: r7-1` 가 존재하는지
 *    fs.readFileSync + includes 로 검증. 한쪽이라도 마커 부재 시 즉시 fail.
 *
 * R9 §3 strict 강화:
 *  - R8 까지 it 2 는 src/ 마커 부재 시 console.warn + return (skip) — silent regression 위험.
 *  - R9 §3 부터 src/ 마커 부재 시 즉시 fail — CI 빌드 차단 → drift 사전 차단.
 *  - R8 T5 적용으로 src/ logger line 225 에 마커 존재 (확인됨) → strict fail 안전 환경.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MARKER = "metadata-freeze-spec: r7-1";
const STAGING_MIRROR_PATH = path.resolve(
  __dirname,
  "../lib/behavior/buildBehaviorEventMetadata.ts",
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

describe("Phase B metadata mirror 마커 자동 검증 (R8 §2 / R9 §3 strict)", () => {
  it("staging mirror 에 마커 존재", () => {
    const content = readFileSafe(STAGING_MIRROR_PATH);
    expect(content, `mirror 파일 부재: ${STAGING_MIRROR_PATH}`).not.toBeNull();
    expect(content).toContain(MARKER);
  });

  it("src/ logger 에 마커 존재 (R9 §3 strict — 부재 시 즉시 fail)", () => {
    // R9 §3: R8 T5 적용으로 src/ 마커 이미 존재 → strict fail 안전. 본체 변경으로 마커가 사라지면 즉시 fail.
    const content = readFileSafe(SRC_LOGGER_PATH);
    expect(content, `src/ logger 파일 부재: ${SRC_LOGGER_PATH}`).not.toBeNull();
    expect(content, `src/ logger 마커 '${MARKER}' 부재 — R9 §3 strict regression`).toContain(MARKER);
  });
});
