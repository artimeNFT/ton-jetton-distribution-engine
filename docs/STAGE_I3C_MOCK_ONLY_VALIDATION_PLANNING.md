# Stage I-3.C — Mock-Only Validation Planning — Design Only

## Scope

Stage I-3.C defines the planning contract for future mock-only validation of the isolated signer boundary and capability exposure gate.

I-3.C is Design-Only.

This document does not authorize implementation, tests, scripts, runtime adapter code, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.C is this mock-only validation planning document.

---

## Baseline

I-3.C starts from the locked I-3.B Capability Exposure Gate Design.

Locked baseline:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Boundary Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`
- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`
- I-3.B Capability Exposure Gate Design — `295970d`

Current baseline:

`295970d823676b76a4ec2d0edd75c64b438a7cf0`

---

## Purpose

The purpose of I-3.C is to define how future mock-only validation should prove that the I-3 capability gate and signer boundary reject unsafe integration paths.

The future validation must prove behavior without using real capabilities.

Mock-only means:

- no real signer
- no real wallet
- no real provider
- no real RPC
- no real seqno
- no real chain state
- no network access
- no real secrets
- no signed messages
- no signed BOC
- no broadcast payloads

---

## Planning Principle

Future validation must prove negative behavior.

The test objective is not to prove that a happy path can proceed.

The test objective is to prove that unsafe paths are blocked deterministically.

Every unsafe scenario must resolve to:

`SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

And must preserve:

- `retryAllowed=false`
- `reassignmentAllowed=false`
- `signerReentryAllowed=false`
- `newIntentExposureAllowed=false`

---

## Required Preservation From Prior Stages

Future mock-only validation must preserve:

- I-2.2 SR1-SR7
- I-2.3 BV1-BV12
- I-2.4 behavioral negative coverage
- I-3.A primitive/canonical/frozen DTO interface contract
- I-3.B capability exposure gate
- state-before-action
- RunState as execution source of truth
- DecisionStore as evidence/control record, not mutation authority
- boundary rejection as `SECURITY_TERMINAL`
- no retry/reassignment/signer re-entry/new intent exposure after boundary rejection
- seqno/chain state as confirm-or-block only
- metadata/identity coupling prohibition
- dummy sentinel redaction only
- same-SHA CI evidence requirement before closure

---

## Mock-Only Fixture Rules

Future mock fixtures may represent invalid shapes, but they must not include real capabilities.

Allowed mock fixture categories:

- primitive DTO snapshots
- mock enum/status strings
- dummy sentinel strings
- deterministic fake fingerprints
- deterministic fake identity values
- deterministic fake failure reasons
- deterministic fake gate statuses
- inert labels describing attempted bypass type

Forbidden mock fixture categories:

- real private keys
- real mnemonics
- real seed material
- real RPC tokens
- real provider credentials
- real signatures
- real signed messages
- real signed BOC
- real broadcast payloads
- real wallet handles
- real provider handles
- real signer handles
- real RPC clients
- real TonClient instances
- real NetworkProvider instances
- real network responses
- real seqno reads
- real chain-state reads
- real Date.now/new Date decision inputs
- randomness affecting expected result

---

## Mock Scenario Matrix

Future validation should include at least the following mock-only scenario groups.

### M1 — Valid primitive DTO baseline

Purpose:

Prove the baseline primitive DTO shape can be evaluated deterministically without capability exposure.

Expected behavior:

- validation result is deterministic
- no signer/provider/RPC/wallet/seqno capability is exposed
- no secret material appears
- no signed material appears
- no broadcast material appears

This scenario must not authorize execution.

---

### M2 — Runtime capability exposure attempt

Mock input:

A primitive label indicating attempted signer/provider/RPC/wallet/seqno capability exposure.

Expected behavior:

`RUNTIME_CAPABILITY_CREEP`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

Must block:

- retry
- reassignment
- signer re-entry
- new intent exposure

---

### M3 — Live handle ingress attempt

Mock input:

A forbidden field label representing a live handle, such as:

- provider handle
- wallet handle
- signer handle
- executor handle
- RPC client
- TonClient
- NetworkProvider

Expected behavior:

`LIVE_HANDLE_EXPOSURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M4 — DTO capability smuggling

