// ============================================================
// useCatColorCalibration — 학습(캘리브레이션) 훅
// 사용자가 "이건 OO 고양이" 버튼 누를 때마다 샘플 1개 추출 누적
// SAMPLE_TARGET 도달 → 자동으로 ColorProfileV1 생성 → Supabase upsert
//
// 다수 고양이 동시 학습 대응:
// - samples/lighting/raw 버퍼를 catId별 Map으로 관리
// - active catId만 바꿔도 다른 고양이의 누적 샘플 유지
// ============================================================

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractHsvKmeans } from "@/lib/cat-identity/extractors/hsvKmeansExtractor";
import { detectLighting } from "@/lib/cat-identity/extractors/lightingDetector";
import { buildProfileV1 } from "@/lib/cat-identity/calibration/profileBuilder";
import type { HsvSample, LightingLevel } from "@/lib/cat-identity/types";

const SAMPLE_TARGET = 20; // v1 기본 학습량

type UseCatColorCalibrationProps = {
  /** 현재 활성 고양이 id — 샘플 귀속 대상 */
  catId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  bbox: { x: number; y: number; w: number; h: number } | null;
  zoneId?: string;
  supabaseClient?: SupabaseClient;
};

type CalibrationState = {
  /** catId별 현재 누적 수 */
  countsByCat: Record<string, number>;
  /** catId별 완료 여부 */
  doneByCat: Record<string, boolean>;
  /** 현재 active 고양이의 누적 수 (편의용) */
  count: number;
  target: number;
  saving: boolean;
  /** 현재 active 고양이 완료 여부 (편의용) */
  done: boolean;
  error: string | null;
};

type RawItem = { h: HsvSample; lighting: LightingLevel; bboxArea: number };

