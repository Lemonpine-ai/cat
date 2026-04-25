/**
 * cat-identity Tier 1 fix R5-2 R3-4 — useCatPhotoUpload 훅 단위 테스트.
 *
 * Mock 의존성:
 *  - uploadCatProfilePhoto (Storage 업로드)
 *  - extractHsvFromPhoto (HSV 추출)
 *  - stripExifFromImage (EXIF 제거)
 *  - supabase.from(...).update(...).eq(...) chain
 *  - supabase.storage.from(...).remove([...])  (cleanup)
 *
 * 4 시나리오:
 *  1) uploadAndExtract 성공 → ok + publicUrl + path + profile
 *  2) uploadCatProfilePhoto 실패 → error UPLOAD_FAILED
 *  3) UPDATE 실패 → cleanupOrphan 자동 호출 + error UPDATE_FAILED
 *  4) extractHsv 실패 → emptyHsvProfile 폴백 + ok 반환
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/cat/uploadCatProfilePhoto", () => ({
  uploadCatProfilePhoto: vi.fn(),
}));
vi.mock("@/lib/cat/extractHsvFromPhoto", () => ({
  extractHsvFromPhoto: vi.fn(),
  emptyHsvProfile: vi.fn().mockReturnValue({
    bins: [],
    dominant_hues: [],
    sample_count: 0,
    extracted_at: "2026-04-25T00:00:00.000Z",
    version: "v1",
  }),
}));
vi.mock("@/lib/cat/stripExifFromImage", () => ({
  stripExifFromImage: vi.fn(),
}));

import {
  useCatPhotoUpload,
  type PhotoUploadResult,
} from "@/hooks/useCatPhotoUpload";
import { uploadCatProfilePhoto } from "@/lib/cat/uploadCatProfilePhoto";
import { extractHsvFromPhoto } from "@/lib/cat/extractHsvFromPhoto";
import { stripExifFromImage } from "@/lib/cat/stripExifFromImage";

/** mock supabase 빌더 — UPDATE chain + Storage remove. */
function makeSupabase(opts: { updateError?: { message: string } | null }) {
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  };
  const removeFn = vi.fn().mockResolvedValue({ data: [], error: null });
  return {
    supabase: {
      from: vi.fn().mockReturnValue(updateChain),
      storage: {
        from: vi.fn().mockReturnValue({ remove: removeFn }),
      },
    } as unknown as SupabaseClient,
    updateChain,
    removeFn,
  };
}

const FAKE_FILE = new File([new Uint8Array([0xff, 0xd8, 0xff])], "test.jpg", {
  type: "image/jpeg",
});

const PROFILE = {
  bins: [],
  dominant_hues: [180],
  sample_count: 100,
  extracted_at: "2026-04-25T00:00:00.000Z",
  version: "v1" as const,
};

describe("useCatPhotoUpload fix R5-2 R3-4", () => {
  beforeEach(() => {
    vi.mocked(stripExifFromImage).mockResolvedValue({
      kind: "ok",
      file: FAKE_FILE,
    });
    vi.mocked(extractHsvFromPhoto).mockResolvedValue({
      kind: "ok",
      profile: PROFILE,
    });
    vi.mocked(uploadCatProfilePhoto).mockResolvedValue({
      kind: "ok",
      publicUrl: "https://test/cat.jpg",
      path: "home-1/profiles/cat-1_123.jpg",
    });
  });

  it("1) uploadAndExtract 성공 → ok + publicUrl + path + profile", async () => {
    const { supabase } = makeSupabase({});
    const { result } = renderHook(() =>
      useCatPhotoUpload({ supabase, homeId: "home-1" }),
    );
    let res: PhotoUploadResult | null = null;
    await act(async () => {
      res = await result.current.uploadAndExtract("cat-1", FAKE_FILE);
    });
    const r1 = res!;
    expect(r1.kind).toBe("ok");
    if (r1.kind === "ok") {
      expect(r1.publicUrl).toBe("https://test/cat.jpg");
      expect(r1.path).toBe("home-1/profiles/cat-1_123.jpg");
      expect(r1.profile.dominant_hues).toEqual([180]);
    }
  });

  it("2) uploadCatProfilePhoto 실패 → error UPLOAD_FAILED", async () => {
    vi.mocked(uploadCatProfilePhoto).mockResolvedValueOnce({
      kind: "error",
      code: "UPLOAD_FAILED",
      message: "Storage upload 실패 메시지",
    });
    const { supabase } = makeSupabase({});
    const { result } = renderHook(() =>
      useCatPhotoUpload({ supabase, homeId: "home-1" }),
    );
    let res: PhotoUploadResult | null = null;
    await act(async () => {
      res = await result.current.uploadAndExtract("cat-1", FAKE_FILE);
    });
    const r2 = res!;
    expect(r2.kind).toBe("error");
    if (r2.kind === "error") {
      expect(r2.code).toBe("UPLOAD_FAILED");
    }
  });

  it("3) UPDATE 실패 → cleanupOrphan 자동 호출 + error UPDATE_FAILED", async () => {
    const { supabase, removeFn } = makeSupabase({
      updateError: { message: "permission denied" },
    });
    const { result } = renderHook(() =>
      useCatPhotoUpload({ supabase, homeId: "home-1" }),
    );
    let res: PhotoUploadResult | null = null;
    await act(async () => {
      res = await result.current.uploadAndExtract("cat-1", FAKE_FILE);
    });
    const r3 = res!;
    expect(r3.kind).toBe("error");
    if (r3.kind === "error") {
      expect(r3.code).toBe("UPDATE_FAILED");
    }
    /* UPDATE 실패 → cleanup remove 가 새 path 로 호출되었는지 확인. */
    expect(removeFn).toHaveBeenCalledWith(["home-1/profiles/cat-1_123.jpg"]);
  });

  it("4) extractHsv 실패 → emptyHsvProfile 폴백 + ok 반환 (등록 자체 막지 않음)", async () => {
    vi.mocked(extractHsvFromPhoto).mockResolvedValueOnce({
      kind: "error",
      reason: "worker_unavailable",
      message: "worker error",
    });
    const { supabase, updateChain } = makeSupabase({});
    const { result } = renderHook(() =>
      useCatPhotoUpload({ supabase, homeId: "home-1" }),
    );
    let res: PhotoUploadResult | null = null;
    await act(async () => {
      res = await result.current.uploadAndExtract("cat-1", FAKE_FILE);
    });
    expect(res!.kind).toBe("ok");
    /* UPDATE 호출은 emptyHsvProfile 로 일어나야 함 (등록 자체 막지 않음 정책). */
    expect(updateChain.update).toHaveBeenCalled();
  });
});
