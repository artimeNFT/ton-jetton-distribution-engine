#!/usr/bin/env bash
set -euo pipefail

echo "[stage-b-full] Checking clean git state before run"
BEFORE_STATUS="$(git status --short)"

if [ -n "$BEFORE_STATUS" ]; then
  echo "[stage-b-full] git status is not clean before run:"
  echo "$BEFORE_STATUS"
  exit 1
fi

echo "[stage-b-full] TypeScript check"
npx tsc --noEmit

echo "[stage-b-full] Stage B-1 regression"
./scripts/stage-b1-regression.sh

echo "[stage-b-full] Stage B gate smoke"
./scripts/stage-b-gate-smoke.sh

echo "[stage-b-full] Real execution gate smoke"
./scripts/stage-b-real-gate-smoke.sh

echo "[stage-b-full] Checking clean git state after run"
AFTER_STATUS="$(git status --short)"

if [ -n "$AFTER_STATUS" ]; then
  echo "[stage-b-full] git status is not clean after run:"
  echo "$AFTER_STATUS"
  exit 1
fi

echo "[stage-b-full] PASS"