export function useCatColorCalibration({
  catId,
  videoRef,
  bbox,
  zoneId,
  supabaseClient,
}: UseCatColorCalibrationProps) {
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  // catId별 독립 버퍼 — 다른 고양이 선택해도 이전 샘플 유지
  const samplesMapRef = useRef<Map<string, HsvSample[]>>(new Map());
  const lightingMapRef = useRef<Map<string, LightingLevel[]>>(new Map());
  const rawMapRef = useRef<Map<string, RawItem[]>>(new Map());

  const [state, setState] = useState<CalibrationState>({
    countsByCat: {},
    doneByCat: {},
    count: 0,
    target: SAMPLE_TARGET,
    saving: false,
    done: false,
    error: null,
  });

  /** Map에서 해당 catId 버퍼를 가져오거나 새로 생성 */
  const ensureBuffers = useCallback((id: string) => {
    if (!samplesMapRef.current.has(id)) samplesMapRef.current.set(id, []);
    if (!lightingMapRef.current.has(id)) lightingMapRef.current.set(id, []);
    if (!rawMapRef.current.has(id)) rawMapRef.current.set(id, []);
    return {
      samples: samplesMapRef.current.get(id)!,
      lighting: lightingMapRef.current.get(id)!,
      raw: rawMapRef.current.get(id)!,
    };
  }, []);

  /** 전체 count snapshot 만들기 (state 동기화용) */
  const snapshotCounts = useCallback((): Record<string, number> => {
    const obj: Record<string, number> = {};
    for (const [id, arr] of samplesMapRef.current) obj[id] = arr.length;
    return obj;
  }, []);

  /** 프로필 생성 및 Supabase upsert — active catId 기준 */
  const saveProfile = useCallback(async () => {
    if (!catId) {
      setState((s) => ({ ...s, error: "catId 없음" }));
      return;
    }
    const bufs = ensureBuffers(catId);
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const profile = buildProfileV1(bufs.samples, bufs.lighting);

      // cats 테이블 업데이트
      const { error: upErr } = await supabase
        .from("cats")
        .update({
          color_profile: profile,
          color_sample_count: bufs.samples.length,
          color_updated_at: new Date().toISOString(),
        })
        .eq("id", catId);
      if (upErr) throw upErr;

      // 샘플 원본 INSERT (재학습/디버깅용)
      const rows = bufs.raw.map((r) => ({
        cat_id: catId,
        h_mean: r.h.h_mean,
        h_std: r.h.h_std,
        s_mean: r.h.s_mean,
        s_std: r.h.s_std,
        v_mean: r.h.v_mean,
        bbox_area: r.bboxArea,
        zone_id: zoneId ?? null,
        lighting_level: r.lighting,
      }));
      const { error: insErr } = await supabase
        .from("cat_color_samples")
        .insert(rows);
      if (insErr) throw insErr;

      setState((s) => {
        const doneByCat = { ...s.doneByCat, [catId]: true };
        return {
          ...s,
          saving: false,
          done: true,
          doneByCat,
          error: null,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, saving: false, error: msg }));
    }
  }, [catId, supabase, zoneId, ensureBuffers]);

  /** 현재 프레임 bbox에서 샘플 1개 추가 (active catId에 귀속) */
  const addSample = useCallback(() => {
    if (!catId) {
      setState((s) => ({ ...s, error: "catId 없음" }));
      return;
    }
    if (state.saving) return;
    if (state.doneByCat[catId]) return; // 이미 완료된 고양이는 스킵
    const video = videoRef.current;
    if (!video || !bbox) {
      setState((s) => ({ ...s, error: "비디오/bbox 없음" }));
      return;
    }

    const lighting = detectLighting(video, bbox);
    if (lighting === "dark") {
      setState((s) => ({ ...s, error: "조명이 너무 어두움 — 건너뛰기 권장" }));
      return;
    }

    const samples = extractHsvKmeans(video, bbox);
    if (!samples || samples.length === 0) {
      setState((s) => ({ ...s, error: "샘플 추출 실패" }));
      return;
    }

    const primary = samples[0];
    const bufs = ensureBuffers(catId);
    bufs.samples.push(primary);
    bufs.lighting.push(lighting);
    bufs.raw.push({
      h: primary,
      lighting,
      bboxArea: bbox.w * bbox.h,
    });

    const countsByCat = snapshotCounts();
    const curCount = countsByCat[catId] ?? 0;
    setState((s) => ({
      ...s,
      countsByCat,
      count: curCount,
      done: s.doneByCat[catId] ?? false,
      error: null,
    }));

    // 목표 도달 시 자동 저장
    if (curCount >= SAMPLE_TARGET) {
      void saveProfile();
    }
    // deps에 saveProfile 포함 — stale closure 방지
  }, [
    catId,
    bbox,
    videoRef,
    state.saving,
    state.doneByCat,
    ensureBuffers,
    snapshotCounts,
    saveProfile,
  ]);

  /** 초기화 — 현재 active catId 버퍼만 비움 (다른 고양이는 유지) */
  const reset = useCallback(() => {
    if (catId) {
      samplesMapRef.current.set(catId, []);
      lightingMapRef.current.set(catId, []);
      rawMapRef.current.set(catId, []);
    }
    setState((s) => {
      const countsByCat = { ...s.countsByCat, [catId]: 0 };
      const doneByCat = { ...s.doneByCat };
      delete doneByCat[catId];
      return {
        ...s,
        countsByCat,
        doneByCat,
        count: 0,
        saving: false,
        done: false,
        error: null,
      };
    });
  }, [catId]);

  /** 모든 고양이 버퍼 초기화 (카메라 전환 등) */
  const resetAll = useCallback(() => {
    samplesMapRef.current.clear();
    lightingMapRef.current.clear();
    rawMapRef.current.clear();
    setState({
      countsByCat: {},
      doneByCat: {},
      count: 0,
      target: SAMPLE_TARGET,
      saving: false,
      done: false,
      error: null,
    });
  }, []);

  return { state, addSample, saveProfile, reset, resetAll };
}
