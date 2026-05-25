# Stage I-3.F — Mock-Only Boundary Evaluator Implementation Gate — Design Only

## Scope

Stage I-3.F defines the implementation gate for the future Mock-Only Boundary Evaluator.

I-3.F is Design-Only / Gate-Only.

This document does not authorize implementation, tests, scripts, runtime adapter code, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.F is this gate document.

No code may be written under I-3.F until this gate is committed, merged to main, pushed, and verified by same-SHA GitHub Actions success.

---

## Baseline

I-3.F starts from locked origin/main after I-3.E.

Locked baseline:

- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`
- I-3.B Capability Exposure Gate Design — `295970d`
- I-3.C Mock-Only Validation Planning — `03ba68f`
- I-3.D Implementation Proposal Review — `f1db5a6`
- I-3 Closure Review / Release Decision — `97ae18a`
- I-3.E First Implementation Unit Scope — `42fe824`

Current baseline:

`42fe824a09d7c6f4903647fd8f88f1620c45430d`

Prior boundary package:

- I-2.1 — `bf5657f`
- I-2.2 — `d7c9ed4`
- I-2.3 — `5ff69a2`
- I-2.4 — `940d856`
- I-2 Closure Review — `9a7d9d7`

---

## Purpose

The purpose of I-3.F is to approve the exact implementation envelope for a future mock-only evaluator without implementing it.

This gate defines:

- the only future target file
- the fixture schema
- the result schema
- the forbidden imports
- the required M1-M20 scenario coverage
- the required redaction behavior
- the required determinism behavior
- the required focused smoke behavior
- the required closure evidence for any later implementation unit

I-3.F does not create the evaluator.

---

## Future Implementation Unit Name

Future unit name:

`I-3.G — Mock-Only Boundary Evaluator Smoke Construction`

This name is proposed only for sequencing.

I-3.F does not open I-3.G.

I-3.F does not authorize implementation of I-3.G.

---

## Future Target File

If separately approved later, the future implementation must use exactly one target file:

`scripts/i-3-g-mock-only-boundary-evaluator-smoke.ts`

No other file may be changed unless a later gate explicitly approves it.

Forbidden future implementation changes without separate approval:

- `lib/**`
- `src/**`
- `contracts/**`
- `wrappers/**`
- `tests/**`
- `docs/**` except stage-specific evidence if separately approved
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `.github/**`
- schema files
- RunState files
- DecisionStore files
- dispatcher runtime files
- signer-related files
- provider/RPC-related files
- wallet-related files

---

## Future File Classification

The future target file, if separately approved later, must be classified as:

- smoke-only
- self-contained
- deterministic
- mock-only
- negative-behavioral
- non-production
- non-runtime
- no live capability surface

It must not be imported by production code.

It must not export runtime functions used by production code.

It must not become a library module.

---

## Future Fixture Schema

The future mock-only evaluator may use only primitive fixture objects.

Required fixture fields:

- `fixtureId`
- `scenarioId`
- `scenarioName`
- `boundaryVersion`
- `decisionId`
- `candidateId`
- `stateKey`
- `recipientAddress`
- `amountDecimal`
- `batchId`
- `operatorId`
- `boundaryDecisionId`
- `unsignedIntentFingerprint`
- `mockGateEvidence`
- `mockViolation`
- `dummySentinel`
- `expectedFailureReason`
- `expectedTerminalStatus`

Allowed primitive value types:

- string
- boolean
- integer-safe numeric enum
- decimal-string amount
- canonical address string
- explicit enum/status string
- deterministic fake fingerprint
- deterministic fake gate status
- dummy sentinel string

Forbidden fixture value types:

- functions
- closures
- class instances
- Date objects
- Map
- Set
- Buffer carrying execution material
- BigInt in serialized fixture I/O
- provider handle
- wallet handle
- signer handle
- executor handle
- RPC client
- network client
- TonClient
- NetworkProvider
- RunState object
- DecisionStore writer object
- ExecutionContext object
- private key
- mnemonic
- seed phrase
- signature
- signed message
- signed BOC
- broadcast payload

---

## Future Result Schema

The future evaluator may return only primitive result objects.

Required result fields:

- `fixtureId`
- `scenarioId`
- `status`
- `terminalStatus`
- `failureReason`
- `evidenceFingerprint`
- `retryAllowed`
- `reassignmentAllowed`
- `signerReentryAllowed`
- `newIntentExposureAllowed`
- `redactionPassed`
- `deterministicEvaluationPassed`

Required unsafe result:

`SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

Required unsafe permissions:

- `retryAllowed=false`
- `reassignmentAllowed=false`
- `signerReentryAllowed=false`
- `newIntentExposureAllowed=false`

Forbidden result fields:

- signer handle
- provider handle
- wallet handle
- RPC client
- seqno response
- chain response
- network response
- signed message
- signed BOC
- broadcast payload
- raw secret
- stack trace containing sentinel
- mutable runtime reference
- execution callback
- dispatch callback

---

## Required Future Scenario Coverage

The future smoke must cover I-3.C M1-M20.

Required scenario groups:

- M1 — Valid primitive DTO baseline
- M2 — Runtime capability exposure attempt
- M3 — Live handle ingress attempt
- M4 — DTO capability smuggling
- M5 — Evidence capability smuggling
- M6 — Helper/factory routing bypass
- M7 — Dynamic loading bypass
- M8 — Stage I smoke missing or failed
- M9 — Stage H smoke missing or failed
- M10 — I-2.4 behavioral smoke bypass
- M11 — SR1-SR7 weakening
- M12 — BV1-BV12 weakening
- M13 — Identity mutation
- M14 — Decision drift
- M15 — Boundary rejection escape
- M16 — Seqno / chain-state repair attempt
- M17 — Metadata / identity coupling
- M18 — Redaction failure
- M19 — Stale or missing same-SHA CI evidence
- M20 — Non-deterministic mock context

Minimum required behavior:

- all unsafe scenarios resolve to `SECURITY_TERMINAL`
- all unsafe scenarios resolve to `TERMINAL_FAIL_CLOSED`
- all unsafe scenarios set `retryAllowed=false`
- all unsafe scenarios set `reassignmentAllowed=false`
- all unsafe scenarios set `signerReentryAllowed=false`
- all unsafe scenarios set `newIntentExposureAllowed=false`
- no dummy sentinel leaks into observed outputs
- repeated evaluation produces identical results

---

## Required Future Failure Reasons

The future evaluator must use explicit failure reasons.

Required failure reasons:

- `RUNTIME_CAPABILITY_CREEP`
- `LIVE_HANDLE_EXPOSURE`
- `INTERFACE_CONTRACT_VIOLATION`
- `CAPABILITY_GATE_BYPASS_DETECTED`
- `UNREVIEWED_CAPABILITY_PATH`
- `STAGE_I_SMOKE_NOT_GREEN`
- `STAGE_H_SMOKE_NOT_GREEN`
- `BOUNDARY_BEHAVIORAL_SMOKE_BYPASS`
- `SECURITY_REQUIREMENT_WEAKENED`
- `BOUNDARY_ASSERTION_WEAKENED`
- `CAPABILITY_GATE_IDENTITY_MUTATION`
- `CAPABILITY_GATE_DECISION_DRIFT`
- `CAPABILITY_GATE_REJECTION_ESCAPE`
- `CAPABILITY_GATE_CHAIN_STATE_REPAIR`
- `CAPABILITY_GATE_METADATA_IDENTITY_COUPLING`
- `CAPABILITY_GATE_REDACTION_FAILURE`
- `CAPABILITY_GATE_EVIDENCE_MISSING`
- `BOUNDARY_NON_DETERMINISM`

Any unknown or unmapped unsafe condition must resolve to:

`UNKNOWN_BOUNDARY_FAILURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Future Forbidden Imports

The future target file must not import signer/provider/RPC/wallet/seqno/network/runtime capabilities.

Forbidden import/source patterns:

- `@ton/ton`
- `TonClient`
- `NetworkProvider`
- wallet opening helpers
- mnemonic helpers
- private key helpers
- signer adapters
- provider adapters
- RPC clients
- network clients
- dispatcher runtime modules
- RunState writers
- DecisionStore writers
- production execution modules
- broadcast/send modules
- smart-contract deployment helpers
- testnet/mainnet configuration loaders
- environment secret loaders

Allowed imports, if needed and separately approved:

- Node built-ins for deterministic local behavior only
- TypeScript-only type definitions if they do not import runtime capability
- no external network-capable packages

Preferred future shape:

The future smoke should be self-contained and avoid project runtime imports.

---

## Future Forbidden Runtime Behavior

The future target file must not:

- open a wallet
- instantiate a provider
- create an RPC client
- read seqno
- read chain state
- estimate gas
- estimate fees
- access live network status
- sign
- create signed message
- create signed BOC
- broadcast
- mutate RunState
- mutate DecisionStore
- mutate schema
- call production dispatcher runtime
- call execution engine runtime
- read real secrets
- print real secrets
- load `.env` secrets
- set `DRY_RUN=false`
- trigger Testnet execution
- trigger Mainnet execution

---

## Future Determinism Requirements

The future smoke must prove deterministic evaluation.

For identical fixture input, repeated evaluation must produce identical:

- status
- terminalStatus
- failureReason
- evidenceFingerprint
- retryAllowed
- reassignmentAllowed
- signerReentryAllowed
- newIntentExposureAllowed
- redactionPassed
- deterministicEvaluationPassed

Forbidden decision inputs:

- `Date.now`
- `new Date`
- `Math.random`
- system clock
- live network timing
- live fee/gas estimate
- live provider status
- filesystem mtime
- process uptime
- unordered object traversal where order affects fingerprint
- locale-dependent formatting
- timezone-dependent formatting

---

## Future Fingerprint Requirements

The future evaluator may use deterministic mock evidence fingerprints.

Fingerprint requirements:

- deterministic
- stable across repeated runs
- derived only from canonical primitive fixture/result data
- independent of wall-clock time
- independent of file-system metadata
- independent of runtime process state
- independent of network state
- independent of signer/provider/wallet/RPC state

Fingerprint must not include:

- secret material
- dummy sentinel value
- signed material
- broadcast payload
- live handles
- stack traces
- environment variable values

---

## Future Redaction Requirements

The future smoke must use dummy sentinels only.

The dummy sentinel must not appear in:

- stdout
- stderr
- structured logs
- evidence object
- error message
- error cause
- stack trace
- serialized rejection object

Real secret material must never be used.

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

## Required Focused Future Smoke Output

The future smoke should print deterministic summary lines only.

Required summary concepts:

- total scenario count
- negative scenario count
- bypass scenario count
- redaction check count
- determinism check count
- PASS/FAIL

Forbidden output:

- fixture full dump containing sentinel
- stack traces containing sentinel
- raw secret-like material
- signed material
- broadcast payload
- provider/RPC details
- wallet details
- seqno values from live network

---

## Required Future Aggregator Decision

I-3.F does not modify aggregators.

A later implementation substage must separately decide whether and how to wire the future focused smoke into `scripts/stage-i-full-smoke.sh`.

Aggregator wiring must not occur before the focused smoke itself is reviewed, implemented, and locally validated.

If aggregator wiring is later approved, it must preserve:

- Stage I full smoke pass
- Stage H full smoke pass
- I-2.4 behavioral smoke active/pass
- no signer/provider/RPC/wallet/seqno/network capability exposure

---

## Current Stage Non-Authorization

I-3.F does not authorize:

- TypeScript runtime code
- lib changes
- script changes
- tests
- smoke implementation
- mock evaluator implementation
- aggregator wiring
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

## Gate To Close I-3.F

I-3.F may close only when:

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

I-3.F may define the implementation gate for a future mock-only boundary evaluator.

I-3.F does not authorize implementation.

I-3.F does not authorize tests or scripts.

I-3.F does not authorize aggregator wiring.

I-3.F does not authorize runtime adapter work.

I-3.F does not authorize capability exposure.

The future implementation remains blocked until separately scoped, reviewed, negatively tested, explicitly approved, implemented in the approved target file only, and validated by local smoke plus same-SHA CI.
