#!/usr/bin/env bash
set -euo pipefail

label="[i-1-stage-i-negative-proof-smoke]"
target="scripts/i-1-testnet-environment-boundary-smoke.ts"
backup="$(mktemp)"

cp "$target" "$backup"

restore() {
  cp "$backup" "$target"
  rm -f "$backup"
}

trap restore EXIT

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/i-1-testnet-environment-boundary-smoke.ts")
s = p.read_text()

old = '"https://testnet.toncenter.com/api/v2/jsonRPC",'
new = '"https://missing-i1-negative.example/jsonRPC",'

if old not in s:
    raise SystemExit("NEGATIVE_ANCHOR_NOT_FOUND")

s = s.replace(old, new, 1)
p.write_text(s)
print("PATCHED_I1_TESTNET_ALLOWLIST")
PY

if ./scripts/stage-i-full-smoke.sh; then
  echo "${label} NEGATIVE_TEST_FAILED"
  exit 1
fi

echo "${label} NEGATIVE_TEST_PASS"

restore
trap - EXIT

./scripts/stage-i-full-smoke.sh

echo "${label} RESTORE_PASS"
echo "${label} PASS"
