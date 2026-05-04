#!/usr/bin/env bash
set -euo pipefail

ROOT="/tmp/stage-b-real-gate-smoke"
RUNNER="scripts/.stage-b-real-gate-smoke.ts"
OUT="$ROOT/out.txt"

cleanup() { rm -f "$RUNNER"; }
trap cleanup EXIT

rm -rf "$ROOT"
mkdir -p "$ROOT"

cat > "$RUNNER" <<'TS'
import { run } from "./launchStageA";
void run({} as any).then(() => process.exit(0)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
TS

run_blocked_case() {
  local name="$1"
  local expected="$2"
  shift 2

  set +e
  env \
    CAMPAIGN_ID=real_gate_smoke_01 \
    TARGETS_PATH=./data/targets.100.01.json \
    STATE_PATH="$ROOT/state.json" \
    REPORT_DIR="$ROOT/reports" \
    DRY_RUN=false \
    "$@" \
    npx ts-node "$RUNNER" > "$OUT" 2>&1
  local code="$?"
  set -e

  if [ "$code" -eq 0 ]; then
    echo "[real-gate] $name FAIL: expected non-zero exit"
    cat "$OUT"
    exit 1
  fi

  grep -q "$expected" "$OUT" || {
    echo "[real-gate] $name FAIL: expected pattern not found: $expected"
    cat "$OUT"
    exit 1
  }

  echo "[real-gate] $name PASS"
}

run_blocked_case "missing REAL_EXECUTION_ENABLED" "REAL_EXECUTION_ENABLED"
run_blocked_case "bad REAL_EXECUTION_ENABLED" "REAL_EXECUTION_ENABLED" REAL_EXECUTION_ENABLED=false
run_blocked_case "missing confirmation" "CONFIRM_REAL_CHAIN_EXECUTION" REAL_EXECUTION_ENABLED=true
run_blocked_case "wrong confirmation" "CONFIRM_REAL_CHAIN_EXECUTION" REAL_EXECUTION_ENABLED=true CONFIRM_REAL_CHAIN_EXECUTION=wrong
run_blocked_case "missing stage-b flag" "STAGE_B_FULL_CHECK_REQUIRED" REAL_EXECUTION_ENABLED=true CONFIRM_REAL_CHAIN_EXECUTION=real_gate_smoke_01
run_blocked_case "all flags valid still blocked" "live execution remains blocked" REAL_EXECUTION_ENABLED=true CONFIRM_REAL_CHAIN_EXECUTION=real_gate_smoke_01 STAGE_B_FULL_CHECK_REQUIRED=true

echo "[real-gate] smoke PASS"
