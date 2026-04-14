/**
 * Daily Diary (타임라인 일기) 전용 타입
 * - 기존 타입(DiaryCatProfile, CatHealthLog 등)은 src/types/diary.ts 참조
 * - 여기는 타임라인 UI 전용 신규 타입만 정의
 */

/** 돌봄 로그 한 건 — cat_care_logs 테이블 기반 */
export type CareLogEntry = {
  id: string;
  care_kind: string;   // meal | water_change | litter_clean | medicine
  cat_id: string;
  cat_name: string;    // 조인 또는 클라이언트에서 매핑
  created_at: string;  // ISO 8601
};

/** 시간대 구분 — 오전 / 오후 / 저녁 */
export type TimeSection = "morning" | "afternoon" | "evening";

/** 타임라인 한 줄 — UI 렌더링용 */
export type DiaryTimelineEntry = {
  id: string;           // 원본 로그 ID
  section: TimeSection;
  sentence: string;     // 귀여운 문장
  timeLabel: string;    // "오전 8:30" 형식
  careKind: string;     // 아이콘 매핑용
};
