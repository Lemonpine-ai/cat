# ============================================================
# Phase 2A — 노트북 4: MobileNetV3 학습 + 평가 + 변환
# Colab에서 실행. 셀 구분은 "# %%" 주석으로 표시.
# ============================================================

# %% [1] Google Drive 마운트 + GPU 확인
from google.colab import drive
drive.mount('/content/drive')

import torch
import numpy as np
import pandas as pd
print(f'PyTorch: {torch.__version__}')
print(f'CUDA 사용 가능: {torch.cuda.is_available()}')

if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    device = torch.device('cuda')
else:
    print('⚠️ GPU 없음! 런타임 → 런타임 유형 변경 → T4 GPU로 설정하세요.')
    print('   CPU로도 학습 가능하지만 시간이 10배 이상 걸립니다.')
    print('   T4 못 받으면 → 런타임 재시작 시도, 또는 새벽에 다시 시도.')
    device = torch.device('cpu')

# %% [2] 설정값
import os

BASE = '/content/drive/MyDrive/catvisor-ai'
DATA = f'{BASE}/data/final'    # Phase C에서 만든 최종 데이터
MODEL_DIR = f'{BASE}/models/mobilenetv3-fgs'
os.makedirs(MODEL_DIR, exist_ok=True)

# 하이퍼파라미터
IMG_SIZE = 224    # MobileNetV3 표준 입력 크기
BATCH_SIZE = 32   # Colab T4 메모리에 적합한 크기
NUM_WORKERS = 2   # 데이터 로딩 병렬 처리
SEED = 42         # 재현성 보장 (같은 시드 → 같은 결과)

# 시드 고정 (모든 랜덤 요소에 적용)
torch.manual_seed(SEED)
torch.cuda.manual_seed_all(SEED)
np.random.seed(SEED)

# %% [3] 패키지 설치
# !pip install scikit-learn

# %% [4] 데이터 로더 구성
import torchvision.transforms as T
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader, WeightedRandomSampler

# 학습용 이미지 변환 (약간의 augmentation 포함)
train_transform = T.Compose([
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.RandomHorizontalFlip(p=0.5),                  # 좌우 반전
    T.ColorJitter(brightness=0.1, contrast=0.1),     # 밝기/대비 미세 변경
    T.ToTensor(),                                     # 텐서로 변환 (0~1)
    T.Normalize(mean=[0.485, 0.456, 0.406],          # ImageNet 평균으로 정규화
                std=[0.229, 0.224, 0.225]),
])

# 검증/테스트용 변환 (augmentation 없음 — 순수 성능 측정)
eval_transform = T.Compose([
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]),
])

# ImageFolder: 폴더명이 곧 클래스 이름
# data/final/train/normal/ → 클래스 0
# data/final/train/pain/   → 클래스 1
train_dataset = ImageFolder(f'{DATA}/train', transform=train_transform)
val_dataset = ImageFolder(f'{DATA}/val', transform=eval_transform)
test_dataset = ImageFolder(f'{DATA}/test', transform=eval_transform)

print(f'클래스 매핑: {train_dataset.classes}')  # ['normal', 'pain']
print(f'학습: {len(train_dataset)}장')
print(f'검증: {len(val_dataset)}장')
print(f'테스트: {len(test_dataset)}장')

# 학습 데이터 클래스별 개수 확인
train_labels = [label for _, label in train_dataset.samples]
normal_count = train_labels.count(0)
pain_count = train_labels.count(1)
print(f'학습 데이터 — 정상: {normal_count}장, 통증: {pain_count}장')

# %% [5] WeightedRandomSampler 설정
# 문제: 정상 3,000장 vs 통증 300장 → 모델이 "전부 정상"이라 해도 90% 정확도
# 해결: 통증 사진을 3배 자주 보여줘서 균형 맞춤

weights_per_class = [1.0 / normal_count, 3.0 / pain_count]
sample_weights = [weights_per_class[label] for label in train_labels]

sampler = WeightedRandomSampler(
    weights=sample_weights,
    num_samples=len(train_labels),  # 전체 데이터 수만큼 샘플링
    replacement=True,                # 복원 추출 (같은 통증 사진 여러번 봄)
)

