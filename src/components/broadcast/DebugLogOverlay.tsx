"use client";

/**
 * DebugLogOverlay — 프로덕션 진단용 화면 내 로그 오버레이
 *
 * USB 디버깅 없이 S9/G7 같은 실기기에서 `[s9-cam]` 로그를 확인하기 위한 도구.
 * URL 에 `?debug=1` 쿼리 파라미터가 있을 때만 활성화 — 일반 사용자에겐 보이지 않음.
 *
 * 동작:
 *   - console.info / warn / error 를 프록시로 감싸서 호출 내용을 capture
 *   - message 에 `[s9-cam]` 태그 포함 시 state 에 prepend
 *   - 화면 하단 fixed overlay 로 최근 50줄 표시
 *   - 레벨별 색상 (info=민트 / warn=주황 / error=빨강)
 *
 * 사용:
 *   - 브로드캐스트 페이지에 import 후 항상 렌더
 *   - 내부에서 ?debug=1 체크 후 활성화 여부 결정
 *
 * 제거 시점:
 *   - S9 진단 완료 후 CameraBroadcastClient 에서 import 제거 + 이 파일 삭제(또는 보존)
 */

import { useEffect, useRef, useState } from "react";

/** 오버레이에 유지할 최근 로그 최대 줄 수 */
const MAX_LOG_LINES = 50;
/** 로그 필터 태그 — 이 태그가 포함된 console 호출만 오버레이에 표시 */
const LOG_FILTER_TAG = "[s9-cam]";

/** 개별 로그 엔트리 */
type LogEntry = {
  /** 모노로직 키 (React key 용) */
  id: number;
  /** HH:MM:SS.mmm 타임스탬프 */
  time: string;
  /** 레벨 — 색상 구분용 */
  level: "info" | "warn" | "error";
  /** 출력 텍스트 — 인자들을 space 로 join */
  text: string;
};

/** console 인자를 안전하게 문자열로 변환 — 객체는 JSON.stringify, 실패 시 String() */
function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

/** 현재 시간 — HH:MM:SS.mmm 포맷 */
function nowTimeLabel(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function DebugLogOverlay() {
  /* URL 쿼리 ?debug=1 체크 — SSR 에서는 undefined 라 false 기본값 */
  const [enabled, setEnabled] = useState(false);
  /* 로그 배열 — 최신이 위로 prepend */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  /* 접기/펼치기 토글 */
  const [collapsed, setCollapsed] = useState(false);
  /* 일련번호 ref — id 생성용 */
  const idRef = useRef(0);

  /* 마운트 시 ?debug=1 여부 확인 (클라이언트 전용, SSR 안전) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") {
      setEnabled(true);
    }
  }, []);

  /* enabled=true 일 때만 console 프록시 설치 */
  useEffect(() => {
    if (!enabled || typeof console === "undefined") return;

    /* 원본 함수 백업 — 언마운트 시 복구 */
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    /* 공통 처리 — 태그 매칭 시 state 에 추가 */
    const captureFactory = (level: LogEntry["level"]) =>
      (...args: unknown[]) => {
        const text = args.map(formatArg).join(" ");
        if (text.includes(LOG_FILTER_TAG)) {
          idRef.current += 1;
          const entry: LogEntry = {
            id: idRef.current,
            time: nowTimeLabel(),
            level,
            text,
          };
          setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_LINES));
        }
      };

    /* info/warn/error 만 프록시 — log 는 noise 많아서 제외 */
    const capturedInfo = captureFactory("info");
    const capturedWarn = captureFactory("warn");
    const capturedError = captureFactory("error");

    console.info = (...args: unknown[]) => {
      capturedInfo(...args);
      originalInfo(...args);
    };
    console.warn = (...args: unknown[]) => {
      capturedWarn(...args);
      originalWarn(...args);
    };
    console.error = (...args: unknown[]) => {
      capturedError(...args);
      originalError(...args);
    };

    /* cleanup — 원본 복구 */
    return () => {
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        /* 접힘 상태: 헤더만 보이는 24px 고정 / 펼침 시 화면 하단 45vh */
        maxHeight: collapsed ? 24 : "45vh",
        background: "rgba(0, 0, 0, 0.88)",
        color: "#e8e8e8",
        fontFamily: "'Courier New', monospace",
        fontSize: "10px",
        lineHeight: "1.35",
        zIndex: 999999,
        overflow: "hidden",
        borderTop: "1px solid rgba(79, 209, 197, 0.5)",
        backdropFilter: "blur(6px)",
      }}
      role="log"
      aria-live="polite"
      aria-label="디버그 로그 오버레이"
    >
      {/* 헤더 — 탭하면 접기/펼치기 */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          height: 24,
          background: "rgba(79, 209, 197, 0.15)",
          color: "#4fd1c5",
          border: "none",
          padding: "0 8px",
          fontFamily: "inherit",
          fontSize: "10px",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label={collapsed ? "로그 펼치기" : "로그 접기"}
      >
        <span>🐾 [s9-cam] debug · {logs.length}건 · {collapsed ? "▲ 탭하면 펼침" : "▼ 탭하면 접음"}</span>
        <span style={{ opacity: 0.7 }}>?debug=1</span>
      </button>

      {/* 로그 목록 — 접혔으면 숨김 */}
      {!collapsed && (
        <div
          style={{
            overflowY: "auto",
            maxHeight: "calc(45vh - 24px)",
            padding: "4px 8px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: "#888", padding: "8px 0" }}>
              로그 대기 중… 카메라 켜기 탭하면 [s9-cam] 로그가 쌓입니다.
            </div>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                style={{
                  color:
                    l.level === "error"
                      ? "#ff6b6b"
                      : l.level === "warn"
                        ? "#ffd166"
                        : "#95e1d3",
                  wordBreak: "break-all",
                  marginBottom: 2,
                }}
              >
                <span style={{ color: "#666", marginRight: 4 }}>{l.time}</span>
                <span style={{ color: "#888", marginRight: 4 }}>
                  [{l.level.toUpperCase()}]
                </span>
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
