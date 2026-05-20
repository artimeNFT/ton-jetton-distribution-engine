#!/usr/bin/env bash
set -euo pipefail

label="[h-3-stage-h-aggregator-negative-proof-smoke]"
doc="docs/STAGE_H3_SECRET_MARKER_CLASSIFICATION.md"
backup="$(mktemp)"

cp "$doc" "$backup"
restore() {
  cp "$backup" "$doc"
  rm -f "$backup"
}
trap restore EXIT

python3 - <<'PY'
from pathlib import Path

p = Path("docs/STAGE_H3_SECRET_MARKER_CLASSIFICATION.md")
lines = p.read_text().splitlines()
out = []
removed = False

for line in lines:
    if not removed and line.startswith("### data/operators.json::"):
        removed = True
        continue
    out.append(line)

if not removed:
    raise SystemExit("CLASSIFICATION_HEADING_NOT_REMOVED")

p.write_text("\n".join(out) + "\n")
print("REMOVED_ONE_CLASSIFICATION_HEADING")
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