# 데이터 로더 생성
train_loader = DataLoader(
    train_dataset, batch_size=BATCH_SIZE,
    sampler=sampler, num_workers=NUM_WORKERS,
)
val_loader = DataLoader(
    val_dataset, batch_size=BATCH_SIZE,
    shuffle=False, num_workers=NUM_WORKERS,
)
test_loader = DataLoader(
    test_dataset, batch_size=BATCH_SIZE,
    shuffle=False, num_workers=NUM_WORKERS,
)

# %% [6] 모델 구성 — MobileNetV3-Small + 새 분류 head
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
import torch.nn as nn

# ImageNet으로 사전학습된 모델 로드
model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)

# 기존 1000-클래스 head를 2-클래스 head로 교체
# MobileNetV3-Small 원래 구조: Linear(576, 1024) → Linear(1024, 1000)
# 우리 구조: Linear(576, 128) → ReLU → Dropout(0.3) → Linear(128, 2)
model.classifier = nn.Sequential(
    nn.Linear(576, 128),     # 576차원 특징 → 128차원으로 압축
    nn.ReLU(),                # 활성화 함수
    nn.Dropout(p=0.3),       # 30% 뉴런을 랜덤으로 끔 (과적합 방지)
    nn.Linear(128, 2),       # 2클래스 출력: [정상 확률, 통증 확률]
)

model = model.to(device)

total_params = sum(p.numel() for p in model.parameters())
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f'총 파라미터: {total_params:,}개')
print(f'학습 가능: {trainable_params:,}개')

# %% [7] backbone 고정/해제 함수
def freeze_backbone(model):
    """backbone(특징 추출부) 고정 — 새 head만 학습 (전반부용)"""
    for name, param in model.named_parameters():
        if 'classifier' not in name:
            param.requires_grad = False
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'backbone 고정. 학습 가능 파라미터: {trainable:,}개 (head만)')

def unfreeze_backbone(model):
    """backbone 해제 — 전체 네트워크 학습 (후반부용)"""
    for param in model.parameters():
        param.requires_grad = True
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'backbone 해제. 학습 가능 파라미터: {trainable:,}개 (전체)')

# 전반부: backbone 고정하고 head만 먼저 학습
freeze_backbone(model)

# %% [8] 손실 함수 + 옵티마이저
# class_weights [1.0, 5.0]: 통증을 놓치면 5배 페널티
# → 의료 특성상 "통증인데 정상이라 함(위음성)"이 더 위험하므로
class_weights = torch.tensor([1.0, 5.0]).to(device)
criterion = nn.CrossEntropyLoss(weight=class_weights)

# AdamW 옵티마이저 (낮은 학습률로 안정적 학습)
optimizer = torch.optim.AdamW(
    filter(lambda p: p.requires_grad, model.parameters()),
    lr=1e-4,           # 학습률
    weight_decay=1e-4,  # 가중치 정규화 (과적합 방지)
)

# %% [9] 학습 + 평가 함수
from sklearn.metrics import recall_score, precision_score, f1_score, confusion_matrix

def train_one_epoch(model, loader, criterion, optimizer):
    """에포크 1회 학습 → 평균 손실, 정확도 반환"""
    model.train()  # 학습 모드 (Dropout 활성화)
    total_loss = 0
    correct = 0
    total = 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()          # 기울기 초기화
        outputs = model(images)        # 순전파
        loss = criterion(outputs, labels)  # 손실 계산
        loss.backward()                # 역전파
        optimizer.step()               # 가중치 업데이트

        total_loss += loss.item() * len(labels)
        _, predicted = outputs.max(1)
        correct += predicted.eq(labels).sum().item()
        total += len(labels)

    return total_loss / total, correct / total

