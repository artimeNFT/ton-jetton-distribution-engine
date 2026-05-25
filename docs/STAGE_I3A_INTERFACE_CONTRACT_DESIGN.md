# Stage I-3.A — Interface Contract Design — Design Only

## Scope

Stage I-3.A defines the canonical interface contract for future isolated signer boundary integration.

I-3.A is Design-Only.

This document does not authorize implementation, signer integration, runtime adapter code, RPC/provider access, wallet opening, seqno reads, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.A is this interface contract document.

---

## Baseline

I-3.A starts from the locked I-3 Scope / Pre-Integration Plan.

Locked baseline:

- I-2.1 — `bf5657f` — Audit/Policy Baseline
- I-2.2 — `d7c9ed4` — Behavioral Signer Boundary Contract
- I-2.3 — `5ff69a2` — Boundary Validation Logic
- I-2.4 — `940d856` — Boundary Behavioral Smoke Suite
- I-2 Closure Review — `9a7d9d7`
- I-3 Scope / Pre-Integration Plan — `1ccef95`

Current baseline:

`1ccef95406ae570c66ea420ad96abd2ef32d2122`

---

## Purpose

The purpose of I-3.A is to define an execution-incapable, primitive-only DTO interface between the Dispatcher boundary and the future isolated signer boundary.

The interface must preserve:

- I-2.2 SR1-SR7
- I-2.3 BV1-BV12
- I-2.4 behavioral negative smoke coverage
- G-3 unsigned-intent primitive snapshot constraint
- state-before-action
- RunState as execution source of truth
- DecisionStore as evidence/control record, not mutation authority
- boundary rejection as `SECURITY_TERMINAL`
- no retry/reassignment/signer re-entry/new intent exposure after boundary rejection
- seqno/chain state as confirm-or-block only
- metadata/identity coupling prohibition
- dummy sentinel redaction only; no real secrets in tests

---

## Core Interface Principle

The future signer boundary may receive only canonical primitive DTO snapshots.

Allowed value classes:

- strings
- booleans
- integer-safe numeric enums where explicitly defined
- decimal-string amounts for I/O
- canonical address strings
- explicit enum/status strings
- deterministic fingerprint strings

Forbidden value classes:

- class instances
- runtime objects
- provider handles
- wallet handles
- signer handles
- executor handles
- functions
- closures
- mutable references
- Date objects
- Map
- Set
- Buffer carrying signed or execution-capable payload
- RPC client objects
- NetworkProvider objects
- TonClient objects
- RunState objects
- DecisionStore writer objects
- ExecutionContext objects

Any violation:

