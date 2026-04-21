import type { NextConfig } from "next";

function supabaseHostFromEnv(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseHostFromEnv();

const nextConfig: NextConfig = {
  /* 카메라 페이지 캐시 방지 — 브라우저가 구 JS 번들을 사용하는 문제 해결.
   * 추가로 COOP/COEP 헤더를 적용해 SharedArrayBuffer(threaded wasm)를 활성화.
   * ONNX Runtime Web 의 threaded wasm 은 SAB 필수 — COI(crossOriginIsolated)
   * 없으면 브라우저가 SAB 차단 → "initWasm() failed" 에러 발생.
   * Worker 쪽 fallback(numThreads=1)도 병행해 COI 실패 시에도 최소 동작 보장. */
  headers: async () => [
    {
      source: "/camera/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        /* COOP/COEP — SharedArrayBuffer 활성화 (threaded wasm 필수) */
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
    {
      source: "/",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        /* home 대시보드에도 COI 적용 — MultiCameraGrid 가 YOLO Worker 사용 */
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
      ],
    },
    /* /ort-wasm/ 정적 자산 헤더 — 확장자별 분리 (.wasm vs .mjs).
     *
     * 배경: 기존 `/ort-wasm/:file*` 단일 룰은 모든 파일에 Content-Type: application/wasm
     *       을 강제해 .mjs 에도 잘못 적용됨. 브라우저가 strict MIME check 로
     *       "Failed to load module script: Expected a JavaScript-or-Wasm module
     *       script but the server responded with a MIME type of application/wasm"
     *       에러를 내며 WebGPU 백엔드 동적 import 가 실패, 연쇄로 YOLO Worker
     *       모든 백엔드 실패.
     *
     * 해결: source 에서 path-to-regexp 의 capture pattern 으로 확장자 매칭.
     *   - .wasm  → application/wasm  (ONNX Runtime WASM 바이너리)
     *   - .mjs   → text/javascript   (WebGPU JSEP 등 JS 모듈 wrapper)
     * CORP + Cache-Control 은 양쪽 동일. */
    {
      source: "/ort-wasm/:file(.*\\.wasm)",
      headers: [
        { key: "Content-Type", value: "application/wasm" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      source: "/ort-wasm/:file(.*\\.mjs)",
      headers: [
        { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
