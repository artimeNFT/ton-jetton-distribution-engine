# Stage B-1 Regression

## Status

Stage B-1 regression is a dry-run validation layer for Stage A artifacts.

Current status:

- Baseline regression: PASS
- Negative fixture regression: PASS
- Blockchain execution: disabled
- Mutation: disabled
- Git state after run: clean

Last validated head: 9cc7323 Add Stage B regression W022 fixture

## Purpose

This script verifies that the Stage B-0 watcher can validate a known-good Stage A campaign and detect selected corruption fixtures.

It reduces manual copy-paste risk and provides a repeatable pre-mainnet safety gate.

## Command

Run from the repository root:

./scripts/stage-b1-regression.sh

## What it validates

Baseline checks:

- TypeScript compilation passes.
- Watcher exits with code 0 on the known-good campaign.
- Summary severity is info.
- Findings count is 0.
- Audit CSV header is valid.
- Audit CSV row count equals expected row count.
- Audit duplicate recipient rows count is 0.
- Audit amount mismatch rows count is 0.
- Audit status mismatch rows count is 0.
- State entry count is 100.
- State success count is 100.
- Lock is inactive.

Negative fixture checks:

- W004: missing expected state entry.
- W005: unexpected extra state entry.
- W017: audit CSV row count mismatch.
- W020: audit CSV amount mismatch.
- W022: audit CSV status mismatch.

Each negative fixture must exit with code 2 and produce the expected detector code.

## Not covered yet

The regression script does not yet cover every watcher detector.

Known remaining hardening areas:

- Audit txHash consistency.
- Audit campaignId consistency.
- Audit batchId consistency.
- Audit attempts consistency.
- Audit operator or walletLabel consistency.
- Report auto-discovery from WATCH_REPORT_DIR.
- Mainnet execution gates.

These are not required for the current Stage B-1 baseline pack, but should be considered before mainnet readiness.
