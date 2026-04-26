/**
 * cat-identity Tier 1 fix R4-2 — CatRegistrationScreen 단위 테스트.
 *
 * 4 시나리오:
 *  1) 빠른 클릭 2회 → submit mock 호출 1회만 (submittingRef 동기 가드 — C3)
 *  2) validation 에러에 weightKg 포함 + showOptional=false → setShowOptional(true) (M5)
 *  3) result.alreadyExisted=true → ALREADY_TOAST_KEY 설정 (M3)
 *  4) UPLOAD_FAILED 결과 → "사진 다시 시도하기" / "사진 없이 완료하기" 버튼 렌더 (M2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CatRegistrationScreen } from "@/app/cats/new/CatRegistrationScreen";

/**
 * useCatRegistration 훅 mock — submit/retryPhotoUpload 결과를 테스트별로 컨트롤.
 * next/navigation 의 useRouter 도 mock.
 */

const mockRouterReplace = vi.fn();
const mockRouterRefresh = vi.fn();
const mockRouterBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
    back: mockRouterBack,
  }),
}));

const mockSubmit = vi.fn();
const mockRetry = vi.fn();
const mockReset = vi.fn();
let mockState: "idle" | "submitting" | "success" | "error" = "idle";
let mockErrorMessage: string | null = null;

vi.mock("@/hooks/useCatRegistration", () => ({
  useCatRegistration: () => ({
    state: mockState,
    errorMessage: mockErrorMessage,
    submit: mockSubmit,
    retryPhotoUpload: mockRetry,
    reset: mockReset,
  }),
}));

