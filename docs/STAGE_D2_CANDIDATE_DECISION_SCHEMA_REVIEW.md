# STAGE_D2_CANDIDATE_DECISION_SCHEMA_REVIEW

## 1. Status

Stage D-2 is docs-only.

No decision schema implementation is approved here.

No decision store implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is in scope.

This document defines the future Candidate Decision schema contract.

---

## 2. CandidateDecisionRecord

A future decision record must be append-only and audit-complete.

Required fields:

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

builderRunId is nullable during D-2.

builderRunId may be populated only by a later approved target-builder stage.

The decision record must not mutate Candidate identity or Candidate key components.

---

## 3. Traceability Contract

Every decision must link back to one source observation.

Required traceability fields:

- eventId
- txHash
- traceId
- lt
- actionIndex
- sourceProvider
- sourceEndpoint
- observedAt
- receivedAt

Traceability must be one-to-one:

- one CandidateDecisionRecord references one candidateId
- one candidateId references one CandidateRecord
- one CandidateRecord references one source observation identity

If eventId is unavailable, the decision must still preserve txHash, traceId, lt, and actionIndex.

If traceability cannot be reconstructed, the decision must fail closed to manual_hold.

---

## 4. Budget Snapshot

Every future decision must record budget context at decision time.

Required budget snapshot fields:

- globalBudgetLimit
- globalBudgetUsedBeforeDecision
- globalBudgetAvailableBeforeDecision
- candidateAmount
- budgetCurrencyOrUnit
- budgetSnapshotAt
- budgetPolicyVersion
- budgetDecision

Allowed budgetDecision values:

- within_budget
- exceeds_budget
- budget_unknown
- manual_review_required

If budget state cannot be determined, the decision must fail closed to manual_hold or rejected.

A later builder stage must not silently reinterpret the original budget context.

---

## 5. Snapshot Objects and Versioning

A future decision record must include immutable snapshots.

Required snapshot objects:

- advisoryProfileSnapshot
- finalitySnapshot
- budgetSnapshot
- rulesetSnapshot
- blacklistSnapshot

Required version fields:

- schemaVersion
- rulesetVersion
- blacklistVersion
- budgetPolicyVersion
- profileSchemaVersion

Snapshots must be copied into the decision record.

Snapshots must not be references to mutable external state.

A later profile, blacklist, or budget update must not rewrite historical decisions.

---

## 6. Decision Reason Contract

A future implementation must use controlled decision reasons.

Initial allowed reason categories:

- finality_not_confirmed
- candidate_stale
- profile_missing
- profile_risky
- blacklist_match
- amount_invalid
- budget_exceeded
- budget_unknown
- duplicate_candidate
- manual_hold_required
- manual_override_accept
- manual_override_reject
- policy_accept

Free-text notes may exist only as supplemental notes.

Free-text notes must not replace controlled decisionReason.

---

## 7. Final Rule

Stage D-2 approves Candidate Decision schema review only.

No decision schema implementation is approved here.

No decision store implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
