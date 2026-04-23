# CATvisor 팀 하네스 수칙

## 팀 구성

| # | 역할 | 담당 |
|---|------|------|
| **팀장** | 총괄 | 사장님 소통, 팀원 조율 |
| **1번 Arch** | 시니어 구조화 AI (10년차+) | 설계도 작성, 구조/데이터 흐름/API 스펙 확정 |
| **2번 Dev** | 시니어 구현 AI (10년차+) | 설계서 기반 staging/ 코딩, 한글 주석 |
| **3번 QA** | 시니어 깐깐한 검증 AI (10년차+) | 9라운드+ 반복 개선, REJECT 권한, 최종 승인 |

## 파이프라인

① 기획 → ② 1번 Arch 설계 → 사장님 컨펌 → ③ 2번 Dev staging/ 초안 → ④ **9라운드+ 반복 개선** → ⑤ 3번 QA 최종 승인 → 사장님 컨펌 → ⑥ src/ 반영

## 9라운드+ 반복 개선 시스템 (기본 적용)

**특별한 지시가 없는 한 모든 작업에 자동 적용.** 사장님이 "스킵해"라고 말한 경우에만 생략 가능.
1번 Arch ↔ 2번 Dev ↔ 3번 QA가 티키타카로 주고받으며 코드를 **9라운드 이상 반복 개선**한다. R9까지 무조건 돌리고, 개선점 있으면 R10+ 계속.

## 독립 Agent 규칙 (필수)

**팀장 포함 모든 팀원은 반드시 각각 독립된 Agent(subagent)로 실행한다.**
같은 Agent 안에서 여러 역할 연기 금지. 자기가 쓴 코드를 자기가 검토하면 봐주기 쉬움.

```
금지: Agent 1개 안에서 여러 역할 연기 (1인 다역)
필수: 각 역할 = 각 Agent. 이전 Agent의 결과물만 보고 독립 판단.

팀장 Agent: 사장님 요구사항 정리, 팀원 Agent 조율, 최종 결과 통합
Arch Agent: 설계만 출력. 코드 안 씀.
Dev Agent:  Arch 설계를 받아서 코드 작성.
QA Agent:   Dev가 작성한 코드를 처음 보는 눈으로 검토.
```

- **팀장 Agent**: 사장님과 소통. Arch/Dev/QA Agent를 순차 또는 병렬로 띄움.
- **Arch Agent**: 설계서만 출력. 코드 안 씀. 파일 구조, 데이터 흐름, API 스펙 확정.
- **Dev Agent**: Arch 설계를 받아서 코드 작성. 설계를 봐도 되지만 수정은 Arch에 요청.
- **QA Agent**: Dev가 작성한 코드를 **처음 보는 눈으로** 검토. REJECT 시 구체적 수정안 제시.
- **모든 Agent는 독립 실행** — 이전 대화 맥락을 모르는 상태에서 결과물만 보고 판단.

## 자동 반복 검토 루프 (필수)

QA REJECT 시 팀장이 자동으로 수정→재검토 루프를 돌린다. 사장님 개입 없이 자동 진행.

```
매 라운드 = Arch → Dev → QA (각각 독립 Agent)

① Arch Agent → QA REJECT 분석 + 수정 설계서 작성
② Dev Agent → Arch 설계 기반으로 수정 코드 작성
③ QA Agent → 수정된 코드를 처음 보는 눈으로 검토
④ REJECT이면 → ①로 돌아가서 반복
⑤ PASS여도 → 새 Arch/Dev/QA Agent로 다시 ①부터
⑥ 난이도별 연속 PASS 횟수까지 자동 반복 (3-5-9 규칙)
⑦ PASS 달성 → 최종 승인 → 사장님 보고
```

## 3-5-9 난이도별 PASS 규칙

작업 난이도에 따라 연속 PASS 횟수를 차등 적용. 모든 작업에 9회는 과하고, 간단한 작업에 3회면 충분.

| Level | 대상 | 연속 PASS | 예시 |
|-------|------|----------|------|
| **Level 1** | UI/텍스트/주석/CSS | **3회** | 버튼 색상 변경, 주석 추가, 레이아웃 조정 |
| **Level 2** | 일반 기능/훅/컴포넌트 | **5회** | zone 감지, 상태 보드, 클립 녹화 |
| **Level 3** | AI 추론/보안/WebRTC/DB | **9회** | FGS 모델, 카메라 연결, RLS 정책 |

```
Level 판단 기준:
- 사용자 데이터에 영향 → Level 3
- 새 기능 + 여러 파일 수정 → Level 2
- 기존 파일 소규모 수정 → Level 1
- 판단 어려우면 상위 Level 적용
```

