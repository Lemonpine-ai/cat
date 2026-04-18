# Design System — 다보냥 (CATvisor)

> 이 문서는 다보냥의 단일 디자인 진실. UI 관련 모든 결정은 여기를 참조한다.
> 코드 작성·리뷰 시 이 문서와 일치하는지 확인. 불일치 = 버그.

---

## 1. Product Context

- **What**: 다보냥 — AI가 지켜주는 고양이 건강 모니터링 + 페르소나 기반 주간 일기장
- **For**: 출근하는 집사 / 아픈 고양이 보호자 / 초보 집사 / 중장년 1인 가구 / 임보 후 걱정하는 캣맘
- **Space**: 펫테크 + 헬스케어 + 커뮤니티 (슈퍼앱 지향)
- **Type**: 모바일 우선 Next.js 웹앱

### 다냥 생태계 (확장 로드맵)

| 서비스 | 역할 | 상태 |
|--------|------|------|
| **다보냥** | AI 건강 모니터링 + 페르소나 일기 | v1 (현재) |
| **다가온** | 입양 플랫폼 (캣맘 ↔ 입양자 브릿지) | v2 마케팅 유입용 |
| 다왔냥 | 집사 대행 / 방문 돌봄 | v3 확장 |
| 다샀냥 | 펫 커머스 | v3 확장 |

**다보냥 브랜드 한줄 정의:**
> "귀여운 감시자가 아니라, 같이 살아가는 가족."

---

## 2. Aesthetic Direction

- **Direction**: **Warm Minimal Korean** (토스 신뢰감 + 펫 브랜드 따뜻함)
- **Decoration level**: intentional (최소한의 장식, 감정은 카피와 아이콘으로)
- **Mood**: 신뢰할 수 있으면서 따뜻한. 병원 앱처럼 단정하지만 집사 마음에 닿는.
- **Emotional hook**: "혼자가 아니에요" — 아픈 고양이 보호자, 초보 집사의 외로움 해소

### Safe Choices (category baseline)

1. **민트 primary** — 펫 + 헬스 카테고리 공통 신뢰 신호
2. **rounded-2xl/3xl 카드** — 부드러운 모바일 UX 관례
3. **lucide-react 기능 아이콘** — 업계 표준 가독성

### Deliberate Risks (차별점)

1. **"오뮤다예쁨체" → Pretendard Variable 전면 교체**. 귀여움을 폰트에서 빼고 **카피·페르소나·아이콘**에서 표현. 의료 신뢰감 확보.
2. **고양이 이름만 Instrument Serif** — 데이터에 둘러싸인 이름을 **주인공으로 격상**. 경쟁사 중 아무도 안 함.
3. **페르소나 8종 시그니처 시스템** — AI가 우리 애 성격대로 일기 써줌. 이게 다보냥의 결정적 moat.

---

## 3. Typography

### Font Stack

| 역할 | 폰트 | 이유 |
|------|------|------|
| **Display / UI / Body** | `Pretendard Variable` | 한국 탑티어(토스/당근/카카오) 표준. 한글 가독성 + 따뜻한 곡선 |
| **Cat Name Accent** | `Instrument Serif` | 고양이 이름 강조용. 데이터 속 주인공 신호 |
| **Numbers / Data** | `Pretendard Variable + tabular-nums` | "3회 · 15:23" 정렬 보장 |
| **Code (개발자용)** | `JetBrains Mono` | (현재 미사용, 향후 개발자 도구용 예약) |

### Blacklist (사용 금지)

- "오뮤다예쁨체" 및 모든 손글씨 폰트 (body로 사용 금지, 로고 등 특수 용도에만 허용 검토)
- Inter, Roboto, Arial, Helvetica, Noto Sans KR (너무 범용 · 한국 제품 정체성 없음)

### Loading Strategy

- **Pretendard**: CDN (`cdn.jsdelivr.net/gh/orioncactus/pretendard`) 또는 self-host
- **Instrument Serif**: Google Fonts
- `font-display: swap` 필수. 폰트 로딩 실패 시 fallback은 `system-ui, sans-serif`

