/**
 * Phase B — YOLO v2 파이프라인 feature flag 단일 진입점.
 *
 * 목적:
 *  - Phase B 신기능(방송폰 단독 추론 + DB INSERT)은 OFF/ON 토글로 배포.
 *  - flag 를 읽는 위치가 여러 곳에 흩어지면 실수로 누락되어 "한쪽만 켜진" 상태가 생길
 *    수 있으므로, 반드시 본 유틸 `isYoloV2Enabled()` 한 곳에서만 읽는다.
 *
 * 환경 변수:
 *  - `NEXT_PUBLIC_CAT_YOLO_V2` = "1" → ON, 그 외/미지정 → OFF.
 *  - Next.js `NEXT_PUBLIC_*` 는 빌드타임에 번들에 주입되므로, 값 변경 시 반드시
 *    Vercel 재배포 트리거(빈 커밋 push 등) 필요. (CLAUDE.md #6 교훈)
 *
 * 호출 컨텍스트:
 *  - 브라우저 메인 스레드 / 서버 / Worker / 테스트(node) 모두에서 안전하게 호출 가능.
 *  - `typeof process` 방어 — Worker 환경에서도 process.env 가 노출되어 있지만,
 *    혹시 있을지 모르는 non-standard 런타임(예: 일부 모바일 in-app 브라우저)에서
 *    ReferenceError 나는 것을 방지.
 *
 * ⚠️ Dev 판단:
 *  - 설계서 §5 "`"0"` (OFF)" 기본값을 지킴.
 *  - "1" 이외의 truthy 문자열(`"true"`, `"yes"`)은 OFF 처리 — 사장님/Vercel UI 가
 *    "1" 로 통일되어 있어 혼동 방지. 필요 시 Q&A 에서 확장.
 */

/**
 * 현재 런타임에서 YOLO v2 (방송폰 단독 추론) 경로가 활성화되어 있는지 조회.
 *
 * @returns `NEXT_PUBLIC_CAT_YOLO_V2 === "1"` 일 때 true.
 *          그 외(값 없음 / "0" / "true" / 기타) 는 false.
 */
export function isYoloV2Enabled(): boolean {
  // process 객체 자체가 없는 환경(극히 드문 Worker 변형) 방어.
  if (typeof process === "undefined") return false;
  // Next.js 가 빌드타임에 NEXT_PUBLIC_* 를 실제 문자열로 치환하므로
  // process.env 접근이 안전. (런타임 process.env 접근이 아니라 빌드타임 치환)
  const raw = process.env.NEXT_PUBLIC_CAT_YOLO_V2;
  return raw === "1";
}
