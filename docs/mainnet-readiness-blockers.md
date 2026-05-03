# Mainnet Readiness Blockers

## Status

This document defines the blockers that must be cleared before any real TON mainnet execution.

Current project state:

- Stage B-0 watcher: practically complete as Stage A artifact gate.
- Stage B-1 regression script: baseline pack automated and passing.
- Current execution mode: dry-run only.
- Real blockchain execution: not approved.

## Absolute rule

No mainnet execution is allowed until every blocker in this document is explicitly cleared.

DRY_RUN=false alone must never be enough to trigger real execution.

Real execution must require an explicit campaign-bound confirmation flag.

## Required execution gates

Before real execution, the dispatcher must require all of the following:

- DRY_RUN=false.
- REAL_EXECUTION_ENABLED=true.
- CONFIRM_REAL_CHAIN_EXECUTION must equal the exact campaignId.
- WATCHER or equivalent validation must pass with severity info.
- Git status must be clean.
- State path must not collide with an existing unrelated campaign.
- Report path must not collide with an existing unrelated campaign.

If any gate is missing or mismatched, execution must stop before signing or sending any transaction.

## Required preflight blockers

The following checks must pass before any real transaction is signed:

- Targets file is readable and campaignId matches.
- Recipient count matches expected plan.
- Recipient addresses parse successfully.
- Recipient addresses are unique after normalization.
- Amounts are normalized as bigint at runtime and decimal strings at I/O boundaries.
- Metadata preflight passes.
- Operators file is readable.
- Operator IDs are unique.
- Operator wallets have sufficient TON balance for gas.
- Gas estimate is within configured bounds.
- TON RPC endpoint is reachable and stable.
- Jetton master address is verified.
- Expected jetton wallet addresses are derivable and valid.
- Stage B-1 regression script passes.
- Stage B-0 watcher passes against final targets, state, operators, and report artifacts.

## Required postflight checks

After execution, the system must reconcile artifacts before the campaign can be considered complete:

- State meta.status is completed or explicitly stopped.
- Lock is inactive.
- No submitted entries remain stuck.
- No expired cooldown entries remain.
- Success entries have txHash.
- Hard failures have reason or error details.
- Audit CSV row count matches expected entries.
- Audit CSV has no duplicate recipient rows.
- Audit CSV amount values match state.
- Audit CSV status values match state.
- Final watcher run exits with code 0.

## Artifact archive requirements

The following artifacts must be archived for every real campaign:

- targets file.
- operators file or operator snapshot.
- token metadata snapshot.
- final state file.
- final audit CSV.
- structured logs.
- git commit hash.
- environment variable snapshot with secrets redacted.
- watcher output.
- postflight reconciliation output.

## Dry-run mode and fault executor forcing

The dispatcher must treat dry-run mode and executor forcing as separate concerns.

- dryRun controls whether real blockchain execution is allowed.
- dryRun must be explicitly set to a boolean.
- Missing dryRun is invalid and must fail closed.
- forceExecutorInDryRun may be used only for synthetic dry-run fault injection.
- forceExecutorInDryRun must not be interpreted as approval for real execution.
- Fault injection must never require setting dryRun=false.

This separation prevents a fault-test path from accidentally looking like a real-execution path.
