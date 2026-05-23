#!/usr/bin/env bash
set -euo pipefail

label="[h-5-stage-h-metadata-governance-negative-proof-smoke]"
target="scripts/h-5-2-metadata-governance-smoke.ts"
backup="$(mktemp)"

cp "$target" "$backup"

restore() {
  cp "$backup" "$target"
  rm -f "$backup"
}

trap restore EXIT

python3 - <<'PY'
from pathlib import Path

p = Path("scripts/h-5-2-metadata-governance-smoke.ts")
s = p.read_text()

old = '  }, "IDENTITY_MUTATION");'
new = '  }, "METADATA_GOVERNANCE_OK");'

if old not in s:
    raise SystemExit("NEGATIVE_ANCHOR_NOT_FOUND")

s = s.replace(old, new, 1)
p.write_text(s)
print("PATCHED_H5_IDENTITY_MUTATION_EXPECTATION")
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
