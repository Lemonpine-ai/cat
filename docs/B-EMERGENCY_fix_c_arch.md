# 🛡️ Fix-C 설계서 — broadcaster signaling timeout ENV 화

> **1번 Arch Agent (시니어 구조화 AI, 10년차+)** | 2026-04-26 | 무자비한 프로토콜 100% 준수 | 코드 작성 금지, 설계서만

---

## 1. 시스템 스냅샷 (Snapshot #fix-c-arch-r0)

**현재 상태**
- master HEAD: `39b2808` (Vercel `dpl_3LSPP2jzzDDPnL61h4kPEezg6TRc` READY+PROMOTED)
- recovery tag: `recovery-pre-broadcaster-signaling-timeout-2026-04-26` (origin push 완료)
- 운영 모드: 베타 (사용자 7명)
- 어제 머지: PR #4 `NEXT_PUBLIC_ICE_TIMEOUT_MS` (viewer ICE 60s)

**성역 파일 리스트 (이번 fix 에서 절대 수정 금지)**
- `src/hooks/useBroadcasterSignaling.ts` (offer/cleanup 본체) — 라인 12 단 1줄만 bump
- `src/lib/webrtc/configurePeerConnectionHandlers.ts` (백오프 3s/10s/30s)
- `src/hooks/useWebRtcSlotConnection.ts` (viewer 측, PR #4 영역)
- `src/lib/webrtc/iceConnectionTimeoutMs.ts` (PR #4 helper — **참고만, viewer 전용**)
- `staging/hooks/viewerPeerConnectionHelpers.ts` (viewer 측, 무관)

**작업 목표**
`useBroadcasterSignalingPoll.ts:205` 의 `15_000` 하드코딩을 ENV `NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS` 로 ENV 제어 + viewer ICE timeout (60s) 과 동기화.

---

## 2. 에이전트 전쟁 로그 (War Log)

### [구조] 1차 설계
신규 helper: `src/lib/webrtc/broadcasterSignalingTimeoutMs.ts` (PR #4 미러, ENV 분리).

### [팀장] 1차 공격
> "viewer helper 와 broadcaster helper 두 개 — 스파게티 아니냐?"

**구조 반박**: RULE 3 (물리적 병렬 독립) — 다른 시그널링 축. 하나로 뭉치면 ENV 한 개로 두 축이 결합됨. 미래에 viewer=60s, broadcaster=30s 따로 튜닝 위해 두 helper 가 옳음.

**팀장 양보**: PR #4 와 100% 동일한 검증 로직 (STEP 1~9, MIN/MAX 가드, warn 정책) 그대로 복사.

### [QA] 1차 공격
> "라인 195~205 외 다른 setTimeout 다 무시? configurePeerConnectionHandlers 의 disconnected grace 10s 도 ENV 화 빼먹은 거 아니야?"

**구조 반박** (조사 결과):
- `useBroadcasterSignalingPoll.ts:168` (3s) → answer_ready 채널 SUBSCRIBED race — **무관** (채널 lifecycle)
- `useBroadcasterSignalingPoll.ts:182` (2s) → notify 채널 cleanup — **무관**
- `useBroadcasterSignalingPoll.ts:220` (3s) → refresh 채널 cleanup — **무관**
- `configurePeerConnectionHandlers.ts:248` (10s) → disconnected grace — **이미 connected 후의 일시 끊김 영역**, signaling 단계 아님. 이번 fix 범위 밖.
- `configurePeerConnectionHandlers.ts:218~222` connected 도달 시 `signalingTimeoutRef.current` clearTimeout — **회귀 0**

### [팀장] 2차 공격
> "BROADCAST_CODE_VERSION 'v3-signaling-timeout' 을 'v4-signaling-timeout-env' 로 bump 안 하면 사장님이 콘솔에서 fix 적용 여부를 어떻게 검증?"

**구조 수용**: `useBroadcasterSignaling.ts:12` 1줄도 동시 변경. **변경 라인 총 2줄 (코드) + 신규 2 파일 (helper + test).**

### [QA] 2차 공격
> "#13 무손상 — Vercel ENV 미설정 production 환경에서 100% 동일 동작? helper 가 throw 하면 startBroadcast 가 깨진다."

**구조 답변**: PR #4 helper 도 모든 분기에서 number 반환 — throw 절대 없음. 새 helper 도 동일 보장.

### [QA] 3차 공격 (CLAUDE.md 금지 패턴)
- #1 (`.rpc().catch()`) — RPC 추가 없음 ✅
- #2 (`new RTCPeerConnection` 직전 close) — 새 PC 생성 안 함 ✅
- #3 (dummy PC try/finally) — 미적용 ✅

### 최종 합의
> **팀장: "OK. 단순 1줄 + helper 1개 + 테스트 1개 + 코드버전 bump. 다른 건 다 성역."**

---

## 3. 확정 설계 (Fix)

### A. 변경 위치

| # | 파일 | 라인 | 변경 종류 |
|---|---|---|---|
| 1 | `src/lib/webrtc/broadcasterSignalingTimeoutMs.ts` | 신규 | helper |
| 2 | `src/lib/webrtc/__tests__/broadcasterSignalingTimeoutMs.test.ts` | 신규 | 단위 테스트 |
| 3 | `src/hooks/useBroadcasterSignalingPoll.ts` | 11 (import) + 195~205 (setTimeout) | 2-region edit |
| 4 | `src/hooks/useBroadcasterSignaling.ts` | 12 (BROADCAST_CODE_VERSION) | 1-line bump |
| 5 | `vitest.config.ts` | 50 부근 (include 추가) | 1-line append |
| 6 | `docs/ARCHITECTURE.md` | §10.10 신규 섹션 | 문서 동기화 |

### B. 변경 코드 명세 (Dev 가 작성)

#### B-1. 신규 helper 명세 (`src/lib/webrtc/broadcasterSignalingTimeoutMs.ts`)
PR #4 helper (`iceConnectionTimeoutMs.ts`) 와 **로직 100% 동일**, 다음만 다름:
- 함수명: `getBroadcasterSignalingTimeoutMs`
- ENV_NAME: `"NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS"`
- DEFAULT: `15_000`
- MIN: `1_000`, MAX: `300_000`
- STEP 1 literal access: `process.env.NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS` (변수 indexing 금지 — Next.js DefinePlugin 호환)
- console.warn prefix: `[broadcasterSignalingTimeoutMs]`
- 한국어 주석 + STEP 1~9 구조 PR #4 와 1:1 미러
- 의존성: 없음 (Pure TS)

#### B-2. `useBroadcasterSignalingPoll.ts` 변경

import 블록 (라인 11 직전/직후) 추가:
```typescript
import { getBroadcasterSignalingTimeoutMs } from "@/lib/webrtc/broadcasterSignalingTimeoutMs";
```

라인 195~205 (Before / After):

**Before:**
```typescript
/* ── ④ signaling 타임아웃 — 15초 이내에 answer 미수신 시 세션 재생성 ── */
if (signalingTimeoutRef.current) clearTimeout(signalingTimeoutRef.current);
signalingTimeoutRef.current = setTimeout(() => {
  signalingTimeoutRef.current = null;
  if (peerConnectionRef.current?.connectionState !== "connected") {
    void (async () => {
      await cleanupPeerResourcesOnly(true);
      restartBroadcast();
    })();
  }
}, 15_000);
```

**After (한글 주석 필수):**
```typescript
/* ── ④ signaling 타임아웃 — answer 미수신 시 세션 재생성 ──
 * ENV NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS 로 조정 (단위: ms).
 * 미설정 시 15000ms (기존 동작 100% 유지, CLAUDE.md #13 무손상).
 * viewer 의 NEXT_PUBLIC_ICE_TIMEOUT_MS 와 동기화 권장 (예: 60000). */
const signalingTimeoutMs = getBroadcasterSignalingTimeoutMs();
if (signalingTimeoutRef.current) clearTimeout(signalingTimeoutRef.current);
signalingTimeoutRef.current = setTimeout(() => {
  signalingTimeoutRef.current = null;
  if (peerConnectionRef.current?.connectionState !== "connected") {
    console.warn(`[broadcaster] signaling 타임아웃 (${signalingTimeoutMs}ms) — 세션 재생성`);
    void (async () => {
      await cleanupPeerResourcesOnly(true);
      restartBroadcast();
    })();
  }
}, signalingTimeoutMs);
```

#### B-3. `useBroadcasterSignaling.ts:12` 변경
- Before: `const BROADCAST_CODE_VERSION = "v3-signaling-timeout";`
- After: `const BROADCAST_CODE_VERSION = "v4-signaling-timeout-env";`

이 상수는 라인 61 의 `console.log` 로 마운트 시 1회 콘솔 출력 → 사장님이 G7 콘솔에서 즉시 확인 가능.

#### B-4. `vitest.config.ts` include 추가
라인 49 ICE timeout 줄 직후:
```
"src/lib/webrtc/__tests__/broadcasterSignalingTimeoutMs.test.ts",
```

#### B-5. 단위 테스트 명세 (T1~T12)
PR #4 의 T1~T10 미러링 + T11/T12 추가:

| ID | 입력 | 기대 결과 | warn |
|----|------|----------|------|
| T1 | `{}` (미설정) | 15000 | 0 |
| T2 | `"30000"` | 30000 | 0 |
| T3 | `"60000"` | 60000 | 0 |
| T4 | `"500"` (MIN 미만) | 15000 fallback | 1 |
| T5 | `"400000"` (MAX 초과) | 15000 fallback | 1 |
| T6 | `"abc"` (NaN) | 15000 fallback | 1 |
| T7 | `""` (빈 문자열) | 15000 | 0 |
| T8 | `"  60000  "` (공백 trim) | 60000 | 0 |
| T9 | 인자 없이 + ENV 미설정 | 15000 | 0 |
| T10 | 인자 없이 + ENV `"60000"` | 60000 | 0 |
| T11 | `"0"` | 15000 + warn | 1 |
| T12 | `"-1000"` | 15000 + warn | 1 |

### C. ENV 파싱 안전장치 (helper 내부)

| STEP | 처리 | 결과 |
|------|------|------|
| 1 | literal access | Next.js DefinePlugin inline |
| 2 | undefined / null | DEFAULT 15000 |
| 3 | 빈 문자열 | DEFAULT 15000 |
| 4 | `Number(trimmed)` | parseInt 금지 (꼼수 차단) |
| 5 | NaN / Infinity | DEFAULT 15000 + warn |
| 6 | `Math.trunc()` | 정수화 |
| 7 | 0 이하 / 음수 | DEFAULT 15000 + warn |
| 8 | 범위 [1000, 300000] 외 | DEFAULT 15000 + warn |
| 9 | 검증 통과 | 정수 반환 |

### D. 측정 단위 명시 (ms)
- 변수명 suffix: `signalingTimeoutMs`
- console.warn: `(${signalingTimeoutMs}ms)`
- ENV 명 suffix: `_MS`
- JSDoc: `@returns 검증 통과한 타임아웃 ms (실패 시 15000ms fallback)`

### E. CLAUDE.md #13 무손상 검증

| 항목 | 결과 |
|------|------|
| ENV 미설정 → helper 반환값 | `15_000` |
| `15_000` setTimeout → 기존 코드 비교 | **byte 단위 동일** |
| cleanupPeerResourcesOnly clearTimeout | **불변** |
| connected 도달 시 clearTimeout | **불변** |
| restartBroadcast 호출 경로 | **불변** |
| BROADCAST_CODE_VERSION console.log | "v3" → "v4" 1글자, side effect 0 |

→ ENV 미설정 production = **timing/lifecycle/API 호출 100% 동일**.

### F. 빌드 영향 검증

| 항목 | 명령 | 기대 |
|------|------|------|
| TypeScript | `pnpm tsc --noEmit` | 0건 |
| ESLint | `pnpm lint` | 0건 |
| 단위 테스트 | `pnpm vitest run src/lib/webrtc/__tests__/broadcasterSignalingTimeoutMs.test.ts` | T1~T12 PASS |
| 전체 vitest | `pnpm test` | 모두 PASS |
| pnpm build | `pnpm build` | 성공 + warning 0 |
| client bundle inline | `grep -rn "60000" .next/static/chunks/` | 발견 |

### G. 9R 검증 체크리스트 (Level 3)

| R | 관점 | 질문 |
|---|------|------|
| **R1** | 동작 | (a) `pnpm build` 통과? (b) T1~T12 PASS? (c) Vercel READY+PROMOTED? (d) ENV 60000 설정 후 G7 콘솔에 `v4-signaling-timeout-env` + `(60000ms)` 찍힘? |
| **R2** | 설계 일치 | (a) ARCHITECTURE.md §10.10 신규 섹션? (b) PR #4 §10.9 와 동일 포맷? |
| **R3** | 단순화 | (a) helper 가 PR #4 와 99% 동일 구조? (b) 새 추상화 0? (c) 단일 ENV, 단일 helper 호출? |
| **R4** | 가독성 | (a) 한국어 주석 4줄? (b) `signalingTimeoutMs` 변수명 단위 포함? (c) STEP 1~9 PR #4 미러? |
| **R5** | 엣지케이스 | (a) ENV 미설정 → 정확히 15000? (b) NaN/음수/빈/공백 trim 처리? (c) helper throw 없음? (d) restartBroadcast 의 ref null 순서? |
| **R6** | 성능 | (a) literal access cost 0? (b) startBroadcast 당 1회 → 무시? (c) 누수 0? |
| **R7** | 보안 | (a) NEXT_PUBLIC_* 시크릿 아님? (b) Vercel Sensitive 권장? (c) XSS/RLS 영향 0? |
| **R8** | 영향 범위 | (a) viewer 영향 0? (b) staging 영향 0? (c) 백오프 (3s/10s/30s) 충돌 0? (d) disconnected grace 충돌 0? (e) useBroadcasterAutostart 등 영향 0? |
| **R9** | 최종 품질 | (a) PR #4 와 패턴 일관성? (b) BROADCAST_CODE_VERSION bump? (c) 금지 #1/#2/#3 통과? (d) 무효 키워드 0건? (e) Vercel Instant Rollback 1-click? |

### H. 잠재 회귀 리스크 점검

| 영역 | 결과 | 회귀 |
|------|------|------|
| `staging/hooks/viewerPeerConnectionHelpers.ts` | viewer 측 헬퍼, broadcaster 와 무관 | **0** |
| `src/hooks/useWebRtcSlotConnection.ts` (viewer) | 별도 ENV → 충돌 0 | **0** |
| `useBroadcasterSignaling.ts:316` (`start_device_broadcast`) | session INSERT 빈도 4배 ↓ → DB 부하 ↓ | **0 (개선)** |
| `configurePeerConnectionHandlers.ts` 백오프 | disconnected 후 단계, signaling 과 시간축 분리 | **0** |
| `configurePeerConnectionHandlers.ts:218~222` clearTimeout | 동일 ref, 변경 없음 | **0** |
| `useBroadcasterSignaling.ts:12` BROADCAST_CODE_VERSION | console.log 1회, side effect 0 | **0** |
| 다른 setTimeout (168/182/220) | 채널 lifecycle, 무관 | **0** |
| CLAUDE.md 금지 #1/#2/#3 | 모두 미해당 | **0** |

### I. 배포 순서 (atomic)

1. 로컬: `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm build`
2. commit + push (단일 atomic): `feat(webrtc): broadcaster signaling timeout ENV flag (default 15s 유지)`
3. Vercel 빌드 → MCP `getDeployments` → READY+PROMOTED 확인
4. Vercel ENV `NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS=60000` 추가 (Sensitive)
5. 빈 커밋 push 로 강제 재빌드
6. 재빌드 READY+PROMOTED 확인
7. client bundle inline 검증 (`grep "60000"`)
8. 사장님 G7 실기기 테스트:
   - 콘솔: `[broadcaster] 코드 버전: v4-signaling-timeout-env`
   - 콘솔: `[broadcaster] signaling 타임아웃 (60000ms) — 세션 재생성` (timeout 발동 시만)
   - viewer 콘솔: `[CameraSlot] 연결 타임아웃 (60000ms)` 동기화
   - broadcaster 새 session_id 폭증 멈춤 (15분에 40+ → 거의 0)
   - DB postgres `could not obtain lock on row in relation "camera_sessions"` 25회/10분 → 0~1회
9. DB 모니터링 10분: `SELECT count(*) FROM camera_sessions WHERE created_at > now() - interval '10 minutes'`

### J. Vercel Instant Rollback
- 이전 commit: `39b2808` (dpl_3LSPP2jzzDDPnL61h4kPEezg6TRc)
- 1-click promote: Vercel Dashboard 또는 MCP

---

## 4. 복구 명령어 (Rollback)

**상황 1: Vercel 즉시 롤백 (5초)**
```
Vercel Dashboard → Deployments → 39b2808 → "Promote to Production"
```

**상황 2: ENV 만 제거하여 default 15s 복귀**
```
mcp__vercel__removeEnvVar (NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS)
git commit --allow-empty -m "ci: revert NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS to default"
git push origin master
```

**상황 3: git 전체 롤백 (recovery tag)**
```
git fetch --tags origin
git reset --hard recovery-pre-broadcaster-signaling-timeout-2026-04-26
git push origin master --force-with-lease   # ⚠️ 사장님 승인 필수
```

---

## 사장님 컨펌 요청 — 7개 항목

다음 항목 명시 승인 시 즉시 2번 Dev Agent 호출:

- [ ] **(1) ENV 명**: `NEXT_PUBLIC_BROADCASTER_SIGNALING_TIMEOUT_MS` (viewer 의 `NEXT_PUBLIC_ICE_TIMEOUT_MS` 와 짝)
- [ ] **(2) default 값**: `15_000` ms (CLAUDE.md #13 무손상). Vercel 에 `60000` 별도 설정.
- [ ] **(3) 가드 범위**: `[1000, 300000]` ms (1초~5분). 범위 외 fallback 15000 + warn.
- [ ] **(4) 신규 파일 2개 생성**: `src/lib/webrtc/broadcasterSignalingTimeoutMs.ts` + 단위 테스트
- [ ] **(5) `BROADCAST_CODE_VERSION` bump**: `v3-signaling-timeout` → `v4-signaling-timeout-env`
- [ ] **(6) Level 3 9R 적용**: Arch ↔ Dev ↔ QA 9 연속 PASS
- [ ] **(7) 배포 절차**: 단일 atomic commit → Vercel READY → ENV 등록 → 빈 커밋 재빌드 → G7 검증
