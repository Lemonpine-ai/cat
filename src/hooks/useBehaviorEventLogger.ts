/**
 * 행동 이벤트 DB 로거 훅
 * - useBehaviorDetection의 currentBehavior "전환 시점"만 DB에 기록
 *   · 이전 행동(진행 중 row) → ended_at UPDATE
 *   · 새 행동 → 새 row INSERT
 * - fire-and-forget: DB I/O는 await 없이 void → UI 블록 금지
 * - Supabase 클라이언트는 useMemo로 단일 인스턴스 유지
 * - user_id는 homes.owner_id 우선 (공동 사용자도 대표 owner로 기록 → RLS 통과)
 *
 * 사용처: CameraSlot에서 useBehaviorDetection 결과를 받아 연결
 *
 * DB 스키마: staging/lib/supabase/cat-behavior-events-migration.sql
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BehaviorDetection } from "@/types/behavior";

type UseBehaviorEventLoggerArgs = {
  /** 현재 집 ID (RLS home_id 기준) */
  homeId: string | null;
  /** 카메라 디바이스 ID (null 이면 로깅 비활성) */
  cameraId: string | null;
  /**
   * 현재 확정된 행동 (useBehaviorDetection의 currentBehavior 그대로 주입).
   * 내부에서 "전환" 여부를 직접 감지한다 (이전 classKey 추적).
   */
  currentBehavior: BehaviorDetection | null;
  /** 평균 신뢰도 (옵션). 미지정 시 currentBehavior.confidence 사용 */
  avgConfidence?: number;
  /** 공용 Supabase 클라이언트 주입 (중복 realtime 소켓 방지). 미주입 시 자체 생성 */
  supabaseClient?: SupabaseClient;
};

/**
 * DB에 기록된 "현재 진행 중" 행동 이벤트 참조
 * - ended_at UPDATE 시점에 id가 필요
 * - serial: insert 호출마다 증가하는 일련번호. close 전후로 다른 insert가 끼어들어
 *   openEventRef가 바뀐 경우 "이전 타겟을 엉뚱한 새 row와 close" 하는 경합을 막는다.
 */
type OpenEventRef = {
  id: string;
  classKey: string;
  serial: number;
};

