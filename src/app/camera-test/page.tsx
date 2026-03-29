"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "cat-moments";

type UploadPhase =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done"; publicUrl: string; logId: string }
  | { kind: "error"; message: string };

type ProfileWithHome = {
  homeId: string;
  userId: string;
};

type CatMinimal = {
  id: string;
  name: string;
};

/**
 * 웹캠 캡처 → cat-moments 업로드 → cat_logs INSERT 테스트 페이지.
 * 경로: {home_id}/{cat_id}/{timestamp}_test.jpg
 */
export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>({ kind: "idle" });
  const [profile, setProfile] = useState<ProfileWithHome | null>(null);
  const [cats, setCats] = useState<CatMinimal[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessionAndCats() {
      try {
        const supabase = createSupabaseBrowserClient();

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          setInitError("로그인이 필요합니다. /login 에서 먼저 로그인해 주세요.");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("home_id")
          .eq("id", user.id)
          .single();

        if (profileError || !profileData?.home_id) {
          setInitError(
            profileError?.message ??
              "profiles.home_id 가 없습니다. Supabase에서 home_id를 연결해 주세요.",
          );
          return;
        }

        setProfile({ homeId: profileData.home_id as string, userId: user.id });

        const { data: catRows, error: catError } = await supabase
          .from("cats")
          .select("id, name")
          .order("name", { ascending: true });

        if (catError) {
          setInitError(catError.message);
          return;
        }

        const catList = (catRows ?? []) as CatMinimal[];
        setCats(catList);
        if (catList.length > 0) {
          setSelectedCatId(catList[0].id);
        }
      } catch (err) {
        setInitError(err instanceof Error ? err.message : "초기화 오류");
      }
    }

    void fetchSessionAndCats();
  }, []);

  useEffect(() => {
    let mediaStream: MediaStream | null = null;

    async function startWebcam() {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setStreamReady(true);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === "NotAllowedError"
              ? "카메라 권한이 거부됐습니다. 브라우저 주소창 옆 아이콘에서 허용해 주세요."
              : err.name === "NotFoundError"
                ? "연결된 카메라를 찾을 수 없습니다."
                : err.message
            : "웹캠을 시작할 수 없습니다.";
        setStreamError(message);
      }
    }

    void startWebcam();

    return () => {
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function handleCapture() {
    if (!profile) {
      setPhase({ kind: "error", message: "세션 정보가 없습니다. 새로고침 후 다시 시도해 주세요." });
      return;
    }
    if (!selectedCatId) {
      setPhase({ kind: "error", message: "고양이를 선택해 주세요." });
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      setPhase({ kind: "error", message: "카메라가 준비되지 않았습니다." });
      return;
    }

    setPhase({ kind: "uploading" });

    try {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas context 를 가져올 수 없습니다.");
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("이미지 변환에 실패했습니다."));
          },
          "image/jpeg",
          0.88,
        );
      });

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const storagePath = `${profile.homeId}/${selectedCatId}/${timestamp}_test.jpg`;

      const supabase = createSupabaseBrowserClient();

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage 업로드 실패: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      const { data: logRow, error: logError } = await supabase
        .from("cat_logs")
        .insert({
          home_id: profile.homeId,
          cat_id: selectedCatId,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          captured_at: new Date().toISOString(),
          mime_type: "image/jpeg",
          file_size_bytes: blob.size,
          width_px: canvas.width,
          height_px: canvas.height,
          recorded_by: profile.userId,
        })
        .select("id")
        .single();

      if (logError) {
        throw new Error(`cat_logs 기록 실패: ${logError.message}`);
      }

      setPhase({
        kind: "done",
        publicUrl: publicUrlData.publicUrl,
        logId: logRow.id as string,
      });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "전송에 실패했습니다.",
      });
    }
  }

  const isUploading = phase.kind === "uploading";

  return (
    <div style={outerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>📸 카메라 테스트</h1>
        <p style={subtitleStyle}>웹캠을 촬영해 cat-moments 버킷에 업로드합니다.</p>

        {initError ? (
          <p style={errorBannerStyle}>{initError}</p>
        ) : null}

        {streamError ? (
          <p style={errorBannerStyle}>{streamError}</p>
        ) : null}

        <div style={videoWrapStyle}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={videoStyle}
          />
          {!streamReady && !streamError ? (
            <div style={videoOverlayStyle}>
              <span style={{ fontSize: "2rem" }}>📷</span>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#5c7d79" }}>
                카메라 권한 요청 중…
              </p>
            </div>
          ) : null}
        </div>

        {/* 고양이 선택 */}
        {cats.length > 0 ? (
          <div style={catSelectWrapStyle}>
            <label style={labelStyle} htmlFor="cat-select">
              어떤 고양이?
            </label>
            <select
              id="cat-select"
              value={selectedCatId}
              onChange={(e) => { setSelectedCatId(e.target.value); }}
              style={selectStyle}
            >
              {cats.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* 전송 버튼 */}
        <button
          type="button"
          onClick={() => { void handleCapture(); }}
          disabled={isUploading || !streamReady || !profile || !selectedCatId}
          style={{
            ...captureButtonStyle,
            ...(isUploading || !streamReady || !profile || !selectedCatId
              ? captureButtonDisabledStyle
              : {}),
          }}
        >
          {isUploading ? "전송 중…" : "전송"}
        </button>

        {/* 결과 */}
        {phase.kind === "done" ? (
          <div style={resultWrapStyle}>
            <p style={successTextStyle}>🎉 기록 완료! 보리가 아주 좋아할 거예요!</p>
            <p style={resultMetaStyle}>log id: {phase.logId}</p>
            <a href={phase.publicUrl} target="_blank" rel="noreferrer" style={linkStyle}>
              업로드된 사진 보기 →
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={phase.publicUrl}
              alt="방금 찍은 사진"
              style={thumbnailStyle}
            />
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <p style={errorBannerStyle}>{phase.message}</p>
        ) : null}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

/* ─── 인라인 스타일 (테스트 전용 — 심플하게) ──────────────────────────────── */

const outerStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  padding: "2rem 1rem 4rem",
  background: "linear-gradient(165deg, #f4fbf9 0%, #ecfdf5 55%, #e0f2fe 100%)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "480px",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1.75rem 1.5rem",
  borderRadius: "1.25rem",
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(20,184,166,0.2)",
  boxShadow: "0 4px 24px rgba(13,148,136,0.1)",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 900,
  color: "#0a3d38",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.82rem",
  color: "#5c7d79",
  lineHeight: 1.5,
};

const videoWrapStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16/9",
  borderRadius: "1rem",
  overflow: "hidden",
  background: "#0f172a",
  border: "1px solid rgba(20,184,166,0.25)",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const videoOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(15,23,42,0.65)",
  color: "#fff",
};

const catSelectWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  fontWeight: 700,
  color: "#134e4a",
};

const selectStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  borderRadius: "0.75rem",
  border: "1.5px solid rgba(13,148,136,0.3)",
  background: "#fafefd",
  fontSize: "0.9rem",
  color: "#0c2825",
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
};

const captureButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "1rem",
  borderRadius: "1rem",
  border: "none",
  fontSize: "1.15rem",
  fontWeight: 900,
  color: "#fff",
  cursor: "pointer",
  background: "linear-gradient(135deg, #0d9488 0%, #0891b2 50%, #06b6d4 100%)",
  boxShadow: "0 8px 28px rgba(13,148,136,0.35)",
  transition: "filter 0.15s",
  fontFamily: "inherit",
};

const captureButtonDisabledStyle: React.CSSProperties = {
  opacity: 0.55,
  cursor: "not-allowed",
  boxShadow: "none",
};

const resultWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
  padding: "0.85rem",
  borderRadius: "0.85rem",
  background: "linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)",
  border: "1px solid rgba(52,211,153,0.5)",
};

const successTextStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 800,
  fontSize: "0.9rem",
  color: "#047857",
};

const resultMetaStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.68rem",
  color: "#6b7280",
  wordBreak: "break-all",
};

const linkStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 700,
  color: "#0f766e",
  textDecoration: "none",
};

const thumbnailStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "0.65rem",
  border: "1px solid rgba(20,184,166,0.2)",
  objectFit: "cover",
  maxHeight: "220px",
};

const errorBannerStyle: React.CSSProperties = {
  margin: 0,
  padding: "0.7rem 0.85rem",
  borderRadius: "0.75rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  lineHeight: 1.45,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fca5a5",
};
