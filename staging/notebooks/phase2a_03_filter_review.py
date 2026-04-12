# ============================================================
# Phase 2A — 노트북 3: 자동 필터링 + 데이터 분할
# 3심 다수결 결과를 바탕으로 사람 검수 없이 자동 라벨 확정
# Colab에서 실행. 셀 구분은 "# %%" 주석으로 표시.
# ============================================================

# %% [1] Google Drive 마운트 + 설정
from google.colab import drive
drive.mount('/content/drive')

import os
import shutil
import random
import pandas as pd
from pathlib import Path

# 기본 경로
BASE = '/content/drive/MyDrive/catvisor-ai'
DATA = f'{BASE}/data'
RESULTS_CSV = f'{DATA}/results.csv'

random.seed(42)  # 재현성

# %% [2] 채점 결과 로드 + 자동 필터링
df = pd.read_csv(RESULTS_CSV)
print(f'전체 채점 결과: {len(df)}장')
print()

# --- 자동 정상: 3심 합의 정상 + Gemini 단독 정상 ---
auto_normal = df[
    df['consensus'].isin(['auto_normal', 'gemini_only_normal'])
].copy()
print(f'자동 정상: {len(auto_normal)}장')

# --- 자동 통증: 3심 다수결로 통증 확정 ---
auto_pain = df[df['consensus'] == 'auto_pain'].copy()
print(f'자동 통증: {len(auto_pain)}장  (3심 2/3 이상이 통증 판정)')

# --- 폐기: 불일치, 낮은 confidence, 판단 불가 ---
discarded = df[
    df['consensus'].str.startswith('discard', na=False)
    | (df['consensus'] == 'insufficient')
].copy()
print(f'자동 폐기: {len(discarded)}장  (불일치, 확신 부족 등)')

# 미분류 확인
classified = set(auto_normal.index) | set(auto_pain.index) | set(discarded.index)
unclassified = df[~df.index.isin(classified)]
if len(unclassified) > 0:
    print(f'미분류: {len(unclassified)}장 → 폐기 처리')

print()
print(f'정상 채택률: {len(auto_normal)/len(df)*100:.1f}%')
print(f'통증 채택률: {len(auto_pain)/len(df)*100:.1f}%')
print(f'폐기율: {(len(discarded)+len(unclassified))/len(df)*100:.1f}%')

# %% [3] 3심 판정 상세 확인 — 통증 자동 확정 목록
# 어떤 이미지가 통증으로 확정됐는지 확인
print('=' * 50)
print(f'자동 통증 확정: {len(auto_pain)}장 상세')
print('=' * 50)

for _, row in auto_pain.head(20).iterrows():  # 상위 20개만 미리보기
    g = row.get('gemini_score', '?')
    c = row.get('claude_score', '?')
    o = row.get('gpt4o_score', '?')
    conf = row.get('avg_confidence', '?')

    # 3모델 중 가장 상세한 clinical_note 선택
    note = ''
    for col in ['claude_note', 'gpt4o_note', 'gemini_note']:
        n = str(row.get(col, ''))
        if n and n != 'nan' and len(n) > len(note):
            note = n

    print(f"  {row['filename']}")
    print(f"    Gemini:{g} / Claude:{c} / GPT-4o:{o} (확신:{conf})")
    if note:
        print(f"    소견: {note[:80]}")
    print()

if len(auto_pain) > 20:
    print(f'  ... 외 {len(auto_pain) - 20}장')

# %% [4] 최종 학습 데이터 목록 구성
# 자동 정상 → normal
# 자동 통증 + augmented + 원본 학습용 통증 → pain

# --- 정상 파일 목록 ---
final_normal = list(auto_normal['filename'])

# --- 통증 파일 목록 ---
final_pain = list(auto_pain['filename'])

# augmented 통증 (원본 학습용 통증 기반이므로 자동 포함)
aug_pain_files = os.listdir(f'{DATA}/augmented/pain')
final_pain.extend(aug_pain_files)

