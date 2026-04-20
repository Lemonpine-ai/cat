/**
 * Next.js 16 middleware 후속 API — 인증 게이트.
 *
 * ⚠️  matcher 수정 회귀 테스트 필수
 *   이 파일의 `config.matcher` 정규식 또는 `isPublicPath()` 프리픽스 목록을
 *   변경하면, 반드시 `tests/static-assets-smoke.spec.ts` 의 GET/HEAD 어설션
 *   10건을 모두 돌려서 정상 자산(200) + auth 리다이렉트(307) + **보안 회귀
 *   4건(동적 라우트 확장자 우회 3건 + public/ 직하 자산 1건)** 이 모두
 *   의도대로 동작하는지 확인할 것.
 *
 * 배경 메모:
 *   ① matcher 가 `.wasm / .mjs / .woff2` 확장자를 배제하지 않으면 정적 자산
 *      요청이 Supabase auth 체크에 걸려 307 → /login 으로 튕겨나가, YOLO
 *      Worker 의 동적 import 가 실패한다. (Phase 2A R0 이슈)
 *   ② 반대로 suffix-only (예: `.*\\.wasm$`) 화이트리스트는 `/community/
 *      news/evil.wasm` 같은 **동적 라우트 우회** 공격에 취약. 반드시
 *      public 디렉토리 prefix 와 결합해야 한다. (R1 QA HIGH #1)
 *
 * 운영 규약: `staging/docs/proxy-auth-rules.md` 참고.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHttpsApiUrl } from "@/lib/url/ensureHttpsApiUrl";

/**
 * 보호 대상에서 제외할 경로 프리픽스.
 * - /login, /auth: 인증 전용 페이지
 * - /camera/pair: 로그인 없이 4자리 코드로 카메라 페어링
 * - /camera/broadcast: device_token으로 자체 인증하는 방송 페이지
 * - /api/webrtc/*: 로그인 없이 방송 탭에서도 ICE 설정 JSON 을 받아야 함 (TURN 은 웹에 노출되는 패턴과 동일)
 * - /ort-wasm, /fonts, /models: public/ 정적 자산 디렉토리 (3개)
 *   · matcher 가 1차 차단하지만, 확장자 없는 manifest·인덱스 파일
 *     등을 위한 2차 방어선.
 *   · /sounds, /icons 는 현재 실제 자산이 올라와 있지 않아 제외.
 *     실자산 추가 시점에 이 목록과 matcher prefix 그룹 동시 갱신.
 *   · public/ 직하 자산 (logo.jpeg 등) 은 의도적으로 미포함 — next/image
 *     경유만 허용 (직접 URL 접근 시 auth 게이트로 307 /login).
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/camera/pair") ||
    pathname.startsWith("/camera/broadcast") ||
    pathname.startsWith("/api/webrtc/") ||
    /* public/ 정적 자산 디렉토리 3개 — matcher prefix 그룹(ort-wasm|fonts|models)과
     * 정확히 동일하게 유지. 확장자 없는 manifest 파일 등을 위한 2차 방어선. */
    pathname.startsWith("/ort-wasm/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/models/")
  );
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const normalizedUrl = ensureHttpsApiUrl(supabaseUrl.trim());
  const supabase = createServerClient(normalizedUrl, supabaseAnonKey.trim(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

/**
 * matcher 정규식 — "제외할 경로" 를 부정 선행(negative lookahead) 로 나열.
 *
 * 구조: 디렉토리 **prefix (ort-wasm|fonts|models)** + 확장자 19종 결합.
 *
 *   /(?! _next/static
 *      | _next/image
 *      | favicon\.ico
 *      | (?:ort-wasm|fonts|models)/.*\.(?:svg|png|...|onnx)$
 *    ).*
 *
 * 확장자 화이트리스트 (정적 자산만, 총 19종):
 *   이미지:   svg, png, jpg, jpeg, gif, webp, ico  (7)
 *   WASM/JS: wasm, mjs                              (2) ← onnxruntime-web
 *   폰트:     woff, woff2, ttf, otf, eot            (5)
 *   미디어:   mp3, mp4, webm, ogg                   (4)
 *   AI 모델: onnx                                    (1)
 *
 * **왜 prefix 를 강제하나 (보안):**
 *   R1 설계였던 `.*\\.wasm$` suffix-only 매치는 `/community/news/evil.wasm`
 *   같은 **동적 라우트 요청도 proxy 를 우회** 시켜 auth 게이트를 뚫는다.
 *   공격자가 App Router 의 `[slug]/page.tsx` 등을 `.wasm` 확장자로
 *   호출하면 Supabase 세션 검사 없이 서버 컴포넌트가 실행될 수 있음.
 *   → prefix 를 ort-wasm/fonts/models 3개 public 디렉토리로 고정하여
 *      "실제 정적 파일" 만 통과시킨다.
 *
 * **이스케이프 표기:** TS 문자열에서 literal dot 은 `\\.` 로 작성.
 *   (TS 컴파일 결과 regex 엔진에 `\.` 가 전달 → `.` 문자 매치)
 *
 * 의도적으로 제외한 확장자:
 *   - js, css, map  → 이미 `_next/static` 프리픽스가 커버
 *   - json, txt, xml → 미래 사용자 업로드 경로 대비 보수적 제외
 *   - pdf            → 인증된 리포트 다운로드일 수 있음
 *
 * 새 확장자/디렉토리 추가 시 `staging/docs/proxy-auth-rules.md` 규약 필독.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|(?:ort-wasm|fonts|models)/.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|mjs|woff|woff2|ttf|otf|eot|mp3|mp4|webm|ogg|onnx)$).*)",
  ],
};
