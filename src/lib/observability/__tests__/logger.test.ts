/**
 * cat-identity Tier 1 fix R4-4 m11 — logger PII 마스킹 단위 테스트.
 *
 * 회귀 방지:
 *  - owner_id / email / home_id 등 PII 키 자동 마스킹 (앞 4자 + ***).
 *  - 비-PII 키는 그대로 출력.
 *  - SENTRY_DSN 미설정 시 emitToSentry noop.
 *
 * fix R7-1 (QA-6차 R1 후속):
 *  vitest.setup.ts 에서 logger 모듈을 글로벌 noop mock 으로 등록한다 (다른 테스트의
 *  의도된 stderr noise 차단 목적). 본 파일은 logger 의 PII 마스킹 동작 자체를 검증하므로
 *  파일 진입 직후 vi.unmock 으로 mock 을 해제하고 실제 logger 를 import 해야 한다.
 *  (console.warn / console.error 자체는 아래 beforeEach 에서 spyOn 으로 흡수하여 stderr 0 유지)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.unmock("@/lib/observability/logger");

import { logger } from "@/lib/observability/logger";

describe("logger PII 마스킹 (fix R4-4 m11)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("1) logger.error context 의 owner_id → '앞 4자 + ***' 로 마스킹", () => {
    logger.error("test", new Error("oops"), {
      owner_id: "abcdefgh-1234-5678",
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const args = errorSpy.mock.calls[0];
    /* args[1] = { error, ...masked } 객체. */
    const ctx = args[1] as { owner_id?: unknown };
    expect(ctx.owner_id).toBe("abcd***");
  });

  it("2) logger.warn context 의 home_id → 마스킹, non_pii → 그대로", () => {
    logger.warn("test", "msg", { home_id: "xyz123abc", non_pii: "ok" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0];
    const ctx = args[1] as { home_id?: unknown; non_pii?: unknown };
    expect(ctx.home_id).toBe("xyz1***");
    expect(ctx.non_pii).toBe("ok");
  });

  it("3) PII 값이 4자 이하 → '***'", () => {
    logger.error("test", "msg", { owner_id: "abc" });
    const args = errorSpy.mock.calls[0];
    const ctx = args[1] as { owner_id?: unknown };
    expect(ctx.owner_id).toBe("***");
  });

  it("4) PII 키 + 비-string 값 → '***'", () => {
    logger.error("test", "msg", { owner_id: 12345 });
    const args = errorSpy.mock.calls[0];
    const ctx = args[1] as { owner_id?: unknown };
    expect(ctx.owner_id).toBe("***");
  });

  it("5) ctx 부재 → 마스킹 step skip (회귀 방지)", () => {
    logger.warn("test", "msg");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    /* 인자 1개만 (ctx 미동봉). */
    expect(warnSpy.mock.calls[0].length).toBe(1);
  });

  it("6) NEXT_PUBLIC_SENTRY_DSN 미설정 → emitToSentry noop (window 노출 0)", () => {
    /* 본 환경에서 process.env.NEXT_PUBLIC_SENTRY_DSN 미설정 가정.
     * emitToSentry 가 throw 하지 않고 정상 종료해야 함. */
    expect(() => {
      logger.warn("test", "msg", { owner_id: "abc" });
      logger.error("test", "msg", { owner_id: "abc" });
    }).not.toThrow();
  });

  it("7) 다양한 PII 키 (email / user_id / phone / homeId / ownerId) 모두 마스킹", () => {
    logger.warn("test", "msg", {
      email: "user@example.com",
      user_id: "uid-12345",
      phone: "010-1234-5678",
      homeId: "home-abcdef",
      ownerId: "owner-xyz123",
    });
    const ctx = warnSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.email).toBe("user***");
    expect(ctx.user_id).toBe("uid-***");
    expect(ctx.phone).toBe("010-***");
    expect(ctx.homeId).toBe("home***");
    expect(ctx.ownerId).toBe("owne***");
  });

  it("8) R5-2 R7-3 — Storage path 마스킹 (homeId/profiles/catId 평문 누출 차단)", () => {
    logger.error("test", new Error("oops"), {
      path: "abcdefgh-home/profiles/cat-uuid_123.jpg",
    });
    const ctx = errorSpy.mock.calls[0][1] as { path?: unknown };
    /* path 는 PII_KEYS 에 추가됨 — 앞 4자 + *** 로 마스킹. */
    expect(ctx.path).toBe("abcd***");
  });

  it("9) R5-2 R7-3 — catId / cat_id / url 모두 PII_KEYS 마스킹", () => {
    logger.warn("test", "msg", {
      catId: "uuid-cat-12345",
      cat_id: "snake-cat-67890",
      url: "https://supabase.co/storage/v1/object/public/cat-moments/x.jpg",
    });
    const ctx = warnSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.catId).toBe("uuid***");
    expect(ctx.cat_id).toBe("snak***");
    expect(ctx.url).toBe("http***");
  });
});
