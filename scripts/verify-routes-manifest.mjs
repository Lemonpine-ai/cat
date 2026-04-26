/**
 * cat-identity Tier 1 fix R1 #6 — routes-manifest 검증 스크립트.
 *
 * Next.js build 결과물 (.next/routes-manifest.json) 에 cat-identity 핵심 라우트가
 * 포함되어 있는지 빌드 직후 한번 확인. 회귀 (route 누락) 조기 감지.
 *
 * 사용:
 *   pnpm verify:routes
 *
 * exit 1: 라우트 누락 또는 manifest 파일 자체 부재
 * exit 0: 모든 검증 통과
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MANIFEST_PATH = resolve(process.cwd(), ".next", "routes-manifest.json");
const REQUIRED_ROUTES = ["/cats/new"];

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `[verify-routes] manifest 파일 없음: ${MANIFEST_PATH}\n  먼저 'pnpm build' 실행 필요.`,
  );
  process.exit(1);
}

const raw = readFileSync(MANIFEST_PATH, "utf8");
const manifest = JSON.parse(raw);

// Next.js manifest 는 staticRoutes / dynamicRoutes 두 배열을 가짐.
const allRoutes = [
  ...(manifest.staticRoutes ?? []),
  ...(manifest.dynamicRoutes ?? []),
].map((r) => r.page);

let missing = [];
for (const required of REQUIRED_ROUTES) {
  if (!allRoutes.includes(required)) {
    missing.push(required);
  }
}

if (missing.length > 0) {
  console.error(
    `[verify-routes] 누락된 라우트: ${missing.join(", ")}\n  존재 라우트: ${allRoutes.join(", ")}`,
  );
  process.exit(1);
}

console.log(`[verify-routes] OK — ${REQUIRED_ROUTES.length} 라우트 모두 존재`);
process.exit(0);
