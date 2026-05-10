# STAGE_D9_1_GAS_SNAPSHOT_SCHEMA_ADVISORY

## 1. Status

Stage D-9.1 is docs-only.

No production logic is approved here.

No CandidateDecisionRecord schema change is approved here.

No gas estimator implementation is approved here.

No blockchain call is approved here.

No Dispatcher integration is approved here.

No RunState mutation is approved here.

No targets generation is approved here.

No signing, sending, broadcasting, or execution is in scope.

This document defines the advisory schema direction for a future gasEstimateSnapshot.

---

## 2. Purpose

The future gasEstimateSnapshot must preserve decision-time fee context.

Budget alone is not sufficient evidence.

A decision record must be able to explain:

- what fee estimate was used
- who or what produced the estimate
- when the estimate was produced
- which chain/config context was observed
- whether the estimate was fresh enough
- which fee ceiling was enforced
- why a decision was allowed or rejected under the fee policy

The gas snapshot is audit evidence, not an execution instruction.

---

## 3. Proposed Snapshot Shape

Future field name: gasEstimateSnapshot.

The snapshot should be a peer of:

- budgetSnapshot
- finalitySnapshot
- rulesetSnapshot
- blacklistSnapshot

It must represent decision-time fee evidence.

It must not represent execution success.

---

## 4. Proposed Advisory Fields

The future gasEstimateSnapshot should include:

- gasEstimateSource
- gasEstimateMethod
- gasEstimatorVersion
- gasObservedAt
- gasMaxFreshnessMs
- gasFreshnessDecision
- gasChain
- gasWorkchain
- gasChainSeqno
- gasChainConfigHash
- gasChainConfigParamVersion
- estimatedStorageFeeNanoTon
- estimatedComputeFeeNanoTon
- estimatedForwardFeeNanoTon
- estimatedActionFeeNanoTon
- estimatedTotalFeeNanoTon
- feeAllowanceNanoTon
- feePolicyVersion
- feeDecision

---

## 5. Runtime and I/O Type Rules

Runtime fee arithmetic should use bigint.

Persisted JSONL fields must use decimal strings.

Decimal string rules:

- base-10 only
- no scientific notation
- no fractional component
- no locale separators
- no negative values
- no empty strings

The following fields must be decimal strings at I/O boundaries:

- estimatedStorageFeeNanoTon
- estimatedComputeFeeNanoTon
- estimatedForwardFeeNanoTon
- estimatedActionFeeNanoTon
- estimatedTotalFeeNanoTon
- feeAllowanceNanoTon

Future validation must fail closed if any decimal string is malformed.

---

## 6. Freshness Rules

The future gasEstimateSnapshot must include freshness evidence.

Required freshness checks:

- gasObservedAt must be valid ISO 8601
- decisionAt must be valid ISO 8601
- gasObservedAt must not be after decisionAt
- decisionAt - gasObservedAt must be within gasMaxFreshnessMs
- gasFreshnessDecision must be explicit

Allowed gasFreshnessDecision values:

- fresh
- stale
- not_applicable_offline_fixed

Future builders must fail closed if a required gas estimate is stale.

Offline fixed estimates may use not_applicable_offline_fixed, but only in dry-run stages.

---

## 7. Gas Provider Integrity

The snapshot must identify the source of the estimate.

The future schema should distinguish:

- offline fixed dry-run estimate
- sandbox estimate
- RPC/config based estimate
- external provider estimate

For any non-offline estimate, the snapshot should preserve observed chain context:

- gasChain
- gasWorkchain
- gasChainSeqno
- gasChainConfigHash
- gasChainConfigParamVersion
- gasObservedAt

If a required chain/config context field is missing, the future builder must fail closed.

The system must not silently use stale API data as a fresh gas estimate.

---

## 8. Arithmetic Consistency Rules

Future validation should prove internal fee consistency.

Recommended invariant:

estimatedStorageFeeNanoTon + estimatedComputeFeeNanoTon + estimatedForwardFeeNanoTon + estimatedActionFeeNanoTon must equal estimatedTotalFeeNanoTon.

All arithmetic must be performed with bigint at runtime.

All persisted values must remain decimal strings.

If the arithmetic check fails, the future builder must fail closed.

No fallback estimate is allowed.

No best-effort fee value is allowed.

---

## 9. Fail-Closed Rules

Future gas snapshot construction must fail closed if:

- gasEstimateSource is missing or unsupported
- gasEstimateMethod is missing
- gasEstimatorVersion is missing
- gasObservedAt is invalid
- a required fee field is missing
- a required fee field is not a decimal string
- a required chain/config context field is missing
- the estimate is stale
- arithmetic consistency fails
- feeDecision is missing or unsupported

The builder must not construct a partial gasEstimateSnapshot.

The builder must not invent fallback fee values.

The builder must not proceed with unknown gas context.

---

## 10. CandidateDecisionRecord Integration Boundary

D-9.1 does not approve adding gasEstimateSnapshot to CandidateDecisionRecord.

Future integration must happen only after a dedicated validation stage.

When approved in a later stage, gasEstimateSnapshot should be added as immutable decision-time evidence.

It should be treated like the existing snapshots:

- budgetSnapshot
- finalitySnapshot
- rulesetSnapshot
- blacklistSnapshot

Any future decisionId calculation must explicitly define whether gasEstimateSnapshot participates in the decision identity.

If it participates, any gas context change creates a different decisionId.

If it does not participate, the audit model must justify why gas evidence is not identity-defining.

---

## 11. Audit Explanation Requirement

The future snapshot must be self-explanatory.

An auditor should be able to answer:

- which estimator was used
- which estimator version was used
- when the estimate was produced
- whether the estimate was fresh
- what fee ceiling was enforced
- what total estimated fee was used
- why the gas policy allowed or rejected the candidate

The audit explanation must not require a live-chain call.

The persisted record must contain enough context to explain the decision offline.

---

## 12. Explicit Non-Scope

Stage D-9.1 does not implement:

- gas estimator code
- sandbox gas estimation
- RPC gas estimation
- blockchain config reads
- CandidateDecisionRecord schema mutation
- decisionId mutation
- Decision Store mutation
- Dispatcher integration
- RunState mutation
- targets generation
- signing
- sending
- broadcasting
- execution

This stage is advisory only.

---

## 13. Deferred Implementation Stages

Recommended future stages:

- D-9.2 Gas Snapshot Validation Contract
- D-9.3 CandidateDecisionRecord Gas Snapshot Integration
- D-9.4 Gas Snapshot Roundtrip and Recovery Smoke
- D-9.5 Passive Heartbeat Schema Advisory
- D-9.6 Passive Heartbeat Writer Shell

Any implementation stage must preserve D-8 fail-closed behavior.

Any implementation stage must remain dry-run until explicitly approved otherwise.

---