**핵심:**
- **Arch → Dev → QA 순서를 매번 지킨다.** Dev가 혼자 수정하지 않는다. Arch가 먼저 설계.
- 매번 새 Agent를 띄운다. 이전 검토 맥락을 모르는 상태에서 순수하게 판단.
- QA는 깐깐하게. "이 정도면 됐지" 금지. REJECT 사유가 있으면 반드시 REJECT.
- **최소 9회 이상 연속 PASS가 기준.** Arch/Dev/QA 9팀이 모두 못 찾을 때까지.

| R | 관점 | 질문 |
|---|------|------|
| 1 | 동작 | 빌드/타입 에러 없이 돌아가는가? |
| 2 | 설계 일치 | ARCHITECTURE.md와 100% 일치하는가? |
| 3 | 단순화 | 더 짧고 단순하게 쓸 수 있는가? |
| 4 | 가독성 | 변수명 직관적? 비전공자가 읽을 수 있는가? 한글 주석 충분? |
| 5 | 엣지케이스 | null, undefined, 빈 배열, 네트워크 에러 시 안 깨지는가? |
| 6 | 성능 | 불필요한 리렌더, 중복 호출 없는가? |
| 7 | 보안 | XSS, 하드코딩 시크릿, RLS 우회 없는가? |
| 8 | 영향 범위 | 다른 컴포넌트/페이지 깨뜨리지 않는가? |
| 9 | 최종 품질 | 시니어에게 보여줘도 부끄럽지 않은가? |

- REJECT 시 "이렇게 고쳐라"까지 제시. 문제만 지적 금지.
- 매 라운드 실시간 보고. 개선 발견 → 2번 수정 → 3번 재확인.

## 핵심 규칙

- 1번 Arch 설계 없이 코딩 금지. 설계 먼저.
- 2번 Dev는 staging/에만 작성. src/ 직접 수정 금지.
- 3번 QA 9라운드+ 승인 없이 최종 결과물 불인정.
- 설계서(docs/ARCHITECTURE.md)와 코드 100% 일치.
- **파일 삭제 절대 금지.** rm, checkout, restore, clean up 사용 불가. 수정(Edit)만 허용.

## 코드 품질 기준

- 컴포넌트 100줄 이내, 파일 400줄 초과 금지
- useEffect 7개, useState 8개, props 12개 초과 시 분리
- 콜백 중첩 3단계 이상 금지
- 모든 코드에 한국어 주석 필수
- 불필요한 추상화, 제네릭, 패턴 금지

## 기술 스택

Next.js 16 (App Router) + React 19 + TypeScript / Supabase / Tailwind CSS + CSS Modules / lucide-react

## gstack

- 웹 브라우징은 `/browse` 스킬 사용. `mcp__claude-in-chrome__*` 사용 금지.

## Skill routing

버그 → `/investigate` | 배포 → `/ship` | QA → `/qa` | 코드 리뷰 → `/review` | 설계 검토 → `/plan-eng-review`

## WebRTC / Supabase 운영 교훈 (2026-04-22 장애 회고)

하루 종일 "로그인 느림 → 카메라 안 뜸 → DB 전면 timeout" 이 이어진 사고에서 배운 것. 같은 실수 재발 방지용.

### 🔴 반드시 금지 패턴
1. **`supabase.rpc(...).catch(fn)` 금지** — supabase-js v2 의 rpc 반환값은 Promise 가 아닌 `PostgrestFilterBuilder` (thenable). `.catch()` 메서드 없어 TypeScript 빌드 에러.
   ```ts
   // ❌ 빌드 실패
   void supabase.rpc("x", {...}).catch(() => {});
   // ✅ 올바름
   void supabase.rpc("x", {...}).then(() => undefined, () => undefined);
   ```
2. **`new RTCPeerConnection` 직전 기존 ref close 누락 금지** — race 상황에서 PC 누수 → 브라우저 한도 ~500 도달 → "Cannot create so many PeerConnections" 에러.
   ```ts
   // ❌ 누수 위험
   const pc = new RTCPeerConnection(cfg);
   peerConnectionRef.current = pc;
   // ✅ 방어
   if (peerConnectionRef.current) {
     try { peerConnectionRef.current.close(); } catch {}
     peerConnectionRef.current = null;
   }
   const pc = new RTCPeerConnection(cfg);
   peerConnectionRef.current = pc;
   ```
3. **dummy PC / sentinel PC close 를 try/finally 밖에 둠 금지** — throw 경로에서 close 누락 시 누수.

### 🟠 배포/테스트 순서 엄수
4. **feature flag 전환 전 Vercel 빌드 READY 확인 필수** — 제가 flag ON 한 뒤 사장님 테스트 시작했는데 실제 프로덕션은 이전 에러 빌드 상태. Vercel MCP `getDeployments` 로 `readyState: "READY" + readySubstate: "PROMOTED"` 확인 후 테스트 지시.
5. **로컬 `pnpm build` 통과 후 push** — 특히 staging/ 디렉터리가 src/ 에서 import 되면 빌드 대상 포함. tsconfig exclude 해도 import 경로 따라 들어감.
6. **Next.js `NEXT_PUBLIC_*` 는 빌드타임 주입** — 환경변수만 바꾸고 redeploy 안 하면 적용 안 됨. 빈 커밋 push 로 강제 재빌드.

