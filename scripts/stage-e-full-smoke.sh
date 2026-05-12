#!/usr/bin/env bash
set -euo pipefail

echo "[stage-e-full] TypeScript check"
npx tsc --noEmit

echo "[stage-e-full] E-1 Decision Store ownership check contract smoke"
npx ts-node scripts/e-1-decision-store-ownership-check-contract-smoke.ts

echo "[stage-e-full] E-2 Append Writer lock enforcement smoke"
npx ts-node scripts/e-2-decision-store-append-writer-lock-enforcement-smoke.ts

echo "[stage-e-full] PASS"
