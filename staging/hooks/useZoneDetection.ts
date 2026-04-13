"use client";

/**
 * useZoneDetection — zone 데이터 로드 + 움직임 감지 통합 훅.
 *
 * Supabase에서 device_id별 zone 목록을 가져오고,
 * 2초마다 video 프레임을 분석하여 zone 내 활동을 감지합니다.
 * 활동 감지 시 cat_care_logs에 자동 기록.
 *
 * [전체 화면 감지] zone이 없으면 전체 화면 움직임을 감지하여
 * globalMotionState를 반환합니다. zone이 설정되면 zone 감지가 우선.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { ZoneMotionDetector } from "../../lib/zone/zoneMotionDetector";
import type { CameraZone, GlobalMotionState } from "../../types/zone";
import type { ZoneActivityEvent } from "../../lib/zone/zoneMotionDetector";

/* 분석 주기 (밀리초) */
const DETECT_INTERVAL_MS = 2000;
/* 비활동 판정 시간 (5분 = 300초) */
const RESTING_TIMEOUT_MS = 5 * 60 * 1000;

/** 초기 globalMotionState — initialized:false로 "분석 전" 상태 구별 */
const INITIAL_MOTION_STATE: GlobalMotionState = {
  isActive: false,
  lastActivityAt: null,
  currentState: "resting",
  initialized: false,
};

type UseZoneDetectionOptions = {
  /** home_id — zone 조회 + care_logs INSERT에 필요 */
  homeId: string | null;
  /** device_id — 특정 카메라의 zone만 필터링 (선택) */
  deviceId?: string | null;
  /** video 엘리먼트 참조 — 프레임 분석 대상 */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 연결 상태 — connected일 때만 분석 */
  isConnected: boolean;
};

export function useZoneDetection({
  homeId,
  deviceId,
  videoRef,
  isConnected,
}: UseZoneDetectionOptions) {
  /* supabase 싱글턴 — 매 렌더마다 재생성 방지 */
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [zones, setZones] = useState<CameraZone[]>([]);
  const [activeZoneIds, setActiveZoneIds] = useState<Set<string>>(new Set());
  const [globalMotionState, setGlobalMotionState] =
    useState<GlobalMotionState>(INITIAL_MOTION_STATE);
  const detectorRef = useRef<ZoneMotionDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 이전 activeZoneIds — Set 내용 비교용 (불필요한 리렌더 방지) */
  const prevActiveIdsRef = useRef<Set<string>>(new Set());

  /* zone 목록 Supabase에서 로드 (home_id 기준) */
  const loadZones = useCallback(async () => {
    if (!homeId) return;
    try {
      let query = supabase
        .from("camera_zones")
        .select("*")
        .eq("home_id", homeId);

      /* device_id 필터 — 특정 카메라의 zone만 조회 */
      if (deviceId) {
        query = query.eq("device_id", deviceId);
      }

      const { data, error } = await query
        .order("created_at", { ascending: true });

      if (!error && data) {
        setZones(data as CameraZone[]);
      }
    } catch {
      /* 네트워크 에러 시 무시 — zone 없이도 카메라는 작동해야 함 */
    }
  }, [homeId, deviceId, supabase]);

  /* zone 로드 — 마운트 후 3초 딜레이 (Auth Lock 경합 방지) */
  useEffect(() => {
    if (!homeId) return;
    /* deviceId 전환 시 이전 zone 즉시 제거 (stale 데이터 방지) */
    setZones([]);
    const timer = setTimeout(() => { void loadZones(); }, 3000);
    return () => clearTimeout(timer);
  }, [loadZones, homeId]);

  /* deviceId 변경 시 detector + prevActiveIds 초기화 */
  useEffect(() => {
    return () => {
      detectorRef.current?.destroy();
      detectorRef.current = null;
      prevActiveIdsRef.current = new Set();
      /* BUG-5: deviceId 전환 시 이전 zone 즉시 제거 (race condition 방지) */
      setZones([]);
    };
  }, [deviceId]);

  /* 활동 감지 시 care_logs에 자동 기록 */
  const handleActivityEvent = useCallback(
    async (event: ZoneActivityEvent) => {
      if (!homeId) return;
      console.log(`[ZoneDetection] 활동 감지: ${event.zone.name} → ${event.careKind}`);
      /* BUG-1: zone_id/device_id 제거 — care_logs에는 home_id, care_kind만 기록 */
      const { error } = await supabase
        .from("cat_care_logs")
        .insert({
          home_id: homeId,
          care_kind: event.careKind,
        });
      if (error) {
        console.error("[ZoneDetection] care_log INSERT 실패:", error.message);
      }
    },
    /* BUG-2: deviceId 제거, supabase 추가 (INSERT에서 사용) */
    [homeId, supabase],
  );

  /* 2초마다 프레임 분석 — zone 또는 전체 화면 */
  useEffect(() => {
    if (!isConnected || !videoRef.current) {
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

    const hasZones = zones.length > 0;
    if (hasZones) {
      /* fullscreen→zone 전환: globalMotionState 초기화 */
      setGlobalMotionState(INITIAL_MOTION_STATE);
      detectorRef.current.setZones(zones);
    } else {
      /* zone→fullscreen 전환: zone 관련 상태 초기화 */
      setActiveZoneIds(new Set());
      prevActiveIdsRef.current = new Set();
    }

    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;

      if (hasZones) {
        /* 탭 비활성 시 zone 프레임 분석 스킵 (배터리 보호) */
        if (document.hidden) return;

        /* zone 감지 모드 — 기존 로직 */
        const events = detector.analyzeFrame(video);

        /* Set 내용 비교 — 변경 시에만 상태 업데이트 (리렌더 방지) */
        const nextIds = detector.getActiveZoneIds();
        const prevIds = prevActiveIdsRef.current;
        const changed =
          nextIds.size !== prevIds.size ||
          [...nextIds].some((id) => !prevIds.has(id));
        if (changed) {
          prevActiveIdsRef.current = nextIds;
          setActiveZoneIds(nextIds);
        }
        for (const event of events) {
          void handleActivityEvent(event);
        }
      } else {
        /* 전체 화면 감지 모드 — zone 미설정 시 */
        /* 탭 비활성 시 프레임 분석은 스킵하되 시간 경과 판단은 실행 */
        const motionDetected = document.hidden
          ? false
          : detector.analyzeFullScreen(video);
        const now = Date.now();

        setGlobalMotionState((prev) => {
          if (motionDetected) {
            /* 움직임 감지 → active, initialized 전환 */
            return { isActive: true, lastActivityAt: now, currentState: "active", initialized: true };
          }
          /* 움직임 없음 — 마지막 활동 이후 5분 경과 여부 확인 */
          const lastAt = prev.lastActivityAt;
          if (!lastAt) {
            /* 아직 한번도 감지 안 됨 — initialized만 true로 전환 */
            if (prev.initialized) return prev;
            return { ...prev, initialized: true };
          }
          const elapsed = now - lastAt;
          const nextState = elapsed >= RESTING_TIMEOUT_MS ? "resting" : "active";
          /* 상태 변화 없으면 이전 객체 유지 (불필요한 리렌더 방지) */
          if (!prev.isActive && prev.currentState === nextState && prev.initialized) return prev;
          return { isActive: false, lastActivityAt: lastAt, currentState: nextState, initialized: true };
        });
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

  return { zones, activeZoneIds, globalMotionState, reloadZones: loadZones };
}