Mock input:

A DTO-like shape attempts to carry capability-related fields.

Forbidden field examples:

- `providerHandle`
- `walletHandle`
- `signerHandle`
- `executorHandle`
- `runtimeContext`
- `executionContext`
- `runStateObject`
- `decisionStoreWriter`

Expected behavior:

`INTERFACE_CONTRACT_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M5 — Evidence capability smuggling

Mock input:

A failure/evidence object attempts to carry capability or execution material.

Forbidden evidence examples:

- provider handle
- signer handle
- wallet session
- broadcast payload
- signed BOC
- live chain response body
- stack trace containing secret-like material

Expected behavior:

`CAPABILITY_GATE_BYPASS_DETECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M6 — Helper/factory routing bypass

Mock input:

A primitive label indicating that capability is routed through helper/factory indirection.

Bypass examples:

- helper module exposure
- factory-created signer
- generic adapter wrapper
- dependency injection container
- dynamic loader

Expected behavior:

`UNREVIEWED_CAPABILITY_PATH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M7 — Dynamic loading bypass

Mock input:

A primitive label indicating dynamic import/load of signer/provider/RPC/wallet/seqno capability.

Expected behavior:

`UNREVIEWED_CAPABILITY_PATH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M8 — Stage I smoke missing or failed

Mock input:

Gate evidence says Stage I smoke is missing, failed, stale, or unverifiable.

Expected behavior:

`STAGE_I_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M9 — Stage H smoke missing or failed

Mock input:

Gate evidence says Stage H smoke is missing, failed, stale, or unverifiable.

Expected behavior:

`STAGE_H_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M10 — I-2.4 behavioral smoke bypass

Mock input:

Gate evidence says I-2.4 behavioral smoke is missing, bypassed, weakened, or no longer proves:

- `negativeCases=12`
- `boundaryRejectionEscapeCases=7`

Expected behavior:

`BOUNDARY_BEHAVIORAL_SMOKE_BYPASS`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M11 — SR1-SR7 weakening

Mock input:

A primitive label indicating that at least one I-2.2 security requirement was removed, weakened, bypassed, or made optional.

Expected behavior:

`SECURITY_REQUIREMENT_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M12 — BV1-BV12 weakening

Mock input:

A primitive label indicating that at least one I-2.3 assertion was removed, weakened, bypassed, or made optional.

Expected behavior:

`BOUNDARY_ASSERTION_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M13 — Identity mutation

Mock input:

A primitive DTO where identity fields diverge from expected values.

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

Expected behavior:

`CAPABILITY_GATE_IDENTITY_MUTATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M14 — Decision drift

Mock input:

A primitive label indicating signer/provider/RPC/wallet/seqno/network/gas/fee/metadata context affected decision semantics.

Expected behavior:

`CAPABILITY_GATE_DECISION_DRIFT`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M15 — Boundary rejection escape

Mock input:

Boundary rejection attempts to trigger any of:

- retry
- operator reassignment
- signer re-entry
- new intent exposure
- intent regeneration
- fallback execution
- recovery mutation
- alternate dispatch

Expected behavior:

`CAPABILITY_GATE_REJECTION_ESCAPE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M16 — Seqno / chain-state repair attempt

Mock input:

Seqno, chain state, RPC state, or network observation is used to repair, mutate, regenerate, or reinterpret a logical decision.

Expected behavior:

`CAPABILITY_GATE_CHAIN_STATE_REPAIR`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M17 — Metadata / identity coupling

Mock input:

Metadata URI, metadata hash, display metadata, exchange label, indexer state, eligibility label, or hidden metadata mutation affects signer-boundary identity.

Expected behavior:

