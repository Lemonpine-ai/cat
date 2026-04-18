"""
YOLOv8 .pt → ONNX 변환 스크립트
- 학습 완료된 YOLOv8n 모델을 브라우저에서 실행 가능한 ONNX 포맷으로 변환
- opset 17: onnxruntime-web 호환성 최고
- simplify=True: 불필요한 노드 제거로 추론 속도 향상
- dynamic=False: 고정 입력 크기(640x640)로 최적화

실행 방법:
    python staging/scripts/export_yolo_onnx.py

변환 후 수동 복사 필요:
    cp runs/detect/train4/weights/best.onnx public/models/cat_behavior_yolov8n.onnx
"""

from pathlib import Path
from ultralytics import YOLO


def main() -> None:
    # 학습 완료된 best.pt 경로
    pt_path = Path("runs/detect/train4/weights/best.pt")

    if not pt_path.exists():
        raise FileNotFoundError(
            f"학습된 모델을 찾을 수 없습니다: {pt_path}\n"
            "먼저 YOLOv8 학습을 완료하세요."
        )

    print(f"[INFO] 모델 로드: {pt_path}")
    model = YOLO(str(pt_path))

    # ONNX 변환 (onnxruntime-web 호환 설정)
    print("[INFO] ONNX 변환 시작 (opset=17, simplify=True)")
    export_path = model.export(
        format="onnx",
        opset=17,       # onnxruntime-web 1.17+ 호환
        simplify=True,  # 그래프 단순화로 추론 속도 향상
        dynamic=False,  # 고정 shape (640x640) - 최적화 극대화
        imgsz=640,      # 표준 YOLO 입력 크기
        half=False,     # FP32 - WebGPU/WebGL fallback 호환
    )

    print(f"[OK] 변환 완료: {export_path}")
    print(
        "\n[수동 작업]\n"
        f"  1) {export_path} 파일을 확인하세요\n"
        "  2) public/models/cat_behavior_yolov8n.onnx 로 복사하세요\n"
        "  3) 파일 크기가 10MB를 넘으면 Git LFS 등록 필요\n"
    )


if __name__ == "__main__":
    main()