def evaluate(model, loader):
    """검증/테스트 평가 → 정확도, Recall, Precision, F1 계산"""
    model.eval()  # 평가 모드 (Dropout 비활성화)
    all_preds = []
    all_labels = []

    with torch.no_grad():  # 기울기 계산 안 함 (메모리 절약)
        for images, labels in loader:
            images = images.to(device)
            outputs = model(images)
            _, predicted = outputs.max(1)
            all_preds.extend(predicted.cpu().numpy())
            all_labels.extend(labels.numpy())

    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    accuracy = (all_preds == all_labels).mean()

    # 통증 = 클래스 1
    pain_recall = recall_score(all_labels, all_preds, pos_label=1, zero_division=0)
    # 정상 Precision = "정상이라 한 것 중 진짜 정상 비율"
    normal_precision = precision_score(all_labels, all_preds, pos_label=0, zero_division=0)
    pain_f1 = f1_score(all_labels, all_preds, pos_label=1, zero_division=0)

    return {
        'accuracy': accuracy,
        'pain_recall': pain_recall,
        'normal_precision': normal_precision,
        'pain_f1': pain_f1,
        'preds': all_preds,
        'labels': all_labels,
    }

# %% [10] 학습 루프
TOTAL_EPOCHS = 50       # 최대 50회 반복
UNFREEZE_EPOCH = 30     # 30 에포크 후 backbone 해제
PATIENCE = 10           # 10 에포크 동안 성능 안 오르면 조기 중단

best_val_f1 = 0         # 최고 성능 기록
patience_counter = 0    # 조기 중단 카운터
history = []            # 학습 히스토리

print('=' * 60)
print('학습 시작')
print(f'전반부 (1~{UNFREEZE_EPOCH} 에포크): head만 학습 (backbone 고정)')
print(f'후반부 ({UNFREEZE_EPOCH+1}~{TOTAL_EPOCHS} 에포크): 전체 학습')
print(f'조기 중단: {PATIENCE} 에포크 동안 개선 없으면 자동 중단')
print('=' * 60)

for epoch in range(1, TOTAL_EPOCHS + 1):
    # --- 후반부 시작: backbone 해제 + 옵티마이저 교체 ---
    if epoch == UNFREEZE_EPOCH + 1:
        print(f'\n--- 에포크 {epoch}: backbone 해제, 전체 학습 시작 ---')
        unfreeze_backbone(model)

        # 새 옵티마이저 (약간 높은 학습률)
        optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)

        # 학습률을 점점 줄여가는 스케줄러
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=TOTAL_EPOCHS - UNFREEZE_EPOCH,
        )

        best_val_f1 = 0       # 후반부 기준으로 리셋
        patience_counter = 0

    # 학습 1 에포크
    train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer)

    # 검증 평가
    val_metrics = evaluate(model, val_loader)

    # 후반부 스케줄러 업데이트
    if epoch > UNFREEZE_EPOCH:
        scheduler.step()

    # 히스토리 기록
    history.append({
        'epoch': epoch,
        'train_loss': train_loss,
        'train_acc': train_acc,
        'val_accuracy': val_metrics['accuracy'],
        'val_pain_recall': val_metrics['pain_recall'],
        'val_normal_precision': val_metrics['normal_precision'],
        'val_pain_f1': val_metrics['pain_f1'],
    })

    # 결과 출력
    print(f'에포크 {epoch:3d} | '
          f'loss {train_loss:.4f} | '
          f'train {train_acc:.3f} | '
          f'val {val_metrics["accuracy"]:.3f} | '
          f'recall {val_metrics["pain_recall"]:.3f} | '
          f'prec {val_metrics["normal_precision"]:.3f} | '
          f'f1 {val_metrics["pain_f1"]:.3f}')

    # 최고 모델 저장 (pain_f1 기준)
    if val_metrics['pain_f1'] > best_val_f1:
        best_val_f1 = val_metrics['pain_f1']
        patience_counter = 0
        torch.save(model.state_dict(), f'{MODEL_DIR}/best_model.pth')
        print(f'  → 최고 모델 저장! (pain_f1: {best_val_f1:.3f})')
    else:
        patience_counter += 1
        if patience_counter >= PATIENCE:
            print(f'\n조기 중단: {PATIENCE} 에포크 동안 성능 개선 없음')
            break

    # 5 에포크마다 체크포인트 (Colab 끊김 대비)
    if epoch % 5 == 0:
        torch.save({
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'best_val_f1': best_val_f1,
        }, f'{MODEL_DIR}/checkpoint_epoch{epoch}.pth')