### Modular Scale

| 토큰 | 크기 | 용도 |
|------|------|------|
| `text-xs` | 12px | 타임스탬프, meta |
| `text-sm` | 14px | 캡션, 라벨 |
| `text-base` | 16px | body (기본) |
| `text-lg` | 18px | 강조 body |
| `text-xl` | 20px | 카드 타이틀 |
| `text-2xl` | 24px | 섹션 헤더 |
| `text-3xl` | 30px | hero 서브 |
| `text-4xl` | 36px | hero 메인 |

**Weight**: 400 (body) / 500 (medium) / 600 (semibold, 카드 타이틀) / 700 (bold, 강조)

---

## 4. Color

### Approach

**balanced** — primary + 경고 3단계 스펙트럼 + 페르소나 accent. 색은 **상태와 감정**을 의미로 쓴다.

### Primary Palette (기존 유지 + 확장)

```css
--mint-50:  #f1fbf9;  /* lightest bg */
--mint-100: #d6f5f1;
--mint-200: #a8ece6;
--mint-300: #7fe0d6;
--mint-400: #4fd1c5;  /* brand primary */
--mint-500: #38bdb0;  /* primary action */
--mint-600: #2aa89b;
--mint-700: #1e8f83;  /* strong text */
--mint-800: #146e66;
--mint-900: #0e5551;
```

### Warning Spectrum (3단계 신규)

건강 모니터링 앱에서 **단계적 경고**가 핵심. 현재 coral 단일 톤으로는 부족.

```css
--sage-400:    #a8d5ba;  /* 안심 — "편하게 쉬는 중" */
--butter-400:  #ffd699;  /* 주의 — "오래 안 먹었어요" */
--coral-400:   #ff8a65;  /* 경고 — "12시간 식사 0회" (현재 coral 진화) */
--alarm-500:   #ff5252;  /* 심각 — FGS 5+점 통증 감지 */
```

### Community Accent

```css
--lavender-400: #a29bfe;  /* 친구들 탭 — 차분한 대화 */
```

### Persona Accent Colors (8종)

일기장 카드 미묘한 accent. 메인 색상은 민트 고정, 페르소나별로 **border-left 색 + 뱃지**만 차별화.

```css
--persona-dodo:       #b497e7;  /* 도도 — 보라 (고귀함) */
--persona-haemak:     #ffd54f;  /* 해맑 — 노랑 (밝음) */
--persona-meokbo:     #ff9e80;  /* 먹보 — 살구 (따뜻한 식욕) */
--persona-explorer:   #81c784;  /* 탐험가 — 초록 (모험) */
--persona-scary:      #90caf9;  /* 겁쟁이 — 하늘 (여린) */
--persona-tsundere:   #b0bec5;  /* 츤데레 — 회색 (속마음) */
--persona-philosophy: #7986cb;  /* 철학자 — 남색 (사색) */
--persona-clingy:     #f48fb1;  /* 응석쟁이 — 핑크 (애교) */
```

### Semantic

```css
--color-bg:         #e0f7fa;    /* 앱 배경 (현재 유지) */
--color-surface:    rgba(255, 255, 255, 0.92);
--color-surface-solid: #ffffff;
--color-text:       #0d2b28;    /* 본문 */
--color-text-sub:   #3d6b65;    /* 보조 */
--color-text-muted: #94b8b3;    /* 비활성 */
--color-border:     rgba(79, 209, 197, 0.22);
--color-shadow:     rgba(79, 209, 197, 0.18);

/* 주간 일기장 전용 */
--diary-cream:      #fffaf0;
--diary-soft-pink:  #ffe4e1;
```

### Dark Mode (v2에서 구현)

v1은 light만. Dark는 v2 — 단순 invert 금지. 민트는 채도 -15%, 배경은 `#0f1f1d` 같은 딥민트 그린.

---

## 5. Spacing

- **Base unit**: 4px
- **Density**: comfortable (펫 앱은 여유로운 게 따뜻함)

