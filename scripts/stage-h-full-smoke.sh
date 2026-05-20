#!/usr/bin/env bash
set -euo pipefail

echo "[stage-h-full] TypeScript check"
npx tsc --noEmit

echo "[stage-h-full] H-1 Legacy execution artifact quarantine smoke"
npx ts-node scripts/h-1-legacy-execution-artifact-quarantine-smoke.ts

echo "[stage-h-full] H-2 Network boundary guarding smoke"
npx ts-node scripts/h-2-network-boundary-guarding-smoke.ts

echo "[stage-h-full] H-X Historical integrity audit smoke"
npx ts-node scripts/h-x-historical-integrity-audit-smoke.ts

echo "[stage-h-full] H-3 Secrets signer boundary smoke"
npx ts-node scripts/h-3-secrets-signer-boundary-policy-smoke.ts

echo "[stage-h-full] PASS"
