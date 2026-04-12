# ============================================================
# Phase 2A — 노트북 2: 트리플 채점 (Gemini + Claude + GPT-4o)
# 3개 AI 모델이 독립적으로 채점 → 다수결로 라벨 확정
# Colab에서 실행. 셀 구분은 "# %%" 주석으로 표시.
# ============================================================

# %% [1] Google Drive 마운트
from google.colab import drive
drive.mount('/content/drive')

# %% [2] 패키지 설치
# Colab에 기본 없는 패키지 설치 (첫 실행 시 1분 소요)
import subprocess
import sys

pkgs = ['google-generativeai', 'anthropic', 'openai', 'tqdm']
for pkg in pkgs:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', pkg])

print('패키지 설치 완료')

# %% [3] 임포트 + 경로 설정
import os
import json
import csv
import time
import base64
import glob
import random
import traceback
from pathlib import Path
from tqdm.notebook import tqdm  # Colab용 진행바

# 기본 경로
BASE = '/content/drive/MyDrive/catvisor-ai'
DATA = f'{BASE}/data'
RESULTS_CSV = f'{DATA}/results.csv'

# 재현성 시드 고정
random.seed(42)

# 폴더 존재 확인 (없으면 생성)
for d in [DATA, f'{DATA}/raw/normal', f'{DATA}/raw/pain',
          f'{DATA}/test_holdout/pain', f'{DATA}/augmented/pain']:
    os.makedirs(d, exist_ok=True)

print(f'기본 경로: {BASE}')
print(f'결과 CSV: {RESULTS_CSV}')

# %% [4] FGS 시스템 프롬프트 — 수의사 전문가 페르소나
# 3개 모델 모두 동일한 프롬프트 사용 (독립 판단 + 교차 검증)

FGS_SYSTEM_PROMPT = """당신은 40년 경력의 고양이 표정 전문 수의사입니다.
수만 마리의 고양이를 직접 진료하며 Feline Grimace Scale(FGS)을 적용해 왔습니다.
당신은 고양이의 귀 모양, 눈 모양, 입(코·볼) 모양, 수염 모양을 보는 것만으로 통증 여부를 즉시 알아차립니다.
사진 한 장만 봐도 미세한 표정 변화를 놓치지 않는 것이 당신의 전문성입니다.

## 중요 원칙

- 통증을 놓치는 것(위음성)이 정상을 통증으로 오판하는 것(위양성)보다 훨씬 위험합니다.
- 조금이라도 의심되면 0이 아닌 1을 주세요. 보수적으로 "정상"을 주지 마세요.
- 합산 4점 이상(fgs_score >= 3)이면 통증이 있는 것으로 판단, 수의사 상담이 필요합니다.
- 합산 7점 이상(fgs_score = 4)이면 즉시 수의사 방문 + 진통제가 필요합니다.
- 단, 카메라 앵글로 인한 착시를 통증으로 오판하지 마세요.

## FGS 5가지 Action Unit — 엄격한 기준 (NZ Cat Foundation / Evangelista et al. 2019)

각 AU를 0, 1, 2로 평가하세요. 1점 기준을 주의깊게 확인하세요.

### AU1. 귀 위치 (ear_position)
- 0: 귀가 앞을 향해 곧게 서 있음, 귀 안쪽이 정면을 향함
- 1: 귀가 살짝 벌어지거나 뒤로 돌아감, 귀 끝이 살짝 아래로 처짐
- 2: 귀가 옆으로 돌아가 있고 귀 끝이 바깥쪽을 향함, 납작하게 눕힘

### AU2. 눈 찡그림 (orbital_tightening) — 가장 중요한 지표, 엄격하게!
- 0: 눈이 크고 둥글게 완전히 열림, 홍채 전체가 둥글게 보임
- 1: 눈꺼풀이 살짝 긴장되거나 눈이 편안하게 뜬 상태보다 약간 작아 보임
- 2: 눈을 가늘게 뜨거나 찡그리거나 반쯤 감음

### AU3. 코·볼 긴장 (muzzle)
- 0: 코·볼이 이완되고 둥근 형태, 입 주변이 부드러움
- 1: 코·볼이 약간 타원형으로 찌그러짐, 입 주변에 힘이 들어간 느낌
- 2: 코·볼이 뚜렷한 타원형, 볼이 납작해지고 코에 주름

### AU4. 수염 변화 (whisker_change)
- 0: 수염이 느슨하고 완만한 곡선형
- 1: 수염이 직선으로 펴지고 수염 사이 간격이 좁아짐
- 2: 수염이 직선으로 앞으로 뻗거나 뒤로 휘어짐

### AU5. 머리 위치 (head_position)
- 0: 머리가 어깨선 위에 높이 들려 있음
- 1: 머리가 어깨선과 수평이거나 살짝 아래
- 2: 머리가 어깨선 아래로 확실히 숙여짐

## 종합 점수 계산
5개 AU 합산 (0~10) → 5단계 변환:
- 합산 0 → fgs_score: 0 (정상)
- 합산 1~2 → fgs_score: 1 (경미)
- 합산 3 → fgs_score: 2 (주의)
- 합산 4~6 → fgs_score: 3 (경고)
- 합산 7~10 → fgs_score: 4 (심각)

## 카메라 앵글 보정
- 위에서 찍은 사진 + 올려다봄 → head=0, 홍채 선명하면 eye=0
- 옆으로 누운 자세 → 편안하면 ear=0, head=0
- 클로즈업 → head=0
- 품종 특성(아몬드형 눈 등) → 긴장/수축 여부로 판단

## 전체 인상 검증 (AU 채점 후 반드시 수행)
1. 경계/호기심/편안 → 통증 아닐 가능성 높음
2. AU 합산 높은데 건강해 보임 → 앵글/품종 오탐 재검토
3. 오탐 의심 시 AU 하향 조정 허용

## 흔한 실수 — 반드시 피하세요
- 눈이 가늘면 eye=2 (졸린 거 아님)
- 고개 숙이면 최소 head=1
- 2개+ AU 동시 변화 → 각각 더 엄격하게
- 위에서 찍음 + 올려다봄 + 홍채 선명 → eye=0, head=0

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
{
  "fgs_score": 0,
  "confidence": 0.85,
  "au_scores": {"ear": 0, "eye": 0, "muzzle": 0, "whisker": 0, "head": 0},
  "reasoning": "각 AU별 판단 근거를 한국어로 설명",
  "clinical_note": "임상 경험상 이 고양이의 전반적 상태에 대한 종합 소견 (한국어)"
}

## 주의사항
- 얼굴이 안 보이면 confidence 0.3 이하
- 확신 0.7 미만이면 fgs_score=0
- 애매하면 높은 점수 — 통증 놓침이 더 위험
"""

