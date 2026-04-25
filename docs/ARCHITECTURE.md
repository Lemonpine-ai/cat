# CATvisor(다보냥) — FGS AI + 힐링 다이어리 + 커뮤니티 설계 문서

> 최종 수정: 2026-04-11  
> 초판 확정: 2026-04-08  
> 작성: Arch 에이전트

---

## 목차

1. [개요](#1-개요)
2. [FGS AI 파이프라인](#2-fgs-ai-파이프라인)
3. [힐링 다이어리 고도화](#3-힐링-다이어리-고도화)
4. [커뮤니티 페이지](#4-커뮤니티-페이지)
5. [다이어리(리포트) 페이지](#5-다이어리리포트-페이지)
6. [DB 스키마](#6-db-스키마)
7. [API 라우트](#7-api-라우트)
8. [컴포넌트 구조](#8-컴포넌트-구조)
9. [기술 규칙](#9-기술-규칙)

---

## 1. 개요

CATvisor(다보냥)는 **FGS AI 통증 감지 + 힐링 다이어리**를 핵심으로 한 고양이 건강 모니터링 앱이다.

### 1.1 핵심 가치

- **FGS AI**: 펫캠으로 고양이 표정을 자동 분석하여 통증 징후를 조기 감지
- **힐링 다이어리**: AI 자동 기록을 고양이 시점 귀여운 멘트로 변환 → 매일 앱을 열게 만드는 습관 루프
- **이중 퍼널**: 다이어리 퍼널(매일 습관) + 알림 퍼널(FGS 이상 감지 시 즉시 알림)

### 1.2 MVP 범위 (1단계, 2-3주)

| 기능 | 설명 |
|------|------|
| FGS AI 분석 | Claude Vision API로 고양이 얼굴 사진을 보고 FGS 0-4 점수 산출 (별도 학습 없이 바로 사용) |
| 힐링 다이어리 고도화 | FGS 점수가 다이어리 멘트에 자연스럽게 반영 |
| 데이터 수집 자동화 | 커스텀 모델 전환용 프레임+점수 자동 축적 |
| FGS 트렌드 | 일일 평균, 7일 추이 차트 |
| 이상 알림 | FGS 2일 연속 2+ 시 푸시 알림 (MVP: 앱 내 알림) |

### 1.3 기술 스택

Next.js 16 (App Router) + React 19 + TypeScript / Supabase (DB, Auth, Storage, Realtime) / Tailwind CSS + CSS Modules / lucide-react / Claude Vision API (Anthropic SDK)

---

## 2. FGS AI 파이프라인

### 2.1 Feline Grimace Scale (FGS) 개요

FGS는 고양이 얼굴의 5가지 지표로 통증을 측정하는 수의학 표준 도구다.

| Action Unit | 지표 | 설명 |
|-------------|------|------|
| `ear` | 귀 위치 | 뒤로 젖혀지거나 옆으로 벌어짐 |
| `eye` | 눈 찡그림 | 눈을 가늘게 뜸, 눈꺼풀 긴장 |
| `muzzle` | 코·볼 변화 | 볼 부풀림, 코 주름 |
| `whisker` | 수염 긴장 | 수염이 앞으로 곧게 섬 |
| `head` | 머리 위치 | 머리를 아래로 숙임 |

**점수 체계 (5단계 단순화):**

| 점수 | 의미 | 다이어리 반영 |
|------|------|---------------|
| 0 | 정상 | "오늘도 기분 좋다옹 😺" |
| 1 | 경미 | "살짝 피곤하다옹~ 😌" |
| 2 | 주의 | "좀 불편하다옹... 😿" |
| 3 | 경고 | "나 좀 아프다옹... 집사야 봐줘 🏥" |
| 4 | 심각 | "많이 아프다옹... 병원 가야 해 🚨" |

### 2.2 추론 아키텍처 (MVP: 클라우드)

```
펫캠 → WebRTC → 폰(클라이언트)
  │
  ├─ Frame Sampler: 5분당 1프레임 추출
  │   (야간 22시-6시: 30분 간격)
  │   (고양이 움직임 없으면 스킵)
  │
  ├─ 로컬 프리필터: 고양이 얼굴 감지된 프레임만 전송
  │   (빈 프레임, 뒷모습 제외 → API 호출 50% 절감)
  │
  └─→ 서버 (API Route)
        │
        ├─ FGS Scorer: Claude Vision API zero-shot
        │   - system prompt: FGS 5지표 설명 + 레퍼런스
        │   - 응답: { fgs_score: 0-4, confidence: 0-1, au_scores: {...} }
        │
        ├─ Data Collector: fgs_frames 테이블에 저장
        │
        ├─ Score Aggregator: 일일 평균, 7일 트렌드 계산
        │
        └─ Alert Dispatcher: FGS 2일 연속 2+ → 알림
```

### 2.3 FGS 분석 프롬프트 구조

Claude에게 보내는 메시지 구조:

```
[시스템 지시문] FGS 기준 설명 + 5가지 지표 판단 기준
[사용자 입력]   고양이 얼굴 사진 (이미지 데이터)
[AI 응답]       { 점수(0-4), 확신도(0-1), 지표별 점수, 판단 근거 }
```

- 확신도 0.7 미만(= AI가 70% 미만으로 확신) → "측정 불가" 상태, 알림 억제
- MVP에서는 고양이 1마리 가정 (다묘 가정은 Phase 2)

### 2.4 엣지케이스 대응

| 상황 | 대응 |
|------|------|
| 카메라 미연결 | FGS 관련 UI 숨김, 다이어리 기존 기능만 표시 |
| Vision API 타임아웃/에러 | 15초 타임아웃, 실패 시 1회 재시도 후 스킵 (에러 로그만 기록) |
| 확신도 0.7 미만 | "측정 불가" 표시, 알림 억제, fgs_frames에는 저장 (학습 데이터용) |
| 어두운 환경 | lighting='low' 태그, 확신도 자연히 낮아져서 자동 필터링 |
| 하루 측정 0건 | fgs_daily_summary 생성 안 함, 트렌드 차트에서 빈칸 표시 |
| Storage 용량 근접 | 90일 이상 오래된 프레임 자동 정리 (Supabase cron or 수동) |

### 2.4 비용 절감 전략

| 전략 | 절감율 | 설명 |
|------|--------|------|
| 스마트 샘플링 | 60-70% | 움직임 감지 시에만 호출 |
| 야간 정지 | 추가 절감 | 22시-6시 30분 간격 |
| 로컬 프리필터 | 50% | 고양이 얼굴 감지 프레임만 전송 |
| 배치 처리 | 추가 절감 | 1시간 단위 배치 (실시간 X) |

예상 비용: 베타 5명 ~1-2만원/월, 20명 ~6만원/월

### 2.5 데이터 수집 흐름

MVP부터 커스텀 모델 학습용 데이터를 자동 축적한다.

```
1. 5분마다 프레임 추출 → Vision API FGS 점수 → fgs_frames 저장
2. FGS 2+ 시 유저에게 "이 표정이 불편해 보이나요?" → user_feedback 저장
3. "지금 표정 체크" 버튼 → source='manual'로 저장
4. 동물병원 방문 후 "진료 결과 입력" → 실제 진단과 FGS 매칭 (gold label)
```

### 2.6 프라이버시 정책

| 항목 | 내용 |
|------|------|
| 동의 화면 | "고양이 사진이 AI 개선에 활용됩니다. 사람 얼굴은 저장하지 않습니다." |
| 옵트아웃 | 데이터 수집 거부 가능. 거부 시 fgs_frames 저장 안 함 (FGS 점수만 기록) |
| 크롭 저장 | 고양이 얼굴만 크롭, 배경 제거 후 저장 |

**컴포넌트:** `src/components/fgs/FgsConsentModal.tsx` — 최초 1회 동의 모달

### 2.7 Phase 2 온디바이스 AI 전환 (MVP 후 3-4주)

> 라이선스: 모든 모델 MIT/Apache — 소스 공개 의무 없음, 상업 이용 자유

#### 2.7.1 모델 구성 (3단계 파이프라인)

```
사진 입력
    ↓
┌─ YOLOv7-tiny (고양이 얼굴 검출) ──────────┐
│   MIT 라이선스 / ~6MB / 5ms                 │
│   학습 데이터: Roboflow Cat Face 8,153장    │
└─────────────────────────────────────────────┘
    ↓ 크롭된 얼굴
┌─ MobileNetV3-Small (공유 백본) ─────────────┐
│   MIT 라이선스 / ~2.5MB / 3ms               │
│                                              │
│   ┌── Head A: 임베딩 (128차원 벡터) ───┐    │
│   │   → 개체 식별 (나비? 모모?)         │    │
│   │   ImageNet 사전학습 특성 활용        │    │
│   │   추가 학습 불필요                   │    │
│   └─────────────────────────────────────┘    │
│                                              │
│   ┌── Head B: 분류 (FGS 0~4) ──────────┐    │
│   │   → 통증 점수                       │    │
│   │   학습: Cat Emotions → FGS 매핑      │    │
│   │   + MVP 수집 user_feedback 데이터    │    │
│   └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
    ↓
일기에 기록: "나비 / FGS 1 / 정상"
```

#### 2.7.2 개체 식별 (Cat ID) 작동 방식

- ImageNet 사전학습된 MobileNetV3-Small의 특성을 128차원 임베딩으로 압축
- **추가 학습 없이** 사전학습 특성 그대로 활용 (색상, 텍스처, 형태 구분 가능)
- 사용자가 고양이 등록 시 사진 3~5장 촬영 → 임베딩 벡터 저장
- 이후 새 사진 → 임베딩 추출 → 등록된 벡터와 코사인 유사도 비교
- **새 고양이 추가 시 재학습 불필요** (FaceID와 동일 원리)
- 가정 내 2~5마리 수준은 시각 차이만으로 충분히 구분 가능
- 매칭 실패 시 → "새 고양이를 등록할까요?" UI 표시

#### 2.7.3 모델 스펙 요약

| 모델 | 역할 | 크기 | 속도 | 라이선스 |
|------|------|---:|---:|------|
| YOLOv7-tiny | 얼굴 검출 | 6MB | 5ms | MIT |
| MobileNetV3-Small | 개체 식별 + 통증 분석 | 2.5MB | 3ms | MIT |
| **합계** | | **~9MB** | **~8ms** | **전부 무료** |

- 배포 형식: ONNX (브라우저/서버) 또는 TFLite (모바일)
- 학습 환경: Google Colab 무료 (T4 GPU, ~2시간)
- 학습 데이터: Roboflow 공개 데이터셋 (라벨링 불필요)
- MVP 수집 user_feedback 500건+ 쌓이면 자체 데이터로 재학습 → 정확도 향상

#### 2.7.4 Phase 2 전환 시 변경점

| 항목 | MVP (Phase 1) | Phase 2 |
|------|---------------|---------|
| FGS 추론 | Claude Vision API | MobileNetV3-Small (온디바이스) |
| 개체 식별 | MVP: 1마리 가정 | MobileNetV3-Small 임베딩 |
| 얼굴 검출 | 없음 (전체 사진 전송) | YOLOv7-tiny (로컬 크롭) |
| 비용 | API 호출당 과금 | **$0 (온디바이스)** |
| 속도 | 3~5초 | **~8ms** |
| 오프라인 | 불가 | **가능** |

---

## 3. 힐링 다이어리 고도화

### 3.1 FGS 점수 반영

기존 `care_type` 기반 멘트에 FGS 점수가 자연스럽게 녹아든다.

| FGS 범위 | 다이어리 톤 | 예시 |
|----------|------------|------|
| 0-1 | 밝고 귀여움 | "오늘도 기분 좋다옹 😺" |
| 2 | 살짝 걱정 | "좀 피곤하다옹... 😿" |
| 3+ | 알림 트리거 | "나 좀 불편하다옹... 집사야 봐줘 🏥" |

### 3.2 다이어리 신규 요소

| 요소 | 설명 |
|------|------|
| FGS 일일 요약 카드 | 오늘 평균 FGS + 최근 표정 사진 |
| 7일 FGS 트렌드 차트 | Recharts 꺾은선 그래프 |
| "지금 표정 체크" 버튼 | 유저가 수동으로 FGS 측정 요청 |
| 유저 보정 UI | FGS 2+ 시 "이 표정이 불편해 보이나요?" 피드백 수집 |

### 3.3 이중 퍼널

```
[다이어리 퍼널]
  매일 오전 → "어제의 냥이 일기" 알림 → 앱 오픈 → 다이어리 확인

[알림 퍼널]
  FGS 2일 연속 2+ 감지 → 즉시 알림
  → "통증 징후 2일째 감지, 수의 상담 권장"
  → MVP: 앱 내 알림까지만. 수의 상담 연결은 Phase 2.
```

---

## 4. 커뮤니티 페이지

### 4.1 카테고리 (4개)

| 키 | 이름 | 설명 |
|---|---|---|
| `brag` | 자랑하기 | 귀여운 순간 사진/영상 공유 |
| `kitten` | 아기냥 | 새끼 고양이 육아 정보 |
| `senior` | 노령묘 | 노묘 케어 노하우 |
| `health` | 건강/질병 | 증상 공유, 병원 추천 |

### 4.2 기능 범위

| 기능 | 설명 | 비고 |
|---|---|---|
| 글쓰기 | 제목 + 본문 + 이미지(선택) + 카테고리 | 로그인 사용자만 |
| 글 수정/삭제 | 본인 글만 | |
| 댓글 | 1단 댓글만 (대댓글 없음) | |
| 댓글 수정/삭제 | 본인 댓글만 | |
| 좋아요 | 글 단위 토글 | 중복 좋아요 불가 |
| 프로필 공개 | 닉네임 + 아바타 표시 | profiles 테이블 활용 |
| 신고/차단 | **다음 버전으로 연기** | |

### 4.3 화면 흐름

```
커뮤니티 탭
  │
  ├─ 카테고리 선택 (4개 카드)
  │     │
  │     └─ 글 목록 (무한스크롤 or 페이지네이션)
  │           │
  │           └─ 글 상세 + 댓글 목록
  │                 │
  │                 ├─ 댓글 입력
  │                 └─ 좋아요 토글
  │
  └─ FAB(글쓰기 버튼) → 글 작성 화면
        │
        ├─ 카테고리 선택
        ├─ 제목 입력
        ├─ 본문 입력
        └─ 이미지 첨부 (선택)
```

---

## 5. 다이어리(리포트) 페이지

### 5.1 컨셉

모니터링 대시보드가 아닌 **힐링/귀여운 느낌**의 다이어리.  
고양이 시점의 말투로 상태를 전달한다.

### 5.2 화면 구성

```
다이어리 탭
  │
  ├─ 상단: 고양이 프로필 아이콘 목록
  │     └─ 탭하면 해당 냥이 다이어리로 전환
  │
  ├─ [NEW] FGS 경고 배너 (FGS 2일 연속 2+ 일 때만 표시)
  │
  ├─ 오늘의 냥이
  │     ├─ 큰 사진
  │     └─ 현재 상태 + 귀여운 멘트 (FGS 점수 반영)
  │
  ├─ [NEW] FGS 일일 요약 카드
  │     ├─ 오늘 평균 FGS 점수 + 최근 표정 사진
  │     └─ "지금 표정 체크" 버튼
  │
  ├─ [NEW] 7일 FGS 트렌드 차트 (꺾은선 그래프)
  │
  ├─ 이번 주 하이라이트
  │     └─ 활동 통계 카드 (식사·물·화장실·약 횟수)
  │
  ├─ 귀여운 영상 포착
  │     └─ cat_logs 최근 AI 감지 영상/사진 카드
  │
  └─ 집사 일기장
        └─ 짧은 메모 입력 (200자 제한)
```

> 카메라 미연결 시 [NEW] 표시된 FGS 요소들은 자동 숨김. 기존 다이어리 기능만 표시.

### 5.3 귀여운 멘트 자동생성 규칙

활동 유형(`cat_care_logs.care_type`)에 따라 고양이 시점 멘트를 자동 표시한다.

| care_type | 멘트 |
|---|---|
| `meal` | "오늘도 배빵빵하게 식사했다옹 🍚" |
| `medicine` | "약도 잘 먹는 착한 냥이다옹 💊" |
| `water` | "신선한 물 마시는 중이다옹 💧" |
| `litter` | "화장실 깨끗해서 기분 좋다옹 ✨" |
| `sleep` | "지금은 꿀잠 자는 중이다옹 😴" |
| `zoomies` | "우다다 타임이다옹!! 🏃" |

> 멘트는 클라이언트 컴포넌트에서 `care_type` → 멘트 매핑 객체로 관리한다.

---

## 6. DB 스키마

### 6.1 기존 테이블 (변경 없이 활용)

| 테이블 | 용도 |
|---|---|
| `profiles` | 사용자 프로필 (닉네임, 아바타, home_id) |
| `cats` | 고양이 정보 (이름, 품종, 사진, 상태) |
| `cat_care_logs` | 돌봄 기록 (식사, 물, 약 등) |
| `cat_logs` | AI 감지 활동 로그 (영상/사진 경로) |

### 6.2 신규 테이블 — FGS 데이터 수집

#### `fgs_frames` — 고양이 표정 사진 + AI 점수 저장 (나중에 자체 AI 학습에 사용)

```sql
CREATE TABLE fgs_frames (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id      UUID NOT NULL REFERENCES cats(id),
  home_id     UUID NOT NULL,
  frame_url   TEXT NOT NULL,           -- Supabase Storage 경로 (크롭된 고양이 얼굴)
  fgs_score   SMALLINT NOT NULL,       -- 0-4 (Vision API 산출)
  confidence  REAL NOT NULL,           -- Vision API confidence (0.0-1.0)
  au_scores   JSONB,                   -- 5개 Action Unit 개별 점수 {"ear":0,"eye":1,"muzzle":0,"whisker":1,"head":0}
  source      TEXT DEFAULT 'auto',     -- 'auto'(자동 캡처) / 'manual'(유저 "지금 표정 체크")
  user_feedback SMALLINT,             -- 유저 보정 점수 (NULL이면 미보정)
  lighting    TEXT,                    -- 'good' / 'low' / 'backlit' (Vision API 자동 감지)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: 모델 학습 시 레이블별 샘플링
CREATE INDEX idx_fgs_frames_score ON fgs_frames(fgs_score);
CREATE INDEX idx_fgs_frames_cat ON fgs_frames(cat_id, created_at DESC);
CREATE INDEX idx_fgs_frames_feedback ON fgs_frames(user_feedback) WHERE user_feedback IS NOT NULL;
```

#### `fgs_daily_summary` — 하루 단위 FGS 평균 점수 (7일 추이 차트용)

```sql
CREATE TABLE fgs_daily_summary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id      UUID NOT NULL REFERENCES cats(id),
  home_id     UUID NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  avg_score   REAL NOT NULL,           -- 일일 평균 FGS
  max_score   SMALLINT NOT NULL,       -- 일일 최고 FGS
  frame_count INT NOT NULL DEFAULT 0,  -- 측정 횟수
  alert_sent  BOOLEAN DEFAULT false,   -- 알림 발송 여부
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cat_id, date)
);

-- 인덱스: 7일 트렌드 조회
CREATE INDEX idx_fgs_daily_cat_date ON fgs_daily_summary(cat_id, date DESC);
```

#### RLS 정책 (FGS 테이블)

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `fgs_frames` | home_id 일치 | 서버만 (service_role) | user_feedback만 본인 | — |
| `fgs_daily_summary` | home_id 일치 | 서버만 (service_role) | 서버만 (service_role) | — |

> API Route에서 관리자 권한 키(service_role)로 데이터 저장. 일반 사용자(클라이언트)는 본인 집 데이터 조회만 가능.

### 6.3 신규 테이블 — 커뮤니티 & 다이어리

#### `community_posts` — 커뮤니티 게시글

```sql
CREATE TABLE community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  category    TEXT NOT NULL CHECK (category IN ('brag', 'kitten', 'senior', 'health')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  image_url   TEXT,
  like_count  INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_community_posts_category ON community_posts(category, created_at DESC);
CREATE INDEX idx_community_posts_author ON community_posts(author_id);
```

#### `community_comments` — 댓글 (1단만)

```sql
CREATE TABLE community_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_community_comments_post ON community_comments(post_id, created_at ASC);
```

#### `community_likes` — 좋아요 (유저당 게시글 1회)

```sql
CREATE TABLE community_likes (
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
```

#### `cat_diary` — 집사 일기장

```sql
CREATE TABLE cat_diary (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     UUID NOT NULL,  -- profiles.home_id와 동일 값 (homes 테이블 미존재로 FK 미설정)
  author_id   UUID NOT NULL REFERENCES auth.users(id),
  cat_id      UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) <= 200),
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: 고양이별 날짜순 조회
CREATE INDEX idx_cat_diary_cat_date ON cat_diary(cat_id, date DESC);
```

### 6.4 RLS 정책 요약 (커뮤니티 & 다이어리)

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `community_posts` | 모든 로그인 유저 | 로그인 유저 | 본인만 | 본인만 |
| `community_comments` | 모든 로그인 유저 | 로그인 유저 | 본인만 | 본인만 |
| `community_likes` | 모든 로그인 유저 | 로그인 유저 | — | 본인만 |
| `cat_diary` | 본인만 | 로그인 유저 | 본인만 | 본인만 |

---

## 7. API 라우트

### 7.1 FGS 분석 API

```
POST /api/fgs/analyze
```

**인증:** 필수. Supabase Auth 세션 토큰 검증 → 미인증 시 401 반환.

| 필드 | 타입 | 설명 |
|------|------|------|
| `cat_id` | UUID | 고양이 ID |
| `home_id` | UUID | 홈 ID |
| `frame` | base64 string | 고양이 얼굴 이미지 **(최대 5MB)** |
| `source` | 'auto' \| 'manual' | 자동 캡처 or 수동 체크 |

**처리 흐름:**
1. **세션 검증** — 로그인 유저인지 확인, home_id 일치 확인
2. **이미지 크기 검증** — 5MB 초과 시 413 반환
3. base64 이미지 → Supabase Storage 업로드 (크롭 저장)
4. Claude Vision API 호출 (15초 타임아웃) → FGS 점수 산출
5. `fgs_frames` 테이블에 저장
6. `fgs_daily_summary` 업서트 (일일 평균 재계산)
7. FGS 2+ 이고 전날도 2+ → 알림 트리거

**응답:**
```json
{
  "fgs_score": 1,
  "confidence": 0.85,
  "au_scores": { "ear": 0, "eye": 1, "muzzle": 0, "whisker": 0, "head": 0 },
  "reasoning": "눈을 살짝 찡그리고 있지만 나머지 지표는 정상"
}
```

### 7.2 FGS 유저 피드백 API

```
PATCH /api/fgs/feedback
```

**인증:** 필수. 본인 home_id의 프레임만 수정 가능.

| 필드 | 타입 | 설명 |
|------|------|------|
| `frame_id` | UUID | fgs_frames.id |
| `user_feedback` | 0-4 | 유저가 보정한 점수 |

### 7.3 FGS 트렌드 조회

트렌드는 별도 API Route 없이 **클라이언트에서 Supabase 직접 조회**.

```ts
// 클라이언트에서 직접 SELECT (RLS: home_id 일치 시 허용)
supabase
  .from('fgs_daily_summary')
  .select('*')
  .eq('cat_id', catId)
  .order('date', { ascending: false })
  .limit(7);
```

---

## 8. 컴포넌트 구조

### 8.1 FGS AI 컴포넌트

```
src/app/api/fgs/
├── analyze/
│   └── route.ts                      # POST: Vision API 호출 + 점수 저장 (service_role 사용)
└── feedback/
    └── route.ts                      # PATCH: 유저 보정 점수 저장

src/components/fgs/
├── FgsDailySummaryCard.tsx           # 오늘 FGS 요약 (평균 점수 + 최근 표정 사진)
├── FgsTrendChart.tsx                 # 7일 FGS 꺾은선 그래프 (Recharts)
├── FgsScoreIndicator.tsx             # FGS 점수 아이콘+색상 표시 (0-4)
├── FgsManualCheckButton.tsx          # "지금 표정 체크" 버튼
├── FgsFeedbackModal.tsx              # "이 표정이 불편해 보이나요?" 피드백 모달
├── FgsAlertBanner.tsx                # FGS 2일 연속 2+ 경고 배너
└── FgsConsentModal.tsx               # 프라이버시 동의 모달 (최초 1회)

src/lib/fgs/                          # ⚠️ 서버 전용 (API Route에서만 import)
├── fgsPrompt.ts                      # Vision API system prompt (FGS 레퍼런스)
├── fgsScorer.ts                      # Claude Vision API 호출 로직 (@anthropic-ai/sdk 사용)
├── fgsAggregator.ts                  # 일일 평균 계산 + summary 업서트 (service_role 사용)
└── fgsMentMap.ts                     # FGS 점수 → 다이어리 멘트 매핑 (클라이언트에서도 사용 가능)
```

### 8.2 프레임 샘플러 (클라이언트 전용)

```
src/lib/fgs-client/                   # ⚠️ 클라이언트 전용 (브라우저에서만 실행)
└── frameSampler.ts                   # WebRTC 스트림에서 프레임 추출 + 서버 전송
```

- 5분 간격 (야간 30분)
- 움직임 감지: 이전 프레임과 픽셀 차이 비교, 임계값 미만이면 스킵
- 고양이 얼굴 감지된 프레임만 전송
- `fetch('/api/fgs/analyze', { body })` 로 서버에 전송

### 8.3 타입 정의

```
src/types/fgs.ts
```

```typescript
/* FGS Action Unit 개별 점수 */
export type FgsAuScores = {
  ear: number;      // 0-4
  eye: number;
  muzzle: number;
  whisker: number;
  head: number;
};

/* fgs_frames 테이블 행 */
export type FgsFrameRow = {
  id: string;
  cat_id: string;
  home_id: string;
  frame_url: string;
  fgs_score: number;       // 0-4
  confidence: number;       // 0.0-1.0
  au_scores: FgsAuScores | null;
  source: 'auto' | 'manual';
  user_feedback: number | null;
  lighting: 'good' | 'low' | 'backlit' | null;
  created_at: string;
};

/* fgs_daily_summary 테이블 행 */
export type FgsDailySummaryRow = {
  id: string;
  cat_id: string;
  home_id: string;
  date: string;
  avg_score: number;
  max_score: number;
  frame_count: number;
  alert_sent: boolean;
  created_at: string;
};

/* Vision API 응답 */
export type FgsAnalysisResult = {
  fgs_score: number;
  confidence: number;
  au_scores: FgsAuScores;
  reasoning: string;
};
```

### 8.4 커뮤니티 페이지

```
src/app/(shell)/community/
├── page.tsx                          # 서버 컴포넌트: 카테고리 목록 (page.tsx가 카테고리 그리드를 직접 렌더링)
├── [category]/
│   ├── page.tsx                      # 서버 컴포넌트: 글 목록 fetch
│   └── [postId]/
│       └── page.tsx                  # 서버 컴포넌트: 글 상세 + 댓글 fetch
└── write/
    └── page.tsx                      # 글 작성 페이지

src/components/community/
├── CategoryCard.tsx                  # 카테고리 카드 (클라이언트)
├── PostListItem.tsx                  # 글 목록 한 줄 (클라이언트)
├── PostList.tsx                      # 글 목록 컨테이너 (클라이언트)
├── PostDetail.tsx                    # 글 상세 — 읽기 전용 표시 (클라이언트)
├── PostEditForm.tsx                  # 글 수정 모드 UI (클라이언트)
├── CommentList.tsx                   # 댓글 목록 컨테이너 (클라이언트)
├── CommentItem.tsx                   # 개별 댓글 아이템 (클라이언트)
├── CommentInput.tsx                  # 댓글 입력 (클라이언트)
├── LikeButton.tsx                    # 좋아요 토글 (클라이언트)
├── PostWriteForm.tsx                 # 글 작성 폼 (클라이언트)
└── FloatingWriteButton.tsx           # FAB 글쓰기 버튼 (클라이언트)
```

### 8.5 다이어리(리포트) 페이지

```
src/app/(shell)/reports/
└── page.tsx                          # 서버 컴포넌트: 고양이 목록 + 오늘 데이터 fetch

src/components/diary/
├── CatProfileSelector.tsx            # 상단 고양이 프로필 아이콘 목록 (클라이언트)
├── TodayCatCard.tsx                  # 오늘의 냥이: 큰 사진 + 상태 + 멘트 (클라이언트)
├── WeeklyHighlightCards.tsx          # 이번 주 하이라이트 카드 (클라이언트)
├── CuteActivityCapture.tsx           # 귀여운 영상 포착 카드 (클라이언트)
├── DiaryMemoInput.tsx                # 집사 일기장 입력 (클라이언트)
└── cuteMentMap.ts                    # care_type → 귀여운 멘트 매핑 객체
```

### 8.5.1 Daily Diary (타임라인 일기) 컴포넌트

힐링 다이어리에 날짜별 돌봄 타임라인을 제공하는 하위 컴포넌트 그룹.

```
src/features/diary/components/
├── DiaryHeader.tsx                   # 일기장 제목 + FGS 건강 점수 플레이스홀더 (클라이언트)
├── DiaryDateNav.tsx                  # 날짜 네비게이션 ←어제/오늘→ + date picker (클라이언트)
├── DiarySummaryBar.tsx               # 하루 돌봄 횟수 한 줄 요약 바 (클라이언트)
└── DiaryTimeline.tsx                 # 시간대별(오전/오후/저녁) 타임라인 UI (클라이언트)

src/features/diary/lib/
└── careLogToDiarySentence.ts         # 돌봄 로그 → 귀여운 일기 문장 변환 유틸

src/types/diary.ts (추가 타입)
├── CareLogEntry                     # 돌봄 로그 한 건 (cat_care_logs 기반)
├── TimeSection                      # 시간대 구분 ("morning" | "afternoon" | "evening")
└── DiaryTimelineEntry               # 타임라인 한 줄 렌더링용
```

### 8.6 데이터 흐름 패턴

```
[서버 컴포넌트 page.tsx]
  │  Supabase 서버 클라이언트로 데이터 fetch
  │
  └─→ props로 전달
        │
        [클라이언트 컴포넌트]
          │  사용자 인터랙션 (좋아요, 댓글 등)
          │
          └─→ Supabase 브라우저 클라이언트로 mutation
```

---

## 9. 기술 규칙

### 9.1 코드 컨벤션

- **서버 → 클라이언트 데이터 전달**: 서버 컴포넌트에서 fetch 후 클라이언트 컴포넌트에 props로 전달
- **스타일링**: CSS Modules + Tailwind + 기존 CSS 변수 (`globals.css`)
- **컴포넌트 크기**: 파일당 100줄 이내
- **코드 난이도**: 비전공자도 유지보수 가능한 단순한 코드

### 9.2 파일 네이밍

- 컴포넌트: `PascalCase.tsx`
- 유틸/매핑: `camelCase.ts`
- CSS 모듈: `ComponentName.module.css`

### 9.3 신규 의존성

```bash
npm install @anthropic-ai/sdk
```

- 서버 전용. 클라이언트 번들에 포함되지 않도록 `src/lib/fgs/`에서만 import.

### 9.4 환경 변수

```env
# .env.local에 추가
ANTHROPIC_API_KEY=sk-ant-...           # Claude Vision API 키
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # FGS API Route에서 RLS 우회용
```

- 서버 사이드(API Route)에서만 사용. 클라이언트 노출 금지.
- `NEXT_PUBLIC_` 접두사 붙이지 않음.

### 9.5 Next.js 설정

```ts
// next.config.ts — API Route body 크기 제한 확장
export default {
  experimental: {
    serverActions: { bodySizeLimit: '5mb' }  // 고양이 사진 base64 전송용
  }
};
```

### 9.6 향후 확장 (다음 버전)

- 신고/차단 기능
- 대댓글 (2단 이상)
- 이미지 다중 첨부
- 커뮤니티 검색
- 다이어리 공유 기능
- 다묘 가정 개체 식별 (re-identification)
- 품종별 FGS 보정 (페르시안 등 단두종)
- 수의사 원격 상담 연결
- 커스텀 FGS 모델 (YOLOv8 + ResNet)
- 온디바이스 추론 (TFLite)

---

## 10. YOLO 행동 분류 파이프라인 (Phase A~F, 2026-04-24~)

> Phase A: 2026-04-24 atomic deploy 적용 완료 (commit `354f6dd` + DB 마이그 2건).

### 10.1 12 클래스 단일 진실 원천

YOLOv8n 학습 모델 (mAP50=0.994) 과 DB/TS 코드가 모두 아래 **12 클래스** 만 인정:

```
eating, drinking, grooming, sleeping, playing,
walking, running, sitting, standing, scratching,
elimination, other
```

| 위치 | 구현 |
|------|------|
| ONNX model | `public/models/cat_behavior_yolo.onnx` (12 class output) |
| TS whitelist | `src/lib/ai/behaviorClasses.ts` (`BEHAVIOR_CLASSES`, `BEHAVIOR_SEMANTIC_MAP`) |
| SQL whitelist | `public.is_valid_behavior_class(TEXT)` IMMUTABLE SQL 함수 |
| CHECK constraint | `cat_behavior_events_behavior_class_check` (VALIDATED) |

향후 클래스 추가 시 **4곳 (TS / SQL helper / CHECK / SEMANTIC_MAP) 을 한 커밋**에 같이 수정한다.

### 10.2 Phase B — 방송폰 온디바이스 추론 (R12 PR 준비 완료, 머지 대기)

YOLOv8n ONNX 온디바이스 추론. 방송폰 단독 INSERT (뷰어 중복 차단 — 2026-04-22 장애 재발 방지). flag `NEXT_PUBLIC_CAT_YOLO_V2` 기본 OFF → 기존 Phase A 경로 무손상 (CLAUDE.md #13 원칙).

**장착 위치 (R12 commit 3):**
- Mount: `src/components/broadcast/CameraBroadcastYoloMount.tsx` (UI 없음). `src/app/camera/broadcast/CameraBroadcastClient.tsx` 에서 `{isYoloV2Enabled() && isBroadcasting && <CameraBroadcastYoloMount ... />}` 로 조건부 렌더.
- 뷰어 게이트: `src/hooks/useBehaviorDetection.ts` (onBehaviorChange 발화 차단) + `src/components/catvisor/CameraSlot.tsx` (useBehaviorEventLogger homeId=null 게이트). flag ON 시 뷰어 INSERT = 0.

#### 10.2.1 훅 합성 패턴

driver (compose) = lifecycle (worker/retry) + sampling (tick) + driverHealth (5 영역 + isInferring) + Phase A logger 주입. 각 훅 단일 책임 (CLAUDE.md "100줄 이내" 정신, 단 lifecycle/sampling 은 Worker API 한계로 초과 허용).

| 훅 | 책임 | LOC |
|----|------|-----|
| `useBroadcasterYoloDriver` | compose + handleResult 3상태 (pending/cleared/confirmed) + onBeforeInfer (30분 가드) + onHidden | 313 |
| `useYoloWorkerLifecycle` | Worker 생성/dispose/retry/STABLE_READY_MS + inferStartRef latency stamp | 357 |
| `useYoloSampling` | tick/visibility/postMessage + bitmap 누수 방지 try/finally | 235 |
| `useDriverHealth` | health 5 영역 + isInferring + 4 콜백 (bumpSuccess/bumpFailure/bumpTick/markInferring) | 112 |
| `useYoloLatencyTracker` | latency 링버퍼 + P50/P95 nearest-rank + 2초 flush | 139 |

#### 10.2.2 ref-forward callback wrapper 패턴

driver ↔ driverHealth ↔ lifecycle 간 순환 의존 해소용. driver 가 `bumpSuccess / bumpFailure / bumpTick / markInferring` 4 콜백을 `useRef(() => {})` 로 초기화한 stable wrapper 로 lifecycle/sampling 에 넘기고, effect 에서 `driverHealth.*` 로 ref 교체 동기화.

```ts
const bumpSuccessRef = useRef<() => void>(() => {});
const onSuccess = useCallback(() => bumpSuccessRef.current(), []);
// 이후 effect 에서: bumpSuccessRef.current = driverHealth.bumpSuccess;
```

**안전성:** `driverHealth.*` 는 deps `[]` 안정 (useCallback([], [])), 첫 effect 1회만 실행. sampling/lifecycle 의 effect 는 `onSuccess` identity 변화 없어 무회귀.

전체 본문 + 적용 사례 + 안전성 분석: `staging/docs/phase_b_ref_forward_pattern.md` (R12 cross-reference 포함).

#### 10.2.3 metadata freeze 약속 (Phase D 진입 전)

`cat_behavior_events.metadata` JSONB 4 필드 — Phase D 라벨링 UI 가 본 스키마 기반. 변경 금지:

| 필드 | 조건 |
|------|------|
| `model_version` | 항상 채움 (string, 현 `"v1"`). Phase E archive/active 분류 키. |
| `top2_class` | `detection.top2Class !== undefined` 일 때만 |
| `top2_confidence` | `Number.isFinite(...)` 통과 시만 (NaN/Infinity → key omit) |
| `bbox_area_ratio` | `Number.isFinite(...)` 통과 시만 (NaN/Infinity → key omit) |

**조립 위치 (R12 commit 3 R7-S 합치기 이후):**
- helper: `src/lib/behavior/buildBehaviorEventMetadata.ts` (48 LOC, 순수 함수)
- logger: `src/hooks/useBehaviorEventLogger.ts` 가 import 하여 `buildBehaviorEventMetadata(detection, BEHAVIOR_MODEL_VERSION)` 1줄로 조립.

**mirror 검증 (`staging/tests/metadataFreezeMirror.test.ts`):** helper + logger 양쪽에 마커 `// metadata-freeze-spec: r10-1` 존재 필수. 부재 시 vitest R9 §3 strict 로 즉시 fail → drift 차단.

#### 10.2.4 환경변수

| ENV | scope | 값 | 의미 |
|-----|-------|---|------|
| `NEXT_PUBLIC_CAT_YOLO_V2` | Production | `0` (default) / `1` | Phase B flag. OFF 시 기존 Phase A 경로 무변화. |
| `NEXT_PUBLIC_YOLO_MODEL_URL` | Production | Cloudflare R2 URL | ONNX 모델. flag ON 시 필수. 현재값: `https://pub-e5e4c245235e430f84f088febf07a0c0.r2.dev/cat_behavior_yolov8n.onnx` |
| `NEXT_PUBLIC_YOLO_STABLE_READY_MS` | Production | `60000` (default) / `90000` (iOS 저사양) | ready 안정 유지 시간. retry 카운터 리셋 시점. |

**주의:** `NEXT_PUBLIC_*` 는 빌드 타임 주입. Vercel ENV 변경 후 `git commit --allow-empty -m "..."` + push 로 강제 재빌드 필요 (CLAUDE.md #6 운영 교훈).

### 10.3 DB 스키마 변경 (Phase A 적용 완료)

**cat_behavior_events 새 컬럼:**

| 컬럼 | 타입 | 용도 |
|------|------|------|
| `metadata` | JSONB DEFAULT `'{}'` | `{ top2_class, top2_confidence, bbox_area_ratio, model_version }` |
| `user_label` | TEXT NULL | `NULL \| correct \| human \| shadow \| other_animal \| reclassified:<cls>` |
| `snapshot_url` | TEXT NULL | Phase E 에서 사용 (현재 항상 NULL) |
| `labeled_at` | TIMESTAMPTZ NULL | 집사가 라벨 수정한 시각 |
| `labeled_by` | UUID NULL | auth.users(id) FK, `ON DELETE SET NULL` (탈퇴 시 audit 보존) |

**신규 테이블 (Phase E 뼈대):**

| 테이블 | 용도 | RLS |
|--------|------|-----|
| `cat_behavior_events_archive` | 노이즈/구버전 row 이관 (Phase E) | `deny_all` (TO public) |
| `cat_behavior_label_history` | 집사 라벨 수정 audit log | `deny_all_history` (TO public) |

`cat_behavior_label_history.event_id` 는 `ON DELETE SET NULL` — Phase E 가 events 를 archive 로 MOVE 할 때 audit log 는 보존.

**신규 Storage 버킷:**

- `behavior-snapshots` (private) — Phase E 에서 사용. `deny_all_snapshots` placeholder 정책 (TO public) 설치됨. Phase E 에서 owner-only policy 로 교체.

### 10.4 SECURITY DEFINER RPC

모든 라벨링/export 는 `.from("cat_behavior_label_history")` 직접 금지 — RPC 경유.

| RPC | 서명 | 권한 모델 |
|-----|------|-----------|
| `update_behavior_user_label(event_id UUID, label TEXT)` | VOID | `homes.owner_id = auth.uid()` 체크 + audit 자동 INSERT |
| `export_behavior_dataset(home_id UUID, since DATE, until DATE)` | TABLE | 기간 ≤ 366일 DoS 가드 + `effective_class` 계산 (TS effectiveClass.ts 와 1:1 동치) |

**라벨 화이트리스트:** `correct / human / shadow / other_animal / reclassified:<12 클래스>` (64자 초과 거부)

**effective_class 3분기 CASE:**
1. `user_label IN ('human','shadow','other_animal')` → NULL (노이즈)
2. `user_label LIKE 'reclassified:<cls>'` → `is_valid_behavior_class(cls)` 통과 시 cls, 아니면 NULL
3. 그 외 (NULL / correct / 알 수 없는 값) → `behavior_class` 화이트리스트 통과 시 원본, 아니면 NULL

### 10.5 TS ↔ SQL 동치성 보장

| 계층 | 파일 | 비고 |
|------|------|------|
| TS | `src/lib/behavior/effectiveClass.ts` | `getEffectiveClass(row)` — SQL 3분기 CASE 와 1:1 |
| TS | `src/lib/behavior/userLabelFilter.ts` | `NON_NOISE_FILTER` — PostgREST AND 조합 주의 JSDoc |
| Test | `staging/tests/effectiveClass.parity.test.ts` | 60+ fixture 케이스로 TS↔SQL 동치 회귀 |
| Test | `staging/tests/behaviorClasses.invariants.test.ts` | 12개 / 순차 id / SEMANTIC_MAP 완전성 자동 검증 (모듈 로드 시 IIFE) |

### 10.6 Local-first 이벤트 큐

`src/hooks/useBehaviorEventLogger.ts`:
- 네트워크 단절 시 `localStorage` 큐 (최대 100개, FIFO, push 전 length 체크)
- `flushInProgressRef` mutex — 중복 flush race 방어
- `onAuthStateChange(SIGNED_OUT)` 리스너 — 로그아웃 시 큐 clear (타 유저로 leak 방지)
- useEffect 4개 (7개 한도 준수), 456 lines (파일 400라인 한도 근접 — 다음 refactor 대상)

### 10.7 Phase 로드맵

| Phase | 상태 | 내용 |
|-------|------|------|
| **A** | ✅ 2026-04-24 완료 | 12 클래스 매핑, metadata/user_label, Phase E 뼈대 (archive/history/bucket) |
| **B** | 🟡 R12 PR 준비 완료 (2026-04-24~), 머지 + ENV 등록 대기 | 방송폰 온디바이스 YOLO 추론 (14 파일 src/ 합치기 + Mount + 뷰어 게이트 + R7-S) |
| **C** | 대기 | 다이어리 UI (12 클래스 집계, 일/주/월 리포트, scratching 빈도 기반 패턴) |
| **D** | 대기 | 라벨링 UI (집사가 잘못된 추론 수정 → update RPC 경유) |
| **E** | 대기 | 노이즈 archive 이관, snapshot 저장 (behavior-snapshots 버킷), storage.objects owner-only policy |
| **F** | 대기 | SD카드 학습 영상 batch retraining (`export_behavior_dataset` 사용) |

### 10.8 CLAUDE.md #14 예외 적용

Phase A 는 **AI 모델 클래스 정의 변경** 에 해당 (12 클래스 신규 = 기존 arch/walk_run 구조와 호환 불가) → `src/` 직접 수정 허용.
적용 조건 3가지 모두 충족:
1. ✅ atomic deploy: commit `354f6dd` 단일 push
2. ✅ Vercel READY + PROMOTED 확인 후 DB 마이그 적용 (`20260423_phase_a_behavior_full.sql` + `20260423_phase_a_validate_after_cleanup.sql`)
3. ✅ Vercel Instant Rollback 경로 사전 확인 (이전 READY commit `5f6ee4b2` 메모)

Phase B 이후 (신기능 = UI/훅 추가) 는 다시 `staging/` 원칙 복귀.

---

## 11. cat-identity (고양이 등록 + 식별, 2026-04-25~)

> Phase B (행동 분류) 와 독립된 별도 workstream. 고양이를 앱에서 등록하고 추후 카메라 영상에서 누구인지 식별하는 기능.
>
> Phase 2A (MobileNetV3 표정 분류, F1=0.91) 의 식별 인프라를 활용하되, Tier 1 등록 화면이 입구.

### 11.1 Tier 1 — 등록 화면 (R1 PR, 2026-04-25)

**경로:** `/cats/new` (Server Component → Client Component)

**필수 4 + 사진 + 옵션 7 입력 → cats 테이블 INSERT + 사진 Storage 업로드 + HSV 색상 자동 추출.**

| 분류 | 필드 | UI |
|------|------|----|
| 필수 | 이름 (≤30자) | text input |
| 필수 | 품종 | datalist 자동완성 (15 + 자유입력) |
| 필수 | 생년월일 | `<input type=date>` |
| 필수 | 성별 | 3 라디오 (남/여/모름) |
| 사진 (옵션) | 정면 사진 | `<input type=file accept=image/* capture=environment>` (5MB / JPEG/PNG/WebP/HEIC) |
| 옵션 | 중성화 | 3 라디오 (예/아니오/모름) |
| 옵션 | 체중 (kg) | `<input type=number>` (0.1~30 CHECK, fix R1 #6 강화) |
| 옵션 | 기저질환 | textarea |
| 옵션 | 복용약 | textarea |
| 옵션 | 영양제 | textarea |
| 옵션 | 모래 | select 드롭다운 (6) |
| 옵션 | 사료 | datalist 자동완성 (16 + 자유입력) |

#### 11.1.1 색상 calibration 옵션 B (Tier 1 자동 추출)

사용자 인지 X. 등록 사진 1장에서 자동으로 HSV 색상 프로파일 추출 → `cats.color_profile` JSONB.
- 알고리즘: 중앙 50% 영역 샘플링 → RGB→HSV → 채도 0.2 이상 + 명도 0.15 이상 픽셀만 → Hue 18 bin 히스토그램 → 상위 3 hue 반환
- Tier 2 에서 카메라 스트림 20장 기반 정교화로 대체 (sample_count 증가)

#### 11.1.2 Try A — Orphan 방지 순서

```
useCatRegistration.submit():
  1. validateCatDraft()
  2. cats INSERT (photo_url=null) RETURNING id   ← 먼저 row 확보
  3. 사진 있으면:
     a. extractHsvFromPhoto(file)
     b. uploadCatProfilePhoto() → publicUrl
     c. UPDATE cats SET photo_front_url, color_profile, ...
  4. router.replace("/")
```

업로드/UPDATE 실패 = soft error. cats row 는 살아있음 → 사용자가 나중에 사진 재업로드 가능 (Tier 4).

#### 11.1.3 DB 스키마 변경 (commit 2)

`sql/20260425_cats_tier1_fields.sql`:
- ALTER TABLE cats ADD COLUMN × 9 (모두 nullable)
- 기존 재사용: `birth_date`, `medical_notes`, `photo_front_url`
- 신규 옵션: `is_neutered`, `weight_kg` + CHECK(0.1..30) (fix R1 #6 강화), `medications`, `supplements`, `litter_type`, `food_type`
- 신규 색상: `color_profile` JSONB, `color_sample_count` INTEGER, `color_updated_at` TIMESTAMPTZ
- CLAUDE.md #14 트리거 X (단순 nullable 추가).

#### 11.1.4 홈 진입점 (CTA)

진입점 표 (fix R1 #7 갱신):

| 위치 | 컴포넌트 | 동작 |
|---|---|---|
| 홈 상단 cat 프로필 row | `src/components/home/HomeProfileRow.tsx` | cats=0 → "🐱 고양이 등록하기" / cats>0 → 우측 끝 "＋ 추가" → `/cats/new` 직접 이동 |
| 홈 카드 그리드 (옵션) | `src/components/catvisor/HomeCatCards.tsx` | "＋ 고양이 추가하기" CTA → `/cats/new` |

이전엔 `/settings` 우회 경로였으나 Tier 1 이후 `/cats/new` 직접 이동으로 통일.

추가 기능 (fix R1 #3): 등록 성공 시 `sessionStorage["cat-welcome-name"]` 설정 → `HomeProfileRow` `useEffect` 가 환영 토스트 3.5초 표시 후 자동 제거.

### 11.2 Tier 2 — 식별 + 정교한 calibration (예정)

- staging/lib/cat-identity (이관 완료, src/lib/cat-identity 로 위치) 의 useCatIdentifier + useCatColorCalibration 훅 활성화
- 카메라 스트림에서 bbox 색상을 cats.color_profile 과 비교 → 어떤 고양이인지 매칭
- 새 화면 `/cats/[id]/calibrate` — 카메라 앞에서 20장 자동 수집 → color_sample_count 증가 + color_profile 갱신
- `cat_behavior_events.cat_id` 자동 채움 (현재는 nullable)

### 11.3 Tier 3 — 다묘 관리 + 편집 (예정)

- `/cats/[id]/edit` — Tier 1 옵션 7 필드 편집
- 사진 다중 (`photo_side_url`, `photo_back_url` 활용)
- 삭제 (soft delete)

### 11.4 staging shim 보존 (CLAUDE.md #13)

R12 PR 와 동일 패턴. staging/{components,hooks,lib}/cat-identity 는 re-export shim 만 남고 본체는 src/ 로 이관됨 (commit 1, 2026-04-25).

### 11.5 cat_behavior_events 와의 연결

cat_behavior_events.cat_id 는 nullable. Tier 1 등록 후에도 자동 매칭 안 됨 — Tier 2 식별 도입 후 매칭 시점에 채움. 즉 cat-identity 머지가 Phase B (행동) 머지를 막거나 깨지 않음 (orthogonal).

### 11.6 보안 정책 (Tier 1 fix R1 / R4)

Tier 1 STRICT QA R7 에서 발견된 보안 결함 + fix R4-1 4건 (HEIC EXIF / RLS idempotent / homes 사전 검증 / magic byte) 의 정책 정리.

#### 11.6.1 RLS — cats 테이블 4개 정책

`sql/20260425b_cats_rls_policies.sql` 적용 후 모든 CRUD 가 `homes.owner_id = auth.uid()` 조건을 통과해야 한다. 가족 외 사용자가 다른 home 의 cats 를 조회/수정/삭제하지 못한다.

- `cats_select_by_home_owner` — SELECT
- `cats_insert_by_home_owner` — INSERT WITH CHECK
- `cats_update_by_home_owner` — UPDATE USING + WITH CHECK
- `cats_delete_by_home_owner` — DELETE

운영 절차 (CLAUDE.md #14 atomic deploy, fix R4-1 6단계):
  1) PR 머지 (단일 커밋, 단일 PR — sql/* 와 src/* 동시).
  2) Vercel `getDeployments` 로 production READY+PROMOTED 확인 (commit ID 메모).
  3) homes RLS 사전 검증 4건 (A/B/C/D — sql/20260425b_cats_rls_policies.sql 헤더 참조)
     모두 PASS 확인. 실패 시 STOP, PR revert 후 사장님 보고.
  4) Supabase MCP `apply_migration` 으로 sql/20260425b_cats_rls_policies.sql 적용
     (단일 트랜잭션 — 부분 적용 불가).
  5) 적용 후 검증 SELECT — `SELECT count(*) FROM public.cats;` 가 사장님 본인 home 기준
     0 이 아니어야 함 (RLS 의도 작동 확인). 0 이면 즉시 6) rollback.
  6) 실패 시 즉시 sql/20260425b_cats_rls_policies_rollback.sql 적용 +
     Vercel Instant Rollback (2단계 commit ID).

#### 11.6.2 EXIF strip — 사용자 사진 GPS leak 방지

`src/lib/cat/stripExifFromImage.ts` — Canvas 재인코딩 (JPEG 0.92) 으로 EXIF 메타데이터 제거 후 Storage 업로드. fix R4-1 C1 — 디코드 실패 시 union error (`{ kind: "error", code: "EXIF_STRIP_FAILED" }`) 반환. 호출자 (`uploadCatProfilePhoto`) 가 `INVALID_FORMAT` 으로 변환해 사용자에게 "JPG/PNG/WebP 로 다시 시도해 주세요" 안내. 원본 fallback 금지 (HEIC 의 EXIF 가 살아있는 채로 Storage 로 흘러가는 경로 차단).

`src/lib/cat/detectImageMagic.ts` (fix R4-1 C6) — 파일 첫 12 byte 의 magic 비교로 MIME 위조 차단. JPEG/PNG/WebP 만 통과, HEIC/HEIF 는 null → 거부.

#### 11.6.3 dangerouslySetInnerHTML 금지

cat-identity 화면 어디서도 `dangerouslySetInnerHTML` 사용 금지. 사용자 입력 (이름/품종/메모) 은 React 의 기본 텍스트 escape 만 사용. 추가 sanitize 라이브러리도 도입하지 않음 (XSS surface 자체를 만들지 않는다).

#### 11.6.4 의료 정보 암호화 (후속 PR)

`medical_notes` / `medications` / `supplements` 컬럼은 평문 저장. Tier 3 다묘 관리 PR 에서 client-side AES 암호화 + 사용자 비공개 키 도입 계획 (FR HIPAA 수준은 아님 — 가족 공유 의료 메모 수준).

#### 11.6.5 체중 최소값 0.1 — 입력 실수 차단

`cats.weight_kg` 의 CHECK 가 `>= 0.1` (sql/20260425c_cats_weight_min.sql).
0kg 입력은 사용자 실수 (단위 혼동, 0 자릿수 누락) 가 대부분 — 의미 있는 데이터 없음.
0.1 미만은 신생아도 200g (= 0.2kg) 초과이므로 현실적 하한.

코드 단일 출처: `src/lib/cat/constants.ts` 의 `WEIGHT_MIN = 0.1`.
- `validateCatDraft` (fix R1)
- `catDraftToInsertPayload` (fix R4-3 M7)
- `messages.ts.weightOutOfRange`
- ARCHITECTURE §11.1 표
- sql/20260425c_cats_weight_min.sql CHECK

모두 0.1 사용. 임계값 변경 시 본 5곳 동시 갱신 필요 (그러지 않으면 validate 통과 ↔ payload null 모순 재발).

롤백 SQL: `sql/20260425c_cats_weight_min_rollback.sql` (CHECK 0..30 원복).
