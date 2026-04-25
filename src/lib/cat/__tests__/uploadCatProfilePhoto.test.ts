/**
 * cat-identity Tier 1 fix R4-1 C1 / C6 — uploadCatProfilePhoto INVALID_FORMAT 분기 테스트.
 *
 * 회귀 방지 케이스:
 *  1) MIME 위조 (file.type=image/jpeg + 본문 binary) → INVALID_FORMAT (magic byte 검증 실패)
 *  2) 정상 JPEG magic + strip 성공 → ok
 *  3) skipStrip=true → strip 단계 skip 하지만 magic 검증은 수행
 *  4) MIME 자체가 ALLOWED_MIME 외 → INVALID_MIME (기존 분기 회귀 확인)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadCatProfilePhoto } from "@/lib/cat/uploadCatProfilePhoto";

/** Supabase Storage 동작을 모방하는 최소 mock. */
function makeSupabaseMock(opts?: { uploadError?: { message: string } }) {
  const uploadError = opts?.uploadError ?? null;
  const mock = {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: "https://test/cat.jpg" } }),
      }),
    },
  };
  return mock as unknown as Parameters<typeof uploadCatProfilePhoto>[0]["supabase"];
}

describe("uploadCatProfilePhoto fix R4-1", () => {
  const originalCreateImageBitmap = (
    globalThis as { createImageBitmap?: unknown }
  ).createImageBitmap;
  const originalOffscreenCanvas = (globalThis as { OffscreenCanvas?: unknown })
    .OffscreenCanvas;

  beforeEach(() => {
    // 디코드 / 캔버스 / blob 가 항상 성공한다고 가정 (strip 통과).
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: class FakeOffscreen {
        constructor(public width: number, public height: number) {}
        getContext() {
          return { drawImage: vi.fn() };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
            type: "image/jpeg",
          });
        }
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: vi.fn().mockResolvedValue({
        width: 256,
        height: 256,
        close: vi.fn(),
      }),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      value: originalCreateImageBitmap,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: originalOffscreenCanvas,
      configurable: true,
      writable: true,
    });
  });

  it("1) MIME 위조 (jpeg type + binary 본문) → INVALID_FORMAT", async () => {
    // file.type=image/jpeg 로 위조했지만 실제 byte 가 random binary.
    const fakeFile = new File(
      [new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])],
      "evil.jpg",
      { type: "image/jpeg" },
    );
    const result = await uploadCatProfilePhoto({
      supabase: makeSupabaseMock(),
      homeId: "home-1",
      catId: "cat-1",
      file: fakeFile,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("INVALID_FORMAT");
    }
  });

  it("2) 정상 JPEG magic + strip 성공 → ok", async () => {
    // JPEG magic 헤더 + 패딩.
    const bytes = new Uint8Array(20);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const fakeFile = new File([bytes], "ok.jpg", { type: "image/jpeg" });
    const result = await uploadCatProfilePhoto({
      supabase: makeSupabaseMock(),
      homeId: "home-1",
      catId: "cat-1",
      file: fakeFile,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.publicUrl).toBe("https://test/cat.jpg");
      expect(result.path).toMatch(/^home-1\/profiles\/cat-1_\d+\.jpg$/);
    }
  });

  it("3) MIME 자체가 비허용 → INVALID_MIME (magic 검증 이전)", async () => {
    const fakeFile = new File([new Uint8Array([0x00])], "evil.exe", {
      type: "application/x-msdownload",
    });
    const result = await uploadCatProfilePhoto({
      supabase: makeSupabaseMock(),
      homeId: "home-1",
      catId: "cat-1",
      file: fakeFile,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("INVALID_MIME");
    }
  });

  it("4) HEIC 입력 + magic null → INVALID_FORMAT (HEIC 거부 정책)", async () => {
    // HEIC magic (00 00 00 24 66 74 79 70 68 65 69 63) — detectImageMagic 가 null 반환.
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ]);
    const fakeFile = new File([bytes], "x.heic", { type: "image/heic" });
    const result = await uploadCatProfilePhoto({
      supabase: makeSupabaseMock(),
      homeId: "home-1",
      catId: "cat-1",
      file: fakeFile,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("INVALID_FORMAT");
    }
  });

  it("5) skipStrip=true → strip 단계 우회하지만 magic 검증은 수행", async () => {
    const bytes = new Uint8Array(12);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const fakeFile = new File([bytes], "stripped.jpg", { type: "image/jpeg" });
    const result = await uploadCatProfilePhoto({
      supabase: makeSupabaseMock(),
      homeId: "home-1",
      catId: "cat-1",
      file: fakeFile,
      skipStrip: true,
    });
    expect(result.kind).toBe("ok");
  });
});
