#!/usr/bin/env bash
set -euo pipefail

ROOT="/tmp/stage-b-update-metadata-gate-smoke"
RUNNER="scripts/.stage-b-update-metadata-gate-smoke.ts"
OUT="$ROOT/out.txt"

cleanup() { rm -f "$RUNNER"; }
trap cleanup EXIT

rm -rf "$ROOT"
mkdir -p "$ROOT"

cat > "$RUNNER" <<'TS'
import { run } from "./updateMetadata";
void run({} as any).then(() => process.exit(0)).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
TS

set +e
env CAMPAIGN_ID=update_metadata_gate_01 TARGETS_PATH=./data/targets.100.01.json STATE_PATH="$ROOT/state.json" REPORT_DIR="$ROOT/reports" DRY_RUN=false npx ts-node "$RUNNER" > "$OUT" 2>&1
CODE="$?"
set -e

[ "$CODE" -ne 0 ]
grep -q "REAL_EXECUTION_ENABLED" "$OUT"
echo "[update-metadata-gate] smoke PASS"
