#!/usr/bin/env bash
set -euo pipefail

echo "[stage-f-full] TypeScript check"
npx tsc --noEmit

echo "[stage-f-full] F-1 DecisionStore RunState adapter contract smoke"
npx ts-node scripts/f-1-decisionstore-runstate-adapter-contract-smoke.ts

echo "[stage-f-full] F-2 RunState plan apply contract smoke"
npx ts-node scripts/f-2-runstate-plan-apply-contract-smoke.ts

echo "[stage-f-full] F-3 RunState apply file shell smoke"
npx ts-node scripts/f-3-runstate-apply-file-shell-smoke.ts

echo "[stage-f-full] F-4 Dispatcher dry-run intake boundary smoke"
npx ts-node scripts/f-4-dispatcher-dry-run-intake-boundary-smoke.ts

echo "[stage-f-full] PASS"
