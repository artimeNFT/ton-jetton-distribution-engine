#!/usr/bin/env bash
set -euo pipefail

echo "[stage-d9-full] TypeScript check"
npx tsc --noEmit

echo "[stage-d9-full] D-9.2 gas snapshot validation smoke"
npx ts-node scripts/stage-d9-2-gas-snapshot-validation-smoke.ts

echo "[stage-d9-full] PASS"
