#!/usr/bin/env bash
set -euo pipefail

label="[h-4b-stage-h-budget-reserve-negative-proof-smoke]"
target="scripts/h-4b-2-budget-reserve-policy-smoke.ts"
backup="$(mktemp)"

cp "$target" "$backup"

restore() {
  cp "$backup" "$target"
  rm -f "$backup"
}

trap restore EXIT

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/h-4b-2-budget-reserve-policy-smoke.ts")
s = p.read_text()

old = 'label: "OPERATOR_RESERVE_BREACH",'
new = 'label: "BUDGET_OK",'

if old not in s:
    raise SystemExit("NEGATIVE_ANCHOR_NOT_FOUND")

s = s.replace(old, new, 1)
p.write_text(s)
print("PATCHED_OPERATOR_RESERVE_BREACH_EXPECTATION")
PY

if ./scripts/stage-h-full-smoke.sh; then
  echo "${label} NEGATIVE_TEST_FAILED"
  exit 1
fi

echo "${label} NEGATIVE_TEST_PASS"

restore
trap - EXIT

./scripts/stage-h-full-smoke.sh

echo "${label} RESTORE_PASS"
echo "${label} PASS"
