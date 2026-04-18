"use client";

/**
 * useZoneManager — zone CRUD 훅.
 *
 * Supabase camera_zones 테이블에 대한 추가/수정/삭제를 관리.
 * ZoneSetupPanel에서 사용.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CameraZone, ZoneRect, ZoneType } from "@/types/zone";
import { ZONE_TYPE_CONFIG, MAX_ZONES_PER_DEVICE } from "@/types/zone";

type UseZoneManagerOptions = {
  /** home_id — zone 조회/저장에 필요 */
  homeId: string;
  /** device_id — 특정 카메라의 zone만 관리 */
  deviceId: string;
};

export function useZoneManager({ homeId, deviceId }: UseZoneManagerOptions) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  /** zone 목록 */
  const [zones, setZones] = useState<CameraZone[]>([]);
  /** 로딩 상태 */
  const [isLoading, setIsLoading] = useState(true);

  /* zone 목록 로드 — 마운트 시 1회 */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("camera_zones")
          .select("*")
          .eq("home_id", homeId)
          .eq("device_id", deviceId)
          .order("created_at", { ascending: true });

        if (!error && data && !cancelled) {
          setZones(data as CameraZone[]);
        }
      } catch {
        /* 네트워크 에러 무시 — zone 없이도 동작 */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [supabase, homeId, deviceId]);

  /** zone 추가 */
  const addZone = useCallback(
    async (type: ZoneType, rect: ZoneRect, name?: string) => {
      /* 최대 개수 초과 방지 */
      if (zones.length >= MAX_ZONES_PER_DEVICE) return null;

      const config = ZONE_TYPE_CONFIG[type];
      const zoneName = name ?? `${config.label} ${zones.length + 1}`;

      const { data, error } = await supabase
        .from("camera_zones")
        .insert({
          home_id: homeId,
          device_id: deviceId,
          name: zoneName,
          zone_type: type,
          rect,
          color: config.defaultColor,
        })
        .select()
        .single();

      if (!error && data) {
        setZones((prev) => [...prev, data as CameraZone]);
        return data as CameraZone;
      }
      return null;
    },
    [supabase, homeId, deviceId, zones.length],
  );

  /** zone 삭제 */
  const removeZone = useCallback(
    async (zoneId: string) => {
      const { error } = await supabase
        .from("camera_zones")
        .delete()
        .eq("id", zoneId);

      if (!error) {
        setZones((prev) => prev.filter((z) => z.id !== zoneId));
      }
    },
    [supabase],
  );

  /** zone 업데이트 (이름, rect 등 부분 수정) */
  const updateZone = useCallback(
    async (zoneId: string, updates: Partial<Pick<CameraZone, "name" | "rect" | "zone_type">>) => {
      const { data, error } = await supabase
        .from("camera_zones")
        .update(updates)
        .eq("id", zoneId)
        .select()
        .single();

      if (!error && data) {
        setZones((prev) =>
          prev.map((z) => (z.id === zoneId ? (data as CameraZone) : z)),
        );
      }
    },
    [supabase],
  );

  return { zones, isLoading, addZone, removeZone, updateZone };
}
