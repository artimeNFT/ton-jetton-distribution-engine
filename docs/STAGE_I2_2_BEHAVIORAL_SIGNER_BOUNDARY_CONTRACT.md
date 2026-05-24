# Stage I-2.2 — Behavioral Signer Boundary Contract — Design Only

## Scope

Stage I-2.2 defines the behavioral contract between Dispatcher intent flow and future signer integration.

Boundary flow:

Dispatcher Intent Flow
        ↓
Unsigned Intent Boundary
        ↓
Future Signer Layer

I-2.2 is Design-Only.

No implementation behavior is introduced.

I-2.2 does not perform:

- signer instantiation
- wallet opening
- mnemonic parsing
- private key loading
- seqno query
- RPC/provider execution
- message signing
- message broadcast
- Testnet execution
- Mainnet execution
- DRY_RUN=false execution

---

## Objectives

I-2.2 defines:

- ingress behavior contract
- egress behavior contract
- boundary state contract
- fail-closed contract
- DecisionStore boundary invariant
- evidence contract
- future behavioral smoke contract
- security requirements preventing premature signer capability exposure

---

## Security Requirements

### SR1 — Runtime Capability Creep Gate

No signer, provider, RPC, wallet, or seqno capability exposure, initialization, dependency injection, dynamic loading, factory wiring, helper module routing, or import is allowed before I-2.3 assertions and I-2.4 behavioral smoke are locked.

This requirement forbids capability exposure, not only direct imports.

Violation:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

---

### SR2 — Decision Drift Prohibition

The signer boundary must not recompute:

- recipientAddress
- amount
- operator
- batchId
- decisionId
- candidateId
- stateKey

The boundary may consume only a primitive, canonical, logically frozen snapshot derived from the original decision.

Any mismatch against DecisionStore or RunState:

DECISION_DRIFT_DETECTED
→ TERMINAL_FAIL_CLOSED

---

### SR3 — UnsignedIntent Must Not Become Execution Object

UnsignedIntent must remain primitive and canonical only.

Forbidden additions include:

- signer handle
- wallet handle
- provider handle
- rpcEndpoint
- signedBoc
- signature
- seqno live result
- executor handle
- execution-capable payload material

Violation:

UNSIGNED_INTENT_EXECUTION_OBJECT
→ TERMINAL_FAIL_CLOSED

---

### SR4 — Seqno / Chain State Is Confirm-or-Block Only

Seqno, chain state, RPC reads, or network observations must not mutate an existing logical decision.

They may only:

- confirm compatibility
- block progression
- produce fail-closed evidence

They must not:

- correct a decision
- regenerate an intent
- alter identity fields
- trigger retry
- trigger operator reassignment

Mismatch:

CHAIN_STATE_BOUNDARY_MISMATCH
→ TERMINAL_FAIL_CLOSED

---

### SR5 — Failure-Path Redaction Requirement

Failure paths are mandatory security surfaces.

Future behavioral smoke must use dummy sentinel values only and must verify that controlled failures do not leak secret-like material through:

- stdout
- stderr
- logs
- structured evidence
- error messages
- error causes
- stack traces

Real secret material is forbidden in all tests.

Leak:

BOUNDARY_REDACTION_FAILURE
→ TERMINAL_FAIL_CLOSED

---

### SR6 — Metadata / Identity Coupling Prohibition

The signer boundary must not re-evaluate or mutate identity based on:

- metadata
- URI
- exchange label
- eligibility label
- display cache state
- indexer state
- hidden metadata mutation
- just-in-time metadata switching

Stage H metadata and eligibility controls remain upstream safety gates and must not be coupled into signer identity mutation.

Violation:

METADATA_IDENTITY_COUPLING
→ TERMINAL_FAIL_CLOSED

---

### SR7 — Boundary Rejection Is Security Terminal

Boundary rejection is not a network error.

Boundary rejection must not trigger:

- retry
- operator reassignment
- new intent exposure
- signer re-entry
- fallback execution
- intent regeneration

