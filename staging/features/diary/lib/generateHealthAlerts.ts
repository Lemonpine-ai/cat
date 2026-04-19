/**
 * DiaryStats → HealthAlert[] 변환
 *
 * 경고 트리거 (discrepancy = care - raw_ai):
 * - pain_level 3 (위험)                         → danger
 * - pain_level 2 (주의)                         → warning
 * - discrepancy.meal >= 2                       → warning (집사가 줬는데 AI 가 감지 못함 — 카메라 사각/실제 안 먹음)
 * - discrepancy.meal <= -2                      → info    (AI 는 감지했는데 집사 기록 없음 — 간식 놓침?)
 * - discrepancy.poop >= 2                       → warning (집사가 치운 기록 > AI 감지 — 카메라 사각지대)
 * - meal_count == 0 && (과거일 || KST 20시 이후) → danger
 * - poop_count == 0 && (과거일 || KST 20시 이후) → warning
 *
 * ⓘ 0회 경고는 "하루가 끝났거나 곧 끝날 때" 만 발화.
 *    새벽 1시에 meal=0 은 정상 상황이므로 노이즈 방지 (QA R3 REJECT 반영).
 *
 * client 측에서 생성 후 health_alerts 테이블에 insert 하는 구조.
 * (fire-and-forget. 실패해도 다이어리 렌더는 계속)
 */
import type { DiaryStats, HealthAlert } from "../types/diaryStats";
import { kstToday } from "./kstRange";

/**
 * HealthAlert 하나 조립.
 * QA R13 REJECT #3 반영 — client 생성 시점에는 id 를 붙이지 않는다.
 *   tempId 는 DB 실제 id 와 달라 useHealthAlerts 구독 결과와 key 가 겹쳐
 *   drawer / 카드에서 중복 렌더를 유발했음.
 *   React key 는 상위 컴포넌트에서 `${title}-${alert_date}` 같은 자연키로 구성.
 */
function makeAlert(
  catId: string,
  severity: HealthAlert["severity"],
  title: string,
  message: string,
  alertDate: string,
): HealthAlert {
  return {
    cat_id: catId,
    severity,
    title,
    message,
    created_at: new Date().toISOString(),
    read_at: null,
    /* DB NOT NULL — 다이어리 대상 날짜(KST) 주입. insert 실패 방지 (QA R15 REJECT #1) */
    alert_date: alertDate,
  };
}

/**
 * 현재 KST 시각(시)을 반환. 0~23.
 * Date.getUTCHours() + 9 을 24로 모듈로 연산.
 */
function kstHourNow(): number {
  return (new Date().getUTCHours() + 9) % 24;
}

/**
 * DiaryStats 분석 → 경고 목록 반환
 *
 * @param date — 다이어리 대상 날짜 ("YYYY-MM-DD", KST).
 *               생략 시 오늘(KST) 로 간주. 과거 날짜면 meal/poop 0회 경고를 즉시 발화.
 *
 * ⚠️ 자정 경계 주의 (QA R23 #3 반영):
 *   이 함수는 호출 시점의 date 를 기준으로 1회성 판정만 한다.
 *   페이지를 자정을 넘어 열어둔 채 두면 20시 이후 0회 경고 로직이
 *   '어제 날짜' 로 계속 발화할 수 있다. 이를 막으려면 호출부에서
 *   kstToday() 를 매 추론 시 재계산하여 date 파라미터를 다시 넘겨야 한다.
 *   DiaryPageClient 가 이 책임을 진다 (useEffect deps 에 date 포함).
 */
export function generateHealthAlerts(
  stats: DiaryStats,
  catId: string,
  date?: string,
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  /* 대상 날짜 선결정 — makeAlert 의 alert_date 에 주입 (QA R15 REJECT #1) */
  const today = kstToday();
  const targetDate = date ?? today;

  /* 통증 레벨 기반 */
  if (stats.pain_level === 3) {
    alerts.push(makeAlert(catId, "danger", "통증 위험 신호", "통증 지수가 높아요. 병원 방문을 고려해주세요.", targetDate));
  } else if (stats.pain_level === 2) {
    alerts.push(makeAlert(catId, "warning", "통증 주의", "통증 지수가 평소보다 높아요. 행동을 지켜봐주세요.", targetDate));
  }

  /* 0회 경고의 발화 조건 계산 — 과거일 또는 KST 20시 이후
   *   오늘 새벽/낮에 meal=0 은 정상일 수 있어 노이즈 방지 (QA R3 REJECT 반영)
   */
  const isPastDate = targetDate < today;
  const isLateEvening = kstHourNow() >= 20;
  const zeroCountAllowed = isPastDate || isLateEvening;

  /* 식사 0회 — 하루가 끝났거나 곧 끝날 때만 위험 경고 */
  if (stats.meal_count === 0 && zeroCountAllowed) {
    alerts.push(makeAlert(catId, "danger", "오늘 식사 기록 없음", "하루 종일 식사 기록이 없어요. 확인이 필요해요.", targetDate));
  }

  /* 배변 0회 — 하루가 끝났거나 곧 끝날 때만 경고 */
  if (stats.poop_count === 0 && zeroCountAllowed) {
    alerts.push(makeAlert(catId, "warning", "배변 기록 없음", "24시간 동안 배변 기록이 없어요.", targetDate));
  }

  /* discrepancy 기반 (AI 가 작동한 경우만)
   *   discrepancy = care - raw_ai (보완 전 AI 카운트 기준)
   */
  if (stats.discrepancy) {
    /* 집사가 밥을 줬는데 AI 가 2회 이상 놓침 → 실제 안 먹었거나 카메라 사각지대 */
    if (stats.discrepancy.meal >= 2) {
      alerts.push(
        makeAlert(
          catId,
          "warning",
          "AI 식사 감지 누락",
          "집사님은 밥을 줬는데 카메라가 식사를 감지하지 못했어요. 실제로 먹었는지 확인해주세요.",
          targetDate,
        ),
      );
    }
    /* AI 는 식사를 감지했는데 집사 기록이 없음 — 간식/몰래 먹음? */
    if (stats.discrepancy.meal <= -2) {
      alerts.push(
        makeAlert(
          catId,
          "info",
          "AI 식사 감지 많음",
          "카메라가 집사 기록보다 식사를 더 많이 감지했어요. 간식을 놓친 건 아닐까요?",
          targetDate,
        ),
      );
    }
    /* 집사가 치운 배변 기록이 AI 감지보다 2회 이상 많음 — 사각지대 의심 */
    if (stats.discrepancy.poop >= 2) {
      alerts.push(
        makeAlert(
          catId,
          "warning",
          "배변 감지 차이",
          "집사님의 청소 기록이 AI 감지보다 많아요. 카메라 사각지대를 확인해보세요.",
          targetDate,
        ),
      );
    }
  }

  return alerts;
}
