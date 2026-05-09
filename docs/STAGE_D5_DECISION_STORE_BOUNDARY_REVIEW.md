# STAGE_D5_DECISION_STORE_BOUNDARY_REVIEW

## 1. Status

Stage D-5 is docs-only.

No decision store implementation is approved here.

No persistence implementation is approved here.

No decision engine implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is in scope.

---

## 2. Full Record Storage Rule

A future Decision Store must persist the complete CandidateDecisionRecord.

It must not persist only:

- decision
- decisionReason
- accepted/rejected status
- candidateId only
- summary-only rows

The stored record must include the full D-4 record shape:

- decisionId
- candidateId
- decisionRunId
- builderRunId
- decision
- decisionReason
- decisionAt
- candidateObservedAt
- candidateAgeMs
- decidedBy
- manualOverride
- rulesetVersion
- blacklistVersion
- schemaVersion
- traceability
- budgetSnapshot
- finalitySnapshot
- rulesetSnapshot
- blacklistSnapshot

Snapshot fields must be stored as immutable decision-time evidence.

---

## 3. Append-Only and Atomic Write Requirements

A future Decision Store must be append-only.

Forbidden behavior:

- mutate existing decision records
- delete existing decision records
- overwrite existing decision records
- compact away historical decision records
- rewrite snapshots after storage
- rewrite decision lineage after storage

Atomic write is mandatory.

A write must either:

- append one complete CandidateDecisionRecord successfully
- or append nothing

Partial records are invalid.

If atomic write cannot be guaranteed, the store must fail closed.

---

## 4. Duplicate and Idempotency Boundary

A future Decision Store must use decisionId as the primary idempotency key.

If the same decisionId is submitted again with identical content, the store may return the existing record.

If the same decisionId is submitted with different content, the store must fail closed.

A duplicate decision must not create a second row.

A correction must be represented by a new CandidateDecisionRecord with a new decisionId.

The store must not infer a correction by mutating an existing record.

---

## 5. Store Side-Effect Boundary

A future Decision Store may only persist decision records.

It must not:

- generate targets
- write targets
- invoke Dispatcher
- mutate RunState
- mutate CandidateRecord
- call live providers
- read private keys
- sign transactions
- send transactions
- broadcast transactions
- write audit CSV
- advance cursors

The Decision Store is not an execution path.

It is an append-only evidence store.

---

## 6. Recovery Boundary

Future recovery must rebuild store indexes from persisted CandidateDecisionRecord entries.

Recovery must not require mutable sidecar state as source of truth.

If a record is malformed, truncated, duplicated with conflicting content, or missing required D-4 fields, recovery must fail closed.

Recovery must report:

- valid record count
- duplicate identical count
- conflicting duplicate count
- malformed record count
- latest decisionRunId observed

---

## 7. Final Rule

Stage D-5 approves Decision Store boundary review only.

No decision store implementation is approved here.

No persistence implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
