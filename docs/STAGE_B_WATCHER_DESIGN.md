# Stage B-0 Watcher / Radar Design

Status: draft

Stage B-0 is read-only.

The Watcher observes campaign artifacts and reports anomalies.

It must not mutate state, trigger retries, clear locks, rotate operators, write audit rows, or send blockchain transactions.

## Purpose

The Watcher/Radar detects unsafe or inconsistent Stage A campaign conditions early.

It is an observer, not an executor.

The first implementation must produce reports only.

## Stage B-0 Scope

Stage B-0 may:

- read targets files
- read campaign state files
- read report CSV files when present
- validate expected entries against actual state
- detect stuck submitted entries
- detect stuck locks
- detect amount mismatches
- detect campaign ID drift
- detect idempotency drift
- emit deterministic findings

Stage B-0 must not change system state.

## Explicit Non-Scope

Stage B-0 does not:

- send blockchain transactions
- retry failed recipients
- re-broadcast submitted entries
- clear locks
- modify state files
- modify targets files
- modify report files
- mark entries as success or failure
- rotate operators
- pause operators
- perform zombie recovery
- read live-chain state
- change Tact contracts

Any mutation-capable behavior belongs to a later Stage B-1 design.

## Core Rule

Stage B-0 must preserve all Stage A invariants.

The Watcher may read artifacts and compute findings.

The Watcher must not call any function that changes execution state.

Forbidden calls include:

- stateStore.update
- saveStateAtomic
- appendAuditRow
- appendAuditRows
- dispatcher.dispatch
- executor.broadcast
- walletPool.markSuccess
- walletPool.markFailure
- Blueprint send methods

## Inputs

Minimum inputs:

- campaignId
- targetsPath
- statePath
- optional reportDir
- optional nowIso for deterministic tests

Candidate environment variables:

- WATCH_CAMPAIGN_ID
- WATCH_TARGETS_PATH
- WATCH_STATE_PATH
- WATCH_REPORT_DIR
- WATCH_NOW_ISO

## Artifacts

The Watcher reads three artifact groups:

- targets file
- campaign state file
- report CSV files when present

Targets validation includes:

- recipients array exists
- recipient count is greater than zero
- every address is non-empty
- every address passes Address.parse
- normalized recipient addresses are unique
- every amount is positive
- targets meta.campaignId matches the expected campaign when present

RunState validation includes:

- schemaVersion
- meta.campaignId
- meta.status
- meta.batchAttempts
- entries
- operators
- lock

Reports are optional in Stage B-0.

## Expected State Key Model

The Watcher must derive expected state keys deterministically.

Expected batch IDs:

- `<campaignId>-batch-1`
- `<campaignId>-batch-2`
- `<campaignId>-batch-N`

Expected state key format:

- `<batchId>::<recipientAddress.trim().toLowerCase()>`

The Watcher must compare expected keys against `RunState.entries`.

The Watcher must not infer campaign correctness from `meta.status` alone.

Preferred implementation:

- reuse the existing batch planner when practical
- avoid duplicating batch logic unless the duplicated logic is covered by tests

## Detector Matrix

### W001 State File Missing

Condition:

- expected state file does not exist

Severity:

- warning before first execution
- critical when execution was expected to have started

### W002 Campaign ID Mismatch

Condition:

- state meta.campaignId differs from expected campaignId
- targets meta.campaignId differs from expected campaignId when present

Severity:

- critical

### W003 Schema Version Mismatch

Condition:

- state schemaVersion is absent or unexpected

Severity:

- critical

Action:

- report only
- do not migrate

### W004 Missing Expected Entries

Condition:

- an expected state key is absent from RunState.entries

Severity:

- warning when campaign is running
- critical when campaign is completed

### W005 Unexpected Extra Entries

Condition:

- state contains entries not derived from the current targets and campaignId

Severity:

- warning

### W006 Duplicate Target Addresses

Condition:

- duplicate target addresses after trim/lowercase normalization

Severity:

- critical

Risk:

- idempotency key collision

### W007 Amount Mismatch

Condition:

- state entry amount differs from target amount

Severity:

- critical

### W008 Completed Campaign With Non-Terminal Entries

Condition:

- meta.status is completed
- one or more expected entries are planned, submitted, or cooldown

Severity:

- critical

### W009 Submitted Entry Stuck

Condition:

