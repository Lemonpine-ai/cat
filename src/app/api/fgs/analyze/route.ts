/* ──────────────────────────────────────
   POST /api/fgs/analyze
   고양이 얼굴 사진 → FGS 통증 점수 분석
   ⚠️ 인증 필수 — 로그인 유저만 호출 가능
   ────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/fgs/serviceClient";
import { scoreFgs } from "@/lib/fgs/fgsScorer";
import { upsertDailySummary, shouldSendAlert, markAlertSent } from "@/lib/fgs/fgsAggregator";
import type { FgsAnalyzeRequest } from "@/types/fgs";

/** 이미지 최대 크기 (5MB) */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    /* ① 세션 검증 — 로그인 유저인지 확인 */
    const supabaseAuth = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    /* ② 요청 본문 파싱 */
    const body = (await request.json()) as FgsAnalyzeRequest;
    const { cat_id, frame, source } = body;

    if (!cat_id || !frame) {
      return NextResponse.json(
        { error: "cat_id, frame은 필수입니다." },
        { status: 400 },
      );
    }

    /* ②-1 유저의 home_id 조회 — 요청에서 받지 않고 서버에서 직접 확인 */
    const { data: profile } = await supabaseAuth
      .from("profiles")
      .select("home_id")
      .eq("id", user.id)
      .single();

    if (!profile?.home_id) {
      return NextResponse.json(
        { error: "프로필 정보를 찾을 수 없습니다." },
        { status: 403 },
      );
    }
    const home_id = profile.home_id;

    /* ③ 이미지 크기 검증 (base64 → 바이트 변환 시 약 75%) */
    const estimatedSize = Math.ceil(frame.length * 0.75);
    if (estimatedSize > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "이미지가 너무 큽니다. 5MB 이하로 줄여주세요." },
        { status: 413 },
      );
    }

    /* ④ Claude Vision API로 FGS 점수 산출 */
    const result = await scoreFgs(frame);

    /* ⑤ Supabase Storage에 이미지 업로드 */
    const serviceClient = getServiceClient();
    const fileName = `fgs/${cat_id}/${Date.now()}.jpg`;
    const buffer = Buffer.from(frame, "base64");

    const { error: uploadError } = await serviceClient.storage
      .from("cat-frames")
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    /* 업로드 실패해도 점수는 저장 (frame_url을 빈 문자열로) */
    const frameUrl = uploadError ? "" : fileName;

    /* ⑥ fgs_frames 테이블에 저장 (lighting은 Vision API가 판단) */
    await serviceClient.from("fgs_frames").insert({
      cat_id,
      home_id,
      frame_url: frameUrl,
      fgs_score: result.fgs_score,
      confidence: result.confidence,
      au_scores: result.au_scores,
      source: source || "auto",
      lighting: result.lighting,
    });

    /* ⑦ 일일 요약 업서트 */
    await upsertDailySummary(cat_id, home_id, result.fgs_score);

    /* ⑧ 알림 확인 — FGS 2일 연속 2+ 이면 알림 */
    let alertTriggered = false;
    if (result.fgs_score >= 2) {
      alertTriggered = await shouldSendAlert(cat_id);
      if (alertTriggered) {
        await markAlertSent(cat_id);
        // TODO: 실제 푸시 알림 발송 (Phase 2)
      }
    }

    /* ⑨ 응답 */
    return NextResponse.json({
      ...result,
      alert_triggered: alertTriggered,
    });
  } catch (error) {
    console.error("[FGS Analyze] 서버 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
