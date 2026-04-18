"use client";

/**
 * WebRtcLogsDashboard — WebRTC 연결 로그 대시보드.
 * 설정 > WebRTC 로그 페이지에서 사용.
 *
 * 사장님이 카메라 끊김 이력을 조회할 수 있도록 설계됨.
 * - 최근 50건 이벤트를 시간 내림차순으로 표시
 * - role / event_group 필터 2종
 * - 항목 클릭 시 metadata JSON 확장 표시
 */

import { useEffect, useMemo, useState } from "react";
import { WebRtcLogRow } from "@/components/settings/WebRtcLogRow";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchWebRtcLogs,
  type WebRtcLogFilter,
  type WebRtcLogRow as WebRtcLogRowType,
} from "@/lib/webrtc/fetchWebRtcLogs";
import type { WebRtcLogRole } from "@/lib/webrtc/webrtcConnectionLogger";
type GroupFilter = "" | "errors" | "reconnects";

export function WebRtcLogsDashboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [logs, setLogs] = useState<WebRtcLogRowType[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<WebRtcLogRole | "">("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  /* 필터 변경 시 재조회 — cleanup flag 로 이전 결과 덮어쓰기 방지 */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const filter: WebRtcLogFilter = {
      role: roleFilter || undefined,
      eventGroup: groupFilter || undefined,
    };
    void fetchWebRtcLogs(supabase, filter).then((rows) => {
      if (!alive) return;
      setLogs(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [supabase, roleFilter, groupFilter]);

  return (
    <div className="text-[#0c2825]">
      {/* 필터 영역 — 역할 / 이벤트 그룹 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as WebRtcLogRole | "")}
          className="rounded border border-[#b7d7d2] bg-white px-3 py-1.5 text-sm"
          aria-label="역할 필터"
        >
          <option value="">전체 역할</option>
          <option value="broadcaster">카메라(송신)</option>
          <option value="viewer_slot">슬롯 뷰어</option>
          <option value="viewer_live">라이브 뷰어</option>
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value as GroupFilter)}
          className="rounded border border-[#b7d7d2] bg-white px-3 py-1.5 text-sm"
          aria-label="이벤트 필터"
        >
          <option value="">전체 이벤트</option>
          <option value="errors">에러만</option>
          <option value="reconnects">재연결만</option>
        </select>
      </div>

      {/* 로그 리스트 — 로딩/빈상태/정상 3분기 */}
      {loading ? (
        <p className="text-sm text-[#5c7d79]">로그 불러오는 중…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-[#5c7d79]">
          조건에 맞는 로그가 없어요. 아직 카메라 이벤트가 없거나 필터가 좁아요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((row) => (
            <WebRtcLogRow
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === row.id ? null : row.id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