FGS_USER_MESSAGE = "이 고양이 사진의 FGS 통증 점수를 분석해주세요."

print('프롬프트 설정 완료')

# %% [5] API 키 입력
import getpass

print('API 키를 입력하세요 (입력 내용은 화면에 표시되지 않습니다)')
print()
GEMINI_API_KEY = getpass.getpass('Gemini API Key: ')
CLAUDE_API_KEY = getpass.getpass('Claude API Key: ')
OPENAI_API_KEY = getpass.getpass('OpenAI API Key: ')
print()
print('API 키 설정 완료')

# %% [6] 공통 유틸리티 함수
from PIL import Image
import io

def image_to_base64(path):
    """이미지 파일 → base64 문자열 변환"""
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def load_image_bytes(path):
    """이미지 파일 → bytes 로드 (Gemini용)"""
    with open(path, 'rb') as f:
        return f.read()

def is_valid_image(path):
    """이미지 파일이 정상인지 검사 (깨진 파일 걸러냄)"""
    try:
        img = Image.open(path)
        img.verify()  # 파일 무결성 검사
        # verify 후에는 다시 열어야 함
        img = Image.open(path)
        w, h = img.size
        if w < 10 or h < 10:  # 너무 작은 이미지
            return False
        return True
    except Exception:
        return False

