"use client";

/**
 * useThermalThrottle — 발열/배터리 보호용 비디오 트랙 프로파일 전환 훅.
 * 전이: isDimmed||idleExceeded→LOW+YOLO off / !isDimmed&&hasMotion→HIGH+YOLO on / idle 미도달→유지+YOLO off.
 * 히스테리시스: LOW→HIGH 복귀는 3s 쿨다운. hasMotion=true 고정 주입 시 HIGH+YOLO on 고정.
 * 로그 (`[s9-cam][thermal]`): L1 profile / L2 cooldown-held / L3 idle-exceeded /
 * L4 track-replaced / L5 first-apply / L6 apply-error / E first-apply-giveup.
 * 설계 한도: useEffect 7/7 (mount · E1~E6). 추가 금지 — 신규 로직은 기존 effect 병합.
 * @example
 * const { shouldInferYOLO, reapplyCurrent } = useThermalThrottle({
 *   localStreamRef,
 *   isBroadcasting,
 *   isDimmed,
 *   hasMotion,
 * });
 * @dependencies useGlobalMotion (hasMotion), useScreenDimmer (isDimmed), applyVideoTrackProfile
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVideoTrackProfile,
  type ThermalProfile,
} from "@/lib/webrtc/videoTrackConstraints";

/** 훅 옵션 — Arch 설계서와 동일한 키 그대로 사용 */
export interface UseThermalThrottleOptions {
  /** 현재 송출 중인 MediaStream ref (이 훅은 첫 번째 video track 을 제어) */
  localStreamRef: React.RefObject<MediaStream | null>;
  /** 방송 중 여부 (live/connecting) */
  isBroadcasting: boolean;
  /** 딤 상태 (useScreenDimmer.isDimmed) */
  isDimmed: boolean;
  /**
   * 글로벌 모션 유무 (boolean).
   * 모션 훅 미사용 시 `true` 주입해 HIGH + YOLO on 고정.
   */
  hasMotion: boolean;
  /** idle 로 판정하는 모션 없음 지속 시간 (기본 20초) */
  idleTimeoutMs?: number;
  /** 훅 활성화 여부 (기본 true) — false 면 모든 적용 스킵 */
  enabled?: boolean;
}

/** 훅 반환값 */
export interface UseThermalThrottleResult {
  /** 현재 프로파일 */
  currentProfile: ThermalProfile;
  /** YOLO 추론을 돌려도 되는 상태인가 */
  shouldInferYOLO: boolean;
  /** 외부에서 트랙 교체 직후 호출 — 현재 프로파일을 새 트랙에 재적용 */
  reapplyCurrent: () => Promise<void>;
  /** 마지막 applyVideoTrackProfile 실패 사유(있다면) */
  lastApplyError: string | null;
}

/** LOW → HIGH 복귀 쿨다운 (ms) */
const COOLDOWN_LOW_TO_HIGH_MS = 3_000;
/** 트랙 교체 감지 간격 (ms) — 렌더 중 ref 읽기 회피용 watcher 주기 */
const TRACK_WATCH_INTERVAL_MS = 5_000;
/** 첫 트랙 apply 보장용 폴링 간격 (ms) */
const FIRST_APPLY_POLL_MS = 3_000;
/** 첫 트랙 apply 보장용 최대 시도 횟수 */
const FIRST_APPLY_MAX_TRIES = 5;
/* cooldown-held 로그 폭주 방지 디바운스 간격 */
const COOLDOWN_LOG_DEBOUNCE_MS = 1_000;

