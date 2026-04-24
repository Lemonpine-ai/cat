/**
 * Phase B (R6 T11 / R7 §4) — metadata freeze 테스트.
 *
 * 목적 (R6 §4.1 / T8 freeze 선언):
 *  - `cat_behavior_events.metadata` JSONB 의 4 필드 스키마가 Phase D 착수 시점까지
 *    고정됨을 검증. driver 가 metadata 를 조립하지 않고 logger 가 detection 에서 읽어
 *    기록하는 현 구조를 계약으로 고정.
 *  - detection 의 top2Class / top2Confidence / bboxAreaRatio 가 있을 때와 없을 때
 *    logger 가 조립하는 metadata 가 예측 가능한 shape 이어야 한다.
 *
 * R7 개선 (옵션 R, MINOR-R6-NEW-2 해소):
 *  - R6 까지 본 테스트는 `buildBehaviorEventMetadata()` 로컬 복사본으로 검증 → logger 변경 시
 *    테스트가 자동 검증 못 함 ("freeze" 의도 약화).
 *  - R7 부터 `staging/lib/behavior/buildBehaviorEventMetadata.ts` mirror 함수 import.
 *    Phase B src/ 반영 PR 시점에 mirror 함수가 logger 본체로 흡수되어 (T5 절차)
 *    freeze 의도 100% 달성.
 *
 * freeze 대상 4 필드 (Arch R6 §4.1):
 *  · model_version      — string, 항상 존재 ("v1")
 *  · top2_class         — string, detection.top2Class 존재 시만
 *  · top2_confidence    — number, detection.top2Confidence 가 number 일 때만
 *  · bbox_area_ratio    — number, detection.bboxAreaRatio 가 number 일 때만
 */

import { describe, expect, it } from "vitest";

import type { BehaviorDetection } from "../types/behavior";
import { buildBehaviorEventMetadata } from "../lib/behavior/buildBehaviorEventMetadata";

const BASE_DETECTION: BehaviorDetection = {
  classId: 1,
  classKey: "sleeping",
  label: "sleeping",
  confidence: 0.92,
  bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.4 },
};

describe("Phase B metadata freeze (R6 T11)", () => {
  it("top2 / bbox 없음 → model_version 만 포함", () => {
    const metadata = buildBehaviorEventMetadata(BASE_DETECTION, "v1");
    expect(Object.keys(metadata).sort()).toEqual(["model_version"]);
    expect(metadata.model_version).toBe("v1");
  });

  it("top2Class 만 존재 → model_version + top2_class", () => {
    const metadata = buildBehaviorEventMetadata(
      { ...BASE_DETECTION, top2Class: "grooming" },
      "v1",
    );
    expect(Object.keys(metadata).sort()).toEqual([
      "model_version",
      "top2_class",
    ]);
    expect(metadata.top2_class).toBe("grooming");
  });

  it("top2Confidence 만 number → top2_confidence 포함", () => {
    const metadata = buildBehaviorEventMetadata(
      { ...BASE_DETECTION, top2Confidence: 0.12 },
      "v1",
    );
    expect(metadata.top2_confidence).toBe(0.12);
    // top2_class 는 안 들어가야 함 (top2Class undefined).
    expect(metadata.top2_class).toBeUndefined();
  });

  it("bboxAreaRatio 만 number → bbox_area_ratio 포함", () => {
    const metadata = buildBehaviorEventMetadata(
      { ...BASE_DETECTION, bboxAreaRatio: 0.08 },
      "v1",
    );
    expect(metadata.bbox_area_ratio).toBe(0.08);
  });

  it("4 필드 모두 존재 → freeze spec 정확히 매치", () => {
    const metadata = buildBehaviorEventMetadata(
      {
        ...BASE_DETECTION,
        top2Class: "eating",
        top2Confidence: 0.33,
        bboxAreaRatio: 0.22,
      },
      "v1",
    );
    // R6 freeze 선언: Phase D 착수 시점까지 4 필드 고정.
    expect(Object.keys(metadata).sort()).toEqual([
      "bbox_area_ratio",
      "model_version",
      "top2_class",
      "top2_confidence",
    ]);
    expect(metadata).toMatchObject({
      model_version: "v1",
      top2_class: "eating",
      top2_confidence: 0.33,
      bbox_area_ratio: 0.22,
    });
  });

  it("top2Confidence 가 string 같은 비정상 타입 → 제외", () => {
    // logger 는 typeof === "number" 로 가드. 안전망 검증.
    const metadata = buildBehaviorEventMetadata(
      {
        ...BASE_DETECTION,
        top2Confidence: "0.3" as unknown as number,
      },
      "v1",
    );
    expect(metadata.top2_confidence).toBeUndefined();
  });

  it("R10 §2: bboxAreaRatio 가 NaN → Number.isFinite 가드로 key omit", () => {
    // R10 §2 (옵션 Y): NaN/Infinity 모두 Number.isFinite false → key 자체 부재.
    //   "key 존재 = 정상 측정" / "key 부재 = 측정 불가" 의미 명확 (Phase D/E 통계 안전 분류).
    const metadata = buildBehaviorEventMetadata(
      { ...BASE_DETECTION, bboxAreaRatio: Number.NaN },
      "v1",
    );
    expect("bbox_area_ratio" in metadata).toBe(false);
  });

  it("R10 §2: top2Confidence NaN/Infinity → metadata.top2_confidence/bbox_area_ratio key 부재", () => {
    // R10 §2 신규 case (Arch §2.4): NaN/Infinity 두 필드 동시 omit + top2_class 는 그대로 통과.
    const metadata = buildBehaviorEventMetadata(
      {
        ...BASE_DETECTION,
        top2Class: "eating",
        top2Confidence: Number.NaN,
        bboxAreaRatio: Number.POSITIVE_INFINITY,
      },
      "v1",
    );
    expect(metadata).toEqual({ model_version: "v1", top2_class: "eating" });
    expect("top2_confidence" in metadata).toBe(false);
    expect("bbox_area_ratio" in metadata).toBe(false);
  });

  it("model_version 상수는 로거 단일 소유 (driver 불변)", () => {
    // driver 가 metadata 를 조립하지 않음을 계약으로 고정하는 단서 테스트.
    const m1 = buildBehaviorEventMetadata(BASE_DETECTION, "v1");
    const m2 = buildBehaviorEventMetadata(BASE_DETECTION, "yolov8n-v1.0-20260424");
    // logger 상수 교체만으로 model_version 변경 가능. driver 는 건드리지 않음.
    expect(m1.model_version).toBe("v1");
    expect(m2.model_version).toBe("yolov8n-v1.0-20260424");
  });
});
