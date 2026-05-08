# STAGE_D1_CANDIDATE_DECISION_LAYER_REVIEW

## 1. Status

Stage D-1 is docs-only.

No decision engine implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is in scope.

This document defines the review boundary for a future Candidate Decision Layer.

---

## 2. Decision Scope

The Candidate Decision Layer decides whether an observed Candidate may advance toward target-building review.

Allowed future decision states:

- pending
- accepted
- rejected
- stale
- manual_hold
- invalidated

The decision layer must not:

- generate targets
- write targets
- invoke Dispatcher
- mutate RunState
- execute transfers
- sign or broadcast transactions
- override Candidate identity
- rewrite Candidate key components

Candidate identity remains immutable after ingestion.

---

## 3. Decision Drift Control

A Candidate may be observed at one time and decided later.

The decision record must preserve the context used at decision time.

Required decision snapshot fields:

- candidateId
- decision
- decisionReason
- decisionAt
- candidateObservedAt
- candidateAgeMs
- rulesetVersion
- blacklistVersion
- advisoryProfileSnapshot
- finalitySnapshot
- manualOverride
- reviewerId if manual review exists

Without this snapshot, the decision is not audit-complete.

A later profile or blacklist change must not silently rewrite an older decision.

---

## 4. Candidate Aging Policy

A Candidate must not remain decision-eligible forever.

Future implementation must define aging thresholds:

- fresh
- review_required
- stale
- invalidated

Aging must consider:

- candidateObservedAt
- decisionAt
- finality status
- profile freshness
- blacklist version freshness
- ruleset version freshness

A stale Candidate may not become accepted without explicit manual review.

If aging data is missing, the decision must fail closed.

---

## 5. Audit and Lineage Requirements

Every future decision must be traceable back to its source observation.

Required lineage fields:

- candidateId
- txHash
- traceId
- lt
- actionIndex
- sourceProvider
- sourceEndpoint
- observedAt
- receivedAt
- decisionId
- decisionAt
- decisionReason
- rulesetVersion

A decision must not erase or replace source observation data.

If lineage cannot be reconstructed, the Candidate must remain pending or move to manual_hold.

---

## 6. Final Rule

Stage D-1 approves Candidate Decision Layer review only.

No decision engine implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