Boundary rejection outcome:

SECURITY_TERMINAL
→ TERMINAL_FAIL_CLOSED

---

## Risks

### R1 — Boundary identity drift

Risk:

Decision:
decisionId=A
candidateId=B

Boundary:
boundaryDecisionId=C

Possible impact:

- duplicate execution ambiguity
- recovery inconsistency
- evidence divergence

---

### R2 — Execution-capable payload leakage

Risk:

UnsignedIntent acquires execution-capable fields:

- signature
- signed payload
- signed BOC
- provider handle
- wallet handle

Possible impact:

- signer bypass surface
- invalid execution path exposure

---

### R3 — Illegal state transition

Risk:

READY_FOR_SIGNER
→ CREATED

READY_FOR_SIGNER
→ MUTATED

Possible impact:

- recovery inconsistency
- duplicate state exposure

---

### R4 — Boundary evidence mismatch

Risk:

Decision evidence
≠
Boundary evidence

Possible impact:

- reconciliation failure
- audit inconsistency

---

## Boundary State Model

Allowed transitions:

CREATED
    ↓
VALIDATED
    ↓
APPROVED
    ↓
READY_FOR_SIGNER

Forbidden transitions:

READY_FOR_SIGNER → CREATED

READY_FOR_SIGNER → MUTATED

READY_FOR_SIGNER → EXECUTION_EXPOSED

Any forbidden transition:

→ TERMINAL_FAIL_CLOSED

---

## Allowed Ingress Contract

Allowed:

- canonical primitive values only
- unsigned intent snapshot only
- normalized address strings
- decimal-string amounts
- immutable identifiers
- explicit enum/status values

---

## Forbidden Ingress Contract

Forbidden:

- mnemonic
- privateKey
- secretKey
- seed material
- signature material
- signed payload material
- signed BOC payloads
- provider handles
- wallet handles
- executor handles
- runtime objects
- mutable references
- closures/functions
- RunState objects
- DecisionStore writer objects
- ExecutionContext objects

---

## Identity Invariants

Immutable fields:

- decisionId
- candidateId
- stateKey
- recipientAddress
- amount
- boundaryDecisionId
- boundaryVersion

Any mismatch:

→ TERMINAL_FAIL_CLOSED

---

## Boundary Identity Invariant

boundaryDecisionId must be deterministically derived only from:

- decisionId
- candidateId
- stateKey
- boundaryVersion

Forbidden derivation inputs:

- provider state
- gas values
- fee values
- seqno
- network state
- signer state
- timestamps

---

## DecisionStore Boundary Contract

Future evidence fields are design placeholders only and may be introduced only by a separately approved future schema/evidence contract.

I-2.2 does not add, require, or authorize schema migration.

Future evidence fields may include:

- boundaryDecisionId
- boundaryVersion
- boundaryStatus
- boundaryEvidenceFingerprint

Restrictions:

- boundaryDecisionId immutable
- boundaryVersion immutable

Any mismatch:

BOUNDARY_EVIDENCE_MISMATCH

→ TERMINAL_FAIL_CLOSED

---

## Future Behavioral Smoke Contract

Behavioral smoke validation must verify:

- ingress behavior
- identity immutability
- state transitions
- evidence behavior
- fail-closed behavior
- security-terminal rejection behavior
- failure-path redaction behavior
- absence of signer/provider/RPC/wallet/seqno capability exposure before gates are locked

Behavioral smoke must never rely on:

- regex matching
- source scanning
- text markers
- marker existence

Behavioral smoke PASS condition:

PASS only if the future smoke validates the behavior contract without signer/provider/RPC/wallet/seqno capability exposure.

---

## Forbidden Changes

- no TypeScript runtime code
- no schema migration
- no lib changes
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

---

## Gate To Close I-2.2

I-2.2 closes only when:

- design document committed
- behavioral contract defined
- state model defined
- fail-closed behavior defined
- Security Requirements SR1-SR7 defined
- DecisionStore invariant defined
- future smoke contract defined
- no implementation introduced
