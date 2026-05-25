# Stage I-3 — Closure Review / Release Decision — Design Only

## Scope

This document closes Stage I-3 planning/design work for the isolated signer boundary preparation package.

Stage I-3 Closure Review is Design-Only / Review-Only.

This document does not authorize implementation, tests, scripts, runtime adapter code, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of this closure stage is this release-decision document.

---

## Closure Baseline

Stage I-3 Closure Review starts from locked origin/main after I-3.D.

Current baseline:

`f1db5a637cc4570ce24150ba764b7795c5020530`

Locked I-3 package:

- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`
- I-3.B Capability Exposure Gate Design — `295970d`
- I-3.C Mock-Only Validation Planning — `03ba68f`
- I-3.D Implementation Proposal Review — `f1db5a6`

Prior required boundary package:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Boundary Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`

---

## Closure Objective

The objective of this closure review is to determine whether Stage I-3 may be considered complete as a design/pre-integration package.

This closure verifies that I-3:

- remained docs-only
- did not introduce runtime code
- did not introduce scripts
- did not introduce tests
- did not introduce schema migration
- did not expose signer/provider/RPC/wallet/seqno capability
- did not authorize Testnet/Mainnet execution
- preserved I-2 signer-boundary invariants
- preserved Stage H pre-live safety constraints
- requires future implementation to be separately scoped, reviewed, negatively tested, and gated

---

## I-3 Package Inventory

### I-3 Scope / Pre-Integration Plan

File:

`docs/STAGE_I3_SCOPE_PRE_INTEGRATION_PLAN.md`

Purpose:

Defined I-3 as a design-only/pre-integration planning stage.

Locked effect:

- did not authorize signer implementation
- did not authorize runtime adapter code
- did not authorize RPC/provider access
- did not authorize wallet opening
- did not authorize seqno reads
- did not authorize broadcast
- did not authorize schema migration
- did not authorize Testnet/Mainnet execution
- did not authorize DRY_RUN=false

---

### I-3.A — Interface Contract Design

File:

`docs/STAGE_I3A_INTERFACE_CONTRACT_DESIGN.md`

Purpose:

Defined primitive/canonical/frozen DTO interface drafts for future isolated signer-boundary ingress, egress, and failure evidence.

Locked DTO drafts:

- `SignerBoundaryIngressDraft`
- `SignerBoundaryEgressDraft`
- `BoundaryFailureEvidenceDraft`

Locked effect:

- primitive-only interface principle
- no live handles
- no runtime objects
- no provider/RPC/wallet/signer handles
- no secret material
- no signed material
- no broadcast payloads
- no schema migration
- no runtime adapter authorization

---

### I-3.B — Capability Exposure Gate Design

File:

`docs/STAGE_I3B_CAPABILITY_EXPOSURE_GATE_DESIGN.md`

Purpose:

Defined hard gate conditions for any future capability exposure.

Locked effect:

Capability exposure remains blocked unless all required prior gates are green, including:

- I-2.2 SR1-SR7
- I-2.3 BV1-BV12
- I-2.4 behavioral smoke active/pass
- local Stage I full smoke pass
- local Stage H full smoke pass
- clean diff
- explicit substage approval
- rollback/fail-closed plan
- same-SHA CI success

Blocked classes:

- failed/missing/stale/bypassed evidence
- helper/factory/dynamic-load bypass
- live handle exposure
- secret/signed material exposure
- identity mutation
- decision drift
- retry/reassignment/signer re-entry/new intent exposure
- seqno/chain-state repair
- metadata/identity coupling
- redaction failure
- unreviewed capability paths

---

### I-3.C — Mock-Only Validation Planning

File:

`docs/STAGE_I3C_MOCK_ONLY_VALIDATION_PLANNING.md`

Purpose:

Defined future mock-only validation planning for gate and boundary behavior.

Locked effect:

- defined mock scenario matrix M1-M20
- defined bypass-path coverage
- defined determinism requirements
- defined redaction requirements
- defined future smoke shape
- prohibited real signer/provider/RPC/wallet/seqno/network
- prohibited real secrets
- prohibited signed material
- prohibited broadcast payloads
- prohibited tests/scripts in I-3.C itself

---

### I-3.D — Implementation Proposal Review

File:

`docs/STAGE_I3D_IMPLEMENTATION_PROPOSAL_REVIEW.md`

Purpose:

Defined review/proposal gate rules for future implementation.

Locked effect:

