/**
 * iceConnectionTimeoutMs 단위 테스트.
 *
 * 검증 항목:
 *   - ENV 미설정 / 빈 문자열 → 15000ms, warn 호출 안 함
 *   - 정상 범위 값 ('30000', '60000') → 그대로 반환
 *   - 비정상 값 (NaN / 범위 외) → 15000ms + warn 1회
 *
 * env 는 process.env 오염 방지를 위해 인자로 직접 주입한다.
 * NodeJS.ProcessEnv 가 NODE_ENV 를 required 로 강제하므로
 * partial 객체는 unknown 경유 캐스팅으로 주입한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIceConnectionTimeoutMs } from "../iceConnectionTimeoutMs";

/** 테스트 전용 env 빌더 — partial 객체를 ProcessEnv 로 안전 캐스팅 */
function buildTestEnv(
  overrides: Record<string, string>,
): NodeJS.ProcessEnv {
  return overrides as unknown as NodeJS.ProcessEnv;
}

describe("getIceConnectionTimeoutMs", () => {
  /* console.warn 캡처용 spy */
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("T1: ENV 미설정 시 15000ms 반환 + warn 호출 안 함", () => {
    /* key 자체가 없는 빈 env 객체 주입 */
    const result = getIceConnectionTimeoutMs(buildTestEnv({}));
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T2: '30000' → 30000ms", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "30000" }),
    );
    expect(result).toBe(30000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T3: '60000' → 60000ms", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "60000" }),
    );
    expect(result).toBe(60000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T4: '1000' (MIN 미만) → 15000ms + warn 1회", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "1000" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T5: '999999' (MAX 초과) → 15000ms + warn 1회", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "999999" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T6: 'abc' (NaN) → 15000ms + warn 1회", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "abc" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T7: '' (빈 문자열) → 15000ms + warn 호출 안 함", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T8: '  30000  ' (공백 trim) → 30000ms", () => {
    const result = getIceConnectionTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_ICE_TIMEOUT_MS: "  30000  " }),
    );
    expect(result).toBe(30000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });
});