export function useBehaviorEventLogger({
  homeId,
  cameraId,
  currentBehavior,
  avgConfidence,
  supabaseClient,
}: UseBehaviorEventLoggerArgs): void {
  /** supabase 클라이언트 — 렌더마다 재생성 방지 */
  const supabase = useMemo(
    () => supabaseClient ?? createSupabaseBrowserClient(),
    [supabaseClient],
  );

  /** 직전 전환 시점에 생성된 open row 참조 (ended_at 채우기용) */
  const openEventRef = useRef<OpenEventRef | null>(null);
  /** 직전 confirmed classKey — 전환 감지용 ("__none__" = 비행동) */
  const lastKeyRef = useRef<string>("__none__");
  /**
   * user_id 캐시 — 매 INSERT마다 auth.getUser() 호출 방지.
   * homes.owner_id를 우선 사용 (공동 사용자도 owner로 기록 → RLS 통과).
   */
  const userIdRef = useRef<string | null>(null);
  /**
   * 진행 중 INSERT Promise — async 경합 방지용.
   * INSERT 완료 전 다음 전환이 오면 이 Promise를 await 해서 id를 얻은 뒤 close.
   */
  const pendingInsertRef = useRef<Promise<string | null> | null>(null);
  /**
   * insert 일련번호 카운터 — A→B→A 빠른 전환 시 close가 엉뚱한 row를 건드리지 않도록
   * openEventRef에 serial을 함께 저장하고, close 직전/직후에 serial이 동일한지 검증.
   */
  const serialRef = useRef(0);
  /**
   * avgConfidence 최신값 ref 저장 — props 변경이 effect deps에 들어가 재실행되는 것을 막고,
   * insertNewEvent 내부에서는 항상 최신 값을 읽게 한다.
   */
  const avgConfRef = useRef(avgConfidence);
  avgConfRef.current = avgConfidence;

  /**
   * 초기 1회 user_id 해석:
   * 1) homes.owner_id 조회 (RLS 정책이 owner_id 기준이므로 공동 사용자도 owner로 기록)
   * 2) 실패 시 auth.getUser() fallback
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      let resolved: string | null = null;
      if (homeId) {
        const { data: home } = await supabase
          .from("homes")
          .select("owner_id")
          .eq("id", homeId)
          .maybeSingle();
        resolved = (home?.owner_id as string | undefined) ?? null;
      }
      if (!resolved) {
        const { data: authData } = await supabase.auth.getUser();
        resolved = authData?.user?.id ?? null;
      }
      if (alive) userIdRef.current = resolved;
    })();
    return () => {
      alive = false;
    };
  }, [supabase, homeId]);

  /**
   * 특정 event row의 ended_at 채우기 (fire-and-forget)
   * - 실패는 console.error로만 기록 (UI 영향 없음)
   */
  const closeEventById = useCallback(
    (id: string, endedAt: Date) => {
      void supabase
        .from("cat_behavior_events")
        .update({ ended_at: endedAt.toISOString() })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            // eslint-disable-next-line no-console
            console.error("[BehaviorLogger] ended_at UPDATE 실패", error);
          }
        });
    },
    [supabase],
  );

  /**
   * 이전 "진행 중" 이벤트를 안전하게 종료.
   * - openEventRef가 있으면 즉시 close
   * - 아직 INSERT 중이면 pending Promise await 후 close (고아 row 방지)
   * - A→B→A 빠른 전환 대비: await 전후로 serial이 동일할 때만 실제 close 수행.
   */
  const closeOpenEvent = useCallback(
    async (endedAt: Date) => {
      const open = openEventRef.current;
      if (!open) {
        // open은 없지만 pending insert가 진행 중이면 완료를 기다렸다가 close (고아 row 방지)
        const pending = pendingInsertRef.current;
        if (pending) {
          const pendingId = await pending;
          if (pendingId) {
            closeEventById(pendingId, endedAt);
          }
        }
        return;
      }
      // open이 이미 확정되어 있으면 즉시 close.
      // openEventRef를 먼저 비워 다른 호출이 동일 row를 중복 close하지 못하게 한다.
      const targetId = open.id;
      openEventRef.current = null;
      closeEventById(targetId, endedAt);
    },
    [closeEventById],
  );

  /**
   * 새 행동 row INSERT (fire-and-forget, 경합 방지)
   * - INSERT 시작 시점에 pendingInsertRef + serial 예약 → 전환이 빨라도 고아 row 방지
   * - userIdRef가 아직 null이면 최대 3초 폴링 대기 → 초기 로딩 race로 인한 누락 방지
   * - 완료 후 openEventRef에 id 저장 (단, 더 최신 insert가 시작됐다면 덮지 않음)
   */
  const insertNewEvent = useCallback(
    (detection: BehaviorDetection, startedAt: Date) => {
      if (!homeId || !cameraId) return;
      // 이 insert의 고유 serial 할당 (close 경합 방지용)
      const serial = ++serialRef.current;
      const insertPromise = (async (): Promise<string | null> => {
        // user_id 해석 완료 전이면 최대 3초까지 50ms 간격 폴링 (초기 race 구제)
        if (!userIdRef.current) {
          const started = Date.now();
          while (!userIdRef.current && Date.now() - started < 3000) {
            await new Promise((r) => setTimeout(r, 50));
          }
          if (!userIdRef.current) return null; // timeout → 조용히 스킵
        }
        const userId = userIdRef.current;
        if (!userId) return null;
        const { data, error } = await supabase
          .from("cat_behavior_events")
          .insert({
            user_id: userId,
            home_id: homeId,
            camera_id: cameraId,
            behavior_class: detection.classKey,
            behavior_label: detection.label,
            // 항상 최신 avgConfidence 사용 (ref로 읽어 effect 재실행 방지)
            confidence: avgConfRef.current ?? detection.confidence,
            bbox: detection.bbox,
            detected_at: startedAt.toISOString(),
          })
          .select("id")
          .single();
        if (error || !data) {
          // eslint-disable-next-line no-console
          console.error("[BehaviorLogger] INSERT 실패", error);
          return null;
        }
        return (data.id as string) ?? null;
      })();
      pendingInsertRef.current = insertPromise;
      void insertPromise.then((id) => {
        // 이 insert가 여전히 최신 pending일 때만 openEventRef 교체
        if (pendingInsertRef.current === insertPromise) {
          openEventRef.current = id
            ? { id, classKey: detection.classKey, serial }
            : null;
          pendingInsertRef.current = null;
        }
      });
    },
    // avgConfidence는 ref로 처리하므로 deps에서 제외 → 매 추론마다 effect 재생성 방지
    [supabase, homeId, cameraId],
  );

  /**
   * currentBehavior 변경 감지 → 전환 시점만 DB 반영
   * - 동일 classKey 유지 중에는 no-op
   * - null 전환 → 이전 row close만 수행
   * - 새 행동 전환 → 이전 row close + 새 row insert
   */
  useEffect(() => {
    // 카메라/홈 미지정 → 로깅 비활성
    if (!homeId || !cameraId) return;

    const nowKey = currentBehavior?.classKey ?? "__none__";
    if (nowKey === lastKeyRef.current) return; // 전환 없음

    const now = new Date();
    // 1) 이전 행동 종료 처리 (pending insert가 있다면 내부에서 await)
    void closeOpenEvent(now);
    // 2) 새 행동 시작 (비행동 전환이면 insert 생략)
    if (currentBehavior) {
      insertNewEvent(currentBehavior, now);
    }
    lastKeyRef.current = nowKey;
  }, [currentBehavior, homeId, cameraId, closeOpenEvent, insertNewEvent]);

  /**
   * homeId/cameraId 전환 또는 언마운트 시 진행 중 이벤트 강제 종료
   * - 카메라 교체 시 이전 open row가 ended_at 없이 고아로 남는 것 방지
   * - supabase는 cleanup 순간의 인스턴스로 안전하게 사용
   */
  useEffect(() => {
    return () => {
      // fire-and-forget 유지: 진행 중 INSERT가 있으면 await 후 close → 고아 row 방지
      void (async () => {
        const endedAt = new Date();
        const pending = pendingInsertRef.current;
        if (pending) {
          const pendingId = await pending;
          if (pendingId) {
            const { error } = await supabase
              .from("cat_behavior_events")
              .update({ ended_at: endedAt.toISOString() })
              .eq("id", pendingId);
            if (error) {
              // eslint-disable-next-line no-console
              console.error(
                "[BehaviorLogger] cleanup(pending) ended_at UPDATE 실패",
                error,
              );
            }
          }
        }
        const open = openEventRef.current;
        if (open) {
          openEventRef.current = null;
          const { error } = await supabase
            .from("cat_behavior_events")
            .update({ ended_at: endedAt.toISOString() })
            .eq("id", open.id);
          if (error) {
            // eslint-disable-next-line no-console
            console.error(
              "[BehaviorLogger] cleanup ended_at UPDATE 실패",
              error,
            );
          }
        }
      })();
      // 전환/언마운트 시에는 직전 key도 초기화 — 재마운트 후 첫 감지가 "전환"으로 인식되도록
      lastKeyRef.current = "__none__";
    };
  }, [homeId, cameraId, supabase]);
}
