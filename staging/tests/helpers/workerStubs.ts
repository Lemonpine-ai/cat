/**
 * Phase B (R4) — 테스트 헬퍼 공용 모듈 (M2 대응).
 *
 * 목적:
 *  - `yoloWorkerLifecycle.test.ts` 와 `yoloSampling.test.ts` 에 흩어져 있던
 *    Worker/ImageBitmap/Video/frameIdRef/loggerArm 관련 stub 을 한 곳에 모은다.
 *  - 두 테스트가 mock 하는 대상이 서로 달라 **일부 API 는 lifecycle 전용, 일부는 sampling 전용**.
 *    필요한 쪽만 import 해서 쓴다.
 *
 * 중요:
 *  - 본 파일은 **테스트 헬퍼** 이므로 `vitest.config.ts` 의 `test.include` 에는 추가하지 않는다
 *    (describe/it 블록 없음 → "No test found" 에러 방지).
 *  - `tsconfig.staging-check.json` 의 `include` 에는 추가 (타입 체크 대상).
 *
 * 설계서 연계:
 *  - docs/phase_b_arch_r4.md §2.2 공개 API 7개 명세.
 */

import { vi } from "vitest";

// ===== lifecycle 전용 — Worker 전체를 제어 가능한 stub =====

/** lifecycle 테스트에서 Worker 의 onmessage / postMessage / terminate 를 전부 제어하는 shape. */
export interface StubWorker {
  url: URL;
  messages: unknown[];
  listeners: Record<string, Array<(ev: unknown) => void>>;
  terminated: boolean;
  postMessage(msg: unknown): void;
  addEventListener(type: string, handler: (ev: unknown) => void): void;
  removeEventListener(type: string, handler: (ev: unknown) => void): void;
  terminate(): void;
  /** 테스트 헬퍼 — 외부에서 worker 응답을 흉내. */
  _emit(type: string, payload: unknown): void;
}

/**
 * 단일 StubWorker 인스턴스 생성.
 *
 * @param url `new Worker(url)` 에서 전달된 URL. 기본값은 placeholder.
 */
export function createStubWorker(url?: URL): StubWorker {
  const worker: StubWorker = {
    url: url ?? new URL("http://stub.local/worker"),
    messages: [],
    listeners: {},
    terminated: false,
    postMessage(msg: unknown) {
      this.messages.push(msg);
    },
    addEventListener(type: string, handler: (ev: unknown) => void) {
      (this.listeners[type] ??= []).push(handler);
    },
    removeEventListener(type: string, handler: (ev: unknown) => void) {
      const arr = this.listeners[type];
      if (!arr) return;
      this.listeners[type] = arr.filter((h) => h !== handler);
    },
    terminate() {
      this.terminated = true;
    },
    _emit(type: string, payload: unknown) {
      const arr = this.listeners[type];
      if (!arr) return;
      // forEach 중 리스너 해제가 일어나도 안전하도록 스냅샷 순회.
      for (const h of [...arr]) h(payload);
    },
  };
  return worker;
}

/**
 * `globalThis.Worker` 를 StubWorker 로 교체 + 생성된 stub 목록 관찰.
 *
 * 반환된 `reset()` 을 beforeEach 에서 호출하면 stubGlobal 을 다시 세팅한다
 * (vi.unstubAllGlobals 로 초기화된 상태에서도 동작).
 */
export function installWorkerStub(): {
  readonly createdWorkers: ReadonlyArray<StubWorker>;
  reset(): void;
} {
  const createdWorkers: StubWorker[] = [];

  class StubWorkerCtor {
    constructor(url: URL) {
      const w = createStubWorker(url);
      createdWorkers.push(w);
      // 생성자 리턴으로 stub 인스턴스를 그대로 노출.
      return w as unknown as StubWorkerCtor;
    }
  }

  const reset = (): void => {
    createdWorkers.length = 0;
    vi.stubGlobal("Worker", StubWorkerCtor as unknown as typeof Worker);
  };

  return { createdWorkers, reset };
}

// ===== sampling 전용 — postMessage 만 필요한 간이 worker mock =====

/** sampling 테스트용 — postMessage 호출만 스파이. */
export function makeWorkerPostMessageMock(): {
  worker: Worker;
  posted: unknown[];
} {
  const posted: unknown[] = [];
  const worker = {
    postMessage: vi.fn((msg: unknown, _transfer?: Transferable[]) => {
      posted.push(msg);
    }),
  } as unknown as Worker;
  return { worker, posted };
}

