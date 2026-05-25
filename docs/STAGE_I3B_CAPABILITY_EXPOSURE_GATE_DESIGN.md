# Stage I-3.B — Capability Exposure Gate Design — Design Only

## Scope

Stage I-3.B defines the architectural gate that must control any future signer/provider/RPC/wallet/seqno capability exposure.

I-3.B is Design-Only.

This document does not authorize implementation, signer integration, runtime adapter code, dependency injection wiring, dynamic loading, provider/RPC access, wallet opening, seqno reads, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.B is this gate design document.

---

## Baseline

I-3.B starts from the locked I-3.A Interface Contract Design.

Locked baseline:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Boundary Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`
- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`

Current baseline:

`c8676ea330878bca13c538827b5b1727e5d28eb2`

---

## Purpose

The purpose of I-3.B is to define when capability exposure must be blocked and what evidence must exist before any later stage may propose capability exposure.

Capability exposure includes any direct or indirect exposure of:

- signer capability
- provider capability
- RPC capability
- wallet capability
- seqno capability
- network capability
- broadcast capability
- private-key handling capability
- mnemonic handling capability
- signing capability
- signed-message capability
- dependency injection path to any of the above
- dynamic loading path to any of the above
- factory/helper routing path to any of the above

---

## Core Gate Rule

No capability exposure is allowed unless every required prior gate is green.

Any failed, missing, stale, ambiguous, bypassed, or unverifiable prerequisite must block capability exposure.

Gate failure outcome:

`CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

The gate must never degrade to warning-only behavior.

The gate must never authorize retry, reassignment, signer re-entry, fallback execution, or new intent exposure after rejection.

---

## Required Green Gates Before Any Future Capability Exposure

Capability exposure remains blocked unless all of the following are true:

1. I-2.2 SR1-SR7 remain valid and unmodified.
2. I-2.3 BV1-BV12 remain valid and unmodified.
3. I-2.4 behavioral smoke remains active in `stage-i-full-smoke.sh`.
4. I-2.4 behavioral smoke passes.
5. Local `./scripts/stage-i-full-smoke.sh` passes.
6. Local `./scripts/stage-h-full-smoke.sh` passes.
7. `git diff --check` is clean.
8. Proposed changes are reviewed for runtime capability creep.
9. Proposed changes do not mutate identity fields.
10. Proposed changes do not weaken dummy-sentinel redaction.
11. Proposed changes do not introduce real secret material in tests.
12. Proposed changes preserve no retry/reassignment/signer re-entry/new intent exposure after boundary rejection.
13. Proposed changes preserve seqno/chain state as confirm-or-block only.
14. Proposed changes preserve metadata/identity coupling prohibition.
15. Proposed changes have explicit substage approval.
16. Proposed changes have explicit rollback/fail-closed behavior.
17. Same-SHA GitHub Actions must pass after merge/push.

If any condition is absent, false, stale, or unproven, capability exposure is blocked.

---

## Hard Blocking Conditions

The gate must block immediately if any of the following is detected.

### B1 — Stage I Smoke Failure

Condition:

`./scripts/stage-i-full-smoke.sh` fails or is not run.

Outcome:

`STAGE_I_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B2 — Stage H Smoke Failure

Condition:

`./scripts/stage-h-full-smoke.sh` fails or is not run.

Outcome:

`STAGE_H_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B3 — I-2.4 Behavioral Smoke Bypass

Condition:

`stage-i-full-smoke.sh` no longer invokes `scripts/i-2-4-boundary-behavioral-smoke.ts`, or the smoke no longer verifies the required negative cases.

Required coverage:

- `negativeCases=12`
- `boundaryRejectionEscapeCases=7`

Outcome:

`BOUNDARY_BEHAVIORAL_SMOKE_BYPASS`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B4 — SR1-SR7 Weakening

Condition:

Any I-2.2 security requirement is removed, weakened, bypassed, or made optional.

Outcome:

`SECURITY_REQUIREMENT_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B5 — BV1-BV12 Weakening

Condition:

Any I-2.3 assertion is removed, weakened, bypassed, or made optional.

Outcome:

