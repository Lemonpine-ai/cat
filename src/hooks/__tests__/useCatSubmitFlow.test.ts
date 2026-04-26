/**
 * cat-identity Tier 1 fix R5-2 R3-1 — useCatSubmitFlow 훅 단위 테스트.
 *
 * Mock 의존성:
 *  - useCatRegistration (submit / retryPhotoUpload / state / errorMessage)
 *  - next/navigation useRouter (refresh / replace 검증)
 *
 * 5 시나리오:
 *  1) INSERT 성공 + 사진 성공 → router.replace("/") + 환영 토스트 키
 *  2) INSERT 성공 + 사진 실패 (UPLOAD_FAILED + catId) → uploadFailedCatId 보존
 *  3) INSERT 실패 → status=error 위임 (errorMessage)
 *  4) onSubmit 중복 호출 → 두 번째 무시 (mutex submittingRef)
 *  5) onRetryPhoto → retryPhotoUpload 호출 + 성공 시 router.replace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockSubmit = vi.fn();
const mockRetryPhotoUpload = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/hooks/useCatRegistration", () => ({
  useCatRegistration: vi.fn(() => ({
    submit: mockSubmit,
    retryPhotoUpload: mockRetryPhotoUpload,
    state: "idle",
    errorMessage: null,
    reset: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
    back: vi.fn(),
  }),
}));

import { useCatSubmitFlow } from "@/hooks/useCatSubmitFlow";
import type { CatDraft } from "@/types/cat";

const VALID_DRAFT: CatDraft = {
  name: "나비",
  breed: "코리안 숏헤어",
  birthDate: "2020-01-01",
  sex: "male",
  photoFile: null,
  isNeutered: "yes",
  weightKg: "",
  medicalNotes: "",
  medications: "",
  supplements: "",
  litterType: "",
  foodType: "",
};

const FAKE_PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff])], "p.jpg", {
  type: "image/jpeg",
});

describe("useCatSubmitFlow fix R5-2 R3-1", () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockRetryPhotoUpload.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
    /* sessionStorage 도 리셋 (각 테스트 격리). */
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });

  it("1) INSERT 성공 + 사진 성공 → router.replace('/') + 환영 토스트 키", async () => {
    mockSubmit.mockResolvedValueOnce({
      kind: "ok",
      catId: "cat-1",
      photoUploaded: true,
      alreadyExisted: false,
    });
    const setShowOptional = vi.fn();
    const { result } = renderHook(() =>
      useCatSubmitFlow({ homeId: "h-1", draft: VALID_DRAFT, setShowOptional }),
    );
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(window.sessionStorage.getItem("cat-welcome-name")).toBe("나비");
  });

  it("2) INSERT 성공 + 사진 실패 (UPLOAD_FAILED + catId) → uploadFailedCatId 보존", async () => {
    mockSubmit.mockResolvedValueOnce({
      kind: "error",
      code: "UPLOAD_FAILED",
      message: "사진 업로드에 실패했어요.",
      catId: "cat-99",
    });
    const setShowOptional = vi.fn();
    const draft = { ...VALID_DRAFT, photoFile: FAKE_PHOTO };
    const { result } = renderHook(() =>
      useCatSubmitFlow({ homeId: "h-1", draft, setShowOptional }),
    );
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(result.current.uploadFailedCatId).toBe("cat-99");
    /* router 이동은 일어나지 않음. */
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("3) INSERT 실패 (INSERT_FAILED) → uploadFailedCatId null + replace 미호출", async () => {
    mockSubmit.mockResolvedValueOnce({
      kind: "error",
      code: "INSERT_FAILED",
      message: "등록에 실패했어요.",
    });
    const setShowOptional = vi.fn();
    const { result } = renderHook(() =>
      useCatSubmitFlow({ homeId: "h-1", draft: VALID_DRAFT, setShowOptional }),
    );
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(result.current.uploadFailedCatId).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("4) onSubmit 중복 호출 → submit 1회만 호출 (mutex submittingRef)", async () => {
    /* submit 가 resolve 되기 전에 두 번 호출. 두 번째는 무시되어야 함. */
    let resolveFirst: ((v: unknown) => void) | null = null;
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const setShowOptional = vi.fn();
    const { result } = renderHook(() =>
      useCatSubmitFlow({ homeId: "h-1", draft: VALID_DRAFT, setShowOptional }),
    );
    await act(async () => {
      const p1 = result.current.onSubmit();
      const p2 = result.current.onSubmit();
      resolveFirst?.({
        kind: "ok",
        catId: "cat-1",
        photoUploaded: false,
        alreadyExisted: false,
      });
      await Promise.all([p1, p2]);
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it("5) onRetryPhoto → retryPhotoUpload 호출 + 성공 시 router.replace", async () => {
    /* photo 보존 상태 만들기 — 먼저 onSubmit 으로 UPLOAD_FAILED 받기. */
    mockSubmit.mockResolvedValueOnce({
      kind: "error",
      code: "UPLOAD_FAILED",
      message: "사진 업로드에 실패했어요.",
      catId: "cat-77",
    });
    mockRetryPhotoUpload.mockResolvedValueOnce({
      kind: "ok",
      catId: "cat-77",
      photoUploaded: true,
      alreadyExisted: false,
    });
    const setShowOptional = vi.fn();
    const draft = { ...VALID_DRAFT, photoFile: FAKE_PHOTO };
    const { result } = renderHook(() =>
      useCatSubmitFlow({ homeId: "h-1", draft, setShowOptional }),
    );
    await act(async () => {
      await result.current.onSubmit();
    });
    expect(result.current.uploadFailedCatId).toBe("cat-77");
    await act(async () => {
      await result.current.onRetryPhoto();
    });
    expect(mockRetryPhotoUpload).toHaveBeenCalledWith("cat-77", FAKE_PHOTO);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
