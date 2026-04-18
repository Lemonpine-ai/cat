"""고양이 행동 YOLO 데이터셋 라벨 수정 + train/val 분리 스크립트.
기능: class_id 재매핑(0~11), Stratified Group Split(80:20),
     data.yaml / train.txt / val.txt / fix_report.json 생성.
사용법: python fix_labels_and_split.py [--dry-run] [--backup] [--yes]
"""
from __future__ import annotations

import argparse
import json
import random
import re
import shutil
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from tqdm import tqdm

# ── 경로 설정 ──
BASE_DIR = Path("E:/cat_ai_project/datasets/cat_behavior/processed")
LABELS_DIR = BASE_DIR / "labels"
IMAGES_DIR = BASE_DIR / "images"

# ── 클래스 매핑 (cat-arch가 cat-armstretch의 접두사이므로 cat-arch를 마지막에 배치) ──
CLASS_MAP = [
    ("cat-armstretch", 1), ("cat-footpush", 2), ("cat-getdown", 3),
    ("cat-grooming", 4), ("cat-heading", 5), ("cat-laydown", 6),
    ("cat-lying", 7), ("cat-roll", 8), ("cat-sitdown", 9),
    ("cat-tailing", 10), ("cat-walkrun", 11), ("cat-arch", 0),
]

# ── 클래스 이름 (data.yaml용) ──
CLASS_NAMES = {
    0: "arch", 1: "arm_stretch", 2: "foot_push", 3: "get_down",
    4: "grooming", 5: "heading", 6: "lay_down", 7: "lying",
    8: "roll", 9: "sit_down", 10: "tailing", 11: "walk_run",
}


def parse_args() -> argparse.Namespace:
    """CLI 인자 파싱."""
    parser = argparse.ArgumentParser(
        description="YOLO 라벨 class_id 수정 + train/val 분리"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="파일 수정 없이 리포트만 출력",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="labels 폴더를 백업한 뒤 진행",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="백업 미지정 시 확인 프롬프트를 자동 승인",
    )
    return parser.parse_args()


def get_class_id(filename: str) -> int | None:
    """파일명에서 class_id를 결정한다. longest-match-first 방식."""
    stem = Path(filename).stem.lower()
    # 접두사 길이 내림차순으로 정렬하여 longest-match-first 보장
    for prefix, cid in sorted(CLASS_MAP, key=lambda x: -len(x[0])):
        if stem.startswith(prefix):
            return cid
    return None


def get_group_key(filename: str) -> str:
    """파일명에서 그룹키 추출. _f숫자 부분을 제거한다.
    예: cat-arch-000000_f120.txt → cat-arch-000000
    """
    stem = Path(filename).stem
    # _f + 1자리 이상 숫자로 끝나는 패턴을 정규식으로 매칭 (엣지케이스 방지)
    m = re.search(r"_f\d+$", stem)
    return stem[: m.start()] if m else stem


