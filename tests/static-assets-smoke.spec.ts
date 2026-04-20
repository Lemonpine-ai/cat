import { expect, test } from "@playwright/test";

/**
 * 정적 자산 스모크 테스트 — proxy/auth matcher 회귀 방지용.
 *
 * 전제:
 *   `playwright.config.ts` 의 `use.baseURL` 이 dev/preview 서버 URL 로 설정돼
 *   있어야 한다. (예: `http://localhost:3000`) request.get("/...") 는 이
 *   baseURL 에 상대 경로로 붙는다.
 *
 * 배경:
 *   `src/proxy.ts` 의 matcher 가 `.wasm / .mjs / .woff2` 확장자를 배제하지
 *   않으면 이 정적 자산 요청이 Supabase auth 체크에 걸려 307 → /login 으로
 *   튕긴다. 결과: 홈 대시보드의 YOLO Worker 가 `.jsep.mjs` 동적 import 실패.
 *
 *   반대로 너무 느슨한 matcher (suffix-only, 예: `.*\\.wasm$`) 는
 *   `/community/news/evil.wasm` 같은 동적 라우트 요청까지 proxy 를 우회시켜
 *   auth 게이트를 뚫는다. 최종 matcher 는 **prefix + suffix 결합형** —
 *   public 디렉토리 (`ort-wasm | fonts | models`) 하위에서만 확장자 19종 허용.
 *
 * 이 테스트는 비로그인 상태에서:
 *   [정상]  ① /ort-wasm/*.jsep.mjs GET 200 + Content-Type 검증
 *           ② /ort-wasm/*.jsep.wasm GET 200 + Content-Type 검증
 *           ③ /fonts/*.woff2 GET 200 + Content-Type 검증
 *           ④ /ort-wasm/*.jsep.mjs HEAD 200 (Worker 가 HEAD/GET 혼용 가능)
 *   [auth] ⑤ / → 307 /login
 *           ⑥ /api/imaginary → 307 /login
 *   [보안] ⑦ /community/test/evil.wasm → 307 /login (prefix 불일치 차단)
 *           ⑧ /community/test/evil.png  → 307 /login (prefix 불일치 차단)
 *           ⑨ /api/evil.onnx             → 307 /login (prefix 불일치 차단)
 *           ⑩ /logo.jpeg                 → 307 /login (public/ 직하 자산 — next/image 경유만 허용)
 *
 * Playwright 패턴은 `tests/broadcast-smoke.spec.ts` 와 동일 스타일.
 */
