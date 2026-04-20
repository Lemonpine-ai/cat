# proxy/auth 경로 규약

`src/proxy.ts` (Next.js 16 middleware 후속) 의 **auth 게이트** 에 걸리지 않아야 할 경로/자산을 관리하는 규약.

## 핵심 원칙

CATvisor 의 proxy 는 두 개의 문(door)으로 정적 자산을 보호한다.

1. **1차 — `config.matcher` 정규식 화이트리스트** (**디렉토리 prefix + 확장자 19종**)
2. **2차 — `isPublicPath()` 디렉토리 프리픽스** (확장자 없는 파일 대비)

두 문 중 하나라도 뚫리면 `.wasm / .mjs / .woff2` 같은 정적 자산이 Supabase auth 체크에 걸려 `307 → /login` 으로 튕긴다. 결과는 YOLO Worker 동적 import 실패 같은 런타임 에러.

반대로 **너무 느슨한 matcher** (예: suffix-only) 는 동적 라우트 우회 공격에 뚫린다. 아래 "동적 라우트 우회 경고" 절을 반드시 숙지.

---

## 동적 라우트 우회 경고 (⚠️ 최우선)

App Router 는 `[slug]/page.tsx` 같은 **catch-all 동적 라우트** 를 쓴다.
matcher 를 **확장자 suffix 만** 으로 쓰면, 공격자는 임의 경로를 정적 자산 확장자로 위장해 proxy 를 완전히 우회할 수 있다.

### 나쁜 예 — suffix-only 화이트리스트

```
"/((?!_next/static|_next/image|favicon\\.ico|.*\\.wasm$).*)"
```

위 matcher 는 `/community/news/evil.wasm`, `/api/user/me.wasm`, `/admin/config.wasm` **전부** proxy 를 거치지 않는다.
→ Supabase 세션 검사 없이 서버 컴포넌트 / 라우트 핸들러 실행 가능.
→ **RLS 위반, 세션 탈취, 내부 정보 노출** 로 직결.

### 좋은 예 — prefix + suffix 결합

```
"/((?!_next/static|_next/image|favicon\\.ico|(?:ort-wasm|fonts|models)/.*\\.wasm$).*)"
```

public 디렉토리 3개 **하위에서만** `.wasm` 통과.
`/community/news/evil.wasm` 은 prefix 불일치 → auth 게이트 통과 → 307 /login.

### 🚫 금지 문구

> **확장자 화이트리스트를 추가할 때 prefix 없이 전역 suffix 매치 금지.**
> 반드시 `(?:ort-wasm|fonts|models)/.*\\.<ext>$` 같이 public 디렉토리 prefix 그룹과 결합할 것.

---

## 이스케이프 표기 규약

matcher 문자열은 **TypeScript 문자열 리터럴** → **정규식 엔진 입력** 두 단계를 거친다.
dot(`.`) 을 literal 문자로 매치하려면 두 번 escape 해야 한다.