def backup_labels(labels_dir: Path) -> Path:
    """labels 폴더를 날짜 기반으로 백업한다."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = labels_dir.parent / f"labels_backup_{timestamp}"
    print(f"[백업] {labels_dir} → {backup_dir}")
    shutil.copytree(labels_dir, backup_dir)
    print(f"[백업] 완료 ({sum(1 for _ in backup_dir.glob('*.txt'))}개 파일)")
    return backup_dir


def fix_labels(labels_dir: Path, dry_run: bool) -> dict:
    """라벨 파일의 class_id를 파일명 기반으로 수정한다."""
    txt_files = sorted(labels_dir.glob("*.txt"))
    if not txt_files:
        raise FileNotFoundError(f"라벨 파일이 없습니다: {labels_dir}")

    # 통계 수집용 변수
    total_fixed_files = 0
    total_fixed_lines = 0
    class_dist: dict[int, int] = defaultdict(int)
    errors: list[str] = []
    file_class_map: dict[str, int] = {}  # 파일명 → class_id (split용)

    print(f"\n[라벨 수정] 총 {len(txt_files)}개 파일 처리 중...")
    for txt_file in tqdm(txt_files, desc="라벨 수정"):
        # 파일명으로 class_id 결정
        class_id = get_class_id(txt_file.name)
        if class_id is None:
            errors.append(f"매핑 실패 (알 수 없는 패턴): {txt_file.name}")
            continue

        # 라벨 파일 읽기
        try:
            raw_lines = txt_file.read_text(encoding="utf-8").splitlines()
        except Exception as e:
            errors.append(f"읽기 실패: {txt_file.name} → {e}")
            continue

        # 빈 줄 skip 후 유효 라인만 수집
        lines = [ln for ln in raw_lines if ln.strip()]
        if not lines:
            errors.append(f"빈 파일: {txt_file.name}")
            continue

        # 유효한 라인이 있는 파일만 split 대상에 등록
        file_class_map[txt_file.name] = class_id
        class_dist[class_id] += 1

        # 각 라인의 class_id를 수정
        new_lines = []
        modified = False
        for line in lines:
            parts = line.strip().split()
            if len(parts) < 5:
                # 형식 오류 라인은 원본 유지. 같은 파일의 다른 라인이
                # 수정되면 함께 기록됨 (의도적).
                # modified 플래그 미반영은 의도적 (데이터 손실 방지)
                errors.append(f"잘못된 형식 (유지됨) ({txt_file.name}): {line.rstrip(chr(10))}")
                new_lines.append(line.rstrip("\n"))
                continue
            old_id = parts[0]
            if old_id != str(class_id):
                parts[0] = str(class_id)
                modified = True
                total_fixed_lines += 1
            new_lines.append(" ".join(parts))

        # 파일 단위 수정 카운트
        if modified:
            total_fixed_files += 1

        # dry-run이 아닐 때만 파일 쓰기
        if modified and not dry_run:
            txt_file.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

    return {
        "total_files": len(txt_files),
        "total_fixed_files": total_fixed_files,
        "total_fixed_lines": total_fixed_lines,
        "class_distribution": dict(sorted(class_dist.items())),
        "errors": errors,
        "file_class_map": file_class_map,
    }


def stratified_group_split(
    file_class_map: dict[str, int],
    seed: int = 42,
    train_ratio: float = 0.8,
) -> tuple[list[str], list[str]]:
    """클래스별 Stratified Group Split. 같은 그룹키는 같은 split에 배치."""
    # 그룹키별 소속 클래스 집계 → 대표 클래스 결정
    group_files: dict[str, list[str]] = defaultdict(list)
    group_class_counter: dict[str, Counter] = defaultdict(Counter)

    for filename, class_id in file_class_map.items():
        gk = get_group_key(filename)
        group_files[gk].append(filename)
        group_class_counter[gk][class_id] += 1

    # 대표 클래스 기준으로 그룹키 분류 (동률 시 클래스 ID 오름차순 선택)
    class_groups: dict[int, set[str]] = defaultdict(set)
    for gk, counter in group_class_counter.items():
        max_count = counter.most_common(1)[0][1]
        # 동률인 클래스가 여럿이면 ID 오름차순 선택
        representative = min(
            cid for cid, cnt in counter.items() if cnt == max_count
        )
        class_groups[representative].add(gk)

    train_files: list[str] = []
    val_files: list[str] = []

    # 루프 바깥에서 rng 한 번만 생성 (재현성 보장)
    rng = random.Random(seed)

    # 클래스별로 그룹키를 셔플 후 80:20 분리
    for class_id in sorted(class_groups.keys()):
        groups = sorted(class_groups[class_id])

        # 그룹이 1개뿐이면 val 분리 불가 → train에만 배정
        if len(groups) == 1:
            print(f"[경고] class {class_id}: 그룹 1개 → train에만 배정")
            for gk in groups:
                train_files.extend(group_files[gk])
            continue

        rng.shuffle(groups)

        split_idx = max(1, int(len(groups) * train_ratio))
        train_groups = set(groups[:split_idx])
        val_groups = set(groups[split_idx:])

        for gk in train_groups:
            train_files.extend(group_files[gk])
        for gk in val_groups:
            val_files.extend(group_files[gk])

    # 정렬하여 재현성 보장
    train_files.sort()
    val_files.sort()
    return train_files, val_files


def write_split_files(
    train_files: list[str],
    val_files: list[str],
    images_dir: Path,
    output_dir: Path,
    dry_run: bool,
) -> tuple[int, int, list[str]]:
    """train.txt, val.txt 생성. (train, val, missing) 튜플 반환."""
    if dry_run:
        print("[dry-run] train.txt / val.txt 생성 건너뜀")
        return len(train_files), len(val_files), []

    # 이미지 캐시 구축 (stem → 절대경로 문자열). O(N) 1회 순회
    img_exts = {".jpg", ".jpeg", ".png", ".bmp"}
    try:
        image_map = {
            img.stem: str(img.resolve())
            for img in images_dir.iterdir() if img.suffix.lower() in img_exts
        }
    except PermissionError as e:
        raise PermissionError(f"이미지 폴더 접근 권한 없음: {images_dir}") from e
    if not image_map:
        print("[경고] image_map이 비어 있습니다. 이미지 폴더 경로/형식을 확인하세요.")

    # train.txt / val.txt 작성 + 누락 파일 수집
    missing: list[str] = []
    train_written = 0
    with open(output_dir / "train.txt", "w", encoding="utf-8") as f:
        for name in tqdm(train_files, desc="train.txt 생성"):
            img = image_map.get(Path(name).stem)
            if img:
                f.write(img + "\n")
                train_written += 1
            else:
                missing.append(name)
    val_written = 0
    with open(output_dir / "val.txt", "w", encoding="utf-8") as f:
        for name in tqdm(val_files, desc="val.txt 생성"):
            img = image_map.get(Path(name).stem)
            if img:
                f.write(img + "\n")
                val_written += 1
            else:
                missing.append(name)

    # 누락 이미지 요약 출력
    if missing:
        print(f"[경고] 이미지 누락 {len(missing)}건")
        for name in missing[:5]:
            print(f"  - {name}")
        if len(missing) > 5:
            print(f"  ... 외 {len(missing) - 5}건")

    print(f"[저장] train.txt ({train_written}건) / val.txt ({val_written}건)")
    return train_written, val_written, missing


def write_data_yaml(output_dir: Path, dry_run: bool) -> None:
    """data.yaml을 생성한다."""
    if dry_run:
        print("[dry-run] data.yaml 생성 건너뜀")
        return

    # YAML 직접 작성 (PyYAML 의존성 제거)
    names_block = "\n".join(f"  {i}: {CLASS_NAMES[i]}" for i in range(len(CLASS_NAMES)))
    yaml_content = (
        f"path: {BASE_DIR.as_posix()}\ntrain: train.txt\nval: val.txt\n\n"
        f"nc: {len(CLASS_NAMES)}\nnames:\n{names_block}\n"
    )
    yaml_path = output_dir / "data.yaml"
    yaml_path.write_text(yaml_content, encoding="utf-8")
    print(f"[저장] {yaml_path}")


def write_report(
    report: dict,
    train_count: int,
    val_count: int,
    missing_images: int,
    missing_list: list[str],
    output_dir: Path,
    dry_run: bool,
) -> None:
    """fix_report.json을 생성한다."""
    # 클래스 분포에 이름 추가
    named_dist = {}
    for cid, count in report["class_distribution"].items():
        name = CLASS_NAMES.get(cid, f"unknown_{cid}")
        named_dist[f"{cid}_{name}"] = count

    result = {
        "timestamp": datetime.now().isoformat(),
        "dry_run": dry_run,
        "total_files": report["total_files"],
        "total_fixed_files": report["total_fixed_files"],
        "total_fixed_lines": report["total_fixed_lines"],
        "class_distribution": named_dist,
        "train_count": train_count,
        "val_count": val_count,
        "missing_images": missing_images,
        "missing_images_list": missing_list[:50],
        "error_count": len(report["errors"]),
        "errors": report["errors"][:50],
    }
    # dry-run 모드에서는 이미지 매칭 미수행 안내
    if dry_run:
        result["note"] = "dry-run 모드: train/val 건수는 라벨 기준 (이미지 매칭 미수행)"

    report_path = output_dir / "fix_report.json"
    if not dry_run:
        report_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[저장] {report_path}")
    # 콘솔 요약 출력
    sep = "=" * 50
    r = result
    print(f"\n{sep}\n  라벨 수정 리포트\n{sep}")
    print(f"  총 파일: {r['total_files']} | 수정: {r['total_fixed_files']}파일 {r['total_fixed_lines']}라인")
    print(f"  Train: {r['train_count']} | Val: {r['val_count']} | 누락: {r['missing_images']} | 에러: {r['error_count']}")
    for err in r["errors"][:10]:
        print(f"    - {err}")
    print(sep)


def main() -> None:
    """메인 실행 함수."""
    args = parse_args()
    if not LABELS_DIR.exists():
        raise FileNotFoundError(f"라벨 폴더 없음: {LABELS_DIR}")
    if not IMAGES_DIR.exists():
        raise FileNotFoundError(f"이미지 폴더 없음: {IMAGES_DIR}")
    mode = "DRY-RUN" if args.dry_run else "실행"
    print(f"\n[모드] {mode}\n[라벨] {LABELS_DIR}\n[이미지] {IMAGES_DIR}")

    # 백업 미지정 + 실행 모드일 때 확인 프롬프트
    if not args.backup and not args.dry_run and not args.yes:
        answer = input("[경고] --backup 없이 실행합니다. 계속하시겠습니까? (y/N): ")
        if answer.strip().lower() != "y":
            print("[취소] 사용자가 취소했습니다.")
            return
    if args.backup and not args.dry_run:
        backup_labels(LABELS_DIR)

    # 1단계: 라벨 class_id 수정
    report = fix_labels(LABELS_DIR, args.dry_run)
    file_class_map = report["file_class_map"]
    if not file_class_map:
        print("[경고] 매핑된 파일이 없어 분할을 건너뜁니다.")
        return

    # 2단계: Stratified Group Split
    train_files, val_files = stratified_group_split(file_class_map)
    if not val_files:
        print("[경고] val_files가 비어 있습니다. 분할 비율/데이터를 확인하세요.")
    print(f"\n[분할] Train: {len(train_files)}건 / Val: {len(val_files)}건")

    # 3단계: train.txt / val.txt 작성
    train_written, val_written, missing = write_split_files(
        train_files, val_files, IMAGES_DIR, BASE_DIR, args.dry_run
    )
    # 4단계: data.yaml 생성
    write_data_yaml(BASE_DIR, args.dry_run)
    # 5단계: 리포트 생성
    missing_images = len(missing)
    write_report(report, train_written, val_written, missing_images, missing, BASE_DIR, args.dry_run)
    print("\n[dry-run] 파일 수정 없이 리포트만 출력했습니다." if args.dry_run else "\n[완료] 라벨 수정 + train/val 분리 완료!")


if __name__ == "__main__":
    main()
