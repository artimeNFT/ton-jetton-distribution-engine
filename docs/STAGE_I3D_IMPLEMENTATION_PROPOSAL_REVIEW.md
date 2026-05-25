# Stage I-3.D — Implementation Proposal Review — Design Only

## Scope

Stage I-3.D defines the review gate for any future implementation proposal related to isolated signer boundary integration.

I-3.D is Design-Only.

This document does not authorize implementation, tests, scripts, runtime adapter code, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.D is this implementation proposal review document.

---

## Baseline

I-3.D starts from the locked I-3.C Mock-Only Validation Planning stage.

Locked baseline:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Boundary Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`
- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`
- I-3.B Capability Exposure Gate Design — `295970d`
- I-3.C Mock-Only Validation Planning — `03ba68f`

Current baseline:

`03ba68fe37934ee7076edb5bf9a8db88fe414a66`

---

## Purpose

The purpose of I-3.D is to prevent unsafe expansion from design into implementation.

I-3.D defines:

- the review criteria for future implementation proposals
- the smallest safe implementation-unit model
- mandatory preconditions before any code proposal
- hard rejection criteria
- required evidence package for any later implementation substage
- boundaries that remain blocked after I-3.D

I-3.D does not approve code.

I-3.D does not approve capability exposure.

I-3.D does not approve signer integration.

---

## Core Review Principle

Future implementation must not be approved as a broad “signer integration” task.

Future work must be split into the smallest safe implementation units.

Each unit must:

- be separately scoped
- preserve all prior invariants
- define forbidden surfaces
- define expected negative behavior
- define rollback/fail-closed behavior
- define local validation
- pass same-SHA GitHub Actions after merge/push

If a proposed unit cannot be reduced to a smaller safer unit, that claim must be documented.

If a proposed unit can be split further, it must be split before implementation is considered.

---

## Required Preservation From Prior Stages

Any future implementation proposal must preserve:

- I-2.2 SR1-SR7
- I-2.3 BV1-BV12
- I-2.4 behavioral smoke coverage
- I-3.A primitive/canonical/frozen DTO interface contract
- I-3.B capability exposure gate
- I-3.C mock-only validation planning
- state-before-action
- RunState as execution source of truth
- DecisionStore as evidence/control record, not mutation authority
- boundary rejection as `SECURITY_TERMINAL`
- no retry/reassignment/signer re-entry/new intent exposure after boundary rejection
- seqno/chain state as confirm-or-block only
- metadata/identity coupling prohibition
- dummy sentinel redaction only
- no real secrets in tests
- same-SHA CI evidence before closure

---

## Smallest Safe Implementation Unit Model

Future implementation, if later approved, should proceed only through narrow units.

I-3.D does not authorize these units.

It defines the review model for them.

---

### Unit 1 — Mock-Only Boundary Evaluator

Purpose:

A future unit may propose an isolated mock-only evaluator that processes primitive fixture objects and returns deterministic boundary outcomes.

Allowed future scope, if separately approved:

- deterministic primitive fixture input
- deterministic status output
- deterministic failure reason output
- no runtime dependencies
- no signer/provider/RPC/wallet/seqno imports
- no network
- no real secrets
- no signed material
- no broadcast material

Required proof:

- M1-M20 mock scenarios covered
- deterministic repeated evaluation
- `SECURITY_TERMINAL` on unsafe scenarios
- `TERMINAL_FAIL_CLOSED` on unsafe scenarios
- no retry/reassignment/signer re-entry/new intent exposure
- dummy sentinel redaction

Still forbidden:

- signer
- provider/RPC
- wallet
- seqno
- network
- signing
- broadcast
- schema migration

---

### Unit 2 — Capability Gate Evaluation Logic

Purpose:

A future unit may propose logic that evaluates whether capability exposure remains blocked.

Allowed future scope, if separately approved:

- primitive gate evidence input
- deterministic gate status output
- fail-closed outcome on missing/stale/failed evidence
- no capability exposure

Required proof:

- Stage I smoke failure blocks
- Stage H smoke failure blocks
- I-2.4 bypass blocks
- SR1-SR7 weakening blocks
- BV1-BV12 weakening blocks
- helper/factory/dynamic-load bypass blocks
- stale or missing same-SHA CI evidence blocks

Still forbidden:

- actual signer/provider/RPC/wallet/seqno capability
- dependency injection of live capability
- dynamic loading of live capability
- runtime adapter to signer
- broadcast

---

### Unit 3 — Primitive DTO Shape Validation

Purpose:

A future unit may propose validation for I-3.A DTO shapes.

Allowed future scope, if separately approved:

- primitive-only input checks
- forbidden-field rejection
- canonical string checks
- decimal-string amount checks
- identity immutability checks
- deterministic evidence fingerprint checks

Required proof:

- forbidden ingress fields reject
- forbidden egress fields reject
- runtime object labels reject
- live handle labels reject
- identity mutation rejects
- decision drift rejects
- redaction failure rejects

Still forbidden:

- schema migration
- RunState migration
- DecisionStore migration
- runtime signer adapter
- provider/RPC/wallet/seqno capabilities

---

### Unit 4 — Evidence Redaction Validation

Purpose:

A future unit may propose dummy-sentinel redaction validation.

Allowed future scope, if separately approved:

- dummy sentinel fixtures only
- deterministic rejection output
- evidence object inspection
- stdout/stderr/log/error serialization checks

Required proof:

- sentinel absent from stdout
- sentinel absent from stderr
- sentinel absent from structured logs
- sentinel absent from evidence
- sentinel absent from error messages
- sentinel absent from causes
- sentinel absent from stack traces
- no real secret material

Still forbidden:

- real private keys
- real mnemonics
- real seed material
- real RPC tokens
- real provider credentials
- real signatures
- real signed BOC

