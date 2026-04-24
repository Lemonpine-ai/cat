# Phase B 실기기 테스트 플랜 (R6 T11 MAJOR)

> 대상: 사장님 (방송폰 2~3대 + 가족 4명 뷰어 조건)
> 소요: 약 50분 (준비 5 + 방송 30 + 검증 10 + 종료 5)
> 목적: Phase B staging → src/ 반영 직전 / 직후의 실기기 동작을 체계적으로 검증.
>        실패 시 즉시 롤백 + 로그 수집 절차 포함.
> 연계: `phase_b_src_migration_checklist.md` §1~§7 / `docs/phase_b_arch_r6.md` §5 /
>        `CLAUDE.md` WebRTC / Supabase 운영 교훈 #4/#5/#6/#10/#11/#12.

---

## 0. 시작 전 5분 체크 (준비)

방송 시작 전 다음 7개 항목이 모두 체크되어야 flag ON 으로 넘어간다. 하나라도 미달 시 중단.
(R11 D3 추가: 0-7 — R12 PR atomic 7 commit 직후 명시적 commit ID 메모 + R2 CORS 마지막 확인.)

- [ ] **0-1 Vercel env 확인** — `NEXT_PUBLIC_CAT_YOLO_V2=1` + `NEXT_PUBLIC_YOLO_MODEL_URL=<R2 public URL>`
      둘 다 Production scope 에 설정됐는가? (Vercel MCP `listEnvVars` 또는 대시보드)
- [ ] **0-2 R2 bucket 공개 확인** — `curl -I $NEXT_PUBLIC_YOLO_MODEL_URL` 실행 시
      `HTTP/2 200` + `access-control-allow-origin: https://cat-lac-eight.vercel.app` 응답 확인.
      (미달 시 방송 시작 금지 — Worker init 전원 실패 유발.)