// ===== sampling 전용 — createImageBitmap 결과 =====

/** sampling 테스트용 — bitmap.close() 가 호출됐는지 추적. */
export function makeImageBitmapStub(): {
  bitmap: ImageBitmap;
  closeSpy: ReturnType<typeof vi.fn>;
} {
  const closeSpy = vi.fn();
  const bitmap = { close: closeSpy } as unknown as ImageBitmap;
  return { bitmap, closeSpy };
}

// ===== sampling 전용 — readyState/videoWidth 만 노출하는 video 최소 shape =====

/**
 * sampling 테스트용 — 실제 HTMLVideoElement 대신 필요 속성만 담은 shape.
 * @param ready true 면 readyState=4 / videoWidth=640, false 면 0 으로 세팅.
 */
export function makeVideoElStub(ready = true): HTMLVideoElement {
  return {
    readyState: ready ? 4 : 0,
    videoWidth: ready ? 640 : 0,
  } as unknown as HTMLVideoElement;
}

// ===== 공용 — frameIdRef 단순 생성 =====

/** lifecycle/sampling 공용 — frameIdRef / busyRef 같은 단순 ref 생성. */
export function makeFrameIdRef(initial = 0): { current: number } {
  return { current: initial };
}

// ===== driver renderHook 전용 — Supabase client 최소 stub =====

/**
 * R5 권고 2 — driver 훅 renderHook 테스트용 Supabase client mock.
 *
 * 목적:
 *  - `useBroadcasterYoloDriver` 가 내부적으로 `useBehaviorEventLogger` 를 호출하는데,
 *    logger 가 `supabase.auth.getUser()` / `supabase.from(...)` 등을 호출.
 *  - 본 stub 은 호출은 받아주되 실제 네트워크 IO 는 일으키지 않는다 (모두 빈 응답 반환).
 *  - INSERT/UPDATE select 등 logger 의 모든 메서드 체이닝 (`.from().insert().select().single()`,
 *    `.from().update().eq()` 등) 을 지원하기 위해 Proxy 로 thenable + chainable 객체 반환.
 *
 * 사용 전제:
 *  - 본 stub 은 driver 의 OFF→ON transient flush 검증 같은 단순 시나리오 전용.
 *    실제 INSERT 결과가 필요한 통합 테스트에는 부적합.
 *  - homeId/cameraId 를 null 로 넘기면 logger 본 effect 가 bail out → INSERT 자체가 안 일어남.
 */
export function makeSupabaseStub(): {
  client: unknown;
  authGetUserSpy: ReturnType<typeof vi.fn>;
  fromSpy: ReturnType<typeof vi.fn>;
} {
  const authGetUserSpy = vi.fn(async () => ({
    data: { user: null },
    error: null,
  }));
  const fromSpy = vi.fn();

  // chainable 메서드를 모두 자기 자신 (또는 thenable) 으로 반환하는 Proxy.
  // logger 가 사용하는 패턴: from().select().eq().maybeSingle() / from().insert().select().single() /
  //   from().update().eq() — 모두 마지막에 await 가 붙는다.
  const chainable: Record<string, unknown> = {};
  const handler: ProxyHandler<typeof chainable> = {
    get(_target, prop) {
      if (prop === "then") {
        // await 직접 가능 — 빈 결과 반환.
        return (resolve: (v: { data: null; error: null }) => unknown) =>
          resolve({ data: null, error: null });
      }
      if (prop === "single" || prop === "maybeSingle") {
        return () =>
          Promise.resolve({ data: null, error: null });
      }
      // 그 외는 자기 자신 (체이닝 지속).
      return new Proxy(chainable, handler);
    },
  };
  const chainProxy = new Proxy(chainable, handler);

  fromSpy.mockImplementation(() => chainProxy);

  const client = {
    auth: {
      getUser: authGetUserSpy,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: fromSpy,
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return { client, authGetUserSpy, fromSpy };
}

// ===== 공용 — loggerArmGuard 의 dev-only sentinel 청소 =====

/**
 * afterEach 에서 호출 — 전 테스트에서 남은 `window.__catBehaviorLoggerArmed__`
 * sentinel 을 제거해 테스트 간 간섭 방지.
 */
export function clearLoggerArmSentinel(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __catBehaviorLoggerArmed__?: string })
    .__catBehaviorLoggerArmed__ = undefined;
}
