#!/usr/bin/env node
/**
 * ONNX Runtime Web WASM 파일을 public/ort-wasm/ 에 복사
 * - Worker 가 WASM 을 fetch 하려면 서빙 가능한 절대 URL 필요
 * - Vercel 빌드 시 postinstall 단계에서 자동 실행
 * - repo 크기 관리를 위해 public/ort-wasm/ 은 .gitignore 처리
 */
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
