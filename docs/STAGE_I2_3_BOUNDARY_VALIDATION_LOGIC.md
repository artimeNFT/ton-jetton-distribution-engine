# Stage I-2.3 — Boundary Validation Logic — Design Only

## Scope

Stage I-2.3 defines the assertion logic that must govern the future signer boundary.

I-2.3 is Design-Only.

I-2.3 does not implement validators, runtime enforcement, signer integration, RPC access, wallet opening, seqno reads, schema migration, or behavioral smoke scripts.

I-2.3 converts the I-2.2 Behavioral Signer Boundary Contract into a validation logic matrix that future I-2.4 behavioral smoke must validate before any I-3 isolated signer integration may begin.

---

## Relationship To Prior Stages

### Inputs

I-2.3 depends on:

- Stage I-2.1 — Audit/Policy Baseline
- Stage I-2.2 — Behavioral Signer Boundary Contract
- Stage H metadata, recipient eligibility, budget, and network-boundary safety gates
- Stage G dry-run determinism and signer-boundary design constraints

### Output

I-2.3 outputs:

- boundary validation assertion definitions
- assertion failure outcomes
- evidence expectations
- non-runtime validation matrix
- gate conditions for I-2.4 behavioral smoke construction

---

## Non-Goals

I-2.3 does not create:

- TypeScript runtime code
- signer integration
- signer adapter
- provider adapter
- wallet adapter
- RPC client
- seqno reader
- broadcast path
- runtime validation library
- schema migration
- DecisionStore migration
- RunState migration
- behavioral smoke implementation

---

## Core Validation Principle

A boundary assertion is valid only if it is deterministic, input-bound, fail-closed, and unable to introduce signer/provider/RPC/wallet/seqno capability exposure.

All assertion failures must produce terminal security outcomes unless explicitly classified as a non-security design placeholder.

Boundary validation must never repair, mutate, retry, regenerate, reassign, or reinterpret a logical decision.

---

## Validation Outcome Taxonomy

Allowed outcomes:

- VALIDATED
- BLOCKED_FAIL_CLOSED
- SECURITY_TERMINAL
- TERMINAL_FAIL_CLOSED

Forbidden outcomes:

- RETRYABLE_BOUNDARY_REJECTION
- OPERATOR_REASSIGNMENT_AFTER_BOUNDARY_REJECTION
- INTENT_REGENERATION_AFTER_BOUNDARY_REJECTION
- SIGNER_REENTRY_AFTER_BOUNDARY_REJECTION
- FALLBACK_EXECUTION_AFTER_BOUNDARY_REJECTION
- IDENTITY_RECALCULATION_AFTER_BOUNDARY_REJECTION
- DECISION_REPAIR_AFTER_BOUNDARY_REJECTION

---

## Assertion Matrix

### BV1 — Runtime Capability Exposure Assertion

Requirement:

No signer/provider/RPC/wallet/seqno capability exposure may exist before I-2.3 assertions and I-2.4 behavioral smoke are locked.

Must reject:

- direct import
- indirect import
- capability initialization
- dependency injection
- dynamic loading
- factory wiring
- helper routing
- adapter exposure
- runtime object injection
- wallet/provider/signer handle propagation
- seqno reader exposure

Failure reason:

RUNTIME_CAPABILITY_CREEP

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove the boundary rejects capability exposure behaviorally, not by relying only on source regex or marker scanning.

---

### BV2 — Primitive Snapshot Assertion

Requirement:

Boundary ingress may receive only a primitive, canonical, logically frozen unsigned intent snapshot.

Allowed ingress categories:

- string identifiers
- canonical address strings
- decimal-string amounts
- boolean flags
- explicit enum/status strings
- integer-safe numeric enums where explicitly defined

Must reject:

- runtime objects
- class instances
- functions
- closures
- mutable references
- Maps
- Sets
- Dates
- Buffers containing signed or binary execution payloads
- RunState objects
- DecisionStore writer objects
- ExecutionContext objects
- provider/wallet/signer handles

Failure reason:

NON_PRIMITIVE_BOUNDARY_INGRESS

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove non-primitive ingress is rejected without exposing signer/provider/RPC/wallet/seqno capability.

---

### BV3 — Identity Immutability Assertion

Requirement:

Boundary validation must not mutate identity fields.

Immutable fields:

- decisionId
- candidateId
- stateKey
- recipientAddress
- amount
- batchId
- operator
- boundaryDecisionId
- boundaryVersion

Must reject:

- changed recipient
- changed amount
- changed batchId
- changed operator
- changed decisionId
- changed candidateId
- changed stateKey
- changed boundaryDecisionId
- changed boundaryVersion

Failure reason:

IDENTITY_MUTATION_DETECTED

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove each immutable identity field is fail-closed when altered.

---

### BV4 — Decision Drift Assertion

Requirement:

Boundary validation must not recompute, repair, normalize differently, or reinterpret logical decision identity.

Must reject mismatch between:

- original decision
- unsigned intent snapshot
- RunState entry
- DecisionStore evidence
- boundary evidence fingerprint

Failure reason:

DECISION_DRIFT_DETECTED

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must demonstrate mismatch rejection for decisionId, candidateId, stateKey, recipientAddress, amount, batchId, and operator.

---

### BV5 — Boundary Decision Derivation Assertion

Requirement:

boundaryDecisionId must be derived only from stable logical identity inputs.

Allowed derivation inputs:

- decisionId
- candidateId
- stateKey
- boundaryVersion

Forbidden derivation inputs:

- provider state
- RPC response
- signer state
- wallet state
- seqno
- gas values
- fee values
- network state
- metadata state
- timestamps
- random values
- process identifiers
- host identifiers

Failure reason:

BOUNDARY_DECISION_DERIVATION_DRIFT

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove forbidden context cannot affect boundaryDecisionId.

---

### BV6 — Boundary State Transition Assertion

Requirement:

Boundary state must progress only through allowed forward transitions.

Allowed transition model:

CREATED
→ VALIDATED
→ APPROVED
→ READY_FOR_SIGNER

Must reject:

- READY_FOR_SIGNER → CREATED
- READY_FOR_SIGNER → MUTATED
- READY_FOR_SIGNER → EXECUTION_EXPOSED
- APPROVED → CREATED
- APPROVED → MUTATED
- VALIDATED → CREATED
- any transition that exposes execution material
- any transition that skips required validation evidence

Failure reason:

BOUNDARY_STATE_TRANSITION_VIOLATION

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove illegal state transitions are terminal and not retryable.

---

### BV7 — Security-Terminal Rejection Assertion

Requirement:

Boundary rejection is a security event, not a transient network failure.

Boundary rejection must not trigger:

- retry
- operator reassignment
- signer re-entry
- new intent exposure
- intent regeneration
- fallback execution
- recovery mutation
- alternative dispatch path

Failure reason:

BOUNDARY_REJECTION_SECURITY_TERMINAL

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove boundary rejection cannot enter retry/reassignment/re-entry paths.

---

### BV8 — Seqno / Chain State Confirm-Or-Block Assertion

Requirement:

Seqno and chain state may confirm compatibility or block progression only.

They must not:

- mutate logical decision
- repair decision
- regenerate intent
- change operator
- change amount
- change recipient
- change stateKey
- make a previously invalid boundary valid
- trigger retry
- trigger signer access after mismatch

Failure reason:

CHAIN_STATE_BOUNDARY_MISMATCH

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must simulate mismatch behavior without real RPC, provider, wallet opening, seqno read, or network access.

---

### BV9 — Failure-Path Redaction Assertion

Requirement:

Controlled failure paths must not leak secret-like material.

Future smoke must use dummy sentinel values only.

Must verify no leak through:

- stdout
- stderr
- structured logs
- audit evidence
- error message
- error cause
- stack trace
- serialized rejection object

Forbidden:

- real mnemonic
- real private key
- real seed material
- real RPC token
- real provider credential
- raw signature
- signed BOC
- decrypted key material

Failure reason:

BOUNDARY_REDACTION_FAILURE

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must use dummy sentinel material and controlled failure paths only.

---

### BV10 — Metadata / Identity Coupling Assertion

Requirement:

Metadata and eligibility context must not mutate signer-boundary identity.

Must reject identity mutation based on:

- metadata URI
- metadata hash
- exchange label
- eligibility label
- display cache
- indexer state
- hidden metadata mutation
- just-in-time metadata switching
- post-approval metadata reinterpretation

Failure reason:

METADATA_IDENTITY_COUPLING

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove metadata/eligibility context cannot alter recipient, amount, operator, batchId, decisionId, candidateId, stateKey, boundaryDecisionId, or boundaryVersion.

