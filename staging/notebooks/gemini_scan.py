# === Gemini 전수 스캔 (독립 실행) ===
# 다른 셀 실행 필요 없이 이 셀 하나로 동작합니다

import os
import json
import csv
import time
import base64
import glob
import getpass
from pathlib import Path
from tqdm.notebook import tqdm

BASE = "/content/drive/MyDrive/catvisor-ai"
DATA = f"{BASE}/data"
RESULTS_CSV = f"{DATA}/results.csv"

if not os.path.exists("/content/drive"):
    from google.colab import drive
    drive.mount("/content/drive")

if "GEMINI_API_KEY" not in dir():
    GEMINI_API_KEY = getpass.getpass("Gemini API Key: ")

import google.generativeai as genai
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel("gemini-2.5-flash")

try:
    gemini_model.generate_content("test", generation_config=genai.GenerationConfig(max_output_tokens=5))
    print("Gemini 연결 성공")
except Exception as e:
    print(f"Gemini 연결 실패: {e}")

FGS_PROMPT = """당신은 40년 경력의 고양이 표정 전문 수의사입니다.
고양이의 귀, 눈, 입, 수염 모양을 보고 Feline Grimace Scale(FGS)을 적용합니다.

FGS 5가지 Action Unit (0, 1, 2점):
- AU1 귀: 0=정상, 1=벌어짐, 2=옆으로 납작
- AU2 눈: 0=둥글게 열림, 1=긴장, 2=가늘게 찡그림
- AU3 코볼: 0=이완, 1=찌그러짐, 2=납작+주름
- AU4 수염: 0=곡선, 1=직선, 2=앞뒤 뻗음
- AU5 머리: 0=높음, 1=수평, 2=낮음

종합 점수: 합산0=0, 합산1-2=1, 합산3=2, 합산4-6=3, 합산7-10=4

응답은 반드시 JSON만: {"fgs_score": 0, "confidence": 0.85, "au_scores": {"ear": 0, "eye": 0, "muzzle": 0, "whisker": 0, "head": 0}, "reasoning": "근거", "clinical_note": "소견"}"""

FGS_MSG = "이 고양이 사진의 FGS 통증 점수를 분석해주세요."


def get_mtype(path):
    ext = Path(path).suffix.lower()
    m = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
    return m.get(ext, "image/jpeg")


def parse_json(text):
    if not text:
        return None
    text = text.strip()
    if "```" in text:
        s = text.find("{")
        e = text.rfind("}")
        if s >= 0 and e > s:
            text = text[s:e + 1]
    try:
        return json.loads(text)
    except Exception:
        return None


def score_gemini(path):
    for attempt in range(3):
        try:
            with open(path, "rb") as f:
                data = f.read()
            mt = get_mtype(path)
            resp = gemini_model.generate_content(
                [FGS_PROMPT, {"mime_type": mt, "data": data}, FGS_MSG],
                generation_config=genai.GenerationConfig(temperature=0.1))
            if not resp.candidates:
                return {"error": "safety_filter"}
            r = parse_json(resp.text)
            if r and "fgs_score" in r:
                return r
            return {"error": "json_fail"}
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
            else:
                return {"error": str(e)[:100]}


CSV_FIELDS = [
    "filename", "source_dir",
    "gemini_score", "gemini_confidence", "gemini_au", "gemini_note", "gemini_error",
    "claude_score", "claude_confidence", "claude_au", "claude_note", "claude_error",
    "gpt4o_score", "gpt4o_confidence", "gpt4o_au", "gpt4o_note", "gpt4o_error",
    "avg_confidence", "consensus"]


def load_scored(csv_path):
    scored = set()
    if not os.path.exists(csv_path):
        return scored
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("filename"):
                scored.add(row["filename"])
    return scored


def save_row(csv_path, row):
    exists = os.path.exists(csv_path)
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not exists:
            w.writeheader()
        w.writerow(row)


# --- 이미지 수집 ---
imgs = []
for folder in [f"{DATA}/raw/normal", f"{DATA}/raw/pain", f"{DATA}/augmented/pain"]:
    if os.path.isdir(folder):
        for ext in ["*.jpg", "*.jpeg", "*.png"]:
            imgs.extend(glob.glob(f"{folder}/{ext}"))
imgs = sorted(imgs)

ho_dir = f"{DATA}/test_holdout/pain"
ho = set(os.listdir(ho_dir)) if os.path.isdir(ho_dir) else set()
imgs = [f for f in imgs if os.path.basename(f) not in ho]

done = load_scored(RESULTS_CSV)
todo = [f for f in imgs if os.path.basename(f) not in done]

print(f"전체: {len(imgs)}장 / 완료: {len(done)}장 / 남음: {len(todo)}장")
print("=" * 60)

# --- 스캔 실행 ---
pc, nc, ec = 0, 0, 0

for ip in tqdm(todo, desc="Gemini 스캔"):
    fn = os.path.basename(ip)
    sd = "pain" if "/pain/" in ip else "normal"
    row = {f: "" for f in CSV_FIELDS}
    row["filename"] = fn
    row["source_dir"] = sd

    r = score_gemini(ip)

    if isinstance(r, dict) and "fgs_score" in r:
        sc = r["fgs_score"]
        co = r.get("confidence", 0)
        row["gemini_score"] = sc
        row["gemini_confidence"] = co
        row["gemini_au"] = json.dumps(r.get("au_scores", {}))
        row["gemini_note"] = r.get("clinical_note", "")
        row["consensus"] = "gemini_only_normal" if sc <= 1 else "gemini_pain_suspect"
        row["avg_confidence"] = f"{co:.3f}" if co else ""
        if sc >= 2:
            pc += 1
            tqdm.write(f"  [통증의심] {fn} (score:{sc})")
        else:
            nc += 1
    else:
        row["gemini_error"] = r.get("error", "unknown") if isinstance(r, dict) else "unknown"
        row["consensus"] = "gemini_error"
        ec += 1

    save_row(RESULTS_CSV, row)

    if (nc + pc + ec) % 100 == 0 and (nc + pc + ec) > 0:
        tqdm.write(f"--- 정상:{nc} / 통증:{pc} / 에러:{ec} ---")

    time.sleep(1)

print()
print("=" * 60)
print(f"완료! 정상:{nc} / 통증의심:{pc} / 에러:{ec}")
print("=" * 60)
