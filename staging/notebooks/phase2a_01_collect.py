# ============================================================
# Phase 2A — 노트북 1: 데이터 수집
# Colab에서 실행. 셀 구분은 "# %%" 주석으로 표시.
# ============================================================

# %% [1] Google Drive 마운트 + 폴더 구조 생성
from google.colab import drive
drive.mount('/content/drive')

import os

# 기본 경로 설정
BASE = '/content/drive/MyDrive/catvisor-ai'
DATA = f'{BASE}/data'

# 전체 폴더 구조 한 번에 생성
for d in [
    f'{DATA}/raw/normal',          # 정상 고양이 원본
    f'{DATA}/raw/pain',            # 통증 고양이 원본
    f'{DATA}/test_holdout/pain',   # 테스트 전용 30장 (절대 학습에 안 씀)
    f'{DATA}/augmented/pain',      # 통증 augmentation 결과
    f'{DATA}/final/train/normal',  # 최종 학습용 정상
    f'{DATA}/final/train/pain',    # 최종 학습용 통증
    f'{DATA}/final/val/normal',    # 최종 검증용 정상
    f'{DATA}/final/val/pain',      # 최종 검증용 통증
    f'{DATA}/final/test/normal',   # 최종 테스트용 정상
    f'{DATA}/final/test/pain',     # 최종 테스트용 통증
]:
    os.makedirs(d, exist_ok=True)

print('폴더 구조 생성 완료')

# %% [2] 패키지 설치
# !pip install roboflow pillow kaggle

# %% [3] Kaggle 데이터셋 다운로드 — 고양이 얼굴 대량 확보
# ※ Kaggle API 키 설정이 필요합니다.
#    My Account → Create New API Token → kaggle.json 다운로드
#    아래 코드로 Colab에 업로드하세요.

import os

# Kaggle 인증 설정 (Colab용)
# from google.colab import files
# files.upload()  # kaggle.json 업로드
# !mkdir -p ~/.kaggle && mv kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json

# --- 데이터셋 1: AFHQ (Animal Faces-HQ) ---
# 고화질 고양이 얼굴 ~5,000장, 정상 데이터 대량 확보용
# 라이선스: CC BY-NC-SA → ⚠️ 비상업 라이선스이므로 학습용으로만 사용
# !kaggle datasets download -d "andrewmvd/animal-faces" -p /content/temp_afhq
# !unzip /content/temp_afhq/animal-faces.zip -d /content/temp_afhq/

# --- 데이터셋 2: Cat Emotions ---
# 고양이 표정별 분류 ~1,400장, 다양한 표정 확보
# !kaggle datasets download -d "anshtanwar/cats-faces-emotions-dataset" -p /content/temp_emotions
# !unzip /content/temp_emotions/*.zip -d /content/temp_emotions/

print('⚠️ 위 주석에서 사용할 데이터셋의 주석을 해제하세요.')
print('   다운로드 후 아래 셀에서 정상/통증 폴더로 분류합니다.')

# %% [4] 다운로드한 데이터 → raw 폴더로 분류
import shutil
import glob

def move_images(src_pattern, dest_dir, max_count=None):
    """이미지 파일들을 대상 폴더로 복사
    src_pattern: glob 패턴 (예: '/content/temp_afhq/cat/*.jpg')
    dest_dir: 대상 폴더 경로
    max_count: 최대 복사 수 (None이면 전부)
    """
    files = sorted(glob.glob(src_pattern))
    if max_count:
        files = files[:max_count]
    copied = 0
    for f in files:
        dst = os.path.join(dest_dir, os.path.basename(f))
        if not os.path.exists(dst):
            shutil.copy2(f, dst)
            copied += 1
    print(f'{copied}장 복사 → {dest_dir}')
    return copied

# AFHQ 고양이 → raw/normal (고화질 정상 얼굴)
# ※ AFHQ 압축 해제 후 실제 경로에 맞게 수정하세요
# move_images('/content/temp_afhq/afhq/train/cat/*.jpg', f'{DATA}/raw/normal')
# move_images('/content/temp_afhq/afhq/val/cat/*.jpg', f'{DATA}/raw/normal')

# Cat Emotions → raw/normal (대부분 정상 표정)
# move_images('/content/temp_emotions/**/*.jpg', f'{DATA}/raw/normal')

