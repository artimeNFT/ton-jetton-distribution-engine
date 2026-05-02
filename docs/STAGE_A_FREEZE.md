# Stage A Freeze — TON Jetton Distribution Engine

## Status

Stage A is frozen as a DRY-RUN-only validation milestone.

No live blockchain execution is enabled in this stage.

## Freeze Commit Baseline

Latest validated source commit before this freeze documentation:

- `41265cd Fix Stage A completion semantics`

## Scope Validated

Stage A validates the off-chain distribution engine behavior:

- Reconciler integrity check
- Zombie recovery behavior
- Metadata preflight validation
- Batch planning
- Dispatcher execution loop
- Hook & Lock invariant
- Retry classification
- Operator rotation / failover
- CSV audit writing
- Structured audit logging
- Idempotency / no-op behavior
- Runtime artifact hygiene

## Core Invariants Validated

- State is written before every execution attempt.
- No execution occurs outside the state machine.
- Idempotency key format is `<batchId>::<recipientAddress.toLowerCase()>`.
- Amounts are runtime `bigint` and I/O decimal strings.
- Execution is deterministic once targets are generated.
- Fault injection is environment-driven and disabled by default.
- No false campaign completion after partial hard failure.
- Run lock is cleared after successful or managed-failure runs.
- Runtime artifacts are ignored and not committed.

## Fault Matrix Results

| Fault | Scenario | Result |
|---|---|---|
| Fault-01 | Invalid target address | PASSED |
| Fault-02 | Crash recovery | PASSED |
| Fault-03 | Transient RPC failure | PASSED |
| Fault-04 | Operator failover | PASSED |
| Fault-05 | Hard failure | PASSED |
| Fault-05 Regression | Completion semantics after partial hard failure | PASSED |

## Stress Results

### Stress-50

Campaign:

- `stress_stage_a_50_02`
- `data/targets.50.02.json`
- 50 recipients
- amount per recipient: `1000000000`

Results:

- entries: 50
- success: 50
- failures: 0
- lock: clean
- CSV rows: 50
- CSV amount: `1000000000`
- idempotency/no-op: PASSED
- txHash overwrite: 0
- attemptNumber changes: 0

### Stress-100

Campaign:

- `stress_stage_a_100_01`
- `data/targets.100.01.json`
- 100 recipients
- amount per recipient: `1000000000`

Results:

- entries: 100
- success: 100
- failures: 0
- lock: clean
- CSV rows: 100
- CSV amount: `1000000000`
- idempotency/no-op: PASSED
- txHash overwrite: 0
- attemptNumber changes: 0

## Known Behavior

### 1. DispatchReport.completedAt naming

`DispatchReport.completedAt` is emitted as a report timestamp even when a run is operationally a no-op or when lifecycle semantics are not equivalent to “new execution completed”.

Impact:

- Naming/reporting clarity only.
- No state integrity impact.
- No execution safety impact.

Decision:

- Documented as known behavior.
- Not blocking Stage A Freeze.

### 2. Idempotent no-op lifecycle logs

An idempotent no-op run may emit structured lifecycle logs such as `campaign_started` and `campaign_completed` again.

Impact:

- Lifecycle audit logs are per-run, not exactly-once per campaign.
- No recipient-level `batch_success` rows are created.
- No txHash overwrite occurs.
- No recipient re-execution occurs.
- State remains stable.

Decision:

- Documented as known behavior.
- Not blocking Stage A Freeze.

## Explicit Non-Scope

The following are not part of Stage A:

- Live blockchain execution
- Mainnet execution
- Stage B watcher / radar
- On-chain confirmation tracking
- Real transaction reconciliation
- Contract changes
- Metadata mutation on-chain
- Production deployment

## Freeze Decision

Stage A is considered complete for DRY-RUN validation.

The project may proceed to Stage B planning after this freeze document is committed and pushed.

Stage B must begin with a design/specification pass before implementation.
