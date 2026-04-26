/**
 * broadcasterSignalingTimeoutMs 단위 테스트.
 *
 * 검증 항목:
 *   - ENV 미설정 / 빈 문자열 → 15000ms, warn 호출 안 함
 *   - 정상 범위 값 ('30000', '60000') → 그대로 반환
 *   - 비정상 값 (NaN / 0 / 음수 / 범위 외) → 15000ms + warn 1회
 *
 * env 는 process.env 오염 방지를 위해 인자로 직접 주입한다.
 * NodeJS.ProcessEnv 가 NODE_ENV 를 required 로 강제하므로
 * partial 객체는 unknown 경유 캐스팅으로 주입한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBroadcasterSignalingTimeoutMs } from "../broadcasterSignalingTimeoutMs";

/** 테스트 전용 env 빌더 — partial 객체를 ProcessEnv 로 안전 캐스팅 */
function buildTestEnv(
  overrides: Record<string, string>,
): NodeJS.ProcessEnv {
  return overrides as unknown as NodeJS.ProcessEnv;
}

describe("getBroadcasterSignalingTimeoutMs", () => {
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
    const result = getBroadcasterSignalingTimeoutMs(buildTestEnv({}));
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T2: '30000' → 30000ms", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "30000" }),
    );
    expect(result).toBe(30000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T3: '60000' → 60000ms", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "60000" }),
    );
    expect(result).toBe(60000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T4: '500' (MIN 미만) → 15000ms + warn 1회", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "500" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T5: '400000' (MAX 초과) → 15000ms + warn 1회", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "400000" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T6: 'abc' (NaN) → 15000ms + warn 1회", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "abc" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T7: '' (빈 문자열) → 15000ms + warn 호출 안 함", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T8: '  60000  ' (공백 trim) → 60000ms", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "  60000  " }),
    );
    expect(result).toBe(60000);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });

  it("T9: 인자 없이 호출 (process.env literal access) — ENV 미설정 시 15000ms", () => {
    /* process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS 를 직접 read 하는 경로 검증.
     * Next.js DefinePlugin inline 정책에 맞춘 literal access 가 동작하는지 확인. */
    const original = process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS;
    delete process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS;
    try {
      expect(getBroadcasterSignalingTimeoutMs()).toBe(15000);
      expect(warnSpy).toHaveBeenCalledTimes(0);
    } finally {
      /* 다른 테스트 오염 방지: 원본 복원 */
      if (original !== undefined) {
        process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS = original;
      }
    }
  });

  it("T10: 인자 없이 호출 — process.env literal access ENV 설정 시 그 값", () => {
    /* ENV 설정 시 literal access 경로가 실제 값을 읽어오는지 검증. */
    const original = process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS;
    process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS = "60000";
    try {
      expect(getBroadcasterSignalingTimeoutMs()).toBe(60000);
      expect(warnSpy).toHaveBeenCalledTimes(0);
    } finally {
      /* 원본 복원 — 설정값 없었으면 delete, 있었으면 restore */
      if (original !== undefined) {
        process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS = original;
      } else {
        delete process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS;
      }
    }
  });

  it("T11: '0' → 15000ms + warn 1회 (0 이하 거부)", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "0" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("T12: '-1000' → 15000ms + warn 1회 (음수 거부)", () => {
    const result = getBroadcasterSignalingTimeoutMs(
      buildTestEnv({ NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS: "-1000" }),
    );
    expect(result).toBe(15000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