```
space-1  = 4px
space-2  = 8px
space-3  = 12px
space-4  = 16px
space-5  = 20px
space-6  = 24px
space-8  = 32px  /* 카드 내부 핵심 여백 */
space-10 = 40px
space-12 = 48px
space-16 = 64px
```

---

## 6. Layout

- **Approach**: hybrid (홈/대시보드는 grid-disciplined, 일기장·커뮤니티는 editorial)
- **Max content width**: 1024px (모바일 우선이지만 PC 확장 대비)
- **Mobile**: 16px 좌우 여백
- **Card grid**: 1열(모바일) → 2열(태블릿 640+) → 3열(PC 1024+)

### Border Radius (Hierarchical)

```css
--radius-sm: 0.75rem;  /* 12px — 버튼, input */
--radius-md: 1.25rem;  /* 20px — 카드 */
--radius-lg: 1.5rem;   /* 24px — 큰 카드 */
--radius-xl: 2rem;     /* 32px — hero, 모달 */
--radius-full: 9999px; /* 아바타, 칩 */
```

### Shadow (부드러운 민트 기반 유지)

```css
--shadow-card:       0 8px 32px rgba(14, 85, 81, 0.06), 0 2px 12px rgba(0, 0, 0, 0.04);
--shadow-card-hover: 0 14px 40px rgba(14, 85, 81, 0.1), 0 4px 14px rgba(0, 0, 0, 0.06);
--shadow-header:     0 8px 32px rgba(79, 209, 197, 0.12);
```

### 탭 구조 (v1)

```
HOME (다보냥)  |  REPORTS  |  친구들  |  설정
                                ↑          ↑
                          질환/연령/지역  다냥 패밀리(티저)
                          3서브탭          + 프로필
```

**FRIENDS → "친구들"** (한국어 통일) · 질환별/연령별/지역별 3서브탭

---

## 7. Motion

- **Approach**: intentional (기능적 + 감정적)

### Easing

```css
--ease-enter: cubic-bezier(0.4, 0, 0.2, 1);   /* ease-out */
--ease-exit:  cubic-bezier(0.4, 0, 1, 1);     /* ease-in */
--ease-move:  cubic-bezier(0.4, 0, 0.2, 1);   /* ease-in-out */
```

### Duration

```
micro:   80ms    /* 호버, 포커스 */
short:   200ms   /* 버튼, 칩, tab 전환 */
medium:  320ms   /* 카드 등장, 모달 */
long:    560ms   /* 페이지 전환, hero */
```

### Signature Motions

- **꼬리 흔들기** (고양이 아이콘 hover 시 미묘한 꼬리 wave 애니메이션) — 브랜드 시그니처
- **카운트업** (숫자 변경 시 부드러운 tween) — 현재 `countBump` 유지
- **일기장 페이지 넘김** (주간 일기 탐색 시 책 페이지 느낌)
- **connection pulse** (카메라 LIVE 빨간 점)

---

## 8. Persona System (다보냥 시그니처)

**8종 페르소나**: 도도 · 해맑 · 먹보 · 탐험가 · 겁쟁이 · 츤데레 · 철학자 · 응석쟁이 · (기본)

### Design Representation

일기장·프로필·공유카드에서 페르소나를 시각화:

1. **Badge Chip** — 고양이 이름 옆 작은 칩 (`--persona-{key}` accent)
   - 예: `[🥺 응석쟁이]` 핑크 배경 + 화이트 텍스트
2. **Card Border Accent** — 일기 카드 `border-left: 4px solid var(--persona-{key})`
3. **Shared Card** — SNS 공유용 카드: 페르소나 색 + 고양이 이름 Serif + 시그니처 카피
4. **Persona Selector UI** — 고양이 등록 시 8개 + "성격 진단하기" 링크

### 확장 규칙 (미래)

- **지금**: 8종 그대로 유지
- **v1.5**: 행동 데이터 기반 "오늘의 기분" 자동 변조 (active / balanced / chill)
- **v2+**: 필요 시 "까칠이" 등 1-2종 추가 검토 (유저 요청 기반)

