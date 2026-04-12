# CATvisor 온디바이스 AI 학습 가이드

## 모델 구성 (3단계 파이프라인)

| 단계 | 모델 | 역할 | 크기 | 라이선스 |
|------|------|------|---:|------|
| 1 | YOLOv7-tiny | 고양이 얼굴 검출 | 6MB | MIT |
| 2 | MobileNetV3-Small (Head A) | 개체 식별 (나비? 모모?) | 2.5MB | MIT |
| 3 | MobileNetV3-Small (Head B) | FGS 통증 분류 (0~4) | 공유 | MIT |

## 1단계: Google Colab 접속

1. https://colab.research.google.com 접속
2. Google 계정 로그인 (무료 계정 OK)

## 2단계: 노트북 업로드 + GPU 설정

1. **파일 → 노트북 업로드** 클릭
2. `scripts/catvisor_ondevice_ai.ipynb` 파일 선택
3. 상단 메뉴: **런타임 → 런타임 유형 변경**
4. 하드웨어 가속기: **T4 GPU** 선택 → **저장**

## 3단계: Roboflow 가입 (무료)

학습 데이터를 다운로드하려면 Roboflow API 키가 필요합니다.

1. https://app.roboflow.com 접속
2. Google 계정으로 가입 (무료)
3. **Settings → API Key** 복사
4. 노트북 STEP 2의 `ROBOFLOW_API_KEY`에 붙여넣기

## 4단계: 실행

- 각 셀을 위에서 아래로 **Shift+Enter**
- 또는 **런타임 → 모두 실행**
- 전체 약 **2시간** 소요
- **브라우저를 열어두세요** (무료 Colab은 닫으면 끊김)

## 5단계: 결과 확인

학습 완료 후 Google Drive에 모델 파일 저장됨:

```
내 드라이브/catvisor-ai/
  ├── yolov7-tiny-catface.pt    — 얼굴 검출
  ├── mobilenetv3-fgs-best.pt   — FGS 분류
  ├── mobilenetv3-catid-best.pt — 개체 식별
  └── onnx/
        ├── catvisor-detect.onnx — 얼굴 검출 (앱용)
        ├── catvisor-fgs.onnx    — FGS 분류 (앱용)
        └── catvisor-catid.onnx  — 개체 식별 (앱용)
```

## 비용

| 항목 | 비용 |
|------|------|
| Google Colab | 무료 |
| Roboflow | 무료 |
| YOLOv7 + MobileNetV3 | 무료 (MIT 라이선스) |
| **합계** | **$0** |

## 주의사항

- 무료 Colab은 **브라우저 닫으면 세션 끊김** → 열어두세요
- GPU 배정 안 되면 30분 후 다시 시도
- 학습 완료 후 반드시 Google Drive에 모델 저장 확인