# 원본 학습용 통증 (test_holdout 30장 제외)
holdout_names = set(os.listdir(f'{DATA}/test_holdout/pain'))
raw_pain = [f for f in os.listdir(f'{DATA}/raw/pain')
            if f not in holdout_names and f.lower().endswith(('.jpg', '.jpeg', '.png'))]
final_pain.extend(raw_pain)

# 중복 제거
final_normal = list(set(final_normal))
final_pain = list(set(final_pain))

print(f'최종 학습 데이터:')
print(f'  정상: {len(final_normal)}장')
print(f'  통증: {len(final_pain)}장')

# %% [5] 게이트 3 체크 — 학습 데이터 충분한가?
print('=' * 50)
print('게이트 3 체크')
print(f'  정상: {len(final_normal)}장')
print(f'  통증: {len(final_pain)}장 (목표: 300장 이상)')
print('=' * 50)

g3_pass = len(final_pain) >= 300

if g3_pass:
    print('✅ 게이트 3 통과! 아래 셀에서 train/val/test 분할합니다.')
else:
    deficit = 300 - len(final_pain)
    print(f'❌ 게이트 3 미통과. 통증 데이터 {deficit}장 추가 필요.')
    print('   → augmentation 강도를 높이거나 추가 데이터를 수집하세요.')

# %% [6] train / val / test 분할 + 파일 복사
FINAL = f'{DATA}/final'

# 이미지 소스 검색 경로
search_dirs = [f'{DATA}/raw/normal', f'{DATA}/raw/pain', f'{DATA}/augmented/pain']

def copy_files_to(file_list, dest_dir):
    """파일 목록을 대상 폴더로 복사 (여러 소스에서 검색)"""
    copied = 0
    for fname in file_list:
        for sd in search_dirs:
            src = os.path.join(sd, fname)
            if os.path.exists(src):
                dst = os.path.join(dest_dir, fname)
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
                copied += 1
                break
    return copied

# --- 테스트셋 (학습에 절대 안 씀) ---
# 통증 30장: Phase A에서 분리해둔 test_holdout
test_pain_dir = f'{DATA}/test_holdout/pain'
test_pain_files = os.listdir(test_pain_dir)
for f in test_pain_files:
    src = os.path.join(test_pain_dir, f)
    dst = os.path.join(f'{FINAL}/test/pain', f)
    if not os.path.exists(dst):
        shutil.copy2(src, dst)

# 정상 150장: 무작위 추출
test_normal_count = min(150, len(final_normal))
test_normal_sample = random.sample(final_normal, test_normal_count)
train_normal_pool = [f for f in final_normal if f not in test_normal_sample]
copy_files_to(test_normal_sample, f'{FINAL}/test/normal')

# --- train / val 분할 (80:20) ---
random.shuffle(train_normal_pool)
random.shuffle(final_pain)

val_ratio = 0.2
val_normal_n = int(len(train_normal_pool) * val_ratio)
val_pain_n = int(len(final_pain) * val_ratio)

val_normal = train_normal_pool[:val_normal_n]
train_normal = train_normal_pool[val_normal_n:]
val_pain = final_pain[:val_pain_n]
train_pain = final_pain[val_pain_n:]

# 파일 복사
n1 = copy_files_to(train_normal, f'{FINAL}/train/normal')
n2 = copy_files_to(train_pain, f'{FINAL}/train/pain')
n3 = copy_files_to(val_normal, f'{FINAL}/val/normal')
n4 = copy_files_to(val_pain, f'{FINAL}/val/pain')

print('=' * 50)
print('최종 데이터 분할 완료')
print('=' * 50)
print(f'  train — 정상: {n1}장, 통증: {n2}장')
print(f'  val   — 정상: {n3}장, 통증: {n4}장')
print(f'  test  — 정상: {test_normal_count}장, 통증: {len(test_pain_files)}장')
print()
print(f'저장: {FINAL}')
print()
print('다음: phase2a_04_train.ipynb 에서 MobileNetV3 학습!')
