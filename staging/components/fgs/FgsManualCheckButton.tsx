"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import styles from "./Fgs.module.css";

type Props = {
  /** 고양이 ID */
  catId: string;
  /** 분석 완료 후 콜백 (점수를 부모에게 전달) */
  onResult?: (score: number) => void;
};

/**
 * "지금 표정 체크" 버튼 — 유저가 수동으로 FGS 측정 요청
 * WebRTC 비디오에서 현재 프레임을 캡처하여 서버에 전송
 * home_id는 서버에서 세션 기반으로 자동 조회 (보안)
 */
export function FgsManualCheckButton({ catId, onResult }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    setLoading(true);

    try {
      /* 현재 페이지의 비디오 엘리먼트 찾기 */
      const video = document.querySelector("video") as HTMLVideoElement | null;
      if (!video || video.paused || video.videoWidth === 0) {
        alert("카메라가 연결되어 있지 않습니다.");
        return;
      }

      /* 프레임 캡처 */
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      const base64 = dataUrl.split(",")[1] || "";

      /* 서버에 전송 (home_id는 서버에서 세션 기반 자동 조회) */
      const res = await fetch("/api/fgs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cat_id: catId,
          frame: base64,
          source: "manual",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onResult?.(data.fgs_score);
      }
    } catch (error) {
      console.error("[ManualCheck] 실패:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={styles.manualCheckBtn}
      onClick={handleCheck}
      disabled={loading}
    >
      <Camera size={16} />
      {loading ? "분석 중..." : "지금 표정 체크"}
    </button>
  );
}
