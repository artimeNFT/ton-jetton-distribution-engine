#!/usr/bin/env bash
set -euo pipefail

echo "[stage-g-full] TypeScript check"
npx tsc --noEmit

echo "[stage-g-full] G-1 Integrated pipeline validation smoke"
npx ts-node scripts/g-1-integrated-pipeline-validation-smoke.ts

echo "[stage-g-full] G-2 Deterministic execution context audit smoke"
npx ts-node scripts/g-2-deterministic-execution-context-audit-smoke.ts

echo "[stage-g-full] G-4 Uncertain submission and seqno recovery smoke"
npx ts-node scripts/g-4-uncertain-submission-seqno-recovery-smoke.ts

echo "[stage-g-full] G-5 Terminal audit reconciliation smoke"
npx ts-node scripts/g-5-terminal-audit-reconciliation-smoke.ts

echo "[stage-g-full] PASS"