export function useThermalThrottle({
  localStreamRef,
  isBroadcasting,
  isDimmed,
  hasMotion,
  idleTimeoutMs = 20_000,
  enabled = true,
}: UseThermalThrottleOptions): UseThermalThrottleResult {
  /* 상태 4개 — 설계 한도 준수
   * idleTick: idle 타이머 만료 시 증가시켜 Effect1 재실행을 유도하는 트리거 값 */
  const [currentProfile, setCurrentProfile] = useState<ThermalProfile>("HIGH");
  const [shouldInferYOLO, setShouldInferYOLO] = useState<boolean>(true);
  const [lastApplyError, setLastApplyError] = useState<string | null>(null);
  const [idleTick, setIdleTick] = useState<number>(0);

  /* ── 내부 참조 ── */
  /** 언마운트 후 set-state 가드 */
  const mountedRef = useRef(true);
  /** 마지막으로 hasMotion=true 였던 시각 (ms) — idle 판정에 사용 */
  const lastMotionAtRef = useRef<number>(Date.now());
  /** 마지막으로 LOW 로 내린 시각 — HIGH 복귀 쿨다운 기준 */
  const lastLowAtRef = useRef<number>(0);
  /** 현재 프로파일 ref — effect 밖(reapply, visibility, first apply)에서 참조 */
  const currentProfileRef = useRef<ThermalProfile>("HIGH");
  /** 적용 중인 트랙 id — 트랙 교체 감지용 */
  const appliedTrackIdRef = useRef<string | null>(null);
  /** idle 타임아웃 핸들 — window.setTimeout 의 숫자 핸들 타입으로 고정 (캐스팅 제거) */
  const idleTimerRef = useRef<number | null>(null);
  /** 직전 shouldInferYOLO 값 — 중복 setState 방지 */
  const prevInferRef = useRef<boolean>(true);
  /** 직전 lastApplyError 값 — L6 신규 에러 전이 감지용 */
  const prevApplyErrorRef = useRef<string | null>(null);
  /* HIGH #1 대책 — 방송 false→true 전이 시 lastMotionAtRef 리셋 트리거 */
  const prevIsBroadcastingRef = useRef(false);
  /* LOW #10 — cooldown-held 로그 1초 디바운스 */
  const lastCooldownLogAtRef = useRef(0);
  /* HIGH #12 — LOW→HIGH 쿨다운 해제 시점에 Effect1 재평가 유도용 tick 예약 타이머.
   * hasMotion=true 가 쿨다운 3초 내내 유지되면 Effect1 재실행 트리거가 없어
   * LOW 고착 상태가 되므로, 만료 타이머로 setIdleTick(n+1) 을 걸어 재평가한다. */
  const cooldownTickTimerRef = useRef<number | null>(null);

  /** idle 타이머 해제 헬퍼 — Effect2 guard/정상 cleanup 두 경로 공유. */
  const clearIdleTimer = () => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      /* HIGH #12 — unmount 시 예약 타이머 해제 */
      if (cooldownTickTimerRef.current !== null) {
        clearTimeout(cooldownTickTimerRef.current);
        cooldownTickTimerRef.current = null;
      }
    };
  }, []);

  /** 지정 프로파일을 현재 비디오 트랙에 적용. effect/콜백 내부 전용(ref 읽기 안전).
   * L4/L5 분기는 이전 트랙 id 존재 여부로 결정. state 는 건드리지 않음(Effect1 독점). */
  const applyToCurrentTrack = useCallback(
    async (profile: ThermalProfile) => {
      const stream = localStreamRef.current;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;

      const result = await applyVideoTrackProfile(track, profile);

      if (result.ok) {
        /* L4/L5 분기: appliedTrackIdRef 세팅 직전에 이전 id 존재 여부로 판정 */
        const prevId = appliedTrackIdRef.current;
        if (prevId === null) {
          /* L5 — 첫 apply 성공 */
          console.info(
            "[s9-cam][thermal] first-apply",
            JSON.stringify({ trackId: track.id, profile }),
          );
        } else if (prevId !== track.id) {
          /* L4 — 트랙 교체 감지 후 재적용 성공 */
          console.info(
            "[s9-cam][thermal] track-replaced",
            JSON.stringify({ oldId: prevId, newId: track.id, profile }),
          );
        }
        appliedTrackIdRef.current = track.id;
      }
      /* HIGH #2 — 실패 시 appliedTrackIdRef 갱신 금지 (Effect3 watcher 가 재시도할 수 있도록) */

      if (!mountedRef.current) return;
      if (result.ok) {
        setLastApplyError(null);
      } else {
        setLastApplyError(result.error ?? "unknown error");
      }
    },
    [localStreamRef],
  );

  /* ───────────────────────────────────────────────
   * Effect 1 — 전이 계산 (핵심 상태 머신)
   *
   * 입력: enabled, isBroadcasting, isDimmed, hasMotion, idleTick(타이머 트리거)
   * 출력: currentProfile, shouldInferYOLO + 실제 트랙 적용
   *
   * 주의: YOLO 플래그는 쿨다운 가드 '앞'에서 먼저 반영한다.
   *       그래야 프로파일 전이는 히스테리시스로 보류되어도
   *       YOLO on/off 는 즉시 반영되어 불필요한 추론을 바로 끊을 수 있다.
   * ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!enabled || !isBroadcasting) {
      /* HIGH #3 — 방송 꺼진 상태에선 YOLO 플래그도 false 로 동기화 */
      if (prevInferRef.current !== false) {
        prevInferRef.current = false;
        if (mountedRef.current) setShouldInferYOLO(false);
      }
      /* HIGH #1 재진입 대비 — 다음 방송 시작 때 lastMotionAt 리셋되도록 */
      prevIsBroadcastingRef.current = false;
      return;
    }

    const now = Date.now();

    /* HIGH #1 — 방송 false→true 전이 감지, 오래된 lastMotionAtRef 초기화 */
    if (!prevIsBroadcastingRef.current) {
      lastMotionAtRef.current = now;
      prevIsBroadcastingRef.current = true;
    }

    /* 모션이 있으면 최근 모션 시각 갱신 */
    if (hasMotion) {
      lastMotionAtRef.current = now;
    }

    /* idle 여부: 모션 없음 + 마지막 모션 이후 idleTimeoutMs 경과 */
    const idleExceeded =
      !hasMotion && now - lastMotionAtRef.current >= idleTimeoutMs;

    /* 목표 프로파일 / YOLO 플래그 결정 */
    const nextProfile: ThermalProfile =
      isDimmed || idleExceeded ? "LOW" : "HIGH";
    const nextInfer: boolean = hasMotion && !isDimmed;

    /* YOLO 플래그는 쿨다운 가드보다 먼저 반영 */
    if (prevInferRef.current !== nextInfer) {
      prevInferRef.current = nextInfer;
      if (mountedRef.current) setShouldInferYOLO(nextInfer);
    }

    /* LOW → HIGH 쿨다운 히스테리시스 — 쿨다운 중이면 프로파일 전이만 보류 */
    if (
      currentProfileRef.current === "LOW" &&
      nextProfile === "HIGH" &&
      now - lastLowAtRef.current < COOLDOWN_LOW_TO_HIGH_MS
    ) {
      /* L2 — 쿨다운으로 전이 보류. LOW #10 — 1초 디바운스로 과다 로깅 방지 */
      if (now - lastCooldownLogAtRef.current >= COOLDOWN_LOG_DEBOUNCE_MS) {
        lastCooldownLogAtRef.current = now;
        console.info(
          "[s9-cam][thermal] cooldown-held",
          JSON.stringify({
            held: currentProfileRef.current,
            remainingMs: COOLDOWN_LOW_TO_HIGH_MS - (now - lastLowAtRef.current),
          }),
        );
      }
      /* HIGH #12 — 쿨다운 해제 시점에 재평가 트리거. 중복 등록 방지. */
      if (cooldownTickTimerRef.current === null) {
        const remainingMs = COOLDOWN_LOW_TO_HIGH_MS - (now - lastLowAtRef.current);
        cooldownTickTimerRef.current = window.setTimeout(() => {
          cooldownTickTimerRef.current = null;
          if (mountedRef.current) setIdleTick((n) => n + 1);
        }, Math.max(0, remainingMs) + 50);
      }
      return;
    }

    /* 프로파일이 실제로 바뀔 때만 setState + apply */
    if (nextProfile !== currentProfileRef.current) {
      /* HIGH #12 — 전이 성사했으므로 예약 타이머 불필요, 해제 */
      if (cooldownTickTimerRef.current !== null) {
        clearTimeout(cooldownTickTimerRef.current);
        cooldownTickTimerRef.current = null;
      }
      /* L1 — 프로파일 전이 성사. reason 우선순위: dimmed > idle > motion */
      const reason = isDimmed ? "dimmed" : idleExceeded ? "idle" : "motion";
      console.info(
        "[s9-cam][thermal] profile",
        JSON.stringify({
          from: currentProfileRef.current,
          to: nextProfile,
          reason,
        }),
      );

      currentProfileRef.current = nextProfile;
      if (mountedRef.current) setCurrentProfile(nextProfile);
      if (nextProfile === "LOW") lastLowAtRef.current = now;
      /* async 는 effect 내부 IIFE (React 19 규칙 준수) */
      void (async () => {
        await applyToCurrentTrack(nextProfile);
      })();
    }
  }, [
    enabled,
    isBroadcasting,
    isDimmed,
    hasMotion,
    idleTick,
    idleTimeoutMs,
    applyToCurrentTrack,
  ]);

  /* Effect 2 — idle 타이머: hasMotion=false 로 들어오면 idleTimeoutMs+50ms 뒤 idleTick++ 로 Effect1 재평가 유도. 조건 변경/모션 감지 시 cleanup 에서 해제. */
  useEffect(() => {
    if (!enabled || !isBroadcasting) {
      return () => {
        clearIdleTimer();
      };
    }

    /* 모션이 없을 때만 타이머 장전 — 캐스팅 제거 후 직접 대입 */
    if (!hasMotion) {
      idleTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setIdleTick((n) => n + 1);
        /* L3 — idle 타이머 만료 */
        console.info(
          "[s9-cam][thermal] idle-exceeded",
          JSON.stringify({ idleMs: idleTimeoutMs }),
        );
      }, idleTimeoutMs + 50);
    }

    return () => {
      clearIdleTimer();
    };
    /* clearIdleTimer 는 ref-only 순수 헬퍼 — deps 제외 의도 */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [enabled, isBroadcasting, hasMotion, idleTimeoutMs]);

  /* Effect 3 — 트랙 교체 watcher(5s): reapplyCurrent() 호출 누락 대비용 폴백. 트랙 id 변동 감지 시 재적용. */
  useEffect(() => {
    if (!enabled || !isBroadcasting) return;
    const id = window.setInterval(() => {
      /* 아직 첫 apply 가 없으면 Effect5(첫 apply 폴링) 소관. 여긴 건너뜀. */
      if (!appliedTrackIdRef.current) return;
      const stream = localStreamRef.current;
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      /* 트랙 id 동일 → 교체 없음, 재적용 불필요 */
      if (appliedTrackIdRef.current === track.id) return;
      /* 트랙이 바뀌었다 → 현재 프로파일 재적용 (L4 로그는 applyToCurrentTrack 내부에서) */
      void applyToCurrentTrack(currentProfileRef.current);
    }, TRACK_WATCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, isBroadcasting, localStreamRef, applyToCurrentTrack]);

  /* Effect 4 — visibilitychange 재적용 + motion-grace 리셋.
   * 백그라운드 복귀 시: (1) lastMotionAtRef 리셋하여 첫 프레임 비교까지 idle 오판정 방지,
   *                     (2) setIdleTick 으로 Effect1 재평가 트리거,
   *                     (3) 현재 프로파일을 트랙에 재적용(Android 가 백그라운드에서 제약을 풀 수 있음).
   * 또한 Effect5 giveup 이후의 복구 채널 역할을 겸한다. */
  useEffect(() => {
    if (!enabled || !isBroadcasting) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      /* R8 C — 탭 복귀 직후 motion 훅이 첫 프레임 비교(최대 4s)까지
       * idle 오판정되지 않도록 lastMotionAt 리셋 + Effect1 재평가 트리거 */
      lastMotionAtRef.current = Date.now();
      if (mountedRef.current) setIdleTick((n) => n + 1);
      /* 기존 로직 — 현재 프로파일 재적용 */
      void applyToCurrentTrack(currentProfileRef.current);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enabled, isBroadcasting, applyToCurrentTrack]);

  /* Effect 5 — 첫 트랙 apply 보장(3s × 최대 5회). 방송 시작 시점 localStreamRef 공백 케이스 방지. 최대 시도 초과 시 E 로그 후 Effect4 복구 의존. */
  useEffect(() => {
    if (!enabled || !isBroadcasting) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const track = localStreamRef.current?.getVideoTracks?.()[0];
      if (track && appliedTrackIdRef.current !== track.id) {
        void applyToCurrentTrack(currentProfileRef.current);
        window.clearInterval(id);
        return;
      }
      if (tries >= FIRST_APPLY_MAX_TRIES) {
        /* E — 최대 시도 도달 포기 로그 */
        console.warn(
          "[s9-cam][thermal] first-apply-giveup",
          JSON.stringify({ tries }),
        );
        /* 포기 후 복구는 Effect4(visibilitychange) 경로에 의존 — 화면 잠금/해제로 재시도 */
        window.clearInterval(id);
      }
    }, FIRST_APPLY_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, isBroadcasting, localStreamRef, applyToCurrentTrack]);

  /* Effect 6 (L6) — lastApplyError 신규 전이 감지. null→str, str→str' 에만 warn. 회복(→null)은 조용히 통과. */
  useEffect(() => {
    /* MED #8 — disabled 상태에선 스킵 (이전 에러 상태도 그대로 보존) */
    if (!enabled) return;
    const prev = prevApplyErrorRef.current;
    if (lastApplyError && lastApplyError !== prev) {
      console.warn(
        "[s9-cam][thermal] apply-error",
        JSON.stringify({
          error: lastApplyError,
          profile: currentProfileRef.current,
        }),
      );
    }
    prevApplyErrorRef.current = lastApplyError;
  }, [lastApplyError, enabled]);

  /** 외부에서 트랙을 교체한 직후 호출 — 현재 프로파일을 새 트랙에 재적용 */
  const reapplyCurrent = useCallback(async () => {
    await applyToCurrentTrack(currentProfileRef.current);
  }, [applyToCurrentTrack]);

  return {
    currentProfile,
    shouldInferYOLO,
    reapplyCurrent,
    lastApplyError,
  };
}