`INTERFACE_RUNTIME_OBJECT_REJECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Canonical DTO Definitions

These definitions are contract-level DTO shapes only.

They are not TypeScript implementation.

They do not authorize schema migration.

They do not authorize runtime adapter code.

---

## DTO-1 — SignerBoundaryIngressDraft

Purpose:

Defines the primitive-only input snapshot that a future signer boundary may be allowed to inspect after a separate implementation gate.

Allowed fields:

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
- `boundaryStatus`
- `intentKind`
- `assetId`
- `chainId`
- `createdByStage`
- `evidenceFingerprint`

Field constraints:

- every field must be primitive
- every string field must be canonicalized before boundary ingress
- `amount` must be a decimal string for I/O
- address values must be canonical address strings
- status fields must be explicit enum strings
- fingerprints must be deterministic strings
- no field may be computed from live provider/RPC/wallet/signer state
- no field may carry execution-capable payload material

Forbidden fields:

- `privateKey`
- `mnemonic`
- `seed`
- `seedPhrase`
- `secretKey`
- `decryptedKeyMaterial`
- `signature`
- `rawSignature`
- `signedMessage`
- `signedBoc`
- `signedBOC`
- `bocToBroadcast`
- `rpcEndpoint`
- `providerUrl`
- `providerCredentials`
- `rpcToken`
- `providerHandle`
- `walletHandle`
- `signerHandle`
- `executorHandle`
- `walletSession`
- `broadcastPayload`
- `seqnoLiveResult`
- `chainStateLiveResult`
- `gasEstimateLiveResult`
- `feeEstimateLiveResult`
- `metadataLiveResult`
- `runtimeContext`
- `executionContext`
- `runStateObject`
- `decisionStoreWriter`

Violation:

`FORBIDDEN_INGRESS_FIELD`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## DTO-2 — SignerBoundaryEgressDraft

Purpose:

Defines the primitive-only output categories that a future isolated signer boundary may produce.

Allowed fields:

- `boundaryDecisionId`
- `boundaryVersion`
- `boundaryStatus`
- `rejectionReason`
- `terminalStatus`
- `evidenceFingerprint`
- `redactionStatus`
- `capabilityGateStatus`
- `observedCompatibilityStatus`

Allowed statuses:

- `APPROVED_FOR_FUTURE_SIGNER_GATE`
- `BLOCKED_FAIL_CLOSED`
- `SECURITY_TERMINAL`
- `TERMINAL_FAIL_CLOSED`

Field constraints:

- egress must not mutate identity
- egress must not request retry
- egress must not request operator reassignment
- egress must not expose new intent
- egress must not request signer re-entry
- egress must not expose execution material
- egress must not expose signature material
- egress must not expose broadcast material
- egress must remain deterministic for the same canonical ingress

Forbidden fields:

- `mutatedDecisionId`
- `mutatedCandidateId`
- `mutatedStateKey`
- `mutatedRecipientAddress`
- `mutatedAmount`
- `mutatedBatchId`
- `mutatedOperator`
- `replacementUnsignedIntent`
- `retryRequest`
- `operatorReassignmentRequest`
- `signerReentryRequest`
- `newIntentExposure`
- `intentRegenerationRequest`
- `fallbackExecutionRequest`
- `signature`
- `rawSignature`
- `signedMessage`
- `signedBoc`
- `signedBOC`
- `broadcastPayload`
- `providerResultAsDecisionRepair`
- `seqnoResultAsDecisionRepair`

Violation:

`FORBIDDEN_EGRESS_FIELD`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## DTO-3 — BoundaryFailureEvidenceDraft

Purpose:

Defines primitive-only evidence for boundary rejection.

Allowed fields:

- `boundaryDecisionId`
- `failureReason`
- `terminalStatus`
- `securityStatus`
- `redactionStatus`
- `evidenceFingerprint`
- `sourceStage`
- `validatedAtStage`

Allowed failure reasons:

- `RUNTIME_CAPABILITY_CREEP`
- `NON_PRIMITIVE_BOUNDARY_INGRESS`
- `IDENTITY_MUTATION_DETECTED`
- `DECISION_DRIFT_DETECTED`
- `BOUNDARY_DECISION_DERIVATION_DRIFT`
- `BOUNDARY_STATE_TRANSITION_VIOLATION`
- `BOUNDARY_REJECTION_SECURITY_TERMINAL`
- `CHAIN_STATE_BOUNDARY_MISMATCH`
- `BOUNDARY_REDACTION_FAILURE`
- `METADATA_IDENTITY_COUPLING`
- `BOUNDARY_EVIDENCE_MISMATCH`
- `BOUNDARY_NON_DETERMINISM`
- `FORBIDDEN_INGRESS_FIELD`
- `FORBIDDEN_EGRESS_FIELD`
- `INTERFACE_RUNTIME_OBJECT_REJECTED`

Forbidden evidence content:

- private key
- mnemonic
- seed material
- RPC token
- provider credential
- raw signature
- signed message
- signed BOC
- decrypted key material
- wallet/session handle
- provider handle
- signer handle
- broadcast payload
- live chain response body
- stack trace containing secret-like material

Violation:

`BOUNDARY_FAILURE_EVIDENCE_LEAK`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Canonicalization Rules

All future interface DTO values must be canonicalized before boundary ingress.

Required canonicalization:

- trim string fields
- reject empty identity fields
- lowercase only where already required by existing identity policy
- preserve canonical address representation
- preserve decimal-string amount representation
- reject floating-point amount representation
- reject scientific notation amount representation
- reject BigInt serialization as non-string in I/O
- reject object-based amount representation
- reject non-deterministic timestamps as identity inputs
- reject provider/RPC/signer/wallet-derived values as identity inputs

Important:

Canonicalization must not repair or reinterpret a decision.

If canonicalization discovers a mismatch, the result is fail-closed.

Mismatch outcome:

`INTERFACE_CANONICALIZATION_MISMATCH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Identity Immutability Rules

