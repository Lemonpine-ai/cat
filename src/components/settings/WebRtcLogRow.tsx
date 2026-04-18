"use client";

/**
 * WebRtcLogRow — 로그 대시보드의 단일 행.
 * 클릭하면 metadata 확장. 컴포넌트 100줄 제약 분리.
 */

import {
  EVENT_LABEL,
  ROLE_LABEL,
  eventColor,
  relativeTime,
  shortId,
} from "@/components/settings/webRtcLogLabels";
import type { WebRtcLogRow as WebRtcLogRowType } from "@/lib/webrtc/fetchWebRtcLogs";

export function WebRtcLogRow({
  row,
  expanded,
  onToggle,
}: {
  row: WebRtcLogRowType;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = eventColor(row.event_type);
  return (
    <li className="rounded-lg border border-[#d6ebe8] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span
          className="rounded px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: color.bg, color: color.fg }}
        >
          {EVENT_LABEL[row.event_type]}
        </span>
        <span className="text-sm text-[#5c7d79]">
          {relativeTime(row.created_at)}
        </span>
        <span className="text-sm">{ROLE_LABEL[row.role]}</span>
        <span className="ml-auto text-xs text-[#5c7d79]">
          카메라 {shortId(row.camera_id)}
        </span>
      </button>
      {row.error_message && (
        <p className="px-3 pb-2 text-xs text-[#b45309]">
          에러: {row.error_message}
        </p>
      )}
      {expanded && (
        <pre className="mx-3 mb-2 overflow-x-auto rounded bg-[#f0f7f5] p-2 text-[11px] text-[#0c2825]">
          {JSON.stringify(
            {
              pc_state: row.pc_state,
              reconnect_attempt: row.reconnect_attempt,
              device_id: row.device_id,
              created_at: row.created_at,
              metadata: row.metadata,
            },
            null,
            2,
          )}
        </pre>
      )}
    </li>
  );
}
