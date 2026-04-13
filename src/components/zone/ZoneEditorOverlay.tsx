"use client";

/**
 * ZoneEditorOverlay — 카메라 영상 위에 드래그로 영역을 그리는 canvas.
 * 터치(모바일) + 마우스(PC) 모두 지원.
 * 좌표는 0~1 정규화로 저장하여 해상도에 무관하게 동작.
 */

import { useCallback, useRef, useState } from "react";
import type { ZoneRect } from "@/types/zone";
import { MIN_ZONE_SIZE } from "@/types/zone";

type ZoneEditorOverlayProps = {
  /** 그리기 완료 시 호출 — 정규화된 rect 전달 */
  onZoneDrawn: (rect: ZoneRect) => void;
  /** 기존 zone들 (그리는 동안 반투명 표시) */
  existingZones?: { rect: ZoneRect; color: string }[];
};

export function ZoneEditorOverlay({
  onZoneDrawn,
  existingZones = [],
}: ZoneEditorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  /** canvas 위의 마우스/터치 좌표를 0~1 정규화 */
  function normalizePoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  }

  /** canvas 다시 그리기 — 기존 zone + 현재 그리는 중인 rect */
  const redraw = useCallback(
    (currentRect?: ZoneRect) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      /* canvas 해상도를 실제 표시 크기에 맞춤 */
      const bounds = canvas.getBoundingClientRect();
      canvas.width = bounds.width;
      canvas.height = bounds.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* 기존 zone 반투명 표시 */
      for (const zone of existingZones) {
        const r = zone.rect;
        ctx.fillStyle = zone.color;
        ctx.fillRect(
          r.x * canvas.width,
          r.y * canvas.height,
          r.width * canvas.width,
          r.height * canvas.height,
        );
      }

      /* 현재 그리는 중인 rect */
      if (currentRect) {
        ctx.strokeStyle = "#4FD1C5";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(
          currentRect.x * canvas.width,
          currentRect.y * canvas.height,
          currentRect.width * canvas.width,
          currentRect.height * canvas.height,
        );
        ctx.setLineDash([]);
      }
    },
    [existingZones],
  );

  /* 드래그 시작 (마우스 + 터치) */
  function handleStart(clientX: number, clientY: number) {
    startRef.current = normalizePoint(clientX, clientY);
    setIsDrawing(true);
  }

  /* 드래그 중 — 실시간 rect 미리보기 */
  function handleMove(clientX: number, clientY: number) {
    if (!isDrawing || !startRef.current) return;
    const end = normalizePoint(clientX, clientY);
    const rect = makeRect(startRef.current, end);
    redraw(rect);
  }

  /* 드래그 완료 — rect 확정 */
  function handleEnd(clientX: number, clientY: number) {
    if (!startRef.current) return;
    setIsDrawing(false);
    const end = normalizePoint(clientX, clientY);
    const rect = makeRect(startRef.current, end);
    startRef.current = null;

    /* 최소 크기 검증 */
    if (rect.width >= MIN_ZONE_SIZE && rect.height >= MIN_ZONE_SIZE) {
      onZoneDrawn(rect);
    }
    redraw();
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 cursor-crosshair touch-none"
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={(e) => handleEnd(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) handleStart(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) handleMove(t.clientX, t.clientY);
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (t) handleEnd(t.clientX, t.clientY);
      }}
    />
  );
}

/** 시작점+끝점 → 정규화된 rect (음수 드래그 대응) */
function makeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): ZoneRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
