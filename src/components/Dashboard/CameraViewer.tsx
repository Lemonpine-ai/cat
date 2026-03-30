/**
 * 대시보드용 카메라 수신 UI — 실제 구현은 catvisor/CameraLiveViewer 에 있습니다.
 * offer_sdp 는 DB 에서 `decodeSdpFromDatabaseColumn` 으로 파싱 (순수 SDP·JSON 레거시 모두).
 */
export { CameraLiveViewer as CameraViewer } from "@/components/catvisor/CameraLiveViewer";