print(f'\n학습 완료! 최고 pain_f1: {best_val_f1:.3f}')

# %% [11] 테스트셋 최종 평가 — 게이트 4 판정
# 학습에 전혀 사용하지 않은 데이터로 진짜 성능 측정

# 최고 모델 로드
model.load_state_dict(torch.load(f'{MODEL_DIR}/best_model.pth', weights_only=True))
test_metrics = evaluate(model, test_loader)

print('=' * 60)
print('게이트 4: 최종 테스트셋 평가')
print('=' * 60)
print(f'  전체 정확도:     {test_metrics["accuracy"]:.1%}  (목표: >= 85%)')
print(f'  통증 Recall:     {test_metrics["pain_recall"]:.1%}  (목표: >= 80%)')
print(f'  정상 Precision:  {test_metrics["normal_precision"]:.1%}  (목표: >= 90%)')
print(f'  통증 F1-score:   {test_metrics["pain_f1"]:.3f}  (목표: >= 0.75)')
print()

# 혼동 행렬 (어떤 오류가 많은지 파악)
cm = confusion_matrix(test_metrics['labels'], test_metrics['preds'])
print('혼동 행렬:')
print(f'              예측:정상  예측:통증')
print(f'  실제:정상    {cm[0][0]:5d}    {cm[0][1]:5d}')
print(f'  실제:통증    {cm[1][0]:5d}    {cm[1][1]:5d}')
print()
print(f'  → 정상인데 통증이라 함 (위양성): {cm[0][1]}건')
print(f'  → 통증인데 정상이라 함 (위음성): {cm[1][0]}건  ← 이게 위험!')
print()

# --- 게이트 4 합불 판정 ---
g4_recall = test_metrics['pain_recall'] >= 0.80
g4_precision = test_metrics['normal_precision'] >= 0.90
g4_accuracy = test_metrics['accuracy'] >= 0.85
g4_f1 = test_metrics['pain_f1'] >= 0.75

# 핵심 기준: Recall + Precision 둘 다 통과해야 함
g4_pass = g4_recall and g4_precision

print('게이트 4 결과:')
print(f'  통증 Recall >= 80%:     {"✅ 통과" if g4_recall else "❌ 미통과"}')
print(f'  정상 Precision >= 90%:  {"✅ 통과" if g4_precision else "❌ 미통과"}')
print(f'  전체 정확도 >= 85%:     {"✅" if g4_accuracy else "⚠️ 미달 (참고)"}')
print(f'  통증 F1 >= 0.75:       {"✅" if g4_f1 else "⚠️ 미달 (참고)"}')
print()

if g4_pass:
    print('🎉 게이트 4 통과! 아래 셀에서 ONNX/TFLite 변환을 진행하세요.')
else:
    print('❌ 게이트 4 미통과.')
    print('   → 현재 Claude Vision API를 그대로 유지합니다.')
    print('   → 데이터를 더 모은 후 재학습을 시도하세요.')
    if not g4_recall:
        print(f'   → 통증 Recall 낮음: class_weights를 [1.0, 7.0]으로 올려보세요.')
    if not g4_precision:
        print(f'   → 정상 Precision 낮음: 정상 데이터 품질을 재확인하세요.')

# %% [12] ONNX 변환 (브라우저용)
# 게이트 4 통과 시에만 실행
# !pip install onnx onnxruntime

if g4_pass:
    import onnx

    model.eval()
    model_cpu = model.to('cpu')

    # ONNX 변환용 더미 입력 (1장, 3채널, 224x224)
    dummy_input = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)

    onnx_path = f'{MODEL_DIR}/mobilenetv3_fgs.onnx'
    torch.onnx.export(
        model_cpu,
        dummy_input,
        onnx_path,
        input_names=['image'],           # 입력 이름
        output_names=['logits'],         # 출력 이름
        dynamic_axes={                   # 배치 크기 가변
            'image': {0: 'batch'},
            'logits': {0: 'batch'},
        },
        opset_version=15,                # ONNX Runtime Web 호환 버전
    )

    # 변환된 모델 검증
    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)

    file_size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
    print(f'ONNX 변환 완료: {onnx_path}')
    print(f'파일 크기: {file_size_mb:.1f}MB')