test.describe("정적 자산 스모크 (proxy matcher 회귀 방지)", () => {
  // ────────────────────────────────────────────────────────────────
  // [정상 경로] 화이트리스트 통과 — 비로그인에서도 200
  // ────────────────────────────────────────────────────────────────

  test("비로그인 상태에서 /ort-wasm/*.jsep.mjs 가 200 으로 내려온다", async ({
    request,
  }) => {
    // onnxruntime-web 이 동적 import 하는 SIMD+threaded 엔트리
    const res = await request.get(
      "/ort-wasm/ort-wasm-simd-threaded.jsep.mjs",
      {
        // auto-redirect 끄기 — 307 로 튕기면 테스트 실패로 잡히게
        maxRedirects: 0,
      },
    );
    expect(
      res.status(),
      `기대: 200 (정적 자산 통과). 실제: ${res.status()} — matcher 가 .mjs 를 배제 못 하면 307 이 나온다.`,
    ).toBe(200);

    // Content-Type 이 JS/모듈 계열인지도 가볍게 확인
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toMatch(/javascript|module|text\/plain/);
  });

  test("비로그인 상태에서 /ort-wasm/*.jsep.wasm 가 200 으로 내려온다", async ({
    request,
  }) => {
    // onnxruntime-web 의 실제 WASM 바이너리 — `.wasm` 확장자 화이트리스트 검증
    const res = await request.get(
      "/ort-wasm/ort-wasm-simd-threaded.jsep.wasm",
      {
        maxRedirects: 0,
      },
    );
    expect(
      res.status(),
      `기대: 200 (WASM 통과). 실제: ${res.status()} — matcher 가 .wasm 을 배제 못 하면 307.`,
    ).toBe(200);

    // Content-Type 은 application/wasm 또는 octet-stream (서버 MIME 설정에 따라)
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toMatch(/wasm|octet-stream/);
  });

  test("비로그인 상태에서 /fonts/*.woff2 가 200 으로 내려온다", async ({
    request,
  }) => {
    // same-origin 전환된 한글 폰트 (COEP 대응 커밋 기준)
    const res = await request.get("/fonts/omyu_pretty.woff2", {
      maxRedirects: 0,
    });
    expect(
      res.status(),
      `기대: 200 (폰트 통과). 실제: ${res.status()} — matcher 가 .woff2 를 배제 못 하면 307 이 나온다.`,
    ).toBe(200);

    // Content-Type 이 font/woff2, application/font-woff2, octet-stream 중 하나인지 확인
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toMatch(/font|octet-stream|woff/);
  });

  test("비로그인 상태에서 /ort-wasm/*.jsep.mjs 가 HEAD 로도 200 을 돌려준다", async ({
    request,
  }) => {
    // 브라우저 Worker 의 dynamic import 는 구현체에 따라 HEAD 선행 요청을
    // 쏘는 경우가 있음. GET 과 HEAD 양쪽에서 proxy 우회가 동일하게 동작해야.
    const res = await request.fetch(
      "/ort-wasm/ort-wasm-simd-threaded.jsep.mjs",
      {
        method: "HEAD",
        maxRedirects: 0,
      },
    );
    expect(
      res.status(),
      `기대: 200 (HEAD 도 화이트리스트). 실제: ${res.status()}`,
    ).toBe(200);
  });

  // ────────────────────────────────────────────────────────────────
  // [auth 게이트] 정상 동작 — 비로그인이면 307 /login
  // ────────────────────────────────────────────────────────────────

  test("비로그인 상태에서 / 루트는 여전히 /login 으로 307 리다이렉트된다", async ({
    request,
  }) => {
    // auth 게이트가 여전히 동작해야 함 — matcher 확장 때문에 뚫리면 안 됨
    const res = await request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });

  test("비로그인 상태에서 /api/imaginary 도 /login 으로 307 리다이렉트된다", async ({
    request,
  }) => {
    // API 경로도 auth 게이트가 여전히 동작해야 함 (ort-wasm, fonts 등
    // public 프리픽스에 해당하지 않는 임의 API)
    const res = await request.get("/api/imaginary", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });

  // ────────────────────────────────────────────────────────────────
  // [보안 회귀] 동적 라우트 우회 차단 — R1 QA HIGH #1 대응
  // ────────────────────────────────────────────────────────────────
  //
  // suffix-only matcher (예: `.*\.wasm$`) 는 `/community/news/evil.wasm` 같은
  // **동적 라우트 요청까지 proxy 를 우회** 시켜 auth 게이트를 뚫는다.
  // 최종 matcher 는 prefix (ort-wasm|fonts|models) 와 결합되어 있으므로,
  // prefix 가 일치하지 않는 확장자 요청은 **반드시** 307 /login 으로 튕겨야 한다.

  test("[보안] /community/test/evil.wasm 은 public prefix 가 아니므로 307 /login", async ({
    request,
  }) => {
    const res = await request.get("/community/test/evil.wasm", {
      maxRedirects: 0,
    });
    expect(
      res.status(),
      `기대: 307 (auth 게이트로 튕김). 실제: ${res.status()} — suffix-only matcher 회귀 의심.`,
    ).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });

  test("[보안] /community/test/evil.png 은 public prefix 가 아니므로 307 /login", async ({
    request,
  }) => {
    const res = await request.get("/community/test/evil.png", {
      maxRedirects: 0,
    });
    expect(
      res.status(),
      `기대: 307 (auth 게이트로 튕김). 실제: ${res.status()} — 이미지도 prefix 강제.`,
    ).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });

  test("[보안] /api/evil.onnx 은 public prefix 가 아니므로 307 /login", async ({
    request,
  }) => {
    const res = await request.get("/api/evil.onnx", { maxRedirects: 0 });
    expect(
      res.status(),
      `기대: 307 (auth 게이트로 튕김). 실제: ${res.status()} — AI 모델 확장자도 prefix 강제.`,
    ).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });

  // ────────────────────────────────────────────────────────────────
  // [보안 회귀] public/ 직하 자산 정책 — R6 Arch HIGH #1 대응
  // ────────────────────────────────────────────────────────────────
  //
  // public/ 직하 파일 6개 (logo.jpeg, file.svg, globe.svg, next.svg, vercel.svg,
  // window.svg) 는 matcher prefix 그룹 (ort-wasm|fonts|models) 에 속하지 않는다.
  // 셸 스플래시는 `next/image` 컴포넌트를 경유해 `_next/image` 프록시 경로로
  // 로드하며, 이 경로는 matcher 부정 선행에 의해 통과한다. 하지만 사용자·
  // 공격자가 직접 URL (`GET /logo.jpeg`) 로 접근하면 auth 게이트에 걸려
  // 307 /login 으로 튕겨야 정상.
  //
  // 이 어설션이 깨진다 = matcher 가 public 직하 자산을 잘못 통과시키고 있다
  // → public 디렉토리 정책 전반 재점검 필요. (docs/proxy-auth-rules.md "public/
  // 직하 자산 정책" 절 참조)

  test("[보안] 비로그인 GET /logo.jpeg → 307 /login (next/image 경유가 아닌 직접 접근 차단)", async ({
    request,
  }) => {
    // 셸 스플래시 로고는 src/components/shell/ShellSplashGate.tsx 의
    // `next/image` 로만 로드되어야 한다. 직접 URL 접근은 auth 게이트에
    // 걸려야 public/ 직하 자산 정책이 유지됨을 보장.
    const res = await request.get("/logo.jpeg", { maxRedirects: 0 });
    expect(
      res.status(),
      `기대: 307 (auth 게이트로 튕김). 실제: ${res.status()} — public/ 직하 자산이 matcher prefix 그룹에 잘못 포함된 건 아닌지 확인.`,
    ).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/login");
  });
});
