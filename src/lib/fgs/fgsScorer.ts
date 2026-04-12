/* ──────────────────────────────────────
   FGS 스코어러 — Claude Vision API 호출
   고양이 얼굴 사진 → FGS 0-4 점수 산출
   ⚠️ 서버 전용 — API Route에서만 import
   ────────────────────────────────────── */

import Anthropic from "@anthropic-ai/sdk";
import { FGS_SYSTEM_PROMPT, FGS_USER_MESSAGE } from "./fgsPrompt";
import type { FgsAnalysisResult } from "@/types/fgs";

/** Anthropic 클라이언트 (서버 사이드 싱글톤) */
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** 기본 분석 결과 — API 호출 실패 시 반환 */
const FALLBACK_RESULT: FgsAnalysisResult & { lighting: string | null } = {
  fgs_score: 0,
  confidence: 0,
  au_scores: { ear: 0, eye: 0, muzzle: 0, whisker: 0, head: 0 },
  reasoning: "분석 실패 — 다시 시도해주세요",
  lighting: null,
};

/**
 * Claude 응답에서 JSON 추출 — 마크다운 코드블록 감싸기 대응
 * Claude가 ```json ... ``` 형태로 응답할 수 있어서 정규식으로 벗김
 */
function extractJson(text: string): string {
  /* ```json ... ``` 또는 ``` ... ``` 패턴 제거 */
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

/**
 * 고양이 얼굴 사진을 Claude Vision API로 분석하여 FGS 점수 산출
 *
 * @param imageBase64 - 고양이 얼굴 사진 (base64 인코딩)
 * @param mediaType - 이미지 MIME 타입 (기본: image/jpeg)
 * @returns FGS 분석 결과 (점수, 확신도, 지표별 점수, 판단 근거)
 */
export async function scoreFgs(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
): Promise<FgsAnalysisResult & { lighting: string | null }> {
  const anthropic = getClient();

  try {
    /* Claude Vision API 호출 — 비용 효율을 위해 Sonnet 사용 */
    const response = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: FGS_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: FGS_USER_MESSAGE },
            ],
          },
        ],
      },
      { timeout: 15_000 }, /* 15초 타임아웃 */
    );

    /* 응답에서 JSON 파싱 (마크다운 코드블록 대응) */
    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonText = extractJson(rawText);
    const parsed = JSON.parse(jsonText) as FgsAnalysisResult & { lighting?: string };

    /* 점수 범위 검증 (0~4) */
    const score = Math.max(0, Math.min(4, Math.round(parsed.fgs_score)));
    const confidence = Math.max(0, Math.min(1, parsed.confidence));

    return {
      fgs_score: score,
      confidence,
      au_scores: parsed.au_scores,
      reasoning: parsed.reasoning || "분석 완료",
      lighting: parsed.lighting || null,
    };
  } catch (error) {
    console.error("[FGS] Vision API 호출 실패:", error);
    return FALLBACK_RESULT;
  }
}
