#!/usr/bin/env bash
set -euo pipefail

echo "[stage-d8-full] TypeScript check"
npx tsc --noEmit

echo "[stage-d8-full] D-8.1 serialization smoke"
npx ts-node scripts/stage-d8-1-decision-store-serialization-smoke.ts

echo "[stage-d8-full] D-8.2 record validation smoke"
npx ts-node scripts/stage-d8-2-decision-store-record-validation-smoke.ts

echo "[stage-d8-full] D-8.3 duplicate classifier smoke"
npx ts-node scripts/stage-d8-3-decision-store-duplicate-classifier-smoke.ts

echo "[stage-d8-full] D-8.4 in-memory index smoke"
npx ts-node scripts/stage-d8-4-decision-store-in-memory-index-smoke.ts

echo "[stage-d8-full] D-8.7 append preflight smoke"
npx ts-node scripts/stage-d8-7-decision-store-append-preflight-smoke.ts

echo "[stage-d8-full] D-8.8 path preflight smoke"
npx ts-node scripts/stage-d8-8-decision-store-path-preflight-smoke.ts

echo "[stage-d8-full] D-8.9 append plan smoke"
npx ts-node scripts/stage-d8-9-decision-store-append-plan-smoke.ts

echo "[stage-d8-full] D-8.10 append writer smoke"
npx ts-node scripts/stage-d8-10-decision-store-append-writer-smoke.ts

echo "[stage-d8-full] D-8.12 recovery parser smoke"
npx ts-node scripts/stage-d8-12-decision-store-recovery-parser-smoke.ts

echo "[stage-d8-full] D-8.13 recovery file reader smoke"
npx ts-node scripts/stage-d8-13-decision-store-recovery-file-reader-smoke.ts

echo "[stage-d8-full] D-8.14 roundtrip smoke"
npx ts-node scripts/stage-d8-14-decision-store-roundtrip-smoke.ts

echo "[stage-d8-full] D-8.15 lock contract smoke"
npx ts-node scripts/stage-d8-15-decision-store-lock-contract-smoke.ts

echo "[stage-d8-full] PASS"