---

### BV11 — Evidence Boundary Assertion

Requirement:

Boundary evidence must remain deterministic and consistent with original decision evidence.

I-2.3 does not add or authorize schema migration.

Future evidence fields remain design placeholders until a separately approved schema/evidence contract exists.

Must reject:

- evidence mismatch
- missing boundary evidence fingerprint where a future approved evidence contract requires it
- non-deterministic evidence fingerprint
- evidence derived from provider/RPC/signer/wallet/seqno state
- evidence that changes identity fields
- evidence that authorizes runtime capability exposure

Failure reason:

BOUNDARY_EVIDENCE_MISMATCH

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must validate deterministic evidence behavior without introducing new schema or runtime mutation in I-2.3.

---

### BV12 — Determinism Assertion

Requirement:

Boundary validation logic must be deterministic for the same canonical input.

Forbidden non-deterministic or contextual inputs:

- Date.now()
- new Date() as decision input
- Math.random()
- process timing
- network timing
- file modification time
- provider state
- RPC state
- signer state
- wallet state
- gas/fee volatility

Failure reason:

BOUNDARY_NON_DETERMINISM

Outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

Evidence expectation:

Future smoke must prove repeated validation over the same canonical snapshot produces the same result and same failure reason.

---

## Cross-Assertion Failure Rule

If more than one assertion fails, the boundary must preserve deterministic failure classification.

Required behavior:

- no retry
- no fallback
- no mutation
- no signer re-entry
- no alternate dispatch path
- no execution-capable material exposure

Classification rule:

The highest-severity security failure must resolve to:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

---

## Future I-2.4 Behavioral Smoke Requirements

I-2.4 smoke must validate behavior, not merely text presence.

I-2.4 smoke must cover at least:

- capability exposure rejection
- non-primitive ingress rejection
- identity mutation rejection
- decision drift rejection
- boundaryDecisionId forbidden-context rejection
- illegal state transition rejection
- security-terminal no-retry behavior
- seqno/chain confirm-or-block simulation
- dummy sentinel redaction failure path
- metadata/identity coupling rejection
- deterministic repeated evaluation
- evidence mismatch rejection

I-2.4 must remain isolated from:

- real signer
- real wallet
- real provider
- real RPC
- real seqno
- real network access
- DRY_RUN=false

---

## Required Evidence To Close I-2.3

I-2.3 may close only when:

- this design document is committed
- assertion matrix BV1-BV12 is defined
- every assertion has requirement, rejection class, outcome, and evidence expectation
- no implementation code is introduced
- no runtime capability exposure is introduced
- no schema migration is introduced
- no behavioral smoke scripts are introduced in I-2.3
- stage-h-full-smoke passes
- stage-i-full-smoke passes
- git diff --check is clean
- main fast-forward validation passes
- GitHub Actions passes on the same pushed SHA

---

## Forbidden Changes In I-2.3

- no TypeScript runtime code
- no lib changes
- no script changes
- no test implementation
- no behavioral smoke implementation
- no schema migration
- no DecisionStore migration
- no RunState migration
- no signer imports
- no signer capability exposure
- no provider capability exposure
- no RPC capability exposure
- no wallet capability exposure
- no seqno capability exposure
- no dependency injection of signer/provider/RPC/wallet/seqno capability
- no dynamic loading of signer/provider/RPC/wallet/seqno capability
- no factory/helper routing to signer/provider/RPC/wallet/seqno capability
- no wallet opening
- no TonClient
- no NetworkProvider
- no RPC access
- no seqno query
- no broadcast
- no DRY_RUN=false
- no Testnet execution
- no Mainnet execution

---

## Gate To Open I-2.4

I-2.4 may open only after:

- I-2.3 is committed
- I-2.3 is merged to main
- local stage-h-full and stage-i-full validation pass on main
- origin/main is updated
- GitHub Actions passes on the same SHA
- I-2.4 scope is explicitly approved as behavioral smoke construction only

I-2.4 must not open I-3.

---

## Gate To Open I-3

I-3 remains closed until:

- I-2.3 is closed and locked
- I-2.4 is closed and locked
- behavioral smoke proves boundary enforcement
- no runtime creep exists
- no signer/provider/RPC/wallet/seqno capability exists before the approved gate
- explicit I-3 scope is separately approved

I-2.3 does not authorize I-3.
