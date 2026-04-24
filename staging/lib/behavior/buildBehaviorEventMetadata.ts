/**
 * R12 PR commit 3 적용 — 본 파일은 src/lib/behavior/buildBehaviorEventMetadata.ts 로 이관됨.
 * staging/ 보존 정책 (CLAUDE.md "파일 삭제 절대 금지") 에 따라 re-export shim 유지.
 * 신규 import 는 src/ 경로 권장.
 *
 * ⚠️ mirror 마커 이전 (R12 시점):
 *  - 본 shim 에는 더 이상 `// metadata-freeze-spec: r10-1` 마커가 없음.
 *  - staging/tests/metadataFreezeMirror.test.ts 의 STAGING_MIRROR_PATH 는 R12 에서 본 파일이 아닌
 *    `src/lib/behavior/buildBehaviorEventMetadata.ts` 로 갱신됨 — 마커 검증 의미 유지.
 */
export * from "../../../src/lib/behavior/buildBehaviorEventMetadata";
