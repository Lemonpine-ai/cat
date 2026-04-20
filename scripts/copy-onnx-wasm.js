#!/usr/bin/env node
/**
 * ONNX Runtime Web WASM 파일을 public/ort-wasm/ 에 복사
 * - Worker 가 WASM 을 fetch 하려면 서빙 가능한 절대 URL 필요
 * - Vercel 빌드 시 postinstall 단계에서 자동 실행
 * - repo 크기 관리를 위해 public/ort-wasm/ 은 .gitignore 처리
 */
/* eslint-disable @typescript-eslint/no-require-imports --
 * 이 파일은 Node.js CLI 스크립트 (postinstall). ESM 변환 시
 * package.json "type":"module" 파급 효과가 커서 CommonJS 유지.
 * .cjs rename 은 "파일 삭제 금지" 규칙상 회피. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");
const dst = path.join(__dirname, "..", "public", "ort-wasm");

if (!fs.existsSync(src)) {
  console.warn("[onnx-wasm] onnxruntime-web not installed, skipping copy");
  process.exit(0);
}

fs.mkdirSync(dst, { recursive: true });

const files = fs.readdirSync(src).filter((f) => f.endsWith(".wasm"));
if (files.length === 0) {
  console.warn("[onnx-wasm] no .wasm files found in onnxruntime-web/dist");
  process.exit(0);
}

for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  console.log(`[onnx-wasm] copied ${f}`);
}
console.log(`[onnx-wasm] ${files.length} wasm files → public/ort-wasm/`);

/* 검증 가드 — 빈 디렉토리/0바이트 파일 배포 방지.
 * ONNX Runtime Web 이 런타임에 요구하는 4종 파일이 모두 존재하고 크기 > 0 인지
 * 확인. 누락/빈 파일 있으면 exit 1 로 빌드 실패시켜 프로덕션 사고 차단. */
const REQUIRED_FILES = [
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jspi.wasm",
  "ort-wasm-simd-threaded.wasm",
];
const missing = [];
for (const f of REQUIRED_FILES) {
  const p = path.join(dst, f);
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
    missing.push(f);
  }
}
if (missing.length > 0) {
  console.error("[onnx-wasm] FATAL — missing or empty files:", missing);
  process.exit(1);
}
console.log("[onnx-wasm] verified", REQUIRED_FILES.length, "wasm files");