| 작성 | TS 컴파일 후 (regex 입력) | regex 의미 | 용도 |
|------|---------------------------|------------|------|
| `"\\."` | `\.` | **literal `.`** 매치 | ✅ 확장자 구분자 |
| `"\."` | `.`  (TS 가 `\` 를 삼킴) | **any char** 매치 | ❌ 실수 패턴 |
| `"\\\\."` | `\\.` | 백슬래시 + any char | ❌ 거의 안 씀 |

### 실수 체크리스트

- [ ] matcher 정규식의 모든 확장자 구분자는 `\\.` 인가? (`.` 단독은 any-char → 우회 위험)
- [ ] 새 확장자 그룹 추가 시, 기존 패턴 그대로 복붙했는가?
- [ ] 편집기의 "이스케이프 자동 보정" 기능으로 `\\.` 가 `\.` 로 바뀌진 않았나?

### 간단한 검증

TS 콘솔에서:

```ts
new RegExp("\\.wasm$").test("foo.wasm"); // true  (literal dot)
new RegExp("\\.wasm$").test("fooXwasm"); // false
new RegExp(".wasm$").test("fooXwasm");   // true  (any char — 실수)
```

---

## 변경 체크리스트

### A. public/ 하위에 **새 디렉토리** 를 추가할 때

예: `public/tflite/` 를 새로 만들어 TFLite 모델을 서빙한다면.

1. `src/proxy.ts` 의 `isPublicPath()` 에 `pathname.startsWith("/tflite/")` 추가.
2. `src/proxy.ts` 의 `config.matcher` **prefix 그룹** 에 `tflite` 추가:
   `(?:ort-wasm|fonts|models|tflite)/.*\\.(?:...)$`
3. `tests/static-assets-smoke.spec.ts` 에 GET 200 어설션 1개 + 보안 회귀 1개 추가.
4. PR 설명 본문에 "public/ 디렉토리 신규 추가" **변경 사유 · 자산 출처 명기**.

### B. public/ 하위에 **새 확장자** 의 정적 자산을 추가할 때

예: `.tflite` 모델 파일이나 `.brotli` 압축 자산을 서빙한다면.

1. `src/proxy.ts` 의 `config.matcher` 정규식 확장자 그룹에 추가.
   - **반드시 prefix 결합형** 유지:
     `(?:ort-wasm|fonts|models)/.*\\.(?:svg|png|...|<new_ext>)$`
   - **backslash escape 유지 필수** — `\\.` 로 작성 (TS 문자열 리터럴 이스케이프).
   - suffix-only 는 금지 ("동적 라우트 우회 경고" 참조).
2. `tests/static-assets-smoke.spec.ts` 에 해당 확장자 어설션 1개 + 동적 라우트 우회 회귀 1개 추가.
3. 본 문서 "확장자 화이트리스트 보수 기준" 섹션을 확인해 추가 가능한지 재검토.

### C. 매 변경마다

- Playwright 스모크 10개 어설션이 모두 PASS 하는지 확인.
- 비로그인 상태 GET 200 (정상 자산) + 일반 페이지 307 + **보안 회귀 4건 307** 이 공존해야 **정상**.

---

## 확장자 화이트리스트 보수 기준

현재 허용 목록 (총 **19개**):

| 카테고리 | 확장자 | 개수 |
|----------|--------|-----|
| 이미지 | `svg`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico` | 7 |
| WASM/ESM | `wasm`, `mjs` | 2 |
| 폰트 | `woff`, `woff2`, `ttf`, `otf`, `eot` | 5 |
| 미디어 | `mp3`, `mp4`, `webm`, `ogg` | 4 |
| AI 모델 | `onnx` | 1 |

### 의도적으로 제외한 확장자

- **`js`, `css`, `map`** — 이미 `_next/static` 프리픽스가 커버. 이중 등록 불필요.
- **`json`, `txt`, `xml`** — 미래에 사용자 업로드 경로/사용자 데이터 경로가 이 확장자를 쓸 가능성 있음. 보수적 제외.
- **`pdf`** — 인증된 리포트 다운로드 (로그인 필요) 일 수 있음. 공개 자산으로 허용 불가.

### 의도적으로 제외한 디렉토리

- **`sounds`, `icons`** — `public/` 하위에 **실제 자산이 아직 없음**. prefix 그룹에
  등재해두면 빈 디렉토리 경로가 공격면이 된다. 실자산이 올라오는 **시점에** matcher
  prefix 그룹 + `isPublicPath()` 양쪽에 등재하는 것이 원칙.
  (현재 prefix 그룹은 `ort-wasm | fonts | models` 3개만.)

---

## public/ 직하 자산 정책

`public/` **직하** (하위 디렉토리 없이 바로) 놓인 파일 6개는 matcher prefix 그룹 (`ort-wasm | fonts | models`) 에 포함되지 **않는다**. 따라서 비로그인 상태에서 직접 URL 로 접근하면 auth 게이트에 걸려 `307 → /login` 으로 튕긴다.

### 현재 public/ 직하 파일 목록 (6개)

| 파일 | 용도 | 사용 경로 |
|------|------|-----------|
| `logo.jpeg` | 셸 스플래시 로고 | `src/components/shell/ShellSplashGate.tsx` 의 `next/image` |
| `file.svg` | Next.js 스캐폴드 잔재 | (현재 미사용) |
| `globe.svg` | Next.js 스캐폴드 잔재 | (현재 미사용) |
| `next.svg` | Next.js 스캐폴드 잔재 | (현재 미사용) |
| `vercel.svg` | Next.js 스캐폴드 잔재 | (현재 미사용) |
| `window.svg` | Next.js 스캐폴드 잔재 | (현재 미사용) |

### 접근 규칙

- ✅ **`next/image` 컴포넌트 경유만 허용.** Next.js 가 `/_next/image?url=...` 로 프록시하며, 이 경로는 matcher 의 `_next/image` 부정 선행에 의해 auth 검사 없이 통과한다.
- 🚫 **직접 URL 접근 금지.** `<img src="/logo.jpeg">`, `fetch("/file.svg")`, `<link rel="icon" href="/next.svg">` 같은 **직접 참조 금지**. 비로그인 사용자는 307 /login 으로 튕긴다.

### 왜 이렇게 설계했나

matcher prefix 그룹이 `ort-wasm | fonts | models` 3개 디렉토리로 한정되어 있다. public 디렉토리 **직하** 는 의도적으로 포함하지 않았다 — 직하에 사용자 데이터·토큰·로그 등이 잘못 놓일 위험을 원천 차단하기 위함이다. `next/image` 는 프레임워크가 제공하는 안전한 이미지 전용 프록시 경로이므로 이를 통해서만 접근하면 충분하다.

### 확장 시

비로그인 화면 (예: 로그인 페이지, 카메라 페어링 페이지) 에서 **직접 URL** 로 참조해야 하는 자산이 생기면:

1. `public/brand/` 같은 **하위 디렉토리** 를 새로 만들고 그 안으로 자산 이동.
2. 위 "변경 체크리스트 A" (새 디렉토리 추가) 를 따라 `isPublicPath()` + matcher prefix 그룹 양쪽 갱신.
3. 스모크 테스트에 GET 200 어설션 + 보안 회귀 어설션 각 1개씩 추가.

**주의:** public 직하 자산을 단순히 "직접 접근 허용" 으로 matcher 에 추가하지 말 것. prefix 없이 직하 파일을 통과시키면 디렉토리 리스팅이 허용되는 정적 서버 환경에서 예기치 않은 공개 면이 생길 수 있다.

### 새 확장자 추가 전 자문

- [ ] 이 확장자로 내려가는 파일은 **항상 public/ 안에만** 있는가?
- [ ] 사용자 데이터·토큰·로그 등이 이 확장자로 저장·전송되는 경로는 없는가?
- [ ] `_next/static` 으로 이미 커버되는 자산 아닌가?
- [ ] matcher 추가 시 **prefix 결합형** 을 썼는가? (suffix-only 금지)

한 항목이라도 NO 이면 확장자 추가 대신 **디렉토리 프리픽스** 방식으로 전환 검토.

---

## 회귀 테스트 의무

`src/proxy.ts` 를 수정하는 모든 PR 은 `tests/static-assets-smoke.spec.ts` 의 어설션 **10건** 을 반드시 통과해야 한다:

### 정상 경로 (200 필수)

1. 비로그인 GET `/ort-wasm/ort-wasm-simd-threaded.jsep.mjs` → **200** + Content-Type `javascript|module|text/plain`
2. 비로그인 GET `/ort-wasm/ort-wasm-simd-threaded.jsep.wasm` → **200** + Content-Type `wasm|octet-stream`
3. 비로그인 GET `/fonts/omyu_pretty.woff2` → **200** + Content-Type `font|octet-stream|woff`
4. 비로그인 **HEAD** `/ort-wasm/ort-wasm-simd-threaded.jsep.mjs` → **200** (브라우저 Worker 가 HEAD/GET 혼용 가능)

### auth 게이트 (307 필수)

5. 비로그인 GET `/` → **307 → /login**
6. 비로그인 GET `/api/imaginary` → **307 → /login**

### 보안 회귀 — 동적 라우트 우회 차단 (307 필수, **신설**)

7. 비로그인 GET `/community/test/evil.wasm` → **307 → /login** (prefix 불일치)
8. 비로그인 GET `/community/test/evil.png` → **307 → /login** (prefix 불일치)
9. 비로그인 GET `/api/evil.onnx` → **307 → /login** (prefix 불일치)
10. 비로그인 GET `/logo.jpeg` → **307 → /login** (public/ 직하 자산 — `next/image` 경유가 아닌 직접 접근 차단)

1·2·3·4번이 깨지면 ONNX/폰트 로드 실패. 5·6번이 깨지면 auth 게이트 뚫림. 7·8·9번이 깨지면 동적 라우트 우회 공격에 문이 열림. **10번이 깨지면 public/ 직하 자산 정책이 무너짐.**

---

## 관련 파일

- `src/proxy.ts` — 본 규약이 관리하는 게이트
- `tests/static-assets-smoke.spec.ts` — 회귀 방지 스모크
- `tests/broadcast-smoke.spec.ts` — `/camera/broadcast` public 경로 검증 (참고)
