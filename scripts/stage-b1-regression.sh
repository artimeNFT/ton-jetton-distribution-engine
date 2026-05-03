#!/usr/bin/env bash
set -euo pipefail

OUT="/tmp/stage-b1-regression-baseline.json"

CAMPAIGN_ID="${WATCH_CAMPAIGN_ID:-stress_stage_a_100_01}"
TARGETS_PATH="${WATCH_TARGETS_PATH:-./data/targets.100.01.json}"
STATE_PATH="${WATCH_STATE_PATH:-./stress_stage_a_100_01.state.json}"
REPORT_DIR="${WATCH_REPORT_DIR:-./reports}"
REPORT_PATH="${WATCH_REPORT_PATH:-./reports/mint_report_stress_stage_a_100_01_2026-05-02T18-11-44-006Z.csv}"
OPERATORS_PATH="${WATCH_OPERATORS_PATH:-./data/operators.json}"
BATCH_SIZE="${WATCH_BATCH_SIZE:-10}"
NOW_ISO="${WATCH_NOW_ISO:-2026-05-02T22:00:00.000Z}"

echo "[stage-b1] TypeScript check"
npx tsc --noEmit

echo "[stage-b1] Running baseline watcher"
WATCH_CAMPAIGN_ID="$CAMPAIGN_ID" \
WATCH_TARGETS_PATH="$TARGETS_PATH" \
WATCH_STATE_PATH="$STATE_PATH" \
WATCH_REPORT_DIR="$REPORT_DIR" \
WATCH_REPORT_PATH="$REPORT_PATH" \
WATCH_OPERATORS_PATH="$OPERATORS_PATH" \
WATCH_BATCH_SIZE="$BATCH_SIZE" \
WATCH_NOW_ISO="$NOW_ISO" \
npx ts-node scripts/watchStageB0.ts > "$OUT"

echo "[stage-b1] Validating baseline output"
python3 - "$OUT" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))

assert report["summary"]["severity"] == "info"
assert report["summary"]["findings"] == 0
assert report["findings"] == []

audit = report["audit"]
assert audit["configured"] is True
assert audit["headerValid"] is True
assert audit["rowCount"] == 100
assert audit["expectedRowCount"] == 100
assert audit["duplicateRecipientRows"] == 0
assert audit["amountMismatchRows"] == 0
assert audit["statusMismatchRows"] == 0

state = report["state"]
assert state["entryCount"] == 100
assert state["statusCounts"]["success"] == 100
assert state["successWithoutTxHash"] == 0
assert state["hardFailureMissingReason"] == 0
assert state["submittedStuckCount"] == 0
assert state["expiredCooldownCount"] == 0
assert state["batchAttemptDriftCount"] == 0
assert state["lockActive"] is False

print("[stage-b1] baseline PASS")
PY

W004_STATE="/tmp/stage-b1-w004-missing-entry.state.json"
W004_OUT="/tmp/stage-b1-w004.json"

echo "[stage-b1] Preparing W004 missing-entry fixture"
cp "$STATE_PATH" "$W004_STATE"

python3 - "$W004_STATE" <<'PY'
import json
import sys

path = sys.argv[1]
state = json.load(open(path))
key = next(iter(state["entries"]))
del state["entries"][key]
open(path, "w").write(json.dumps(state, indent=2) + "\n")
print(f"[stage-b1] W004 deleted entry: {key}")
PY

set +e
WATCH_CAMPAIGN_ID="$CAMPAIGN_ID" \
WATCH_TARGETS_PATH="$TARGETS_PATH" \
WATCH_STATE_PATH="$W004_STATE" \
WATCH_REPORT_DIR="$REPORT_DIR" \
WATCH_REPORT_PATH="$REPORT_PATH" \
WATCH_OPERATORS_PATH="$OPERATORS_PATH" \
WATCH_BATCH_SIZE="$BATCH_SIZE" \
WATCH_NOW_ISO="$NOW_ISO" \
npx ts-node scripts/watchStageB0.ts > "$W004_OUT"
W004_EXIT="$?"
set -e

python3 - "$W004_OUT" "$W004_EXIT" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
exit_code = int(sys.argv[2])

assert exit_code == 2
assert report["summary"]["severity"] == "critical"
assert report["summary"]["findings"] == 1
finding = report["findings"][0]
assert finding["code"] == "W004"
assert finding["details"]["missingExpectedEntryCount"] == 1

print("[stage-b1] W004 PASS")
PY

rm -f "$W004_STATE"