def parse_json_response(text):
    """AI 응답에서 JSON 추출 (마크다운 코드블록 자동 처리)"""
    if text is None:
        return None
    text = text.strip()

    # 마크다운 코드블록 제거 (```json ... ``` 또는 ``` ... ```)
    if '```' in text:
        # 첫 번째 { 부터 마지막 } 까지 추출
        start = text.find('{')
        end = text.rfind('}')
        if start >= 0 and end > start:
            text = text[start:end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None

def get_media_type(path):
    """파일 확장자 → MIME 타입"""
    ext = Path(path).suffix.lower()
    types = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png'}
    return types.get(ext, 'image/jpeg')

def retry_api_call(func, max_retries=3, base_delay=5):
    """API 호출 재시도 (지수 백오프)
    최대 3번 시도, 실패 간격: 5초 → 10초 → 20초
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            result = func()
            return result
        except Exception as e:
            last_error = e
            error_msg = str(e).lower()

            # 속도 제한 에러 → 더 오래 대기
            if 'rate' in error_msg or '429' in error_msg or 'quota' in error_msg:
                wait = base_delay * (4 ** attempt)  # 5초 → 20초 → 80초
                print(f'    속도 제한 감지, {wait}초 대기 후 재시도...')
            else:
                wait = base_delay * (2 ** attempt)  # 5초 → 10초 → 20초

            if attempt < max_retries - 1:
                time.sleep(wait)

    # 3번 다 실패
    return {'error': 'api_error', 'detail': str(last_error)[:200]}

print('유틸리티 함수 준비 완료')

# %% [7] Gemini 채점 함수
import google.generativeai as genai

genai.configure(api_key=GEMINI_API_KEY)

# Gemini 모델 객체 (셀 실행 시 1번만 생성)
gemini_model = genai.GenerativeModel('gemini-2.5-flash')

def score_with_gemini(image_path):
    """Gemini Flash로 FGS 채점 (무료)
    upload_file 대신 inline_data 사용 — 더 안정적
    """
    def _call():
        img_bytes = load_image_bytes(image_path)
        media_type = get_media_type(image_path)

        # inline_data 방식 (upload_file보다 안정적)
        response = gemini_model.generate_content(
            [
                FGS_SYSTEM_PROMPT,
                {'mime_type': media_type, 'data': img_bytes},
                FGS_USER_MESSAGE,
            ],
            generation_config=genai.GenerationConfig(temperature=0.1),
        )

        # safety 필터 체크
        if not response.candidates:
            return {'error': 'safety_filter', 'detail': 'no candidates'}

        candidate = response.candidates[0]
        if candidate.finish_reason and candidate.finish_reason != 1:
            # STOP=1 외의 종료 사유 (SAFETY=3 등)
            reason_name = str(candidate.finish_reason)
            return {'error': 'safety_filter', 'detail': reason_name}

        text = response.text
        result = parse_json_response(text)
        if result is not None and 'fgs_score' in result:
            return result
        return {'error': 'json_parse_fail', 'detail': (text or '')[:200]}

    return retry_api_call(_call)

# 연결 테스트
print('Gemini 연결 테스트...')
try:
    test = gemini_model.generate_content('say "ok"',
        generation_config=genai.GenerationConfig(max_output_tokens=10))
    print(f'  Gemini 연결 성공')
except Exception as e:
    print(f'  Gemini 연결 실패: {e}')
    print('  API 키를 확인하세요.')

# %% [8] Claude 채점 함수
import anthropic

claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

def score_with_claude(image_path):
    """Claude Sonnet으로 FGS 채점"""
    def _call():
        b64_data = image_to_base64(image_path)
        media_type = get_media_type(image_path)

        response = claude_client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=512,
            system=FGS_SYSTEM_PROMPT,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': media_type,
                            'data': b64_data,
                        },
                    },
                    {'type': 'text', 'text': FGS_USER_MESSAGE},
                ],
            }],
        )

        text = response.content[0].text
        result = parse_json_response(text)
        if result is not None and 'fgs_score' in result:
            return result
        return {'error': 'json_parse_fail', 'detail': (text or '')[:200]}

    return retry_api_call(_call)

# 연결 테스트
print('Claude 연결 테스트...')
try:
    test = claude_client.messages.create(
        model='claude-sonnet-4-20250514', max_tokens=10,
        messages=[{'role': 'user', 'content': 'say ok'}])
    print(f'  Claude 연결 성공')
except Exception as e:
    print(f'  Claude 연결 실패: {e}')

# %% [9] GPT-4o 채점 함수
from openai import OpenAI

openai_client = OpenAI(api_key=OPENAI_API_KEY)

def score_with_gpt4o(image_path):
    """GPT-4o로 FGS 채점 (3번째 독립 심판)"""
    def _call():
        b64_data = image_to_base64(image_path)
        media_type = get_media_type(image_path)

        response = openai_client.chat.completions.create(
            model='gpt-4o',
            max_tokens=512,
            temperature=0.1,
            messages=[
                {'role': 'system', 'content': FGS_SYSTEM_PROMPT},
                {'role': 'user', 'content': [
                    {
                        'type': 'image_url',
                        'image_url': {
                            'url': f'data:{media_type};base64,{b64_data}',
                            'detail': 'low',
                        },
                    },
                    {'type': 'text', 'text': FGS_USER_MESSAGE},
                ]},
            ],
        )

        text = response.choices[0].message.content
        result = parse_json_response(text)
        if result is not None and 'fgs_score' in result:
            return result
        return {'error': 'json_parse_fail', 'detail': (text or '')[:200]}

    return retry_api_call(_call)

# 연결 테스트
print('GPT-4o 연결 테스트...')
try:
    test = openai_client.chat.completions.create(
        model='gpt-4o', max_tokens=10,
        messages=[{'role': 'user', 'content': 'say ok'}])
    print(f'  GPT-4o 연결 성공')
except Exception as e:
    print(f'  GPT-4o 연결 실패: {e}')

# %% [10] 3심 다수결 판정 함수
def judge_consensus(gemini_score, claude_score, gpt4o_score,
                    gemini_conf, claude_conf, gpt4o_conf):
    """3개 모델의 점수로 다수결 판정

    규칙:
    - 2/3 이상이 정상(0~1) → 'auto_normal'
    - 2/3 이상이 통증(2+) → 'auto_pain'
    - 전부 다른 점수 → 'discard_no_consensus'
    - confidence 평균 < 0.6 → 'discard_low_conf'

    반환: (consensus, avg_confidence)
    """
    scores = []
    confs = []

    # 유효한 점수만 수집
    for s, c in [(gemini_score, gemini_conf),
                 (claude_score, claude_conf),
                 (gpt4o_score, gpt4o_conf)]:
        if s is not None:
            scores.append(int(s))
            confs.append(float(c) if c is not None else 0.5)

    # 2개 미만 채점 → 판단 불가
    if len(scores) < 2:
        return 'insufficient', 0.0

    avg_conf = sum(confs) / len(confs)

    # confidence 평균 0.6 미만 → 폐기
    if avg_conf < 0.6:
        return 'discard_low_conf', avg_conf

    # 정상(0~1) vs 통증(2+) 투표
    normal_votes = sum(1 for s in scores if s <= 1)
    pain_votes = sum(1 for s in scores if s >= 2)

    if normal_votes >= 2:
        return 'auto_normal', avg_conf
    elif pain_votes >= 2:
        return 'auto_pain', avg_conf
    else:
        return 'discard_no_consensus', avg_conf

print('다수결 판정 함수 준비 완료')

# %% [11] CSV 관리 함수
CSV_FIELDS = [
    'filename', 'source_dir',
    'gemini_score', 'gemini_confidence', 'gemini_au', 'gemini_note', 'gemini_error',
    'claude_score', 'claude_confidence', 'claude_au', 'claude_note', 'claude_error',
    'gpt4o_score', 'gpt4o_confidence', 'gpt4o_au', 'gpt4o_note', 'gpt4o_error',
    'avg_confidence', 'consensus',
]

def load_scored_files(csv_path):
    """이미 채점된 파일명 세트 로드 (이어하기용)"""
    scored = set()
    if not os.path.exists(csv_path):
        return scored
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                fname = row.get('filename', '')
                if fname:
                    scored.add(fname)
    except Exception as e:
        print(f'CSV 로드 경고: {e}')
    return scored

def append_result(csv_path, row_dict):
    """CSV에 1행 즉시 추가 (Colab 끊김 대비, 매 건 저장)"""
    file_exists = os.path.exists(csv_path)
    with open(csv_path, 'a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row_dict)

print('CSV 관리 함수 준비 완료')

# %% [12] 채점 대상 이미지 수집
# raw/normal, raw/pain, augmented/pain 에서 모든 이미지 수집

all_images = []
for folder in [f'{DATA}/raw/normal', f'{DATA}/raw/pain', f'{DATA}/augmented/pain']:
    if not os.path.isdir(folder):
        print(f'  폴더 없음 (건너뜀): {folder}')
        continue
    for ext in ['*.jpg', '*.jpeg', '*.png']:
        all_images.extend(glob.glob(f'{folder}/{ext}'))

all_images = sorted(all_images)

# 테스트 홀드아웃(30장) 제외
holdout_dir = f'{DATA}/test_holdout/pain'
holdout_names = set()
if os.path.isdir(holdout_dir):
    holdout_names = set(os.listdir(holdout_dir))

all_images = [f for f in all_images if os.path.basename(f) not in holdout_names]

# 깨진 이미지 사전 필터링
print('이미지 무결성 검사 중...')
valid_images = []
broken_count = 0
for img_path in tqdm(all_images, desc='이미지 검사'):
    if is_valid_image(img_path):
        valid_images.append(img_path)
    else:
        broken_count += 1

if broken_count > 0:
    print(f'  깨진 이미지 {broken_count}장 제외됨')

# 이미 채점 완료된 파일 제외
scored = load_scored_files(RESULTS_CSV)
remaining = [f for f in valid_images if os.path.basename(f) not in scored]

print()
print(f'전체 이미지: {len(valid_images)}장')
print(f'이미 채점됨: {len(scored)}장')
print(f'남은 작업: {len(remaining)}장')
print(f'홀드아웃 제외: {len(holdout_names)}장')

if len(remaining) == 0:
    print()
    print('모든 이미지가 이미 채점되었습니다!')
    print('다음 셀(게이트 2)로 넘어가세요.')

# %% [13] 1단계: Gemini 병렬 전수 스캔
# Gemini Pro 유료 → 병렬 요청으로 빠르게 처리
# 이미 채점된 이미지는 자동으로 건너뜀 (끊겨도 이어하기 가능)

from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

WORKERS = 5  # 동시 요청 수 (5개 병렬)

# 이미 Gemini 채점 완료된 파일 제외
scored = load_scored_files(RESULTS_CSV)
gemini_remaining = [f for f in valid_images if os.path.basename(f) not in scored]

print(f'1단계: Gemini 병렬 스캔 (동시 {WORKERS}건)')
print(f'전체: {len(valid_images)}장 / 이미 완료: {len(scored)}장 / 남음: {len(gemini_remaining)}장')
print('=' * 60)

# CSV 쓰기용 락 (병렬 저장 시 충돌 방지)
csv_lock = threading.Lock()

# 통계 (thread-safe)
stats_lock = threading.Lock()
gemini_pain_count = 0
gemini_normal_count = 0
gemini_error_count = 0

def process_one_image(img_path):
    """이미지 1장 Gemini 채점 (병렬 워커용)"""
    global gemini_pain_count, gemini_normal_count, gemini_error_count

    filename = os.path.basename(img_path)
    source_dir = 'pain' if '/pain/' in img_path else 'normal'

    # 결과 행 초기화
    row = {field: '' for field in CSV_FIELDS}
    row['filename'] = filename
    row['source_dir'] = source_dir

    # Gemini 채점
    gemini_result = score_with_gemini(img_path)

    if isinstance(gemini_result, dict) and 'fgs_score' in gemini_result:
        score = gemini_result['fgs_score']
        conf = gemini_result.get('confidence')
        row['gemini_score'] = score
        row['gemini_confidence'] = conf
        row['gemini_au'] = json.dumps(gemini_result.get('au_scores', {}))
        row['gemini_note'] = gemini_result.get('clinical_note', '')
        row['consensus'] = 'gemini_only_normal' if score <= 1 else 'gemini_pain_suspect'
        row['avg_confidence'] = f'{conf:.3f}' if conf else ''

        with stats_lock:
            if score >= 2:
                gemini_pain_count += 1
            else:
                gemini_normal_count += 1

        return row, score >= 2, filename, score, conf
    else:
        error = gemini_result.get('error', 'unknown') if isinstance(gemini_result, dict) else 'unknown'
        row['gemini_error'] = error
        row['consensus'] = 'gemini_error'

        with stats_lock:
            gemini_error_count += 1

        return row, False, filename, None, None

# 병렬 실행
completed = 0
with ThreadPoolExecutor(max_workers=WORKERS) as executor:
    futures = {executor.submit(process_one_image, p): p for p in gemini_remaining}

    for future in tqdm(as_completed(futures), total=len(futures), desc='Gemini 스캔'):
        row, is_pain, filename, score, conf = future.result()

        # CSV 저장 (락으로 충돌 방지)
        with csv_lock:
            append_result(RESULTS_CSV, row)

        completed += 1

        # 통증 발견 시 실시간 알림
        if is_pain:
            tqdm.write(f'  [통증 의심] {filename} -- score:{score} conf:{conf}')

        # 100건마다 중간 통계
        if completed % 100 == 0:
            tqdm.write(f'--- {completed}건 ---  정상:{gemini_normal_count} / 통증의심:{gemini_pain_count} / 에러:{gemini_error_count}')

print()
print('=' * 60)
print('1단계 완료: Gemini 전수 스캔')
print('=' * 60)
print(f'  정상 (0~1): {gemini_normal_count}장')
print(f'  통증 의심 (2+): {gemini_pain_count}장')
print(f'  에러: {gemini_error_count}장')
print()
print('다음: 아래 셀 [14]을 실행하여 통증 의심분에 Claude + GPT-4o 3심을 적용하세요.')

# %% [14] 2단계: 통증 의심분 Claude + GPT-4o 3심 (약 1~2시간)
# Gemini가 통증 의심(2+)으로 판정한 이미지만 Claude + GPT-4o 추가 채점
# 결과를 기존 CSV에 업데이트

import pandas as pd

df = pd.read_csv(RESULTS_CSV)
print(f'전체 결과: {len(df)}행')

# 통증 의심분 + Gemini 에러분 추출 (Claude/GPT-4o 아직 안 한 것만)
needs_triple = df[
    (df['consensus'].isin(['gemini_pain_suspect', 'gemini_error']))
    & (df['claude_score'] == '')
    & (df['gpt4o_score'] == '')
].copy()

print(f'Claude + GPT-4o 3심 대상: {needs_triple}장')
print(f'예상 시간: 약 {len(needs_triple) * 20 / 60:.0f}분')
print('=' * 60)

if len(needs_triple) == 0:
    print('3심 대상이 없습니다. 이미 완료되었거나 통증 의심이 0건입니다.')
else:
    # 결과를 업데이트할 새 행 목록
    updated_rows = []

    for i, (idx, row) in enumerate(tqdm(needs_triple.iterrows(), total=len(needs_triple), desc='3심 채점')):
        filename = row['filename']

        # 이미지 경로 찾기
        img_path = None
        for folder in [f'{DATA}/raw/normal', f'{DATA}/raw/pain', f'{DATA}/augmented/pain']:
            candidate = os.path.join(folder, filename)
            if os.path.exists(candidate):
                img_path = candidate
                break

        if img_path is None:
            continue

        gemini_score = row['gemini_score']
        gemini_conf = row['gemini_confidence']

        # Gemini 점수를 숫자로 변환
        try:
            gemini_score = int(float(gemini_score)) if gemini_score != '' else None
        except (ValueError, TypeError):
            gemini_score = None
        try:
            gemini_conf = float(gemini_conf) if gemini_conf != '' else None
        except (ValueError, TypeError):
            gemini_conf = None

        # === Claude 채점 ===
        claude_score = None
        claude_conf = None
        claude_result = score_with_claude(img_path)
        if isinstance(claude_result, dict) and 'fgs_score' in claude_result:
            claude_score = claude_result['fgs_score']
            claude_conf = claude_result.get('confidence')
            df.at[idx, 'claude_score'] = claude_score
            df.at[idx, 'claude_confidence'] = claude_conf
            df.at[idx, 'claude_au'] = json.dumps(claude_result.get('au_scores', {}))
            df.at[idx, 'claude_note'] = claude_result.get('clinical_note', '')
        elif isinstance(claude_result, dict):
            df.at[idx, 'claude_error'] = claude_result.get('error', 'unknown')

        # === GPT-4o 채점 ===
        gpt4o_score = None
        gpt4o_conf = None
        gpt4o_result = score_with_gpt4o(img_path)
        if isinstance(gpt4o_result, dict) and 'fgs_score' in gpt4o_result:
            gpt4o_score = gpt4o_result['fgs_score']
            gpt4o_conf = gpt4o_result.get('confidence')
            df.at[idx, 'gpt4o_score'] = gpt4o_score
            df.at[idx, 'gpt4o_confidence'] = gpt4o_conf
            df.at[idx, 'gpt4o_au'] = json.dumps(gpt4o_result.get('au_scores', {}))
            df.at[idx, 'gpt4o_note'] = gpt4o_result.get('clinical_note', '')
        elif isinstance(gpt4o_result, dict):
            df.at[idx, 'gpt4o_error'] = gpt4o_result.get('error', 'unknown')

        # === 3심 다수결 ===
        consensus, avg_conf = judge_consensus(
            gemini_score, claude_score, gpt4o_score,
            gemini_conf, claude_conf, gpt4o_conf,
        )
        df.at[idx, 'consensus'] = consensus
        df.at[idx, 'avg_confidence'] = f'{avg_conf:.3f}'

        if consensus == 'auto_pain':
            tqdm.write(f'  [통증 확정] {filename} -- G:{gemini_score} C:{claude_score} O:{gpt4o_score}')

        # 10건마다 중간 저장 (끊김 대비)
        if (i + 1) % 10 == 0:
            df.to_csv(RESULTS_CSV, index=False, encoding='utf-8')
            tqdm.write(f'  --- {i+1}건 완료, 중간 저장 ---')

        time.sleep(0.5)  # API 부하 방지

    # 최종 저장
    df.to_csv(RESULTS_CSV, index=False, encoding='utf-8')

    # 결과 통계
    auto_normal = len(df[df['consensus'].isin(['auto_normal', 'gemini_only_normal'])])
    auto_pain = len(df[df['consensus'] == 'auto_pain'])
    discarded = len(df[
        df['consensus'].str.startswith('discard', na=False)
        | (df['consensus'] == 'insufficient')
    ])

    print()
    print('=' * 60)
    print('2단계 완료: 3심 다수결 판정')
    print('=' * 60)
    print(f'  자동 정상: {auto_normal}장')
    print(f'  자동 통증 (3심 확정): {auto_pain}장')
    print(f'  폐기: {discarded}장')
    print()
    print(f'결과 저장: {RESULTS_CSV}')
    print()
    print('다음: 셀 [15]에서 게이트 2 환각률을 확인하세요.')

# %% [15] 게이트 2: Gemini 환각률 체크
import pandas as pd

df = pd.read_csv(RESULTS_CSV)
print(f'전체 채점 결과: {len(df)}행')
print()

# 처음 100장 중 Gemini가 통증(2+)으로 판정한 건
first_100 = df.head(100)
gemini_pain_mask = pd.to_numeric(first_100['gemini_score'], errors='coerce') >= 2
gemini_pain = first_100[gemini_pain_mask]

print('=' * 50)
print('게이트 2: Gemini 환각률 (처음 100장)')
print(f'  Gemini가 통증(2+) 판정: {len(gemini_pain)}장 / 100장')

if len(gemini_pain) > 0:
    # 3심 다수결로 실제 통증인지 확인
    actual_pain = gemini_pain[gemini_pain['consensus'] == 'auto_pain']
    hallucination = len(gemini_pain) - len(actual_pain)
    rate = hallucination / max(len(gemini_pain), 1) * 100
    print(f'  3심 다수결로 통증 확인: {len(actual_pain)}장')
    print(f'  Gemini 단독 오판 (환각): {hallucination}장 ({rate:.0f}%)')
    print()
    if rate > 20:
        print('  주의: 환각률 > 20%. 하지만 3심 다수결이 자동으로 걸러냅니다.')
    else:
        print('  게이트 2 통과. 환각률 양호합니다.')
else:
    print('  Gemini가 통증으로 판정한 건이 없습니다.')
    print('  (정상 데이터만 있다면 정상적인 결과입니다)')
print('=' * 50)

# %% [16] 전체 채점 결과 통계
df = pd.read_csv(RESULTS_CSV)

print('=' * 50)
print('전체 채점 결과 통계')
print('=' * 50)
print(f'총: {len(df)}장')
print()

# 합의 분포
print('--- 합의 분포 ---')
consensus_counts = df['consensus'].value_counts()
for label, count in consensus_counts.items():
    pct = count / len(df) * 100
    print(f'  {label}: {count}장 ({pct:.1f}%)')
print()

# 최종 결과 요약
auto_normal = len(df[df['consensus'].isin(['auto_normal', 'gemini_only_normal'])])
auto_pain = len(df[df['consensus'] == 'auto_pain'])
discarded = len(df[
    df['consensus'].str.startswith('discard', na=False)
    | (df['consensus'] == 'insufficient')
])

print('--- 최종 결과 ---')
print(f'  자동 정상: {auto_normal}장')
print(f'  자동 통증: {auto_pain}장')
print(f'  폐기: {discarded}장')
print()
print('다음: phase2a_03_filter_review.ipynb 에서 최종 데이터 구성')