Immutable identity fields:

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

Future interface logic must not mutate these fields.

Future signer interaction must not recompute these fields.

Any mismatch across ingress, egress, RunState, DecisionStore evidence, or boundary evidence must fail closed.

Mismatch outcome:

`INTERFACE_IDENTITY_MISMATCH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Capability Exposure Prohibition

I-3.A does not expose signer capability.

I-3.A does not define a runtime API.

I-3.A does not permit dependency injection.

I-3.A does not permit dynamic loading.

I-3.A does not permit helper/factory routing to signer/provider/RPC/wallet/seqno capability.

Forbidden capability categories:

- signer capability
- provider capability
- RPC capability
- wallet capability
- seqno capability
- network capability
- broadcast capability
- private-key capability
- mnemonic capability
- signing capability
- signed-message capability

Violation:

`I3A_CAPABILITY_EXPOSURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Seqno / Chain State Interface Rule

I-3.A does not permit seqno reads.

I-3.A does not permit chain-state reads.

Future seqno/chain-state information, if separately approved in a later stage, may only confirm or block progression.

It must not:

- repair a decision
- mutate identity
- regenerate an intent
- select a new operator
- change amount
- change recipient
- make invalid boundary state valid
- trigger retry
- trigger fallback execution
- trigger signer re-entry
- expose a new intent

Mismatch outcome:

`INTERFACE_CHAIN_STATE_MISMATCH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Metadata / Identity Coupling Rule

Signer interface fields must not be derived from metadata mutation, display metadata, exchange labels, indexer state, or eligibility reinterpretation.

Forbidden coupling sources:

- metadata URI mutation
- metadata hash reinterpretation
- display cache
- indexer result
- exchange label
- eligibility label
- hidden metadata mutation
- just-in-time metadata switching
- post-approval metadata reinterpretation

Violation:

`INTERFACE_METADATA_IDENTITY_COUPLING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Redaction Rule

I-3.A permits dummy sentinel discussion only.

It does not permit real secret material.

Future tests must not use:

- real mnemonic
- real private key
- real seed phrase
- real RPC token
- real provider credential
- real signature
- real signed BOC

Future failure paths must not leak dummy sentinels through:

- stdout
- stderr
- logs
- structured evidence
- error message
- error cause
- stack trace
- serialized rejection object

Leak outcome:

`INTERFACE_REDACTION_FAILURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Required Future Negative Tests

I-3.A does not add tests.

Before any future capability exposure, new or existing Stage I smoke must prove rejection of:

- forbidden ingress fields
- forbidden egress fields
- runtime object ingress
- live handle ingress
- identity mutation
- decision drift
- forbidden seqno/chain-state repair
- metadata/identity coupling
- dummy sentinel leak
- retry after boundary rejection
- reassignment after boundary rejection
- signer re-entry after boundary rejection
- new intent exposure after boundary rejection
- non-deterministic DTO values

---

## Forbidden Changes In I-3.A

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

---

## Gate To Close I-3.A

I-3.A may close only when:

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

I-3.A may define the interface contract.

I-3.A does not authorize implementation.

I-3.A does not authorize capability exposure.

Any future implementation must be separately scoped, reviewed, and gated.