describe("CatRegistrationScreen fix R4-2", () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockRetry.mockReset();
    mockReset.mockReset();
    mockRouterReplace.mockReset();
    mockRouterRefresh.mockReset();
    mockRouterBack.mockReset();
    mockState = "idle";
    mockErrorMessage = null;
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
    /* jsdom 은 scrollIntoView 미지원 — 테스트용 noop. */
    if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    } else if (typeof Element !== "undefined") {
      vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    }
    /* jsdom 은 URL.createObjectURL / revokeObjectURL 미지원 — CatPhotoPicker 가 호출. */
    if (typeof URL !== "undefined") {
      if (typeof URL.createObjectURL !== "function") {
        URL.createObjectURL = vi.fn(() => "blob:test/preview") as typeof URL.createObjectURL;
        URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
      } else {
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test/preview");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      }
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** 필수 4 + 사진없음 → validation 통과하는 draft 입력 헬퍼. */
  function fillValidDraft() {
    fireEvent.change(screen.getByLabelText(/이름/), {
      target: { value: "나비" },
    });
    fireEvent.change(screen.getByLabelText(/품종/), {
      target: { value: "코리안 숏헤어" },
    });
    fireEvent.change(screen.getByLabelText(/생년월일/), {
      target: { value: "2020-01-01" },
    });
    /* 성별은 기본값 "unknown" 으로도 통과. */
  }

  it("1) C3 — 빠른 클릭 2회 → submit 1회만 호출 (submittingRef 동기 가드)", async () => {
    /* submit 가 100ms 동안 pending 인 상태에서 두 번 클릭. */
    let resolveFn!: (v: { kind: "ok"; catId: string; photoUploaded: boolean; alreadyExisted: boolean }) => void;
    mockSubmit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    render(<CatRegistrationScreen homeId="home-1" />);
    fillValidDraft();
    const submitBtn = screen.getByRole("button", { name: /등록하기/ });

    /* 두 번 빠르게 클릭 */
    await act(async () => {
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    /* pending 해제 */
    await act(async () => {
      resolveFn({
        kind: "ok",
        catId: "cat-1",
        photoUploaded: false,
        alreadyExisted: false,
      });
    });
  });

  it("2) M5 — validation 에러에 weightKg 포함 + showOptional=false → 자동 펼침 + 배너 표시", async () => {
    /* submit 가 호출되지 않도록 — validation 에러로 차단됨. */
    render(<CatRegistrationScreen homeId="home-1" />);
    fillValidDraft();
    /* weightKg 에 범위 밖 값 (50kg) 입력 → weightOutOfRange 에러. */
    fireEvent.click(screen.getByRole("button", { name: /더 자세히 입력하기/ }));
    fireEvent.change(screen.getByLabelText(/체중/), {
      target: { value: "50" },
    });
    /* 옵션 다시 접기. */
    fireEvent.click(screen.getByRole("button", { name: /추가 정보 접기/ }));

    const submitBtn = screen.getByRole("button", { name: /등록하기/ });
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    expect(mockSubmit).not.toHaveBeenCalled();
    /* validation 배너 표시 (top-level errorBanner). */
    const alerts = screen.getAllByRole("alert");
    const banner = alerts.find((el) =>
      el.textContent?.includes("입력값을 확인"),
    );
    expect(banner).toBeTruthy();
    /* 옵션 자동 펼침 — "추가 정보 접기" 버튼이 다시 보이면 펼쳐진 상태. */
    expect(screen.getByRole("button", { name: /추가 정보 접기/ })).toBeTruthy();
  });

  it("3) M3 — alreadyExisted=true → ALREADY_TOAST_KEY 설정 (WELCOME 미설정)", async () => {
    mockSubmit.mockResolvedValue({
      kind: "ok",
      catId: "cat-existing",
      photoUploaded: false,
      alreadyExisted: true,
    });
    render(<CatRegistrationScreen homeId="home-1" />);
    fillValidDraft();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /등록하기/ }));
    });
    expect(mockRouterReplace).toHaveBeenCalledWith("/");
    expect(window.sessionStorage.getItem("cat-already-exists-name")).toBe("나비");
    expect(window.sessionStorage.getItem("cat-welcome-name")).toBeNull();
  });

  it("3.1) M3 — 정상 등록 (alreadyExisted=false) → WELCOME_TOAST_KEY 설정", async () => {
    mockSubmit.mockResolvedValue({
      kind: "ok",
      catId: "cat-new",
      photoUploaded: false,
      alreadyExisted: false,
    });
    render(<CatRegistrationScreen homeId="home-1" />);
    fillValidDraft();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /등록하기/ }));
    });
    expect(window.sessionStorage.getItem("cat-welcome-name")).toBe("나비");
    expect(window.sessionStorage.getItem("cat-already-exists-name")).toBeNull();
  });

  it("4) M2 — UPLOAD_FAILED + photoFile 존재 → 액션 버튼 2개 렌더", async () => {
    mockSubmit.mockResolvedValue({
      kind: "error",
      code: "UPLOAD_FAILED",
      message: "사진 업로드 실패",
      catId: "cat-1",
    });
    /* errorMessage 도 갱신된 상태로 — 실제 흐름은 hook 가 status.error 를 set 하지만
     * 본 테스트에서는 mock 반환값 + errorMessage 갱신을 같이 simulate. */
    mockErrorMessage = "사진 업로드 실패";

    render(<CatRegistrationScreen homeId="home-1" />);
    fillValidDraft();

    /* 사진 파일 선택 (M2 액션 표시 조건: draft.photoFile !== null). */
    const fakeFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], "x.jpg", {
      type: "image/jpeg",
    });
    /* CatPhotoPicker 의 hidden input 에 직접 change 이벤트. */
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    if (fileInput) {
      Object.defineProperty(fileInput, "files", {
        value: [fakeFile],
        configurable: true,
      });
      fireEvent.change(fileInput);
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /등록하기/ }));
    });

    /* 액션 버튼 2개. */
    expect(screen.queryByRole("button", { name: /사진 다시 시도하기/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /사진 없이 완료하기/ })).not.toBeNull();
  });
});