- broad “signer integration” scope is disallowed
- future implementation must be split into smallest safe implementation units
- future signer adapter proposal remains blocked
- implementation, tests/scripts, runtime adapter work, signer/provider/RPC/wallet/seqno/network capability, schema migration, broadcast, Testnet/Mainnet execution, and DRY_RUN=false remain unauthorized

---

## Boundary Invariants Revalidated By Closure

The following invariants remain binding after I-3 closure.

### State-before-action

No future boundary work may expose signer/runtime capability before the required state and evidence gates pass.

### RunState source of truth

RunState remains the execution source of truth.

DecisionStore remains evidence/control record and must not become mutation authority.

### Primitive-only boundary ingress

Signer-boundary ingress must remain primitive/canonical/frozen.

Forbidden:

- runtime objects
- live handles
- functions/closures
- mutable references
- provider/wallet/signer/executor handles
- RPC clients
- TonClient
- NetworkProvider
- RunState object
- DecisionStore writer object
- ExecutionContext object

### Identity immutability

Future boundary work must not mutate or recompute:

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

### Security-terminal rejection

Unsafe boundary states must resolve to:

`SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### No rejection escape

Boundary rejection must not permit:

- retry
- operator reassignment
- signer re-entry
- new intent exposure
- intent regeneration
- fallback execution
- recovery mutation
- alternate dispatch

### Seqno / chain-state confirm-or-block only

Seqno, chain state, RPC state, provider state, gas, fee, or network observation must not repair or mutate logical decision data.

Future seqno/chain-state use, if separately approved, may only confirm or block.

### Metadata / identity decoupling

Metadata state, URI changes, hash reinterpretation, display cache, exchange labels, indexer state, eligibility labels, or hidden metadata mutation must not affect signer-boundary identity.

### Redaction

Only dummy sentinel testing is allowed before separately approved implementation.

Real secrets remain forbidden in tests and evidence.

Forbidden material:

- private key
- mnemonic
- seed phrase
- secret key
- decrypted key material
- RPC token
- provider credential
- signature
- signed message
- signed BOC
- broadcast payload

---

## Closure Risk Register

### R1 — Premature implementation after design closure

Risk:

I-3 closure may be misread as permission to implement signer/runtime integration.

Control:

I-3 closure authorizes release of design package only. It does not authorize implementation.

---

### R2 — Broad signer integration scope

Risk:

A future task may attempt to implement “signer integration” as a broad unit.

Control:

I-3.D requires smallest safe implementation units and blocks broad signer integration scope.

---

### R3 — Capability exposure by helper or factory

Risk:

Signer/provider/RPC/wallet/seqno capability may be routed through helper modules, factories, adapters, dynamic loading, or generic context objects.

Control:

I-3.B treats helper/factory/dynamic-load bypass as a security failure.

---

### R4 — Smoke bypass

Risk:

Future implementation may bypass I-2.4 behavioral smoke or Stage I/H aggregators.

Control:

I-3.B requires I-2.4 smoke active/pass and Stage I/H full smoke pass before capability exposure.

---

### R5 — Decision mutation under signer pressure

Risk:

Future signer work may attempt to repair decisions using signer, seqno, provider, fee, gas, network, or metadata information.

Control:

I-3.A/I-3.B/I-3.D require identity immutability and confirm-or-block only semantics.

---

### R6 — Secret or signed-material leakage

Risk:

Future tests or error paths may leak real or dummy secret-like material.

Control:

I-3.A/I-3.C/I-3.D require dummy sentinel-only testing and redaction coverage.

---

## Release Decision

Stage I-3 is closed as a design/pre-integration package.

The package is release-ready for future planning only.

Stage I-3 does not authorize:

- implementation
- tests/scripts
- runtime adapter work
- signer integration
- signer import
- provider/RPC access
- wallet opening
- seqno reads
- network access
- signing
- signed message generation
- signed BOC generation
- broadcast
- schema migration
- Testnet execution
- Mainnet execution
- DRY_RUN=false
- capability exposure

Any future implementation must be separately scoped, reviewed, negatively tested, and gated.

---

## Required Evidence To Close I-3

I-3 Closure may close only when:

- this closure document is committed
- changes are docs-only
- local Stage I full smoke passes
- local Stage H full smoke passes
- `git diff --check` is clean
- main fast-forward validation passes
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Next-Step Recommendation

The next permitted step after I-3 closure is a separately scoped planning stage for the first smallest safe implementation unit.

Recommended next stage:

`I-3.E — First Implementation Unit Scope / Mock-Only Boundary Evaluator Planning`

This recommendation does not authorize implementation.

It only identifies the next planning candidate.
