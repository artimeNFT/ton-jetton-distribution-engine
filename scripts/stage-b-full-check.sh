#!/usr/bin/env bash
set -euo pipefail

echo "[stage-b-full] Checking clean git state before run"
BEFORE_STATUS="$(git status --short)"

if [ -n "$BEFORE_STATUS" ]; then
  echo "[stage-b-full] git status is not clean before run:"
  echo "$BEFORE_STATUS"
  exit 1
fi

echo "[stage-b-full] Blueprint build"
npx blueprint build --all

echo "[stage-b-full] TypeScript check"
npx tsc --noEmit

echo "[stage-b-full] Stage D-4 decision smoke aggregator"
./scripts/stage-d4-full-smoke.sh

echo "[stage-b-full] Stage D-8 decision store smoke aggregator"
./scripts/stage-d8-full-smoke.sh

echo "[stage-b-full] Stage D-9 gas snapshot smoke aggregator"
./scripts/stage-d9-full-smoke.sh

echo "[stage-b-full] E-Preflight smoke aggregator"
./scripts/e-preflight-full-smoke.sh

echo "[stage-b-full] Stage E integration boundary smoke aggregator"
./scripts/stage-e-full-smoke.sh

echo "[stage-b-full] Stage B-2 ingestion smoke"
npx ts-node scripts/stage-b2-ingestion-smoke.ts

echo "[stage-b-full] Stage B-2 TonAPI fixture smoke"
npx ts-node scripts/stage-b2-tonapi-fixture-smoke.ts

echo "[stage-b-full] Stage B-2 offline orchestrator smoke"
npx ts-node scripts/stage-b2-offline-orchestrator-smoke.ts

echo "[stage-b-full] Stage B-1 regression"
./scripts/stage-b1-regression.sh

echo "[stage-b-full] Stage B gate smoke"
./scripts/stage-b-gate-smoke.sh

echo "[stage-b-full] Real execution gate smoke"
./scripts/stage-b-real-gate-smoke.sh

echo "[stage-b-full] updateMetadata gate smoke"
./scripts/stage-b-update-metadata-gate-smoke.sh

echo "[stage-b-full] Checking clean git state after run"
AFTER_STATUS="$(git status --short)"

if [ -n "$AFTER_STATUS" ]; then
  echo "[stage-b-full] git status is not clean after run:"
  echo "$AFTER_STATUS"
  exit 1
fi

echo "[stage-b-full] PASS"
