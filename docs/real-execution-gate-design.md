# Real Execution Gate Design

## Status

This document defines the required gate before any real TON blockchain execution is implemented or enabled.

Current state:

- Stage B full check exists and passes.
- Stage B-0 watcher exists as a read-only artifact gate.
- Stage B-1 regression exists and passes.
- Stage B gate smoke exists and passes.
- Current execution mode remains dry-run only.

## Core principle

DRY_RUN=false must never be sufficient to enable real execution.

Real execution must require a separate explicit gate, bound to the exact campaignId.

If any gate is missing, mismatched, or invalid, the system must stop before signing, sending, or broadcasting any transaction.

## Required environment gates

Real execution may only be considered when all of the following are true:

- DRY_RUN=false
- REAL_EXECUTION_ENABLED=true
- CONFIRM_REAL_CHAIN_EXECUTION equals the exact campaignId
- STAGE_B_FULL_CHECK_REQUIRED=true

The confirmation value must be campaign-bound. Generic confirmations such as yes, true, confirm, or mainnet are not acceptable.

Example valid confirmation:

CONFIRM_REAL_CHAIN_EXECUTION=stress_stage_c_canary_001

## Required preflight before live executor construction

Before constructing or selecting any live executor, the system must verify:

- Git status is clean.
- ./scripts/stage-b-full-check.sh passes.
- Targets file is readable.
- Target campaignId matches the active campaignId.
- Recipient addresses are valid and unique after normalization.
- Amounts are normalized as bigint internally and decimal strings at I/O boundaries.
- Operators file is readable.
- Operator IDs are unique.
- Operator wallets have sufficient TON balance.
- Metadata preflight passes.
- State path has no collision with unrelated campaigns.
- Report path has no collision with unrelated campaigns.
- Final watcher run exits with severity info.

Failure of any preflight item must abort before signing or broadcasting.

## Execution boundary

The real execution gate must be checked before any live executor is constructed.

The following must remain impossible before the gate passes:

- Loading a signing wallet for live execution.
- Creating a live broadcast executor.
- Signing any transaction.
- Sending any transaction.
- Broadcasting any transaction.

The failure mode must be fail-closed.

If the gate cannot prove that real execution is explicitly approved for the exact campaignId, execution must stop.

## Required postflight after real execution

After any real execution, the following must pass before the campaign is accepted as complete:

- Final state has terminal status.
- Lock is inactive.
- No submitted entries remain stuck.
- No expired cooldown entries remain.
- Success entries have txHash.
- Audit CSV row count matches expected entries.
- Audit CSV has no duplicate recipient rows.
- Audit CSV amount values match state.
- Audit CSV status values match state.
- Final watcher run exits with severity info.
- Final artifacts are archived.

## Out of scope for the current stage

This design does not approve real execution.

The following remain out of scope until the gate is implemented and tested:

- Live wallet signing.
- Live TON transaction broadcast.
- Mainnet dispatch.
- Production operator funding.
- Production campaign execution.

## Design conclusion

Real execution must be treated as a separate mode, not as the absence of dry-run mode.

The system must require explicit campaign-bound approval and must fail before signing or broadcasting if approval is incomplete.
