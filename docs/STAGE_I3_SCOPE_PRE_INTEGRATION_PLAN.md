# Stage I-3 — Scope Definition / Pre-Integration Plan — Design Only

## Scope

Stage I-3 is not authorized for implementation until this scope is reviewed, committed, merged, pushed, and validated.

This document defines the pre-integration scope for future isolated signer integration.

I-3 begins as Design-Only.

No signer implementation, runtime adapter, RPC/provider access, wallet opening, seqno read, broadcast path, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false behavior is authorized by this document.

---

## Baseline

Stage I-3 planning starts only after Stage I-2 closure.

Locked baseline:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`

Current release baseline:

`9a7d9d7b4695a49e100c8b88b9c5337ead674d26`

The I-2 package is release-ready for I-3 planning only.

---

## Purpose

The purpose of I-3 is to define the controlled path toward isolated signer integration without weakening the I-2 boundary.

I-3 must preserve:

- I-2.2 SR1-SR7
- I-2.3 BV1-BV12
- I-2.4 negative behavioral smoke coverage
- state-before-action
- RunState as execution source of truth
- DecisionStore as evidence/control record, not mutation authority
- `SECURITY_TERMINAL` rejection behavior
- no retry/reassignment/signer re-entry/new intent exposure after boundary rejection
- metadata/identity coupling prohibition
- seqno/chain state confirm-or-block only
- dummy sentinel testing only; no real secrets in tests

---

## I-3 Planning Boundary

I-3 may define:

- signer boundary ingress contract
- signer boundary egress contract
- signer capability exposure gate
- signer rejection taxonomy
- redaction and failure-path evidence expectations
- future mock-only validation strategy
- future Testnet gate prerequisites
- future implementation review checklist

I-3 may not yet introduce:

- signer implementation
- signer adapter code
- wallet opening
- provider/RPC client
- seqno query
- chain state read
- broadcast
- signed BOC
- raw signature
- private key handling
- mnemonic handling
- seed material handling
- runtime object crossing the boundary
- schema migration
- DRY_RUN=false
- Testnet execution
- Mainnet execution

---

## Required Integration Principle

Signer integration must be treated as capability exposure.

Capability exposure is not allowed merely because I-3 has begun.

Any future capability exposure must be preceded by:

1. explicit substage scope approval
2. pre-change Stage I full smoke PASS
3. pre-change Stage H full smoke PASS
4. review against SR1-SR7
5. review against BV1-BV12
6. review against I-2.4 negative behavioral coverage
7. explicit failure-path redaction plan
8. explicit rollback/fail-closed plan
9. post-change Stage I full smoke PASS
10. post-change Stage H full smoke PASS
11. same-SHA GitHub Actions success

---

## Allowed I-3 Substage Types

### I-3.A — Interface Contract Design

Allowed:

- document canonical signer ingress fields
- document canonical signer egress fields
- document forbidden fields
- document fail-closed behavior
- document evidence requirements

Forbidden:

- TypeScript implementation
- signer imports
- provider/RPC imports
- wallet imports
- seqno reads
- runtime handles

---

### I-3.B — Capability Exposure Gate Design

Allowed:

- define gate conditions for future capability exposure
- define review checklist
- define negative smoke requirements
- define failure classifications

Forbidden:

- actual capability exposure
- dependency injection wiring
- dynamic loading
- factory/helper routing to signer/provider/RPC/wallet/seqno capability

---

### I-3.C — Mock-Only Validation Planning

Allowed:

- plan mock-only tests
- define dummy sentinel behavior
- define expected `SECURITY_TERMINAL` outcomes
- define deterministic fixture shapes

Forbidden:

- real signer
- real wallet
- real provider
- real RPC
- real seqno
- real secret material
- real network access

---

### I-3.D — Implementation Proposal Review

Allowed:

- review a proposed minimal implementation plan
- reject runtime creep
- require new smoke coverage before implementation
- require explicit approval before coding

Forbidden:

- implementing during the review document
- merging runtime code under planning-only approval

---

## Signer Boundary Ingress Contract — Planning Draft

Future signer boundary ingress may only receive a primitive, canonical, logically frozen snapshot.

Allowed planning fields:

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
- explicit enum/status values

Forbidden ingress fields:

- private key
- mnemonic
- seed material
- secret key
- decrypted key material
- signature
- raw signature
- signed message
- signed BOC
- provider handle
- wallet handle
- signer handle
- executor handle
- RPC endpoint
- provider credentials
- RPC token
- runtime object
- closure/function
- mutable reference
- Date object
- Map/Set
- Buffer containing signed or execution-capable payload

---

## Signer Boundary Egress Contract — Planning Draft

Future signer boundary egress must not mutate logical identity.

Allowed egress planning categories:

- approval/rejection status
- deterministic evidence fingerprint
- redacted error class
- boundary validation status
- capability-gate status

Forbidden egress categories:

- mutated recipient
- mutated amount
- mutated operator
- mutated batchId
- mutated decisionId
- mutated candidateId
- mutated stateKey
- replacement unsigned intent
- retry request
- reassignment request
- signer re-entry request
- new intent exposure
- raw signature
- signed BOC
- broadcast payload
- provider result used as decision repair

---

## Seqno / Chain State Rule

Seqno and chain state remain confirm-or-block only.

They must not:

- repair a decision
- mutate identity
- regenerate an intent
- choose a new operator
- change amount
- change recipient
- turn invalid boundary state into valid boundary state
- trigger retry
- trigger fallback execution

Any mismatch must resolve to:

`SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Failure-Path Redaction Rule

Failure paths remain security surfaces.

Future I-3 work must use dummy sentinels only.

Forbidden in tests:

- real mnemonic
- real private key
- real seed phrase
- real RPC token
- real provider credential
- real signature
- real signed BOC

Required behavior:

- no sentinel in stdout
- no sentinel in stderr
- no sentinel in structured logs
- no sentinel in evidence
- no sentinel in error messages
- no sentinel in causes
- no sentinel in stack traces

Leak outcome:

`BOUNDARY_REDACTION_FAILURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Required Negative Testing Before Any Capability Exposure

Before any future signer capability can be introduced, Stage I smoke must continue to prove:

- BV1 runtime capability exposure rejection
- BV2 non-primitive ingress rejection
- BV3 identity mutation rejection
- BV4 decision drift rejection
- BV5 forbidden boundaryDecisionId derivation context rejection
- BV6 illegal state transition rejection
- BV7 retry/reassignment/signer re-entry/new intent exposure rejection
- BV8 seqno/chain state mismatch rejection
- BV9 dummy sentinel leak rejection
- BV10 metadata/identity coupling rejection
- BV11 evidence mismatch rejection
- BV12 non-deterministic context rejection

I-3 must not weaken I-2.4 behavioral smoke.

---

## Forbidden Changes In This Stage

This pre-integration planning stage forbids:

- TypeScript runtime code
- lib changes
- schema migration
- DecisionStore migration
- RunState migration
- signer imports
- provider imports
- RPC imports
- wallet imports
- seqno reads
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
- execution outside the state machine

---

## Required Evidence To Close This Scope Document

This scope document may close only when:

- document is committed
- local Stage I full smoke passes
- local Stage H full smoke passes
- `git diff --check` is clean
- changes are docs-only
- main fast-forward validation passes
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Release Decision

This document may approve opening I-3 planning.

This document does not approve I-3 implementation.

I-3 implementation remains blocked until a separate substage explicitly approves the smallest safe implementation unit and preserves all I-2 invariants.
