#!/usr/bin/env bash
set -euo pipefail

SMOKE_ROOT="/tmp/stage-b-gate-smoke"
SMOKE_REPORT_DIR="$SMOKE_ROOT/reports"
SMOKE_OUT="$SMOKE_ROOT/launch.out"
RUNNER="scripts/.stage-b-gate-smoke.ts"

cleanup() {
  rm -f "$RUNNER"
}
trap cleanup EXIT

rm -rf "$SMOKE_ROOT"
mkdir -p "$SMOKE_REPORT_DIR"

cat > "$RUNNER" <<'TS'
import { run } from "./launchStageA";

void run({} as any)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
TS

echo "[stage-b-gate] Running non-interactive fault-injection smoke"

set +e
CAMPAIGN_ID=stress_stage_a_100_01 \
TARGETS_PATH=./test-fixtures/stage-b1/targets.json \
STATE_PATH="$SMOKE_ROOT/stress_stage_a_100_01.state.json" \
REPORT_DIR="$SMOKE_REPORT_DIR" \
DRY_RUN=true \
BATCH_SIZE=10 \
ENTRY_DELAY_MS=1 \
BATCH_DELAY_MS=1 \
FAULT_INJECTOR_ENABLED=true \
FAULT_INJECT_CAMPAIGN_ID=stress_stage_a_100_01 \
FAULT_INJECT_RECIPIENT_INDEX=0 \
FAULT_INJECT_KIND=rpc_transient \
FAULT_INJECT_ONCE=true \
timeout 90s npx ts-node "$RUNNER" > "$SMOKE_OUT"
SMOKE_EXIT="$?"
set -e

if [ "$SMOKE_EXIT" -ne 0 ]; then
  echo "[stage-b-gate] smoke failed with exit=$SMOKE_EXIT"
  tail -n 80 "$SMOKE_OUT" 2>/dev/null || true
  exit "$SMOKE_EXIT"
fi

echo "[stage-b-gate] Validating smoke output"

grep -q '"isDryRun":true' "$SMOKE_OUT"
grep -q '"dryRun":true' "$SMOKE_OUT"
grep -q 'Fault injection configured' "$SMOKE_OUT"
grep -q 'FaultInjector] Injecting fault' "$SMOKE_OUT"
grep -q '"reasonCode":"transient_rpc"' "$SMOKE_OUT"
grep -q 'DryRunExecutor] Synthetic broadcast' "$SMOKE_OUT"
grep -q 'Dispatch complete' "$SMOKE_OUT"

echo "[stage-b-gate] smoke PASS"
