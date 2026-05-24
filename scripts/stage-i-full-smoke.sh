#!/usr/bin/env bash
set -euo pipefail

echo "[stage-i-full] TypeScript check"
npx tsc --noEmit

echo "[stage-i-full] I-1 Testnet environment boundary smoke"
npx ts-node scripts/i-1-testnet-environment-boundary-smoke.ts

echo "[stage-i-full] PASS"
