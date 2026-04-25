/**
 * cat-identity Tier 1 fix R1 #5 — useCatRegistration 훅 단위 테스트.
 *
 * Mock supabase 로 4 시나리오 검증:
 *  1) INSERT 성공 + 사진 없음 → ok / photoUploaded:false
 *  2) INSERT 23505 (UNIQUE) + 본인 row 존재 → ok (already-registered)
 *  3) INSERT 23505 + 본인 row 없음 → DUPLICATE_NAME
 *  4) INSERT timeout → TIMEOUT
 *
 * 사진 업로드 시나리오는 storage mock 복잡도 + Worker 의존성 → 별도 파일.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCatRegistration } from "@/hooks/useCatRegistration";
import type { CatDraft } from "@/types/cat";

const VALID_DRAFT: CatDraft = {
  name: "나비",
  breed: "코리안 숏헤어",
  birthDate: "2020-01-01",
  sex: "unknown",
  photoFile: null,
  isNeutered: "unknown",
  weightKg: "",
  medicalNotes: "",
  medications: "",
  supplements: "",
  litterType: "",
  foodType: "",
};

/** insert 결과를 컨트롤할 수 있는 supabase mock 빌더. */
function makeMockSupabase(opts: {
  insertResult: { data: { id: string } | null; error: { code?: string; message?: string } | null };
  selectExistingId?: string | null;
}) {
  // chainable insert builder
  const insertBuilder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(opts.insertResult),
  };
  // chainable select builder (race recheck)
  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.selectExistingId ? { id: opts.selectExistingId } : null,
      error: null,
    }),
  };
  let fromCallCount = 0;
  const supabase = {
    from: vi.fn().mockImplementation(() => {
      fromCallCount += 1;
      // 첫 호출 = INSERT, 두번째 호출 = SELECT (race recheck)
      if (fromCallCount === 1) return insertBuilder;
      return selectBuilder;
    }),
  } as unknown as SupabaseClient;
  return { supabase, insertBuilder, selectBuilder };
}

describe("useCatRegistration", () => {
  it("1) INSERT 성공 + 사진 없음 → ok / photoUploaded:false", async () => {
    const { supabase } = makeMockSupabase({
      insertResult: { data: { id: "cat-123" }, error: null },
    });
    const { result } = renderHook(() =>
      useCatRegistration({ homeId: "home-1", supabaseClient: supabase }),
    );
    let res: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      res = await result.current.submit(VALID_DRAFT);
    });
    expect(res?.kind).toBe("ok");
    if (res?.kind === "ok") {
      expect(res.catId).toBe("cat-123");
      expect(res.photoUploaded).toBe(false);
    }
  });

  it("2) INSERT 23505 + 본인 row 존재 → ok (이미 등록됨 케이스)", async () => {
    const { supabase } = makeMockSupabase({
      insertResult: {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      },
      selectExistingId: "cat-existing",
    });
    const { result } = renderHook(() =>
      useCatRegistration({ homeId: "home-1", supabaseClient: supabase }),
    );
    let res: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      res = await result.current.submit(VALID_DRAFT);
    });
    expect(res?.kind).toBe("ok");
    if (res?.kind === "ok") {
      expect(res.catId).toBe("cat-existing");
      expect(res.photoUploaded).toBe(false);
    }
  });

  it("3) INSERT 23505 + 본인 row 없음 → DUPLICATE_NAME", async () => {
    const { supabase } = makeMockSupabase({
      insertResult: {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      },
      selectExistingId: null,
    });
    const { result } = renderHook(() =>
      useCatRegistration({ homeId: "home-1", supabaseClient: supabase }),
    );
    let res: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      res = await result.current.submit(VALID_DRAFT);
    });
    expect(res?.kind).toBe("error");
    if (res?.kind === "error") {
      expect(res.code).toBe("DUPLICATE_NAME");
    }
  });

  it("4) INSERT timeout (PGRST301) → TIMEOUT", async () => {
    const { supabase } = makeMockSupabase({
      insertResult: {
        data: null,
        error: { code: "PGRST301", message: "statement timeout" },
      },
    });
    const { result } = renderHook(() =>
      useCatRegistration({ homeId: "home-1", supabaseClient: supabase }),
    );
    let res: Awaited<ReturnType<typeof result.current.submit>> | undefined;
    await act(async () => {
      res = await result.current.submit(VALID_DRAFT);
    });
    expect(res?.kind).toBe("error");
    if (res?.kind === "error") {
      expect(res.code).toBe("TIMEOUT");
    }
  });
});
