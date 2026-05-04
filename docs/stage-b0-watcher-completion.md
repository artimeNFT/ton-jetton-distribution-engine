# Stage B-0 Watcher Completion

## Status

Stage B-0 watcher is practically complete for Stage A artifact validation.

Current repository checkpoint:

- HEAD: 6bc6de8 Use dummy operator mnemonics in gate smoke
- Git status: clean
- Execution mode: read-only
- Blockchain execution: disabled
- Mutation: disabled

## Core guarantees

- readOnly is true.
- mutationEnabled is false.
- executionEnabled is false.
- No blockchain execution is performed.
- The watcher validates existing artifacts only.
- Severity exit codes are enabled.

## Exit codes

- info: exit 0
- warning: exit 1
- critical: exit 2
- runtime error: exit 3

## Validated areas

- Campaign metadata consistency.
- Target recipient uniqueness.
- Expected state entry keys.
- Missing expected state entries.
- Unexpected extra state entries.
- Completed campaign terminal-state integrity.
- Submitted entry staleness.
- Active lock staleness.
- Lock batch reference integrity.
- Lock operator reference integrity.
- Batch attempt drift.
- Success entries without txHash.
- Hard failures without reason.
- Expired cooldown entries.
- Duplicate operator IDs.
- Audit CSV header validity.
- Audit CSV row count consistency.
- Audit CSV duplicate recipient rows.
- Audit CSV amount consistency.
- Audit CSV status consistency.
- Audit CSV campaignId consistency.
- Audit CSV batchId consistency.
- Audit CSV attempts consistency.
- Audit CSV walletLabel/operatorId consistency.
- Audit CSV txHash consistency.
- Stage B full-check CI coverage.
- Stage B regression fixtures for fresh-clone execution.

## Detector map

- W002: campaignId mismatch.
- W004: missing expected entries.
- W005: unexpected extra entries.
- W006: duplicate target addresses.
- W008: completed campaign with non-terminal entries.
- W009: submitted entry stuck.
- W010: active lock stuck.
- W011: unknown lock batch.
- W012: unknown lock operator.
- W013: batchAttempts drift.
- W014: success without txHash.
- W015: hard failure missing reason.
- W016: expired cooldown.
- W017: audit row count mismatch.
- W018: audit header invalid.
- W019: audit duplicate recipient rows.
- W020: audit amount mismatch.
- W021: duplicate operator IDs.
- W022: audit status mismatch.
- W023: audit campaignId mismatch.
- W024: audit batchId mismatch.
- W025: audit attempts mismatch.
- W026: audit walletLabel/operatorId mismatch.
- W027: audit txHash mismatch.

## Recommended validation command

Run the Stage B-1 regression script from the repository root:

./scripts/stage-b1-regression.sh

Expected result:

- baseline PASS
- W004 PASS
- W005 PASS
- W017 PASS
- W020 PASS
- W022 PASS
- W023 PASS
- W024 PASS
- W025 PASS
- W026 PASS
- W027 PASS
- git status remains clean after the run

## Remaining hardening items

The watcher is sufficient as a Stage A artifact gate.

Completed since the original completion note:

- Audit txHash consistency.
- Audit campaignId consistency.
- Audit batchId consistency.
- Audit attempts consistency.
- Audit operator or walletLabel consistency.
- Structured Stage B-1 regression coverage.
- GitHub Actions CI for stage-b-full-check.

Still open before testnet or mainnet readiness:

- Report auto-discovery from WATCH_REPORT_DIR.
- Commander control-plane review.
- Watcher architecture lock.
- Testnet canary plan.
- Mainnet execution gates and kill-switch procedures.

## Architectural conclusion

Stage B-0 watcher can now act as a read-only validation gate for Stage A artifacts.

Stage B-1 regression automation exists and validates the core baseline pack.
