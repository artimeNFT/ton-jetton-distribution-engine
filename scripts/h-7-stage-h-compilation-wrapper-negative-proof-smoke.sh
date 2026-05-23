#!/usr/bin/env bash
set -euo pipefail

label="[h-7-stage-h-compilation-wrapper-negative-proof-smoke]"
target="scripts/h-7-2-compilation-wrapper-smoke.ts"
backup="$(mktemp)"

cp "$target" "$backup"

restore() {
  cp "$backup" "$target"
  rm -f "$backup"
}

trap restore EXIT

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/h-7-2-compilation-wrapper-smoke.ts")
s = p.read_text()

old = '"build/JettonMaster.compiled.json",'
new = '"build/MISSING_H7_NEGATIVE.compiled.json",'

if old not in s:
    raise SystemExit("NEGATIVE_ANCHOR_NOT_FOUND")

s = s.replace(old, new, 1)
p.write_text(s)
print("PATCHED_H7_REQUIRED_BUILD_FILE")
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