`CAPABILITY_GATE_METADATA_IDENTITY_COUPLING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M18 — Redaction failure

Mock input:

A dummy sentinel appears in a failure surface.

Failure surfaces:

- stdout
- stderr
- logs
- structured evidence
- error message
- error cause
- stack trace
- serialized rejection object

Expected behavior:

`CAPABILITY_GATE_REDACTION_FAILURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

Real secrets are forbidden.

---

### M19 — Stale or missing same-SHA CI evidence

Mock input:

Gate evidence references missing, stale, mismatched, or unverifiable GitHub Actions evidence.

Expected behavior:

`CAPABILITY_GATE_EVIDENCE_MISSING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

### M20 — Non-deterministic mock context

Mock input:

Any non-deterministic field affects identity, evidence, gate result, or expected failure reason.

Forbidden non-deterministic sources:

- Date.now
- new Date
- Math.random
- system clock
- live network timing
- live fee/gas estimate
- live provider status

Expected behavior:

`BOUNDARY_NON_DETERMINISM`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Determinism Requirements

Future mock-only validation must be deterministic.

For the same fixture input, repeated evaluation must produce the same:

- status
- terminal status
- failure reason
- evidence fingerprint
- retry permission
- reassignment permission
- signer re-entry permission
- new intent exposure permission

Required stable permissions:

- `retryAllowed=false`
- `reassignmentAllowed=false`
- `signerReentryAllowed=false`
- `newIntentExposureAllowed=false`

---

## Redaction Requirements

Future mock-only validation may use dummy sentinels only.

Required rejection surfaces must not contain the sentinel:

- stdout
- stderr
- logs
- structured evidence
- error message
- error cause
- stack trace
- serialized rejection object

Real secret material must never appear in test fixtures.

Forbidden real material:

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

## Bypass Coverage Requirement

Future validation must treat bypass attempts as security failures, not ordinary validation failures.

Bypass paths to cover:

- direct capability exposure
- helper module routing
- factory routing
- adapter wrapper routing
- dependency injection container routing
- dynamic loading
- generic context object injection
- DTO field smuggling
- evidence field smuggling
- hidden import path
- smoke bypass
- stale CI evidence

Bypass outcome:

`CAPABILITY_GATE_BYPASS_DETECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Required Future Smoke Shape

I-3.C does not create a smoke script.

If a future substage creates mock-only smoke, it should be self-contained and must not import runtime signer/provider/RPC/wallet/seqno modules.

Future smoke should:

- use deterministic fixture objects only
- include a valid primitive baseline
- include negative scenarios M2-M20
- verify deterministic repeated evaluation
- verify failure reason specificity
- verify `SECURITY_TERMINAL`
- verify `TERMINAL_FAIL_CLOSED`
- verify no retry/reassignment/signer re-entry/new intent exposure
- verify dummy sentinel redaction
- avoid regex-only/source-marker validation as the primary proof

Future smoke must not:

- open a wallet
- instantiate a provider
- create an RPC client
- read seqno
- read chain state
- sign
- create signed BOC
- broadcast
- use real secrets
- use live network
- mutate schema
- mutate RunState
- mutate DecisionStore

---

## Forbidden Changes In I-3.C

- no TypeScript runtime code
- no lib changes
- no script changes
- no tests
- no schema migration
- no DecisionStore migration
- no RunState migration
- no signer import
- no provider import
- no RPC import
- no wallet import
- no seqno read
- no TonClient
- no NetworkProvider
- no wallet opening
- no private key handling
- no mnemonic handling
- no seed handling
- no signing
- no signed message generation
- no signed BOC generation
- no broadcast
- no DRY_RUN=false
- no Testnet execution
- no Mainnet execution
- no network access

---

## Gate To Close I-3.C

I-3.C may close only when:

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

I-3.C may define mock-only validation planning.

I-3.C does not authorize implementation.

I-3.C does not authorize tests or scripts.

I-3.C does not authorize capability exposure.

Any future mock implementation must be separately scoped, reviewed, negatively tested, and gated.
