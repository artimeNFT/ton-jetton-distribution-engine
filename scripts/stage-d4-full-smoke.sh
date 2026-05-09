#!/usr/bin/env bash
set -euo pipefail

echo "[stage-d4-full] TypeScript check"
npx tsc --noEmit

echo "[stage-d4-full] D-4.1 decision id smoke"
npx ts-node scripts/stage-d4-1-candidate-decision-smoke.ts

echo "[stage-d4-full] D-4.2 decision record smoke"
npx ts-node scripts/stage-d4-2-candidate-decision-record-smoke.ts

echo "[stage-d4-full] D-4.3 decision immutability smoke"
npx ts-node scripts/stage-d4-3-decision-builder-negative-smoke.ts

echo "[stage-d4-full] D-4.4 decision validation smoke"
npx ts-node scripts/stage-d4-4-decision-validation-smoke.ts

echo "[stage-d4-full] D-4.5 fail-closed builder smoke"
npx ts-node scripts/stage-d4-5-decision-builder-fail-closed-smoke.ts

echo "[stage-d4-full] PASS"
