# STAGE_D3_CANDIDATE_DECISION_STORE_ENGINE_GATE

## 1. Status

Stage D-3 is docs-only.

No decision store implementation is approved here.

No decision engine implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is in scope.

This document defines the implementation gate for a future Candidate Decision Store and Decision Engine.

---

## 2. Future Decision Store Contract

A future decision store must be append-only.

Required behavior:

- deterministic decisionId
- idempotency by candidateId and decisionRunId
- no mutation of existing decisions
- no deletion of existing decisions
- no rewrite of Candidate identity
- no rewrite of Candidate key components
- atomic write behavior
- explicit duplicate handling
- explicit schemaVersion validation

If a decision already exists for the same candidateId and decisionRunId, the store must return the existing decision or fail closed.

A later correction must be represented as a new decision record, not as mutation.

---

## 3. Future Decision Engine Gate

A future decision engine must be deterministic.

Required inputs:

- CandidateRecord
- Candidate age context
- finalitySnapshot
- advisoryProfileSnapshot
- blacklistSnapshot
- rulesetSnapshot
- budgetSnapshot

Required outputs:

- CandidateDecisionRecord
- controlled decisionReason
- immutable decision snapshot
- audit-complete lineage

Forbidden behavior:

- randomness
- live provider calls
- target generation
- Dispatcher invocation
- RunState mutation
- execution side effects
- mutation of CandidateRecord

---

## 4. Decision Output Adapter Contract

A future adapter may transform accepted CandidateDecisionRecord data into builder-ready input.

The adapter must not:

- invoke existing scripts directly
- generate targets
- write targets
- invoke Dispatcher
- mutate RunState
- sign or broadcast transactions
- bypass budget enforcement
- bypass manual review gates

Allowed adapter output:

- in-memory accepted decision set
- builder-ready preview object
- deterministic validation summary
- rejected/manual_hold/stale accounting

The adapter is a translation boundary only.

It must not become an execution path.

---

## 5. Active Global Budget Enforcement

A future implementation must enforce global budget actively.

Budget enforcement must happen at two points:

- decision time
- builder time

Decision time requires a budget snapshot.

Builder time requires active recalculation before any target output is allowed.

Required enforcement fields:

- globalBudgetLimit
- globalBudgetUsed
- globalBudgetAvailable
- candidateAmount
- acceptedAmountTotal
- projectedBudgetAfterBuild
- budgetPolicyVersion
- enforcementDecision

Allowed enforcementDecision values:

- within_budget
- exceeds_budget
- budget_unknown
- manual_review_required

If budget cannot be calculated deterministically, the system must fail closed.

The adapter must not bypass budget enforcement.

---

## 6. Required Future Smokes

Before implementation is approved, define smokes for:

- deterministic decisionId
- duplicate decision idempotency
- append-only store behavior
- candidate identity immutability
- controlled decisionReason enforcement
- missing traceability fail-closed
- missing budget fail-closed
- budget exceeded fail-closed
- adapter cannot write targets
- adapter cannot invoke Dispatcher
- correction creates new record, not mutation

---

## 7. Final Rule

Stage D-3 approves implementation-gate design only.

No decision store implementation is approved here.

No decision engine implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
