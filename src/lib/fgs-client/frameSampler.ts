/* ──────────────────────────────────────
   프레임 샘플러 — WebRTC 스트림에서 고양이 표정 캡처
   ⚠️ 클라이언트 전용 — 브라우저에서만 실행
   ────────────────────────────────────── */

/** 샘플링 간격 설정 (밀리초) */
const DAY_INTERVAL = 5 * 60 * 1000;   // 낮: 5분
const NIGHT_INTERVAL = 30 * 60 * 1000; // 야간(22시-6시): 30분

/**
 * 움직임 감지 임계값 (픽셀 차이 비율)
 * 2% = 100x75 썸네일 기준 약 150픽셀 이상 변화
 * 고양이가 잠만 자면 변화 거의 없어서 1-2%가 적절
 * 너무 낮으면(0.5%) 카메라 노이즈에도 반응, 너무 높으면(5%) 움직임 놓침
 */
const MOTION_THRESHOLD = 0.02;

/**
 * 현재 시간이 야간(22시-6시)인지 확인
 */
function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

/**
 * 현재 샘플링 간격 반환 (야간이면 30분, 낮이면 5분)
 */
function getInterval(): number {
  return isNightTime() ? NIGHT_INTERVAL : DAY_INTERVAL;
}

/**
 * 비디오 엘리먼트에서 프레임을 캡처하여 base64로 반환
 *
 * @param video - WebRTC 비디오 엘리먼트
 * @returns base64 인코딩된 JPEG 이미지 (data:... 접두사 제거)
 */
function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(video, 0, 0);

  /* base64 추출 (data:image/jpeg;base64, 접두사 제거) */
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.split(",")[1] || "";
}

/** 움직임 감지용 축소 크기 — 풀 해상도 비교는 모바일에서 느림 */
const THUMB_W = 100;
const THUMB_H = 75;

/**
 * 두 프레임 간 움직임 감지 (축소 이미지 비교)
 * 100x75 썸네일로 축소 후 비교하여 성능 확보
 *
 * @param prev - 이전 프레임 ImageData (축소본)
 * @param curr - 현재 프레임 ImageData (축소본)
 * @returns true이면 움직임 감지됨
 */
function detectMotion(
  prev: ImageData | null,
  curr: ImageData,
): boolean {
  if (!prev) return true; // 첫 프레임은 항상 전송

  let diffCount = 0;
  const totalPixels = curr.data.length / 4;

  /* 픽셀별 RGB 차이 비교 */
  for (let i = 0; i < curr.data.length; i += 4) {
    const rDiff = Math.abs(curr.data[i] - prev.data[i]);
    const gDiff = Math.abs(curr.data[i + 1] - prev.data[i + 1]);
    const bDiff = Math.abs(curr.data[i + 2] - prev.data[i + 2]);

    /* 평균 차이가 30 이상이면 변화된 픽셀로 카운트 */
    if ((rDiff + gDiff + bDiff) / 3 > 30) {
      diffCount++;
    }
  }

  return diffCount / totalPixels > MOTION_THRESHOLD;
}

/**
 * 비디오에서 축소된 ImageData 추출 (움직임 감지용)
 * 풀 해상도 대신 100x75로 축소하여 비교 → 모바일 성능 확보
 */
function getImageData(video: HTMLVideoElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  /* 비디오를 축소하여 그림 */
  ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
  return ctx.getImageData(0, 0, THUMB_W, THUMB_H);
}

/**
 * 프레임 샘플러 시작 — 주기적으로 고양이 표정을 캡처하여 서버에 전송
 * home_id는 서버에서 세션 기반으로 자동 조회 (보안)
 *
 * @param video - WebRTC 비디오 엘리먼트
 * @param catId - 고양이 ID
 * @returns 정리 함수 (컴포넌트 언마운트 시 호출)
 */
export function startFrameSampler(
  video: HTMLVideoElement,
  catId: string,
): () => void {
  let prevImageData: ImageData | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function sample() {
    if (stopped) return;

    try {
      /* 비디오가 재생 중인지 확인 */
      if (video.paused || video.ended || video.videoWidth === 0) {
        scheduleNext();
        return;
      }

      /* 움직임 감지 */
      const currImageData = getImageData(video);
      if (!currImageData) {
        scheduleNext();
        return;
      }

      const hasMotion = detectMotion(prevImageData, currImageData);
      prevImageData = currImageData;

      /* 움직임 없으면 스킵 */
      if (!hasMotion) {
        scheduleNext();
        return;
      }

      /* 프레임 캡처 + 서버 전송 */
      const frameBase64 = captureFrame(video);
      if (!frameBase64) {
        scheduleNext();
        return;
      }

      /* home_id는 서버에서 세션 기반으로 자동 조회 */
      await fetch("/api/fgs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cat_id: catId,
          frame: frameBase64,
          source: "auto",
        }),
      });
    } catch (error) {
      console.error("[FrameSampler] 전송 실패:", error);
    }

    scheduleNext();
  }

  function scheduleNext() {
    if (stopped) return;
    timerId = setTimeout(sample, getInterval());
  }

  /* 첫 샘플링 시작 */
  scheduleNext();

  /* 정리 함수 반환 */
  return () => {
    stopped = true;
    if (timerId) clearTimeout(timerId);
  };
}