DB 스키마: `cats` 테이블에 `personality` + `personality_modifier` (예약) 컬럼.

---

## 9. Signature Components

### 9.1 Live Status Hero (홈 상단)

```
┌─────────────────────────────────────┐
│  😴 보리와 찹쌀이 편하게 쉬고 있어요  │
│     마지막 식사 3시간 전 · 이상 없음  │
│                                      │
│  ┌──────────┐  ┌──────────┐         │
│  │[LIVE]보리│  │[LIVE]찹쌀│         │
│  └──────────┘  └──────────┘         │
└─────────────────────────────────────┘
```

**Typography**:
- 메인 문구: Pretendard Medium 16px
- 고양이 이름 ("보리", "찹쌀이"): Instrument Serif 16px
- 서브 정보: Pretendard 13px · text-muted

**Color**: `--color-surface` 배경 + `--mint-400` accent

### 9.2 Weekly Diary Card

페르소나별 accent border + 사진 중심 + 이번주 하이라이트

```
┌──────────────────────────────────────┐
│ ║ 🌸 아롱이의 3월 넷째 주              │  (border-left = persona color)
│ ║                                     │
│ ║ [큰 사진 — AI 선택 베스트샷]         │
│ ║                                     │
│ ║ "이번주 아롱이는 잘 지냈어요 😊"     │
│ ║                                     │
│ ║ 🍚 14회  💧 21회  💤 76h  🏃 활발    │
│ ║                                     │
│ ║ 💭 하이라이트                        │
│ ║ "수요일 오후에 창밖을 오래 바라봤어요"│
│ ║                                     │
│ ║ [💌 캣맘님께 보내기]                 │
└──────────────────────────────────────┘
```

**Typography**:
- 제목: Instrument Serif Regular 24px (고양이 이름 + "~의 N주")
- 본문: Pretendard Regular 16px
- 숫자: Pretendard Semibold tabular-nums 18px

### 9.3 Care Log Card (현재 개선)

**Before**:
```
밥 먹기
0회
밥 훔쳤어!
```

**After (감성형 통일)**:
```
밥 먹기
아직 식사 전이에요 🍚
오늘 첫 끼를 기다리는 중
```

톤 규칙:
- 메인 문구 = **상태 감정** (긍정/중립/안심)
- 서브 문구 = **구체 맥락** (선택)
- 숫자는 메인 아님 (서브로 내림)

### 9.4 Camera Slot

- `object-contain` 유지 (zone overlay 호환)
- 우상단 기어 아이콘 = 설정 (삭제가 아님)
- "● 방송 중" → "**● 지켜보는 중**" 또는 "**● LIVE**"
- 기기명 사용자 커스텀 허용 ("거실 카메라" 등), 모델명은 회색 meta

### 9.5 Pairing Screen

4자리 코드 + QR 동시 표시. 5분 카운트다운 실시간.

```
┌──────────────────────┐
│   페어링 코드         │
│                       │
│   [3] [8] [0] [2]     │  (숫자 박스 분리)
│                       │
│   ⏱ 04:58 남음        │
│                       │
│   [QR 코드]           │
│   daboxnyang.com      │
└──────────────────────┘
```

---

## 10. Iconography

- **기능 아이콘**: lucide-react (표준)
- **페르소나 이모지**: 성격별 1개씩 지정 (`💎 ☀️ 🍽 🗺 🙈 😤 🤔 🥺`)
- **상태 이모지**: 최소 사용 (남발 금지). 🍚 💧 💤 🏃 🌸 💌 💭 정도만 승인
- **브랜드 시그니처**: 고양이 실루엣 커스텀 아이콘 (꼬리 흔들기 애니메이션)

---

## 11. Voice & Tone

### Voice Principles

1. **"우리 아이"** 주어 사용 — 다보냥이 집사·고양이를 가족으로 대함
2. **감정 먼저, 숫자 나중** — "편하게 쉬는 중 😴" > "활동량 12%"
3. **혼자가 아니에요** — 외로움 해소가 핵심 hook
4. **의인화 일관** — 고양이가 말하는 어투 (페르소나별 차별화)

