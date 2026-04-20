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
    /* /ort-wasm/ 의 .wasm 파일 전용 헤더.
     * - Content-Type: .wasm MIME 확정 (일부 호스트 기본값이 octet-stream)
     * - CORP: COEP require-corp 환경에서 same-origin 리소스 로드 허용
     * - Cache-Control: 해시 없는 고정 경로 — 장기 캐시로 재다운로드 방지 */
    {
      source: "/ort-wasm/:file*",
      headers: [
        { key: "Content-Type", value: "application/wasm" },
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
