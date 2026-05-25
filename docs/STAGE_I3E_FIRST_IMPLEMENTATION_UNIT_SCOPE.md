# Stage I-3.E — First Implementation Unit Scope / Mock-Only Boundary Evaluator Planning — Design Only

## Scope

Stage I-3.E defines the first smallest safe implementation-unit scope for future isolated signer-boundary work.

I-3.E is Design-Only / Scope-Only.

This document does not authorize implementation, tests, scripts, runtime adapter code, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.E is this scope/planning document.

---

## Baseline

I-3.E starts from the locked I-3 Closure Review / Release Decision.

Locked baseline:

- I-3 Scope / Pre-Integration Plan — `1ccef95`
- I-3.A Interface Contract Design — `c8676ea`
- I-3.B Capability Exposure Gate Design — `295970d`
- I-3.C Mock-Only Validation Planning — `03ba68f`
- I-3.D Implementation Proposal Review — `f1db5a6`
- I-3 Closure Review / Release Decision — `97ae18a`

Current baseline:

`97ae18a6e97371ce647671d771e307a310a3be8c`

Prior boundary package:

- I-2.1 — `bf5657f`
- I-2.2 — `d7c9ed4`
- I-2.3 — `5ff69a2`
- I-2.4 — `940d856`
- I-2 Closure Review — `9a7d9d7`

---

## Purpose

The purpose of I-3.E is to define the first future implementation unit without implementing it.

Recommended future unit:

`Mock-Only Boundary Evaluator`

The future evaluator, if separately approved later, may evaluate deterministic primitive fixtures and return deterministic boundary outcomes.

I-3.E only defines the scope and gates for that future unit.

I-3.E does not create the evaluator.

---

## Core Planning Principle

The first future implementation unit must be the smallest safe unit.

It must not be a signer adapter.

It must not touch live blockchain surfaces.

It must not introduce provider/RPC/wallet/seqno/network capability.

It must not sign, broadcast, or create execution-capable payloads.

It must only evaluate mock-only primitive fixtures and produce deterministic fail-closed boundary results.

---

## Future Unit Name

`I-3.F — Mock-Only Boundary Evaluator`

This name is proposed for future planning continuity only.

I-3.E does not open I-3.F.

I-3.E does not authorize implementation of I-3.F.

---

## Future Unit Objective

The future mock-only evaluator should prove that boundary rules can be evaluated behaviorally using deterministic primitive fixtures.

The evaluator should return explicit outcomes for:

- valid primitive baseline
- runtime capability exposure attempt
- live handle ingress attempt
- DTO capability smuggling
- evidence capability smuggling
- helper/factory routing bypass
- dynamic loading bypass
- missing or failed Stage I smoke evidence
- missing or failed Stage H smoke evidence
- I-2.4 behavioral smoke bypass
- SR1-SR7 weakening
- BV1-BV12 weakening
- identity mutation
- decision drift
- rejection escape
- seqno/chain-state repair attempt
- metadata/identity coupling
- redaction failure
- stale or missing same-SHA CI evidence
- non-deterministic mock context

These map to I-3.C scenarios M1-M20.

---

## Future Unit Allowed Scope

The future implementation unit may be considered for approval only if it remains limited to:

- deterministic primitive fixture input
- deterministic status output
- deterministic failure reason output
- deterministic terminal status output
- deterministic permission flags
- deterministic mock evidence fingerprint
- dummy sentinel handling
- M1-M20 mock-only scenario coverage
- self-contained validation logic with no live capability imports
- behavior proof rather than text-marker proof

Allowed future input categories:

- string identifiers
- boolean flags
- integer-safe numeric enums
- decimal-string amounts
- canonical address strings
- explicit enum/status strings
- deterministic fake fingerprints
- deterministic fake gate-evidence status
- dummy sentinel strings

Allowed future output categories:

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

---

## Future Unit Non-Scope

The future mock-only evaluator must not include:

- signer import
- signer initialization
- signer adapter
- wallet opening
- wallet handle
- provider import
- RPC import
- RPC client
- TonClient
- NetworkProvider
- seqno read
- chain-state read
- gas estimate
- fee estimate
- live network status
- private key handling
- mnemonic handling
- seed handling
- secret material
- signature generation
- signed message generation
- signed BOC generation
- broadcast payload generation
- broadcast
- schema migration
- RunState migration
- DecisionStore migration
- runtime dispatcher mutation
- execution outside the state machine
- DRY_RUN=false
- Testnet execution
- Mainnet execution

---

## Required Future Evaluator Inputs

If separately approved later, the future evaluator should accept a primitive mock fixture object only.

A fixture may include:

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

A fixture must not include:

