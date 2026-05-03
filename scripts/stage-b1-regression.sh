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

W005_STATE="/tmp/stage-b1-w005-extra-entry.state.json"
W005_OUT="/tmp/stage-b1-w005.json"

echo "[stage-b1] Preparing W005 extra-entry fixture"
cp "$STATE_PATH" "$W005_STATE"

python3 - "$W005_STATE" <<'PY'
import copy
import json
import sys

path = sys.argv[1]
state = json.load(open(path))
key = next(iter(state["entries"]))
entry = copy.deepcopy(state["entries"][key])

entry["batchId"] = "stress_stage_a_100_01-batch-extra"
entry["recipientAddress"] = "0QEXTRA_STAGE_B1_W005_TEST"
entry["recipientIndex"] = 999999
entry["status"] = "success"
entry["txHash"] = "dry-run-extra-tx"

extra_key = "stress_stage_a_100_01-batch-extra::0qextra_stage_b1_w005_test"
state["entries"][extra_key] = entry

open(path, "w").write(json.dumps(state, indent=2) + "\n")
print(f"[stage-b1] W005 added entry: {extra_key}")
PY

set +e
WATCH_CAMPAIGN_ID="$CAMPAIGN_ID" \
WATCH_TARGETS_PATH="$TARGETS_PATH" \
WATCH_STATE_PATH="$W005_STATE" \
WATCH_REPORT_DIR="$REPORT_DIR" \
WATCH_REPORT_PATH="$REPORT_PATH" \
WATCH_OPERATORS_PATH="$OPERATORS_PATH" \
WATCH_BATCH_SIZE="$BATCH_SIZE" \
WATCH_NOW_ISO="$NOW_ISO" \
npx ts-node scripts/watchStageB0.ts > "$W005_OUT"
W005_EXIT="$?"
set -e

python3 - "$W005_OUT" "$W005_EXIT" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
exit_code = int(sys.argv[2])

assert exit_code == 2
assert report["summary"]["severity"] == "critical"
assert report["summary"]["findings"] == 1
finding = report["findings"][0]
assert finding["code"] == "W005"
assert finding["details"]["unexpectedExtraEntryCount"] == 1

print("[stage-b1] W005 PASS")
PY

rm -f "$W005_STATE"

W017_CSV="/tmp/stage-b1-w017-row-count.csv"
W017_OUT="/tmp/stage-b1-w017.json"

echo "[stage-b1] Preparing W017 audit row-count fixture"

python3 - "$REPORT_PATH" "$W017_CSV" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

lines = src.read_text().splitlines()
dst.write_text("\n".join(lines[:-1]) + "\n")

print(f"[stage-b1] W017 rows: {len(lines) - 1} -> {len(lines[:-1]) - 1}")
PY

set +e
WATCH_CAMPAIGN_ID="$CAMPAIGN_ID" \
WATCH_TARGETS_PATH="$TARGETS_PATH" \
WATCH_STATE_PATH="$STATE_PATH" \
WATCH_REPORT_DIR="$REPORT_DIR" \
WATCH_REPORT_PATH="$W017_CSV" \
WATCH_OPERATORS_PATH="$OPERATORS_PATH" \
WATCH_BATCH_SIZE="$BATCH_SIZE" \
WATCH_NOW_ISO="$NOW_ISO" \
npx ts-node scripts/watchStageB0.ts > "$W017_OUT"
W017_EXIT="$?"
set -e

python3 - "$W017_OUT" "$W017_EXIT" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
exit_code = int(sys.argv[2])

assert exit_code == 2
assert report["summary"]["severity"] == "critical"
assert report["summary"]["findings"] == 1
finding = report["findings"][0]
assert finding["code"] == "W017"
assert finding["details"]["rowCount"] == 99
assert finding["details"]["expectedRowCount"] == 100

print("[stage-b1] W017 PASS")
PY

rm -f "$W017_CSV"

W020_CSV="/tmp/stage-b1-w020-amount-mismatch.csv"
W020_OUT="/tmp/stage-b1-w020.json"

echo "[stage-b1] Preparing W020 audit amount-mismatch fixture"

python3 - "$REPORT_PATH" "$W020_CSV" <<'PY'
import csv
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

rows = list(csv.reader(src.open(newline="")))
amount_index = rows[0].index("amount")
rows[1][amount_index] = "999999999"

csv.writer(dst.open("w", newline="")).writerows(rows)
print(f"[stage-b1] W020 patched amount: {rows[1][amount_index]}")
PY

set +e
WATCH_CAMPAIGN_ID="$CAMPAIGN_ID" \
WATCH_TARGETS_PATH="$TARGETS_PATH" \
WATCH_STATE_PATH="$STATE_PATH" \
WATCH_REPORT_DIR="$REPORT_DIR" \
WATCH_REPORT_PATH="$W020_CSV" \
WATCH_OPERATORS_PATH="$OPERATORS_PATH" \
WATCH_BATCH_SIZE="$BATCH_SIZE" \
WATCH_NOW_ISO="$NOW_ISO" \
npx ts-node scripts/watchStageB0.ts > "$W020_OUT"
W020_EXIT="$?"
set -e

python3 - "$W020_OUT" "$W020_EXIT" <<'PY'
import json
import sys

report = json.load(open(sys.argv[1]))
exit_code = int(sys.argv[2])

assert exit_code == 2
assert report["summary"]["severity"] == "critical"
assert report["summary"]["findings"] == 1
finding = report["findings"][0]
assert finding["code"] == "W020"
assert finding["details"]["amountMismatchRows"] == 1

print("[stage-b1] W020 PASS")
PY

rm -f "$W020_CSV"