else:
    print('게이트 4 미통과 — ONNX 변환 건너뜀')

# %% [13] TFLite 변환 (모바일 앱용, 선택사항)
# 필요시 별도 설치: !pip install onnx2tf tensorflow
if g4_pass:
    print('TFLite 변환 방법:')
    print('  1. !pip install onnx2tf tensorflow')
    print('  2. import onnx2tf')
    print(f'  3. onnx2tf.convert(')
    print(f'       input_onnx_file_path="{onnx_path}",')
    print(f'       output_folder_path="{MODEL_DIR}/tflite_model",')
    print(f'     )')
    print()
    print('또는 ai-edge-torch 패키지로도 변환 가능합니다.')
else:
    print('게이트 4 미통과 — TFLite 변환 건너뜀')

# %% [14] 학습 히스토리 그래프
import matplotlib.pyplot as plt

history_df = pd.DataFrame(history)

fig, axes = plt.subplots(2, 2, figsize=(14, 10))

# 손실 그래프
axes[0][0].plot(history_df['epoch'], history_df['train_loss'], 'b-', label='Train Loss')
axes[0][0].set_title('Loss (손실)')
axes[0][0].set_xlabel('Epoch')
axes[0][0].legend()

# 정확도 그래프
axes[0][1].plot(history_df['epoch'], history_df['train_acc'], 'b-', label='Train')
axes[0][1].plot(history_df['epoch'], history_df['val_accuracy'], 'r-', label='Val')
axes[0][1].axhline(y=0.85, color='gray', linestyle='--', label='목표 85%')
axes[0][1].set_title('Accuracy (정확도)')
axes[0][1].legend()

# 통증 Recall 그래프
axes[1][0].plot(history_df['epoch'], history_df['val_pain_recall'], 'r-', label='Pain Recall')
axes[1][0].axhline(y=0.80, color='gray', linestyle='--', label='목표 80%')
axes[1][0].set_title('Pain Recall (통증 감지율)')
axes[1][0].legend()

# 정상 Precision 그래프
axes[1][1].plot(history_df['epoch'], history_df['val_normal_precision'], 'g-', label='Normal Precision')
axes[1][1].axhline(y=0.90, color='gray', linestyle='--', label='목표 90%')
axes[1][1].set_title('Normal Precision (정상 판정 정확도)')
axes[1][1].legend()

plt.tight_layout()
plt.savefig(f'{MODEL_DIR}/training_history.png', dpi=150)
plt.show()
print(f'그래프 저장: {MODEL_DIR}/training_history.png')

# %% [15] 최종 결과 요약
print('=' * 60)
print('Phase 2A 최종 결과')
print('=' * 60)
print(f'모델: MobileNetV3-Small (2클래스: 정상/통증)')
print(f'학습 데이터: 정상 {normal_count}장, 통증 {pain_count}장')
print(f'테스트 결과:')
print(f'  정확도:          {test_metrics["accuracy"]:.1%}')
print(f'  통증 Recall:     {test_metrics["pain_recall"]:.1%}')
print(f'  정상 Precision:  {test_metrics["normal_precision"]:.1%}')
print(f'  통증 F1:         {test_metrics["pain_f1"]:.3f}')
print()
print(f'게이트 4: {"✅ 통과" if g4_pass else "❌ 미통과"}')
print()
if g4_pass:
    print(f'ONNX 모델: {MODEL_DIR}/mobilenetv3_fgs.onnx')
    print()
    print('다음 단계:')
    print('  1. CATvisor 앱에 ONNX 모델 탑재 (별도 설계서 작성)')
    print('  2. 온디바이스 = 1차 스크리닝, Claude API = 2차 확진')
    print('  3. "AI 참고 수치입니다. 정확한 진단은 수의사에게" 안내 표시')
else:
    print('다음 단계:')
    print('  1. Claude Vision API 유지 (현재 프로덕션 그대로)')
    print('  2. 프로덕션에서 user_feedback 데이터 계속 수집')
    print('  3. 데이터 500건+ 쌓이면 재학습 시도')