- entry.status is submitted
- submittedAt or updatedAt is older than the configured threshold

Default threshold:

- 5 minutes

Severity:

- critical

Stage B-0 action:

- alert only
- do not reset

### W010 Active Lock Stuck

Condition:

- lock.activeBatchId is not null
- lock.lockedAt is older than the configured threshold

Default threshold:

- 5 minutes

Severity:

- critical

Stage B-0 action:

- alert only
- do not clear lock

### W011 Lock References Unknown Batch

Condition:

- lock.activeBatchId is not null
- lock batch ID is not part of the expected batch set

Severity:

- critical

### W012 Lock References Unknown Operator

Condition:

- lock.activeOperatorId is not null
- operator is absent from static or runtime operator records

Severity:

- warning

### W013 BatchAttempts Drift

Condition:

- batchAttempts contains unknown batch IDs
- executed batches have missing attempt counts

Severity:

- warning

### W014 Success Without txHash

Condition:

- entry.status is success
- txHash is empty or null

Severity:

- warning in dry-run
- critical in live mode

### W015 Hard Failure Missing Reason

Condition:

- entry.status is hard_failure
- lastErrorCode or lastError is missing

Severity:

- warning

### W016 Expired Cooldown

Condition:

- entry.status is cooldown
- cooldownUntil is in the past

Severity:

- warning

Stage B-0 action:

- alert only

### W017 CSV Row Count Mismatch

Condition:

- report exists
- terminal CSV rows do not match terminal state entries

Severity:

- warning

### W018 CSV Amount Mismatch

Condition:

- CSV amount differs from target or state amount

Severity:

- critical

### W019 Duplicate CSV Recipient Rows

Condition:

- duplicate success rows for the same recipient or state key in one report

Severity:

- critical

### W020 Idempotency Re-Execution Signal

Condition:

- campaign was already completed
- later report contains new success rows
- state txHash changes unexpectedly
- state attemptNumber changes unexpectedly

Severity:

- critical

## Severity Model

### info

Informational only. No action required.

### warning

Potential drift or observability issue.

Warnings should not imply unsafe execution by themselves.

### critical

Safety, correctness, or idempotency invariant may be broken.

Critical findings must fail CI or return a non-zero exit code.

## Output Requirements

The Watcher should output deterministic JSON.

Minimum output fields:

- campaignId
- checkedAt
- summary.severity
- summary.findings
- summary.warning
- summary.critical
- state.status
- state.entries
- state.lockActive
- findings array

Each finding should contain:

- code
- severity
- message
- details

## Exit Codes

Recommended CLI exit codes:

- 0: no findings or info only
- 1: warnings exist, no critical findings
- 2: critical findings exist
- 3: watcher input or config error
- 4: malformed or unreadable artifact

## Determinism Requirements

For identical inputs and identical nowIso, the Watcher must produce:

- same findings
- same severity
- same exit code
- same ordering

Finding order:

1. severity rank
2. detector code
3. state key or recipient index

## Test Plan

Unit tests:

- missing state file
- malformed state JSON
- campaignId mismatch
- schema mismatch
- duplicate target addresses
- missing expected entries
- unexpected extra entries
- amount mismatch
- stuck submitted entry
- stuck active lock
- completed campaign with non-terminal entries
- success without txHash
- hard_failure without reason
- expired cooldown
- CSV row count mismatch
- CSV amount mismatch
- duplicate CSV success rows
- idempotency txHash overwrite
- idempotency attemptNumber change

Fixture tests:

- valid completed campaign
- partial running campaign
- hard failure campaign
- idempotent no-op campaign
- corrupt state campaign
- mismatched targets campaign

Integration tests:

- stress_stage_a_50_02
- stress_stage_a_100_01
- Stage A fault campaigns

Expected result:

- successful stress campaigns have no critical findings
- known partial or running fault states produce expected findings
- no files are modified

## Future Stage B-1

Stage B-1 may introduce controlled recommendations or recovery actions.

Stage B-1 requires a separate design review before implementation.

Any mutation-capable mode requires:

- explicit mode flag
- dry-run preview
- confirmation gate
- audit record
- rollback plan
- dedicated tests

Stage B-1 must not be implemented by silently extending Stage B-0.

## Freeze Compatibility

Stage B-0 is compatible with Stage A Freeze because it is read-only and does not alter execution behavior.

Stage B-0 must preserve all Stage A invariants.
