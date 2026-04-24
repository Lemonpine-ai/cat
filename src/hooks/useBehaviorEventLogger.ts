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
// Phase A: staging/types/behavior.ts 의 확장 타입 (top2/bboxAreaRatio 옵셔널) 사용.
// (staging/hooks → staging/types)
import type { BehaviorDetection } from "../types/behavior";

/**
 * Phase A: 모델 버전 상수 — metadata.model_version 기록.
 * - Phase E 에서 archive vs active 구분 키로 활용 ("v1" 데이터는 archive 대상).
 * - 추후 v2 모델 배포 시 본 상수만 갱신 (DB 스키마 변경 불필요).
 */
const BEHAVIOR_MODEL_VERSION = "v1";

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
  /**
   * 현재 확정된 고양이 ID (useCatIdentifier 결과, null 허용).
   * INSERT 시점의 값이 cats.cat_id로 기록된다. 미구별(null)이면 cat_id=NULL.
   * - ref로 읽어 deps 변경 → effect 재실행을 막는다 (매 프레임 갱신되므로).
   */
  identifiedCatId?: string | null;
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
  identifiedCatId,
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
   * identifiedCatId 최신값 ref — 매 프레임 바뀌어도 effect 재실행 없이 INSERT 시점에만 읽는다.
   * null 허용 (미구별 상태). cats.cat_id에 주입.
   */
  const identifiedCatIdRef = useRef<string | null>(identifiedCatId ?? null);
  identifiedCatIdRef.current = identifiedCatId ?? null;
  /**
   * ⚠️ R8 추가 (R72): localStorage 큐 100건 초과 warn 1회 가드.
   *   세션 동안 동일 메시지 반복 출력 방지.
   */
  const queueOverflowWarnedRef = useRef<boolean>(false);
  /**
   * ⚠️ R8 추가 (R7-(2)): flush 동시 실행 mutex.
   *   INSERT 성공 시 큐 flush 가 호출되는데, 짧은 시간 내 여러 성공 INSERT 가
   *   연달아 발생하면 같은 큐를 동시 INSERT 해 중복 row 가 생길 수 있음.
   *   flushInProgressRef 가 true 면 후속 호출 즉시 return → 직렬화.
   */
  const flushInProgressRef = useRef<boolean>(false);

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
        // Phase A: metadata JSONB 적재 (top2 / bbox_area_ratio / model_version)
        // - undefined 키는 명시적으로 제외 (DB JSONB 가 undefined 인식 못함).
        // - model_version 은 항상 채움 (Phase E export/archive 분류 키).
        // metadata-freeze-spec: r7-1
        const metadata: Record<string, unknown> = {
          model_version: BEHAVIOR_MODEL_VERSION,
        };
        if (detection.top2Class !== undefined) {
          metadata.top2_class = detection.top2Class;
        }
        if (typeof detection.top2Confidence === "number") {
          metadata.top2_confidence = detection.top2Confidence;
        }
        if (typeof detection.bboxAreaRatio === "number") {
          metadata.bbox_area_ratio = detection.bboxAreaRatio;
        }

        // INSERT payload — 실패 시 localStorage 큐에 저장할 동일 객체.
        const insertPayload = {
          user_id: userId,
          home_id: homeId,
          camera_id: cameraId,
          // 개체 구별 결과 — null이면 미구별 이벤트로 기록 (RLS OK, 컬럼 nullable)
          cat_id: identifiedCatIdRef.current,
          behavior_class: detection.classKey,
          behavior_label: detection.label,
          // 항상 최신 avgConfidence 사용 (ref로 읽어 effect 재실행 방지)
          confidence: avgConfRef.current ?? detection.confidence,
          bbox: detection.bbox,
          detected_at: startedAt.toISOString(),
          metadata,
        };

        const { data, error } = await supabase
          .from("cat_behavior_events")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error || !data) {
          // eslint-disable-next-line no-console
          console.error("[BehaviorLogger] INSERT 실패", error);
          // ⚠️ R7 추가 (R62): INSERT 실패 시 localStorage 큐에 보존.
          //   다음 성공 INSERT 후 flush 되어 오프라인/일시 장애에도 이벤트 유실 방지.
          //   max 100 rows — 넘치면 oldest 부터 drop (LRU). ended_at 은 큐에서 재구성
          //   불가하므로 open 상태 row 로만 복구됨 (Phase D 라벨링 가능).
          try {
            const raw = localStorage.getItem("pending_behavior_events");
            const queue = raw ? JSON.parse(raw) : [];
            // ⚠️ R8 변경 (R72): push 전 검사 + 1회 warn.
            //   기존 코드는 push 후 shift 였는데, shift 가 항상 oldest(=index 0)를
            //   제거하므로 새로 push 한 신규 row 가 100건 도달 직후에는 oldest 와 함께
            //   "직전 row" 가 밀려 FIFO 순서가 살짝 손상될 수 있음. push 전에 cap 을
            //   먼저 확보하면 신규 row 는 항상 큐 끝에 보존되며 100 cap 도 정확히 유지.
            //   warn 은 1 세션 1회만 출력 (큐 폭증 시 로그 도배 방지).
            if (queue.length >= 100) {
              if (!queueOverflowWarnedRef.current) {
                // eslint-disable-next-line no-console
                console.warn(
                  "[useBehaviorEventLogger] localStorage 큐 100건 초과 — oldest drop",
                );
                queueOverflowWarnedRef.current = true;
              }
              queue.shift();
            }
            queue.push({
              ...insertPayload,
              queued_at: new Date().toISOString(),
            });
            localStorage.setItem(
              "pending_behavior_events",
              JSON.stringify(queue),
            );
          } catch {
            /* localStorage 실패 무시 — private mode / quota 초과 등 */
          }
          return null;
        }
        // ⚠️ R7 추가 (R62): INSERT 성공 후 큐 flush 시도.
        //   offline 복구 시 축적된 이벤트 일괄 전송. 성공 시 큐 비움.
        //   실패 시 다음 기회에 재시도 (큐 유지).
        // ⚠️ R8 추가 (R7-(2)): flushInProgressRef 로 중복 flush 차단.
        //   짧은 시간 내 여러 성공 INSERT 가 연달아 발생해도 큐 INSERT 는 1회만.
        //   try/finally 로 마지막에 false 복원 — 에러 경로에서도 mutex 해제 보장.
        if (!flushInProgressRef.current) {
          flushInProgressRef.current = true;
          try {
            const raw = localStorage.getItem("pending_behavior_events");
            const queue = raw ? JSON.parse(raw) : [];
            if (Array.isArray(queue) && queue.length > 0) {
              // queued_at 은 DB 컬럼이 아니므로 INSERT 직전 제거.
              const sanitized = queue.map((row: Record<string, unknown>) => {
                const rest = { ...row };
                delete rest.queued_at;
                return rest;
              });
              const flushPromise = supabase
                .from("cat_behavior_events")
                .insert(sanitized)
                .then(
                  ({ error: flushError }) => {
                    if (!flushError) {
                      try {
                        localStorage.removeItem("pending_behavior_events");
                      } catch {
                        /* 무시 */
                      }
                    }
                  },
                  () => undefined,
                );
              // flush 비동기 종료 후 mutex 해제 (성공/실패 무관).
              void Promise.resolve(flushPromise).finally(() => {
                flushInProgressRef.current = false;
              });
            } else {
              // 큐가 비어있으면 즉시 mutex 해제.
              flushInProgressRef.current = false;
            }
          } catch {
            /* localStorage 파싱 실패 무시 — 다음 성공 시 재시도 */
            flushInProgressRef.current = false;
          }
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

  /**
   * ⚠️ R8 추가 (R7-(1)): 로그아웃 시 localStorage 큐 + 사용자 캐시 초기화.
   *   - SIGNED_OUT 이벤트 발생 시 pending_behavior_events 제거 → 다음 사용자가
   *     로그인했을 때 이전 사용자의 user_id 가 박힌 row 가 잘못 flush 되는 것 방지.
   *   - userIdRef 도 비워 다음 로그인에서 homes.owner_id 재해석 강제.
   *   - lastKeyRef 도 초기화 → 재로그인 후 첫 감지가 "전환" 으로 인식되도록.
   *   - 구독 정리 cleanup 필수 (HMR/언마운트 시 leak 방지).
   */
  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem("pending_behavior_events");
        } catch {
          /* 무시 — private mode / quota 등 */
        }
        userIdRef.current = null;
        lastKeyRef.current = "__none__";
      }
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [supabase]);
}
