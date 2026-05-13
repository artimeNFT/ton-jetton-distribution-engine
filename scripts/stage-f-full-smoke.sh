#!/usr/bin/env bash
set -euo pipefail

echo "[stage-f-full] TypeScript check"
npx tsc --noEmit

echo "[stage-f-full] F-1 DecisionStore RunState adapter contract smoke"
npx ts-node scripts/f-1-decisionstore-runstate-adapter-contract-smoke.ts

echo "[stage-f-full] PASS"
