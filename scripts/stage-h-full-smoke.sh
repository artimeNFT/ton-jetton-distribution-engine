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

echo "[stage-h-full] H-4 Recipient eligibility policy smoke"
npx ts-node scripts/h-4-2-recipient-eligibility-policy-smoke.ts

echo "[stage-h-full] H-4B Budget reserve policy smoke"
npx ts-node scripts/h-4b-2-budget-reserve-policy-smoke.ts

echo "[stage-h-full] H-5 Metadata governance smoke"
npx ts-node scripts/h-5-2-metadata-governance-smoke.ts

echo "[stage-h-full] H-6 Metadata rollback smoke"
npx ts-node scripts/h-6-2-metadata-rollback-smoke.ts

echo "[stage-h-full] H-7 Compilation wrapper smoke"
npx ts-node scripts/h-7-2-compilation-wrapper-smoke.ts

echo "[stage-h-full] H-7 TEP serialization surface smoke"
npx ts-node scripts/h-7-3-tep-serialization-surface-smoke.ts

echo "[stage-h-full] PASS"