### Copy Rules

| 규칙 | 예시 |
|------|------|
| 한영 혼용 금지 | "RECENT ALERTS" → "**오늘 있었던 일**" |
| 섹션 톤 통일 | "오늘의 돌봄" · "우리집 실시간" · "오늘 있었던 일" |
| 이모지 1개 원칙 | 문장당 이모지 최대 1개 (남발 금지) |
| 긴급 알림은 명료하게 | "⚠️ 보리가 12시간 동안 식사하지 않았어요" (이모지+사실) |

---

## 12. Accessibility

- **Color contrast**: WCAG AA 이상 (`--color-text` on `--color-bg` = 4.5+ 확보)
- **Focus ring**: `outline: 2px solid var(--mint-500); outline-offset: 2px;`
- **aria-live**: 페르소나 일기 생성, 연결 상태 변경 시 screen reader 안내
- **Tap target**: 최소 44×44px (모바일 터치 안전)
- **Keyboard nav**: 모든 interactive 요소 tab 이동 가능

---

## 13. Do / Don't

### ✅ Do

- 고양이 이름 돋보이게 (`Instrument Serif`)
- 경고는 3단계 스펙트럼으로 (sage → butter → coral → alarm)
- 페르소나 일관성 유지 (해맑이는 끝까지 해맑)
- 한국어 통일
- 여백 충분히 (comfortable density)

### ❌ Don't

- 손글씨 폰트를 body에 사용
- coral 하나로 모든 경고 표시
- 이모지 남발 (한 문장에 3개 이상)
- 영어 UI 라벨 ("RECENT ALERTS")
- "방송" 단어 사용 (프라이버시 브랜드와 충돌)
- 기능 아이콘과 브랜드 아이콘 혼용 (lucide + 커스텀 실루엣 구분)
- 디자인에서 AI 슬롭 패턴 (보라 그라데이션, 3열 icon-in-circle 그리드, 중앙 정렬 일색)

---

## 14. Migration Plan (현재 → 목표)

| 항목 | Before | After | 우선순위 |
|------|--------|-------|----------|
| Font family | 오뮤다예쁨체 단일 | Pretendard + Instrument Serif | 🔴 v1 필수 |
| 경고 컬러 | coral 단일 | 4단계 스펙트럼 | 🟡 v1 |
| 홈 hero | 고양이 아이콘 5마리 | AI 상태 요약 + 영상 | 🟡 v1 |
| Care 카드 "0회" | 수치형 | 감성형 통일 | 🟡 v1 |
| FRIENDS 탭 | 영어 라벨 | "친구들" + 3서브탭 | 🟢 v1.5 |
| 주간 일기장 UI | 없음 | 페르소나 accent 카드 | 🟢 v1.5 |
| Dark mode | 없음 | 전체 재설계 | ⚪ v2 |

---

## 15. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-17 | 손글씨 body 폐지, Pretendard 전면 채택 | 건강 모니터링 앱 신뢰감 확보. 귀여움은 카피·페르소나로 이동 |
| 2026-04-17 | 고양이 이름 Instrument Serif accent | 데이터 속 주인공 강조 — 경쟁사 차별점 |
| 2026-04-17 | 경고 4단계 스펙트럼 도입 | coral 단일은 FGS/질환 알림에 부족 |
| 2026-04-17 | 페르소나 8종 유지 (확장 안 함) | Miller 법칙 경계선 + 유지보수 + 학술 Feline Five 근거 |
| 2026-04-17 | 다냥 생태계 아키텍처 채택 | 다보냥·다가온·다왔냥·다샀냥 공통 DS 설계 대비 |
| 2026-04-17 | FRIENDS 탭 유지 (v1) | 질환/연령 커뮤니티는 리텐션 핵심 |
| 2026-04-17 | "방송 중" → "지켜보는 중" | 프라이버시 브랜드 정렬 |