print('⚠️ 다운로드한 데이터셋 경로에 맞게 위 코드를 수정하세요.')

# %% [5] Roboflow 데이터셋 다운로드 (추가 옵션)
# Roboflow Universe에서 "cat face" 검색 후 사용
# ※ workspace/project 형식 필요 (이전 학습에서 확인됨)
# from roboflow import Roboflow
#
# ROBOFLOW_API_KEY = input('Roboflow API Key 입력: ')
# rf = Roboflow(api_key=ROBOFLOW_API_KEY)
# project = rf.workspace("워크스페이스명").project("프로젝트명")
# dataset = project.version(1).download("folder", location="/content/temp_roboflow")
#
# # 다운로드 후 raw/normal로 복사
# move_images('/content/temp_roboflow/**/*.jpg', f'{DATA}/raw/normal')

print('⚠️ Roboflow는 선택사항. Kaggle 데이터로 충분하면 건너뛰세요.')

# %% [6] EXIF 메타데이터 제거 + 224x224 리사이즈
# 모든 수집 이미지에서 개인정보(GPS 좌표, 촬영자 등) 제거
from PIL import Image
import glob

def resize_center_crop(img, size):
    """비율 유지하면서 중앙 크롭 → size x size 정사각형으로 만들기"""
    w, h = img.size
    # 짧은 변 기준으로 비율 맞춤
    scale = size / min(w, h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    # 정중앙에서 자르기
    left = (new_w - size) // 2
    top = (new_h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    return img

def strip_exif_and_resize(src_dir, min_size=224):
    """EXIF 메타데이터 제거 + 너무 작은 이미지 필터링 + 224x224 통일"""
    files = glob.glob(f'{src_dir}/**/*.jpg', recursive=True) + \
            glob.glob(f'{src_dir}/**/*.png', recursive=True) + \
            glob.glob(f'{src_dir}/**/*.jpeg', recursive=True)

    kept = 0    # 유지된 이미지 수
    removed = 0 # 제거된 이미지 수

    for f in files:
        try:
            img = Image.open(f).convert('RGB')

            # 224px 미만은 해상도 부족 → 제거
            w, h = img.size
            if w < min_size or h < min_size:
                removed += 1
                continue

            # 224x224로 통일
            img = resize_center_crop(img, min_size)

            # EXIF 없는 새 이미지로 저장 (개인정보 제거)
            clean = Image.new('RGB', img.size)
            clean.paste(img)
            clean.save(f, quality=95)
            kept += 1
        except Exception as e:
            print(f'에러: {f} — {e}')
            removed += 1

    print(f'처리 완료: {kept}장 유지, {removed}장 제거 (해상도 부족 또는 에러)')
    return kept

# 정상 데이터 처리
print('--- 정상 데이터 EXIF 제거 + 리사이즈 ---')
normal_count = strip_exif_and_resize(f'{DATA}/raw/normal')

# 통증 데이터 처리
print('--- 통증 데이터 EXIF 제거 + 리사이즈 ---')
pain_count = strip_exif_and_resize(f'{DATA}/raw/pain')

print(f'\n최종: 정상 {normal_count}장, 통증 {pain_count}장')

# %% [7] 테스트셋 사전 분리 — 통증 90장 → 60장(학습) + 30장(테스트)
# ⚠️ 이 30장은 이후 절대 학습에 사용하지 않습니다.
# 모델의 진짜 성능을 측정하기 위한 "답지"입니다.
import shutil
import random

random.seed(42)  # 같은 결과를 재현하기 위한 고정 시드

pain_dir = f'{DATA}/raw/pain'
holdout_dir = f'{DATA}/test_holdout/pain'

# 통증 사진 전체 목록
pain_files = sorted(
    glob.glob(f'{pain_dir}/*.jpg') +
    glob.glob(f'{pain_dir}/*.png') +
    glob.glob(f'{pain_dir}/*.jpeg')
)

print(f'통증 사진 총: {len(pain_files)}장')

if len(pain_files) < 30:
    print(f'⚠️ 통증 사진이 30장 미만입니다. 테스트셋 분리 불가.')
else:
    # 30장 무작위 선택 → test_holdout에 복사 (원본은 유지)
    test_samples = random.sample(pain_files, 30)

    for f in test_samples:
        dst = os.path.join(holdout_dir, os.path.basename(f))
        shutil.copy2(f, dst)

    # 학습용 = 나머지
    train_pain = [f for f in pain_files if f not in test_samples]

    print(f'테스트 전용: {len(test_samples)}장 → {holdout_dir}')
    print(f'학습용: {len(train_pain)}장 (raw/pain에 유지)')
    print(f'⚠️ test_holdout/ 폴더는 절대 학습에 사용하지 마세요!')

# %% [8] 통증 데이터 Augmentation — 60장 → 300장
# 통증 데이터가 부족하니 같은 사진을 살짝 변형해서 4배 늘림
# FGS 판단에 영향 없는 변환만 사용 (표정 특성 보존)
import torchvision.transforms as T

# 학습용 통증 사진만 (테스트 30장 제외)
holdout_names = set(os.listdir(holdout_dir))
train_pain_files = [
    f for f in glob.glob(f'{pain_dir}/*')
    if os.path.basename(f) not in holdout_names
    and f.lower().endswith(('.jpg', '.jpeg', '.png'))
]

print(f'Augmentation 대상: {len(train_pain_files)}장')

# 4가지 변환 (고양이 표정은 그대로, 조건만 바꿈)
aug_transforms = [
    T.RandomHorizontalFlip(p=1.0),              # 좌우 반전 (표정은 좌우 대칭)
    T.ColorJitter(brightness=0.2),               # 밝기 ±20% (조명 차이 대응)
    T.RandomRotation(degrees=15),                # 약간 회전 (카메라 각도 차이)
    T.RandomResizedCrop(224, scale=(0.8, 1.0)),  # 크롭 변형 (위치 다양화)
]

aug_dir = f'{DATA}/augmented/pain'
aug_count = 0

for src_path in train_pain_files:
    img = Image.open(src_path).convert('RGB')
    basename = os.path.splitext(os.path.basename(src_path))[0]

    # 각 변환 적용 → 4장 생성
    for i, transform in enumerate(aug_transforms):
        aug_img = transform(img)
        out_name = f'{basename}_aug{i}.jpg'
        aug_img.save(os.path.join(aug_dir, out_name), quality=95)
        aug_count += 1

print(f'Augmentation 완료: {aug_count}장 생성 → {aug_dir}')

# %% [9] 게이트 1 체크 — 데이터 충분한가?
normal_total = len(glob.glob(f'{DATA}/raw/normal/*'))
pain_train = len(train_pain_files)
pain_aug = len(glob.glob(f'{aug_dir}/*'))
pain_total = pain_train + pain_aug

print('=' * 50)
print('게이트 1 체크')
print(f'  정상: {normal_total}장 (목표: 3,000장 이상)')
print(f'  통증: {pain_total}장 (원본 {pain_train} + augmentation {pain_aug})')
print(f'         (목표: 200장 이상)')
print(f'  테스트 전용: 30장 (별도 보관)')
print('=' * 50)

g1_pass = normal_total >= 3000 and pain_total >= 200

if g1_pass:
    print('✅ 게이트 1 통과! Phase B(듀얼 채점)로 진행하세요.')
else:
    print('❌ 게이트 1 미통과. 추가 데이터 수집이 필요합니다.')
    if normal_total < 3000:
        print(f'   → 정상 데이터 {3000 - normal_total}장 추가 필요')
    if pain_total < 200:
        print(f'   → 통증 데이터 {200 - pain_total}장 추가 필요')

# %% [10] 라이선스 체크 기록
# ⚠️ 사용한 데이터셋의 라이선스를 여기에 기록하세요.
#
# 데이터셋 1: AFHQ — CC BY-NC-SA 4.0 (학습용만 가능, 모델 상업 배포 시 주의)
# 데이터셋 2: Cat Emotions — [라이선스 확인 후 기록]
# 데이터셋 3: [추가 데이터셋명] — [라이선스]
#
# ✅ CC-BY → 출처 표기하면 상업 사용 가능
# ✅ MIT/Apache → 자유 사용
# ⚠️ CC-BY-SA → 출처 표기 + 동일 조건 배포
# ❌ CC-BY-NC → 비상업적만 가능 (학습은 OK, 모델 배포 시 법률 확인)
print('⚠️ 위 주석에 사용한 데이터셋 라이선스를 기록하세요.')