- [ ] **0-3 빈 커밋으로 최신 배포 확정** — env 변경 후 `git commit --allow-empty -m "chore: redeploy"`
      → push → Vercel MCP `getDeployments` 로 `readyState=READY` + `readySubstate=PROMOTED` 확인.
      (`CLAUDE.md` #4/#6 재발 방지.)
- [ ] **0-4 방송폰 OS / 브라우저 버전 확인** — Android Chrome 113+ 또는 iOS Safari 16.4+.
      구형 기기에서는 WebGPU 미지원 → backend 가 webgl 또는 wasm 으로 수렴하는지 후속에서 확인.
- [ ] **0-5 가족 뷰어 폰 OS / 브라우저 확인** — iOS 15+ 또는 Android Chrome 90+. 뷰어폰은
      추론 안 하고 Realtime 구독만 하므로 WebGPU 불필요.
- [ ] **0-6 이전 PROMOTED commit ID 메모** — Vercel MCP `getDeployments` 또는 대시보드에서
      현재 production 의 SHA(40자) 를 메모해 둔다. §6 실패 시 Instant Rollback 대상.
      (R7 D2 / MINOR-R6-NEW-3 해소.)
- [ ] **0-7 R12 PR 직후 commit ID 메모 + R2 CORS 마지막 확인** — (R11 D3) 본 테스트 직전 2건:
      ① R12 머지 commit ID(40자) 메모 (0-6 "이전 PROMOTED" 와 별개 기록 — Instant Rollback 대상).
      ② `curl -I -H "Origin: https://whatnyan.com" $NEXT_PUBLIC_YOLO_MODEL_URL` → HTTP/2 200 +
         `Access-Control-Allow-Origin: https://whatnyan.com` + `Vary: Origin` 3건. 0-2 는 vercel
         Origin → 0-7 은 정식 도메인 마지막 재확인 (R12 PR 사이 CORS 변경 가능성 차단).

## 1. 방송 시작 체크 (5분)

방송폰에서 방송 시작 버튼 → 첫 5분 내 다음 5개 항목 확인.

- [ ] **1-1 flag ON 정상 인식** — 방송 화면에 dev 배지 (우상단 작은 사각형) 가 등장.
      prod 빌드라면 배지 없음이 정상. dev preview 에서만 확인 대상.
- [ ] **1-2 배지 녹색 전환** — 초기 노랑 (loading) → 30초 내 녹색 (ready) 전환. 빨강 (failed)
      유지 시 §3 실패 경로로.
- [ ] **1-3 배지 hover 로 backend 확인** — 툴팁에 `backend=webgpu` 또는 `webgl` 또는 `wasm` 중 1개
      표시. null 유지 시 init 실패 의심.
- [ ] **1-4 추론 latency 합격선** — 툴팁의 `p50<500ms` (녹색 WebGPU 기준) 또는 `p50<1500ms`
      (WebGL/WASM 기준). p95 는 1000ms/3000ms 이하.
- [ ] **1-5 retryAttempt=0 유지** — 툴팁의 `retry=0` 이 첫 5분 내 계속 0. 1 이상이면 crash 발생.

## 2. 30분 연속 모니터링 (30분)

방송 지속 중 10분마다 1번 씩 총 3번 체크. 사장님이 방송폰 화면을 잠깐 확인하거나 가족이
뷰어폰 상태를 알려주는 수준.

- [ ] **2-1 ticksTotal 단조 증가** — 배지 숫자가 10분당 +120 (5s tick 기준) 주변. 정체 시
      sampling interval 중단 의심 (백그라운드 throttle / visibility 이벤트 / crash).
- [ ] **2-2 retryAttempt 0 유지** — 전체 30분 동안 crash 없음. 1회라도 발생 시 §3-로그 수집.
- [ ] **2-3 Supabase row 증가 속도** — 10분마다 Supabase MCP 로
      `SELECT count(*) FROM cat_behavior_events WHERE detected_at > now() - interval '10 minutes'`
      실행. 분당 10 이하 (confirmed 전환 빈도). 폭증 시 flush 루프 의심.
- [ ] **2-4 방송폰 메모리 증가율** — Chrome DevTools Performance monitor 로 확인 (USB 연결).
      10분당 +10MB 이하. 초과 시 bitmap close 누락 가능성 — lifecycle flush 검증.
- [ ] **2-5 behavior 1개 이상 감지** — 30분 내 적어도 1 row INSERT 되어 `behavior_class`
      컬럼에 sleeping / grooming / eating 등 유효값 1개 이상 기록. 0건이면 detection
      pipeline 이상.

## 3. 종료 체크 (5분)

방송 종료 직후 다음 5개 항목.

- [ ] **3-1 flag OFF 경로 즉시 전환** — flag 를 OFF 로 돌리고 빈 커밋 push → 배포 READY 확인.
      방송폰에서 새로고침 시 배지 사라짐 + Worker termination 확인.
- [ ] **3-2 Mount unmount 직후 worker 종료** — DevTools Network 탭에서 ONNX Worker 관련
      request 가 더 이상 뜨지 않는지 확인.
- [ ] **3-3 Supabase row 무결성** — `SELECT behavior_class, count(*) FROM cat_behavior_events
      WHERE detected_at > '<방송 시작 timestamp>' GROUP BY behavior_class` 로 row 분포
      확인. 12 클래스 whitelist 밖 값 0건 확인.
- [ ] **3-4 뷰어 INSERT 0건** — `SELECT camera_id, count(*) FROM cat_behavior_events WHERE
      detected_at > '<방송 시작 timestamp>' GROUP BY camera_id`. camera_id 는 방송폰 device_id
      만 나와야 함. 뷰어폰 device_id 가 보이면 §7.1 뷰어 게이트 누락.
- [ ] **3-5 로그 스크린샷** — 방송폰 Chrome Console 탭 스크린샷 1장 + Supabase row 분포
      SQL 결과 1장. 성공 케이스 보관용.

## 4. 기기별 WebGPU/WebGL/WASM 분포 (참고표)

| 기기 | OS 버전 | WebGPU | WebGL | WASM SIMD | 예상 backend | 예상 regime |
|------|---------|--------|-------|-----------|-------------|-------------|
| Samsung Galaxy S23 (방송폰 A) | Android 14 | O (Chrome 113+) | O | O | webgpu | day-active 5s |
| Samsung Galaxy A 계열 | Android 12~13 | 불확실 | O | O | webgl 우선 | day-active 5s |
| iPhone 13/14/15 (방송폰 B) | iOS 17+ | 불가 (18 preview 일부) | O | O (16.4+ SIMD) | webgl | day-active 5s |
| iPhone SE / 12 mini (뷰어) | iOS 16 | 불가 | O | 제한적 | 뷰어 — 추론 없음 | — |
| iPad Pro (뷰어) | iOS 17 | preview | O | O | 뷰어 — 추론 없음 | — |

## 5. 30분 연속 기대값 (검증 기준표)

| 지표 | 기대값 | 실패 시 조치 |
|------|--------|-------------|
| `retryAttempt` | 0 유지 | crash 발생 → STABLE_READY_MS 60s → 90s 상향 검토 (체크리스트 §7.3) |
| `ticksTotal` | 360 ± 10% | tick 느림 → regime 확인, motionActive 동작 확인 |
| `inferSuccesses / ticksTotal` | > 0.85 | iOS inference 시간 측정 → regime=night 고정 검토 |
| `inferLatencyP95Ms` | < 1000ms (WebGPU) / < 3000ms (WebGL/WASM) | 1~3초 초과 → backend fallback 강제 wasm |
| 방송폰 메모리 (DevTools) | 증가율 < 10MB/30분 | bitmap close 누락 — sampling `finally` 블록 재확인 |
| Supabase row 증가 | 분당 < 10 | flush 폭증 — logger INSERT 병목 의심 |
| Realtime 채널 수 (Dashboard) | < 50 | 뷰어 누수 — `useRealtimeWithFallback` unsubscribe 미호출 |

## 6. 실패 시 로그 수집 절차

flag ON 후 30분 내 하나라도 실패 판정되면 즉시 다음 순서로 증거 수집 + 롤백.

- [ ] **6-1 Vercel 에러 로그** — Vercel MCP `getDeploymentEvents` 호출 (최근 30분 범위).
      에러/경고 이벤트 전체 캡처.
- [ ] **6-2 Supabase 로그** — Supabase MCP `get_logs` (service=postgres, service=realtime 둘 다).
      최근 30분 범위.
- [ ] **6-3 방송폰 Console 전체 스크린샷** — Chrome DevTools → Console → `[CATvisor]` /
      `[Lifecycle]` / `[Sampling]` 필터링하여 로그 전체 캡처 (USB 연결 필수).
- [ ] **6-4 방송폰 Network 탭** — ONNX worker / Supabase API / WebRTC signaling 요청 상태 코드
      분포 캡처. 404 / 5xx 유무 확인.
- [ ] **6-5 Vercel Instant Rollback** — 준비 단계에서 메모한 이전 PROMOTED commit ID 로
      Instant Rollback 실행. 5초 내 경로 확보 (베타 모드 기준, `CLAUDE.md` 운영 정책 표).
- [ ] **6-6 Supabase row 보존 확인** — 롤백 후 `cat_behavior_events` 에 기존 row 가 그대로
      남아 있는지 SELECT 로 확인. 롤백은 DB 스키마 변경 없으므로 데이터 손실 0 이어야 함.
- [ ] **6-7 사후 보고** — 위 6개 로그를 팀 채널 (또는 gh issue) 에 첨부하여 Arch R7 착수 근거로
      남긴다.

## 7. 베타 → 성장 전환 시 추가 체크 (사용자 30명 이상 시)

`CLAUDE.md` 운영 모드 표의 "성장" 단계로 넘어가면 본 문서의 체크박스 외 다음을 추가 준수:

- [ ] 방송 시작 시간대를 야간 21~24시로 고정 (영향 범위 축소).
- [ ] pg_cron 일간 알림으로 cat_behavior_events row 수 임계치 경고.
- [ ] Supabase Nano → Pro / Compute 상향 검토 (pool 15 → 60).
- [ ] cleanup 함수에 "같은 device 의 old live session 즉시 삭제" 조건 추가
      (`CLAUDE.md` 교훈 #8).

프로덕션 100+ 로 추가 전환 시 24/7 monitoring + on-call + 실시간 alert 도입은 별도 설계.

---

## 부록 A — 배지 툴팁 해석 치트시트

dev 배지 hover 시 툴팁 한 줄 포맷:

```
init=ready backend=webgpu regime=day-active retry=0 inferring=N p50=85ms p95=220ms
```

| 필드 | 의미 | 정상 범위 |
|------|------|----------|
| `init` | ONNX 초기화 상태 | `ready` 유지 |
| `backend` | 실제 실행 백엔드 | 기기별 §4 표 참조 |
| `regime` | scheduler 판정 | day-active / night / idle-throttled |
| `retry` | 누적 재시도 | 0 유지 |
| `inferring` | 진행 중 tick 여부 | 5초에 1번 Y→N 순간 |
| `p50` | 추론 지연 중앙값 | §5 표 참조 |
| `p95` | 추론 지연 95분위 | §5 표 참조 |

## 부록 B — Screen Wake Lock 준비 (R6 T9 연계)

방송폰 30분+ 장시간 테스트 시 화면 꺼짐으로 인한 WebRTC / driver throttle 방지:

- 베타 우회책: Android 개발자 옵션 → 시스템 → "화면 켜 두기" ON, iOS 는 설정 → 디스플레이 →
  자동 잠금 → "안 함" 일시 적용.
- 정식 반영: src/ 반영 PR 에서 `navigator.wakeLock.request("screen")` 호출 추가 (`CameraBroadcastClient`
  레벨). 체크리스트 §7.5 참조.

## 부록 C — 체크리스트 summary (20개 + 추가)

| 단계 | 항목 수 |
|------|---------|
| 0. 시작 전 | 7 |
| 1. 방송 시작 | 5 |
| 2. 30분 연속 | 5 |
| 3. 종료 | 5 |
| 6. 실패 시 로그 수집 | 7 |
| 7. 성장 전환 시 | 4 (조건부) |

**필수 22개 (§0~§3) + 실패 시 7개 + 성장 전환 시 4개.** 베타 단계에서는 §0~§3 의 22개가 기본.
(R7 D2: §0 commit ID 메모 1개 추가. R11 D3: §0 0-7 R12 PR commit ID + R2 CORS 마지막 확인 1개 추가.)
