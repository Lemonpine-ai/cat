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