---

### Unit 5 — Future Signer Adapter Proposal

Purpose:

A future stage may eventually propose signer adapter integration.

I-3.D does not authorize this unit.

This unit remains blocked until all lower-risk units are closed and separately reviewed.

Minimum prerequisites before even proposing this unit:

- mock-only evaluator closed
- capability gate evaluation closed
- primitive DTO validation closed
- redaction validation closed
- Stage I full smoke passes
- Stage H full smoke passes
- same-SHA CI success
- explicit approval for signer-capability discussion

Still forbidden before explicit later approval:

- signer import
- signer initialization
- wallet opening
- provider/RPC
- seqno reads
- signing
- signed BOC generation
- broadcast
- DRY_RUN=false
- Testnet/Mainnet execution

---

## Mandatory Proposal Evidence Package

Any future implementation proposal must include:

- proposed unit name
- exact scope
- exact non-scope
- exact files to be changed
- exact capability category requested, if any
- proof that no smaller safer unit is available
- expected negative scenarios
- expected failure reasons
- expected terminal statuses
- rollback/fail-closed behavior
- redaction strategy
- deterministic fixture strategy
- Stage I smoke requirement
- Stage H smoke requirement
- same-SHA CI requirement
- explicit list of forbidden imports and surfaces
- explicit statement that implementation does not authorize Testnet/Mainnet execution

Missing evidence outcome:

`IMPLEMENTATION_PROPOSAL_EVIDENCE_MISSING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Hard Rejection Criteria

Any future implementation proposal must be rejected if it includes any of the following.

### R1 — Broad Signer Integration Scope

Reject if the proposal is framed as broad signer integration rather than a smallest safe unit.

Outcome:

`IMPLEMENTATION_SCOPE_TOO_BROAD`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R2 — Runtime Capability Creep

Reject if the proposal introduces signer/provider/RPC/wallet/seqno capability before explicit capability-gate approval.

Outcome:

`IMPLEMENTATION_RUNTIME_CAPABILITY_CREEP`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R3 — Live Handle Surface

Reject if any interface, DTO, evidence object, context object, helper, or factory can carry a live handle.

Outcome:

`IMPLEMENTATION_LIVE_HANDLE_SURFACE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R4 — Secret or Signed Material Surface

Reject if the proposal allows private keys, mnemonics, seed material, signatures, signed messages, signed BOC, RPC tokens, provider credentials, or broadcast payloads.

Outcome:

`IMPLEMENTATION_SECRET_SIGNED_MATERIAL_SURFACE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R5 — Identity Mutation or Decision Drift

Reject if any implementation can mutate, recompute, repair, or reinterpret:

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

`IMPLEMENTATION_IDENTITY_DRIFT`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R6 — Retry / Reassignment / Re-Entry Escape

Reject if boundary rejection can trigger:

- retry
- operator reassignment
- signer re-entry
- new intent exposure
- intent regeneration
- fallback execution
- recovery mutation
- alternate dispatch

Outcome:

`IMPLEMENTATION_REJECTION_ESCAPE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R7 — Seqno / Chain-State Repair

Reject if seqno, chain state, RPC, network, fee, gas, or provider state can repair or mutate logical decision data.

Outcome:

`IMPLEMENTATION_CHAIN_STATE_REPAIR`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R8 — Metadata / Identity Coupling

Reject if metadata state, URI changes, hash reinterpretation, display cache, exchange labels, indexer state, eligibility labels, or hidden metadata mutation can affect signer-boundary identity.

Outcome:

`IMPLEMENTATION_METADATA_IDENTITY_COUPLING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R9 — Smoke or CI Bypass

Reject if a proposal treats missing, failing, stale, or mismatched local/CI evidence as non-blocking.

Outcome:

`IMPLEMENTATION_EVIDENCE_BYPASS`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### R10 — Testnet/Mainnet Scope Leakage

Reject if a proposal introduces Testnet/Mainnet execution, DRY_RUN=false, broadcast, signing, or live network behavior under I-3 planning approval.

Outcome:

`IMPLEMENTATION_EXECUTION_SCOPE_LEAK`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Future Negative Test Requirements

Before any future code is accepted, negative testing must prove at least:

- broad scope rejection
- runtime capability creep rejection
- live handle rejection
- secret/signed material rejection
- identity mutation rejection
- decision drift rejection
- retry/reassignment/signer re-entry/new intent exposure rejection
- seqno/chain-state repair rejection
- metadata/identity coupling rejection
- smoke bypass rejection
- stale CI rejection
- redaction failure rejection
- non-determinism rejection

These tests must prove behavior, not text-marker presence.

---

## Future Implementation Review Sequence

A future implementation unit must follow this sequence:

1. define substage scope
2. define exact files to be changed
3. define negative scenarios
4. define expected fail-closed behavior
5. run baseline Stage I full smoke
6. run baseline Stage H full smoke
7. apply minimal change
8. run focused unit smoke
9. run Stage I full smoke
10. run Stage H full smoke
11. run `git diff --check`
12. review diff for forbidden capability exposure
13. fast-forward merge to main
14. rerun Stage I full smoke on main
15. rerun Stage H full smoke on main
16. push main
17. verify same-SHA GitHub Actions success

If any step fails, the implementation unit remains blocked.

---

## Current Stage Non-Authorization

I-3.D does not authorize:

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
- network access
- capability exposure

---

## Gate To Close I-3.D

I-3.D may close only when:

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

I-3.D may define implementation proposal review rules.

I-3.D does not authorize implementation.

I-3.D does not authorize tests or scripts.

I-3.D does not authorize runtime adapter work.

I-3.D does not authorize capability exposure.

Any future implementation must be separately scoped, reviewed, negatively tested, and gated.
