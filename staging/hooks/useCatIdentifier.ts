// ============================================================
// useCatIdentifier — 실시간 고양이 개체 구별 훅
// createMatcher로 전략 인스턴스 생성 → MatchSmoother로 플리커 방지
// bbox가 변할 때마다 매칭 → 확정된 catId 반환
// ============================================================

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMatcher,
  type MatcherStrategy,
} from "@/../staging/lib/cat-identity/matchers";
import { MatchSmoother } from "@/../staging/lib/cat-identity/smoothing/matchSmoother";
import type { CatWithProfile } from "@/../staging/lib/cat-identity/types";

type Bbox = { x: number; y: number; w: number; h: number } | null;

type UseCatIdentifierProps = {
  cats: CatWithProfile[];
  matcherStrategy?: MatcherStrategy;
  enabled: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  bbox: Bbox;
};

type UseCatIdentifierResult = {
  identifiedCatId: string | null;
  confidence: number;
};

export function useCatIdentifier({
  cats,
  matcherStrategy = "hsv_v1",
  enabled,
  videoRef,
  bbox,
}: UseCatIdentifierProps): UseCatIdentifierResult {
  // 매처 인스턴스 (전략 변경 시에만 재생성)
  const matcher = useMemo(() => createMatcher(matcherStrategy), [matcherStrategy]);
  // 스무더 인스턴스 (enabled 변경 시 reset)
  const smootherRef = useRef<MatchSmoother>(new MatchSmoother());

  const [state, setState] = useState<UseCatIdentifierResult>({
    identifiedCatId: null,
    confidence: 0,
  });

  // enabled 꺼지면 상태 리셋
  useEffect(() => {
    if (!enabled) {
      smootherRef.current.reset();
      setState({ identifiedCatId: null, confidence: 0 });
    }
  }, [enabled]);

  // bbox 개별 값 분해 — 객체 reference 변경에 의한 의존성 폭주 방지
  const bx = bbox?.x ?? null;
  const by = bbox?.y ?? null;
  const bw = bbox?.w ?? null;
  const bh = bbox?.h ?? null;

  // 항상 최신 bbox를 읽을 수 있도록 ref에 저장 (setInterval 내부에서 참조)
  const bboxRef = useRef<Bbox>(bbox);
  bboxRef.current = bbox;

  // setInterval로 2 FPS(500ms) 스로틀 — 매 프레임 K-means 실행 방지
  useEffect(() => {
    if (!enabled || !videoRef.current || cats.length === 0) return;
    // bbox 값 자체는 ref에서 읽으므로 의존성은 분해된 primitives만 사용

    let cancelled = false;
    let running = false;
    const video = videoRef.current;

    const tick = async () => {
      if (cancelled || running) return;
      const curBbox = bboxRef.current;
      if (!curBbox) return;
      running = true;
      try {
        const res = await matcher.match(
          {
            bbox: curBbox,
            videoFrame: video,
            timestamp: Date.now(),
          },
          cats,
        );
        if (cancelled) return;
        const smoothed = smootherRef.current.push(res);
        setState(smoothed);
      } catch (err) {
        // 매칭 실패는 조용히 무시 (다음 주기에 재시도)
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useCatIdentifier] match error", err);
        }
      } finally {
        running = false;
      }
    };

    // 즉시 1회 + 2 FPS 주기
    void tick();
    const id = setInterval(() => void tick(), 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // 주의: bbox 객체 자체 X → primitives(bx, by, bw, bh)로 의존성 관리
  }, [enabled, bx, by, bw, bh, cats, matcher, videoRef]);

  return state;
}
