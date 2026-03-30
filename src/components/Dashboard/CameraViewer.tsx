/**
 * 대시보드용 카메라 수신 UI — 실제 구현은 catvisor/CameraLiveViewer 에 있습니다.
 * offer/answer SDP 파싱·ICE(ice_candidates Realtime + DB) 교환은 모두 그쪽에서 처리합니다.
 */
export { CameraLiveViewer as CameraViewer } from "@/components/catvisor/CameraLiveViewer";