- functions
- closures
- class instances
- Date objects
- Map
- Set
- Buffer carrying execution material
- provider handles
- wallet handles
- signer handles
- executor handles
- RPC clients
- network clients
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

## Required Future Evaluator Outputs

If separately approved later, the future evaluator should return a primitive result object only.

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

Required unsafe output:

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

The future evaluator must cover I-3.C M1-M20.

### M1 — Valid primitive DTO baseline

Expected future behavior:

- deterministic result
- no capability exposure
- no secret material
- no signed material
- no broadcast material
- no execution authorization

### M2 — Runtime capability exposure attempt

Expected future behavior:

`RUNTIME_CAPABILITY_CREEP`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M3 — Live handle ingress attempt

Expected future behavior:

`LIVE_HANDLE_EXPOSURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M4 — DTO capability smuggling

Expected future behavior:

`INTERFACE_CONTRACT_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M5 — Evidence capability smuggling

Expected future behavior:

`CAPABILITY_GATE_BYPASS_DETECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M6 — Helper/factory routing bypass

Expected future behavior:

`UNREVIEWED_CAPABILITY_PATH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M7 — Dynamic loading bypass

Expected future behavior:

`UNREVIEWED_CAPABILITY_PATH`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M8 — Stage I smoke missing or failed

Expected future behavior:

`STAGE_I_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M9 — Stage H smoke missing or failed

Expected future behavior:

`STAGE_H_SMOKE_NOT_GREEN`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M10 — I-2.4 behavioral smoke bypass

Expected future behavior:

`BOUNDARY_BEHAVIORAL_SMOKE_BYPASS`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M11 — SR1-SR7 weakening

Expected future behavior:

`SECURITY_REQUIREMENT_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M12 — BV1-BV12 weakening

Expected future behavior:

`BOUNDARY_ASSERTION_WEAKENED`
→ `CAPABILITY_GATE_BLOCKED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M13 — Identity mutation

Expected future behavior:

`CAPABILITY_GATE_IDENTITY_MUTATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M14 — Decision drift

Expected future behavior:

`CAPABILITY_GATE_DECISION_DRIFT`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M15 — Boundary rejection escape

Expected future behavior:

`CAPABILITY_GATE_REJECTION_ESCAPE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M16 — Seqno / chain-state repair attempt

Expected future behavior:

`CAPABILITY_GATE_CHAIN_STATE_REPAIR`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M17 — Metadata / identity coupling

Expected future behavior:

`CAPABILITY_GATE_METADATA_IDENTITY_COUPLING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M18 — Redaction failure

Expected future behavior:

`CAPABILITY_GATE_REDACTION_FAILURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M19 — Stale or missing same-SHA CI evidence

Expected future behavior:

`CAPABILITY_GATE_EVIDENCE_MISSING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

### M20 — Non-deterministic mock context

Expected future behavior:

`BOUNDARY_NON_DETERMINISM`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Determinism Requirements

The future evaluator must be deterministic.

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

Forbidden deterministic inputs:

- `Date.now`
- `new Date`
- `Math.random`
- system clock
- live network timing
- live fee/gas estimate
- live provider status
- filesystem mtime as decision input
- process uptime as decision input

---

## Redaction Requirements

The future evaluator may use dummy sentinels only.

The sentinel must not appear in:

- stdout
- stderr
- structured logs
- evidence object
- error message
- error cause
- stack trace
- serialized rejection object

Real secret material must remain forbidden.

---

## Review Gate Before Future Implementation

A future I-3.F implementation proposal must provide:

- exact files to be changed
- exact fixture schema
- exact result schema
- full M1-M20 scenario list
- expected failure reason for every unsafe case
- deterministic fingerprint method
- redaction strategy
- forbidden import list
- proof of no signer/provider/RPC/wallet/seqno/network imports
- proof of no runtime adapter
- proof of no schema migration
- required focused smoke plan
- required Stage I full smoke
- required Stage H full smoke
- same-SHA CI requirement

Missing evidence outcome:

`FIRST_IMPLEMENTATION_UNIT_SCOPE_INCOMPLETE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Current Stage Non-Authorization

I-3.E does not authorize:

- TypeScript runtime code
- lib changes
- script changes
- tests
- mock evaluator implementation
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

## Gate To Close I-3.E

I-3.E may close only when:

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

I-3.E may define the first implementation unit scope.

I-3.E does not authorize implementation.

I-3.E does not authorize tests or scripts.

I-3.E does not authorize runtime adapter work.

I-3.E does not authorize capability exposure.

The future first implementation unit remains blocked until separately scoped, reviewed, negatively tested, and explicitly approved.
