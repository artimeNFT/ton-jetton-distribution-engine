#!/usr/bin/env bash
set -euo pipefail

echo "[stage-g-full] TypeScript check"
npx tsc --noEmit

echo "[stage-g-full] G-1 Integrated pipeline validation smoke"
npx ts-node scripts/g-1-integrated-pipeline-validation-smoke.ts

echo "[stage-g-full] PASS"
