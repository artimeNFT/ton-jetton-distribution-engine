#!/usr/bin/env bash
set -euo pipefail

echo "[stage-e-full] TypeScript check"
npx tsc --noEmit

echo "[stage-e-full] E-1 Decision Store ownership check contract smoke"
npx ts-node scripts/e-1-decision-store-ownership-check-contract-smoke.ts

echo "[stage-e-full] E-2 Append Writer lock enforcement smoke"
npx ts-node scripts/e-2-decision-store-append-writer-lock-enforcement-smoke.ts

echo "[stage-e-full] E-3 Atomic acquire contract smoke"
npx ts-node scripts/e-3-decision-store-atomic-acquire-contract-smoke.ts

echo "[stage-e-full] E-4 Atomic acquire file shell smoke"
npx ts-node scripts/e-4-decision-store-atomic-acquire-file-shell-smoke.ts

echo "[stage-e-full] E-5 Lock fault injection / hijack resistance smoke"
npx ts-node scripts/e-5-decision-store-lock-fault-injection-hijack-resistance-smoke.ts

echo "[stage-e-full] E-6 DecisionStore / Heartbeat coexistence smoke"
npx ts-node scripts/e-6-decision-store-heartbeat-coexistence-smoke.ts

echo "[stage-e-full] PASS"
