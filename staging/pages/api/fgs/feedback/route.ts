/* ──────────────────────────────────────
   PATCH /api/fgs/feedback
   유저가 FGS 점수를 보정 (AI 학습 데이터로 활용)
   ⚠️ 인증 필수 — 본인 home_id 프레임만 수정 가능
   ────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FgsFeedbackRequest } from "@/types/fgs";

export async function PATCH(request: NextRequest) {
  try {
    /* ① 세션 검증 */
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    /* ② 요청 본문 파싱 */
    const body = (await request.json()) as FgsFeedbackRequest;
    const { frame_id, user_feedback } = body;

    if (!frame_id || user_feedback == null) {
      return NextResponse.json(
        { error: "frame_id와 user_feedback은 필수입니다." },
        { status: 400 },
      );
    }

    /* ③ 점수 범위 검증 (0~4) */
    if (user_feedback < 0 || user_feedback > 4) {
      return NextResponse.json(
        { error: "user_feedback은 0~4 사이여야 합니다." },
        { status: 400 },
      );
    }

    /* ④ user_feedback 업데이트 (RLS가 home_id 검증) */
    const { error: updateError } = await supabase
      .from("fgs_frames")
      .update({ user_feedback })
      .eq("id", frame_id);

    if (updateError) {
      console.error("[FGS Feedback] 업데이트 실패:", updateError);
      return NextResponse.json(
        { error: "피드백 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FGS Feedback] 서버 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
