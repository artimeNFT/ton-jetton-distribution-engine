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

echo "[stage-d8-full] PASS"