`BOUNDARY_ASSERTION_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B6 — Interface Contract Violation

Condition:

Any future ingress, egress, or failure-evidence shape violates I-3.A primitive/canonical/frozen DTO constraints.

Outcome:

`INTERFACE_CONTRACT_VIOLATION`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B7 — Runtime Object / Live Handle Exposure

Condition:

Any boundary surface accepts or returns a live object or handle.

Forbidden examples:

- provider handle
- RPC client
- wallet handle
- signer handle
- executor handle
- TonClient
- NetworkProvider
- RunState object
- DecisionStore writer object
- ExecutionContext object
- closure/function
- mutable reference
- class instance
- Date object
- Map/Set
- Buffer carrying execution-capable payload

Outcome:

`LIVE_HANDLE_EXPOSURE`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B8 — Secret / Signed Material Exposure

Condition:

Any boundary, test, log, evidence object, or failure path exposes secret or signed material.

Forbidden examples:

- private key
- mnemonic
- seed phrase
- secret key
- decrypted key material
- RPC token
- provider credential
- signature
- raw signature
- signed message
- signed BOC
- broadcast payload

Outcome:

`SECRET_OR_SIGNED_MATERIAL_EXPOSURE`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B9 — Identity Mutation

Condition:

Any future capability proposal mutates or recomputes identity fields.

Immutable fields:

- `decisionId`
- `candidateId`
- `stateKey`
- `recipientAddress`
- `amount`
- `batchId`
- `operator`
- `boundaryDecisionId`
- `boundaryVersion`
- `unsignedIntentFingerprint`

Outcome:

`CAPABILITY_GATE_IDENTITY_MUTATION`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B10 — Decision Drift

Condition:

Any future capability proposal changes decision semantics based on signer/provider/RPC/wallet/seqno/network/gas/fee/metadata state.

Outcome:

`CAPABILITY_GATE_DECISION_DRIFT`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B11 — Retry / Reassignment / Re-Entry Escape

Condition:

Boundary rejection triggers or permits:

- retry
- operator reassignment
- signer re-entry
- new intent exposure
- intent regeneration
- fallback execution
- recovery mutation
- alternate dispatch

Outcome:

`CAPABILITY_GATE_REJECTION_ESCAPE`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B12 — Seqno / Chain-State Repair

Condition:

Seqno, chain state, RPC state, or network observation is used to repair, mutate, regenerate, or reinterpret a logical decision.

Outcome:

`CAPABILITY_GATE_CHAIN_STATE_REPAIR`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B13 — Metadata / Identity Coupling

Condition:

Metadata URI, metadata hash, display metadata, exchange label, indexer state, eligibility label, or hidden metadata mutation affects signer-boundary identity.

Outcome:

`CAPABILITY_GATE_METADATA_IDENTITY_COUPLING`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B14 — Redaction Failure

Condition:

Dummy sentinel or secret-like material appears in:

- stdout
- stderr
- logs
- structured evidence
- error message
- error cause
- stack trace
- serialized rejection object

Outcome:

`CAPABILITY_GATE_REDACTION_FAILURE`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### B15 — Unreviewed Capability Path

Condition:

Any dependency injection, dynamic loading, helper routing, factory routing, adapter wiring, or hidden import exposes signer/provider/RPC/wallet/seqno capability without explicit substage approval.

Outcome:

`UNREVIEWED_CAPABILITY_PATH`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Bypass Detection Requirements

The gate design must treat bypass as a first-class security failure.

Bypass includes:

- invoking signer/provider/RPC/wallet/seqno capability outside the approved boundary
- moving capability exposure into helper modules
- hiding capability exposure behind factories
- injecting capability through generic context objects
- loading capability dynamically
- storing capability handles inside DTOs
- passing capability handles through evidence objects
- bypassing `stage-i-full-smoke.sh`
- disabling or weakening I-2.4 negative smoke
- removing no-retry/no-reassignment/no-re-entry/no-new-intent assertions
- treating failed smoke as non-blocking
- treating missing smoke as non-blocking
- treating stale CI as sufficient evidence

Bypass outcome:

`CAPABILITY_GATE_BYPASS_DETECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Gate Evidence Contract

A future capability proposal must provide evidence for:

- proposed substage scope
- exact capability category requested
- exact files to be changed
- why capability exposure is necessary
- why no smaller design-only step is sufficient
- expected failure modes
- rollback/fail-closed behavior
- redaction strategy
- Stage I smoke result
- Stage H smoke result
- diff review
- same-SHA GitHub Actions result

Missing evidence outcome:

`CAPABILITY_GATE_EVIDENCE_MISSING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Capability Exposure States

Allowed planning states:

1. `NOT_REQUESTED`
2. `REQUESTED_FOR_REVIEW`
3. `BLOCKED_FAIL_CLOSED`
4. `APPROVED_FOR_FUTURE_IMPLEMENTATION_SCOPE`

Forbidden states:

- `AUTO_APPROVED`
- `WARNING_ONLY`
- `RETRYABLE_REJECTION`
- `PARTIAL_APPROVAL_WITH_FAILED_SMOKE`
- `APPROVED_WITH_STALE_CI`
- `APPROVED_WITH_MISSING_EVIDENCE`
- `APPROVED_BY_HELPER_PATH`
- `APPROVED_BY_DYNAMIC_LOAD`

Only `APPROVED_FOR_FUTURE_IMPLEMENTATION_SCOPE` may permit a later substage to propose implementation, and even then implementation remains separately scoped.

---

## Non-Authorization Clause

I-3.B does not authorize:

- TypeScript runtime code
- lib changes
- script changes
- tests
- schema migration
- DecisionStore migration
- RunState migration
- signer import
- provider import
- RPC import
- wallet import
- seqno read
- TonClient
- NetworkProvider
- wallet opening
- private key handling
- mnemonic handling
- seed handling
- signing
- signed message generation
- signed BOC generation
- broadcast
- DRY_RUN=false
- Testnet execution
- Mainnet execution

---

## Required Future Negative Tests

I-3.B does not add tests.

Before any future capability exposure, Stage I smoke must continue to reject:

- capability exposure while Stage I smoke is failing
- capability exposure while Stage H smoke is failing
- capability exposure with missing I-2.4 smoke
- capability exposure with weakened SR1-SR7
- capability exposure with weakened BV1-BV12
- capability exposure through helper/factory/dynamic load
- capability exposure through DTO/evidence fields
- live handle ingress/egress
- secret/signed material exposure
- identity mutation
- decision drift
- retry/reassignment/signer re-entry/new intent exposure after rejection
- seqno/chain-state decision repair
- metadata/identity coupling
- redaction failure
- stale or missing same-SHA CI evidence

---

## Gate To Close I-3.B

I-3.B may close only when:

- this document is committed
- changes are docs-only
- local Stage I full smoke passes
- local Stage H full smoke passes
- `git diff --check` is clean
- main fast-forward validation passes
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Release Decision

I-3.B may define capability exposure gate design.

I-3.B does not authorize implementation.

I-3.B does not authorize capability exposure.

Any future implementation or capability exposure must be separately scoped, reviewed, negatively tested, and gated.
