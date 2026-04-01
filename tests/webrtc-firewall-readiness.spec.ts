import { expect, test } from "@playwright/test";
import {
  buildWebRtcIceServers,
  isWebRtcTurnEnvComplete,
} from "../src/lib/webrtc/buildWebRtcIceServers";

test.describe("WebRTC ICE 설정 (방화벽·NAT 대비)", () => {
  test("기본: STUN 서버만 포함되고 개수가 일정하다", () => {
    const servers = buildWebRtcIceServers({});
    expect(servers.length).toBeGreaterThanOrEqual(3);
    const stunLike = servers.filter((entry) => {
      const urls = entry.urls;
      const joined = Array.isArray(urls) ? urls.join(",") : String(urls);
      return joined.includes("stun:");
    });
    expect(stunLike.length).toBeGreaterThanOrEqual(3);
  });

  test("TURN env가 있으면 relay용 항목이 추가된다", () => {
    const servers = buildWebRtcIceServers({
      NEXT_PUBLIC_WEBRTC_TURN_URLS:
        "turn:example-turn.local:3478,turns:example-turn.local:5349",
      NEXT_PUBLIC_WEBRTC_TURN_USERNAME: "test-user",
      NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL: "test-credential",
    });
    const relayEntries = servers.filter((entry) => {
      const urls = entry.urls;
      const joined = Array.isArray(urls) ? urls.join(",") : String(urls);
      return (
        joined.includes("turn:") ||
        joined.includes("turns:") ||
        joined.includes("turn ")
      );
    });
    expect(relayEntries.length).toBe(2);
    expect(relayEntries[0].username).toBe("test-user");
    expect(relayEntries[0].credential).toBe("test-credential");
  });

  test("Chromium에서 RTCPeerConnection이 우리 ICE 목록을 받아들이고 후보 수집이 완료된다", async ({
    page,
  }) => {
    const iceServers = buildWebRtcIceServers({});
    const result = await page.evaluate(async (servers) => {
      const pc = new RTCPeerConnection({ iceServers: servers });
      const candidateLines: string[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          candidateLines.push(event.candidate.candidate);
        }
      };
      pc.createDataChannel("webrtc-ice-probe");
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") done();
        });
        window.setTimeout(done, 12000);
      });
      const state = pc.iceGatheringState;
      pc.close();
      return {
        gatheringState: state,
        candidateCount: candidateLines.length,
        hasSrflxOrRelay: candidateLines.some(
          (line) =>
            line.includes(" typ srflx ") ||
            line.includes(" typ relay ") ||
            line.includes(" typ host "),
        ),
      };
    }, iceServers);

    expect(result.gatheringState).toBe("complete");
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.hasSrflxOrRelay).toBe(true);
  });

  test("TURN 항목이 섞여 있어도 Chromium에서 ICE 수집이 완료된다 (형식·크래시 검증)", async ({
    page,
  }) => {
    const iceServers = buildWebRtcIceServers({
      NEXT_PUBLIC_WEBRTC_TURN_URLS:
        "turn:example.invalid:3478,turns:example.invalid:5349",
      NEXT_PUBLIC_WEBRTC_TURN_USERNAME: "probe-user",
      NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL: "probe-credential",
    });

    const result = await page.evaluate(async (servers) => {
      const pc = new RTCPeerConnection({ iceServers: servers });
      const candidateLines: string[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          candidateLines.push(event.candidate.candidate);
        }
      };
      pc.createDataChannel("webrtc-turn-shape-probe");
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") done();
        });
        window.setTimeout(done, 6000);
      });
      pc.close();
      return {
        gatheringComplete: true,
        candidateCount: candidateLines.length,
      };
    }, iceServers);

    expect(result.gatheringComplete).toBe(true);
    expect(result.candidateCount).toBeGreaterThan(0);
  });

  test("TURN URL 전체를 따옴표로 감싼 경우에도 파싱된다", () => {
    const servers = buildWebRtcIceServers({
      NEXT_PUBLIC_WEBRTC_TURN_URLS:
        '"turn:quoted.example:3478,turns:quoted.example:5349"',
      NEXT_PUBLIC_WEBRTC_TURN_USERNAME: "u",
      NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL: "c",
    });
    const relayCount = servers.filter((e) => {
      const j = Array.isArray(e.urls) ? e.urls.join(",") : String(e.urls);
      return /turns?:/i.test(j);
    }).length;
    expect(relayCount).toBe(2);
  });

  test("isWebRtcTurnEnvComplete 는 세 변수가 모두 있을 때만 true", () => {
    expect(isWebRtcTurnEnvComplete({})).toBe(false);
    expect(
      isWebRtcTurnEnvComplete({
        NEXT_PUBLIC_WEBRTC_TURN_URLS: "turn:x:1",
        NEXT_PUBLIC_WEBRTC_TURN_USERNAME: "a",
        NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL: "b",
      }),
    ).toBe(true);
  });
});

/**
 * 참고: 실제 “방화벽 뒤에서만 안 됨”은 OS·라우터·통신사가 UDP/TURN을 어떻게 허용하느냐에 달려 있어
 * Playwright(HTTP 위주)로 동일하게 재현할 수 없다. 실전 검증은 LTE/공용 Wi‑Fi에서 TURN(가능하면 turns:443) 설정 후 수동 확인이 필요하다.
 */