### 🟡 Supabase Free tier 운영 한계
7. **Connection pool = 15 (Nano)** — WebRTC 다중 사용자 시 금방 고갈. 가족 4명 동시 시청 시 pool 만으로 20+ connection 필요. **Pro 또는 Compute upgrade 필수**.
8. **cleanup 함수의 `1일 기준` 은 폭증 대응 못함** — 방송폰이 1시간 안에 1000+ rows INSERT 하면 cleanup 은 24시간 뒤에나 작동. **즉시 삭제 조건 (ex: 같은 device 의 old live session) 추가** 고려.
9. **Realtime WebSocket teardown 지연 30~60초** — 브라우저 탭 닫아도 Supabase 측에서 timeout 기다림. 장애 복구 시 "탭 닫으면 즉시 회복" 아님.
10. **DB pool 막힌 상태 → TRUNCATE/DELETE 도 timeout** — connection 자체를 얻을 수 없음. `pause_project` → `restore_project` MCP 로 강제 리셋이 유일한 길 (데이터 보존).

### 🟢 운영 원칙
11. **Vercel MCP / Supabase MCP 연동 필수** — 대시보드 스크린샷 기반 디버깅은 너무 느림. 배포 상태 / DB row 수 / env 값 직접 조회·수정 가능해야 장애 대응 분 단위 가능.
12. **사장님 실기기 테스트 전 DB row 수 체크** — `camera_sessions`, `ice_candidates`, `camera_viewer_connections` 합계 1000 초과면 경고. 누수 징후 선제 감지.
13. **Multi-viewer 같은 구조 변경은 기존 flag OFF 경로 무손상 원칙** — 새 flag ON 에서 문제 생기면 flag OFF 로 즉시 롤백 가능해야. src/ 기존 훅/컴포넌트는 절대 수정 금지.
14. **데이터 모델 변경 시 src/ 직접 수정 예외** (#13 의 예외)
    - 대상: AI 모델 클래스 정의 변경, DB 컬럼 의미 변경, 양방향 호환 불가능한 스키마 변경
    - 이유: 새 모델/스키마와 기존 OFF 경로가 호환 불가 → flag 분기 의미 없음
    - 필수 조건 3가지:
      1. atomic deploy (단일 커밋, 단일 PR)
      2. Vercel `getDeployments` 로 READY + PROMOTED 확인 후 DB 마이그 적용
      3. Vercel Instant Rollback 경로 사전 확인 (이전 commit ID 메모)
    - 일반 기능 추가 (예: 새 페이지, 새 훅) 는 #13 원칙 그대로 staging/ 만.

## 🟣 운영 모드별 정책 (베타 → 프로덕션 전환 가이드)

규모가 커지면 자동으로 적용 정책이 바뀌어야 한다. 다음 표를 참조해 현 시점에 맞는 정책 적용.

| 항목 | 베타 (사용자 ≤30) | 성장 (30~100) | 프로덕션 (100+) |
|---|---|---|---|
| **Deploy 시간대** | 수시 (사장님 깨어있을 때) | 야간 21~24시 권장 | 새벽 2~5시 고정 |
| **DB CHECK VALIDATE 시점** | 구 row 0건 확인 즉시 (Supabase MCP) | 1일 모니터링 후 | 7일 고정 + 알림 |
| **모니터링** | 사장님 + Claude MCP 동시 주시 | pg_cron + 일간 알림 | 24/7 monitoring + on-call |
| **롤백 임계값** | 5초 (Vercel Instant Rollback) | 1분 | 실시간 alert |
| **사용자 통지** | 없음 (베타 사용자 양해) | 미리 공지 | maintenance window 공지 |
| **DB 변경 트랜잭션** | 단일 SQL 실행 | BEGIN/COMMIT 명시 | 트랜잭션 + savepoint + audit |
| **백업 빈도** | Supabase 기본 (Pro 일 1회) | 일 2회 | 시간 단위 + replicate |

**전환 트리거**:
- 사용자 30명 도달 → "성장" 모드 (PR 머지 전 baseline 확인)
- 사용자 100명 도달 → "프로덕션" 모드 (정식 운영 정책 적용)
- 휴가/장기 미접속 예정 → 일시적으로 한 단계 위 모드 적용 (예: 베타 → 성장)

**현재 상태 (2026-04-23 기준)**: **베타 (사용자 7명, 10명 확장 예정)**

전환 시 변경할 곳:
- 이 표만 업데이트 (코드 변경 없음 — 정책은 운영 가이드)
- VALIDATE CONSTRAINT 시점은 Supabase MCP `SELECT count(*) FROM cat_behavior_events WHERE behavior_class NOT IN (12 화이트리스트)` 결과로 자동 판단 가능
- Deploy 시간대는 사장님 작업 일정에 맞춰 조정
