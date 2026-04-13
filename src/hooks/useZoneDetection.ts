"use client";

/**
 * useZoneDetection — zone 데이터 로드 + 움직임 감지 통합 훅.
 *
 * Supabase에서 device_id별 zone 목록을 가져오고,
 * 2초마다 video 프레임을 분석하여 zone 내 활동을 감지합니다.
 * 활동 감지 시 cat_care_logs에 자동 기록.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ZoneMotionDetector } from "@/lib/zone/zoneMotionDetector";
import type { CameraZone } from "@/types/zone";
import type { ZoneActivityEvent } from "@/lib/zone/zoneMotionDetector";

/* 분석 주기 (밀리초) */
const DETECT_INTERVAL_MS = 2000;

type UseZoneDetectionOptions = {
  /** home_id — zone 조회 + care_logs INSERT에 필요 */
  homeId: string | null;
  /** video 엘리먼트 참조 — 프레임 분석 대상 */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 연결 상태 — connected일 때만 분석 */
  isConnected: boolean;
};

export function useZoneDetection({
  homeId,
  videoRef,
  isConnected,
}: UseZoneDetectionOptions) {
  const supabase = createSupabaseBrowserClient();
  const [zones, setZones] = useState<CameraZone[]>([]);
  const [activeZoneIds, setActiveZoneIds] = useState<Set<string>>(new Set());
  const detectorRef = useRef<ZoneMotionDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* zone 목록 Supabase에서 로드 (home_id 기준 — 전체 카메라의 zone) */
  const loadZones = useCallback(async () => {
    if (!homeId) return;
    const { data, error } = await supabase
      .from("camera_zones")
      .select("*")
      .eq("home_id", homeId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setZones(data as CameraZone[]);
    }
  }, [supabase, homeId]);

  /* zone 로드 (마운트 시 + deviceId 변경 시) */
  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  /* zone Realtime 구독 — zone 변경 시 자동 갱신 */
  useEffect(() => {
    if (!homeId) return;
    const channel = supabase
      .channel(`zones-${homeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "camera_zones", filter: `home_id=eq.${homeId}` },
        () => { void loadZones(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [supabase, homeId, loadZones]);

  /* 활동 감지 시 care_logs에 자동 기록 */
  const handleActivityEvent = useCallback(
    async (event: ZoneActivityEvent) => {
      if (!homeId) return;
      console.log(`[ZoneDetection] 활동 감지: ${event.zone.name} → ${event.careKind}`);
      const { error } = await supabase
        .from("cat_care_logs")
        .insert({ home_id: homeId, care_kind: event.careKind });
      if (error) {
        console.error("[ZoneDetection] care_log INSERT 실패:", error.message);
      }
    },
    [supabase, homeId],
  );

  /* 2초마다 프레임 분석 */
  useEffect(() => {
    /* 조건 불충족 시 분석 안 함 */
    if (!isConnected || zones.length === 0 || !videoRef.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    /* detector 초기화 */
    if (!detectorRef.current) {
      detectorRef.current = new ZoneMotionDetector();
    }
    detectorRef.current.setZones(zones);

    /* 2초 간격 분석 */
    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;

      /* 탭 비활성 시 분석 중단 (배터리 보호) */
      if (document.hidden) return;

      const events = detector.analyzeFrame(video);
      setActiveZoneIds(detector.getActiveZoneIds());

      /* 활동 이벤트 처리 */
      for (const event of events) {
        void handleActivityEvent(event);
      }
    }, DETECT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected, zones, videoRef, handleActivityEvent]);

  /* 언마운트 시 detector 정리 */
  useEffect(() => {
    return () => {
      detectorRef.current?.destroy();
      detectorRef.current = null;
    };
  }, []);

  return { zones, activeZoneIds, reloadZones: loadZones };
}
