/**
 * 돌봄 로그 → 귀여운 일기 문장 변환
 * care_kind별 랜덤 템플릿 + 시간대 기반 접두사 + 고양이 이름 삽입
 */
import type { CareLogEntry, TimeSection, DiaryTimelineEntry } from "../../../types/diary";

/* ── 시간대 헬퍼 ── */

/** 시각(hour)으로 시간대 구분 */
export function getTimeSection(hour: number): TimeSection {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** ISO 시각 → "오전 8:30" 형식 라벨 (invalid date 방어) */
export function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "시간 미상";
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const prefix = h < 12 ? "오전" : "오후";
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${prefix} ${dh}:${m}`;
}

/* ── 문장 템플릿 ── */

const TIME_PREFIX: Record<TimeSection, string> = {
  morning: "아침에", afternoon: "낮에", evening: "저녁에",
};

/** 돌봄 종류별 귀여운 문장 후보 */
const TEMPLATES: Record<string, string[]> = {
  meal: [
    "{t} 맛있는 밥을 먹었다냥 🍚",
    "{t} 냠냠 밥을 먹었어요 🍚",
    "{t} 집사가 밥을 줬다냥! 🍚",
  ],
  water_change: [
    "{t} 깨끗한 물을 마셨다냥 💧",
    "{t} 시원한 물로 갈아줬어요 💧",
    "{t} 물이 새로 나왔다냥! 💧",
  ],
  litter_clean: [
    "{t} 화장실이 깨끗해졌다냥 🚽",
    "{t} 집사가 화장실 청소해줬어요 🚽",
    "{t} 뽀송뽀송한 화장실이다냥 🚽",
  ],
  medicine: [
    "{t} 약을 먹었다냥… 쓰다냥 💊",
    "{t} 건강을 위해 약을 먹었어요 💊",
    "{t} 집사가 약을 챙겨줬다냥 💊",
  ],
};
const FALLBACK = ["{t} 집사가 돌봐줬다냥 🐾"];

/**
 * 돌봄 로그 한 건 → 타임라인 엔트리 변환
 * @param entry    돌봄 로그 원본
 * @param catName  고양이 이름
 * @param single   고양이가 1마리인지 여부 (이름 삽입용)
 */
export function careLogToDiarySentence(
  entry: CareLogEntry,
  catName: string,
  single: boolean,
): DiaryTimelineEntry {
  const d = new Date(entry.created_at);
  const hour = Number.isNaN(d.getTime()) ? 0 : d.getHours();
  const section = getTimeSection(hour);
  const timeLabel = formatTimeLabel(entry.created_at);

  /* 결정적 랜덤: ID 첫 글자 charCode로 인덱스 선택 (빈 문자열 방어) */
  const pool = TEMPLATES[entry.care_kind] ?? FALLBACK;
  const code = entry.id.length > 0 ? entry.id.charCodeAt(0) : 0;
  const idx = code % pool.length;
  let sentence = pool[idx].replace("{t}", TIME_PREFIX[section]);

  /* 1마리일 때 이름 접두 (한국어 조사 "이/가" 자동 구분, 비한글 이름 방어) */
  if (single && catName) {
    const last = catName.charCodeAt(catName.length - 1);
    const isHangul = last >= 0xac00 && last <= 0xd7a3;
    const marker = isHangul && (last - 0xac00) % 28 !== 0 ? "이" : "가";
    sentence = `${catName}${marker} ${sentence}`;
  }

  return { id: entry.id, section, sentence, timeLabel, careKind: entry.care_kind };
}
