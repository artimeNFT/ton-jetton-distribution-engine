# STAGE_C7_LIVE_READ_GATE_REVIEW

## 1. Status

Stage C-7 is design/review only.

No live TonAPI call is approved here.

No live adapter implementation is approved here.

No polling loop is approved here.

No fixture capture is approved here.

No Orchestrator persistence is approved here.

No candidate persistence is approved here.

No cursor persistence is approved here.

No Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is in scope.

This document defines the gate requirements that must be satisfied before any future read-only live probe.

---

## 2. Finality and Confirmation Depth Gate

Future read-only live probes must not treat the newest observed block as final by default.

Default safety depth:

- minConfirmationDepth: 5 blocks

This value is the C-7 default gate value.

Any change to this value requires explicit review.

The future live-read process must record:

- observedLt
- observedTimestamp
- providerFinalitySignal
- confirmationDepthUsed
- finalityDecision
- reason if an event is held back

If confirmation depth cannot be verified, the read must fail closed or mark the observation as not final.

No Candidate may be persisted from an observation that fails this gate.

---

## 3. Operational Kill-Switch Protocol

A future live-read probe must have an operational kill-switch before any provider call is allowed.

Kill-switch triggers:

- missing required environment variable
- invalid endpoint configuration
- rate-limit policy disabled or invalid
- repeated provider 429 responses
- repeated provider 5xx responses
- malformed response rate above threshold
- redaction failure
- fixture write attempt during C-7
- unexpected persistence attempt
- operator manual stop

Required behavior:

- stop new provider reads
- do not advance cursor
- do not write candidates
- do not write orchestrator state
- emit a structured local failure result
- require explicit operator review before resume

The kill-switch must fail closed.

---

## 4. Infrastructure Reliability and Compliance

All network and provider-access planning must use Infrastructure Reliability and Compliance terminology only.

Approved concerns:

- stable egress configuration
- provider terms compliance
- quota compliance
- rate-limit compliance
- API key isolation
- secret rotation readiness
- request timeout control
- deterministic retry behavior
- structured local error reporting

Forbidden concerns:

- traffic camouflage
- human-like behavior simulation
- organic behavior simulation
- synthetic noise traffic
- hidden routing
- provider evasion language

Any future network configuration must be reviewed as reliability, security, and compliance infrastructure only.

---

## 5. No-Persistence Probe Boundary

Stage C-7 permits review of a future read-only probe gate only.

A future C-8 probe may read provider data only after explicit approval.

During C-7 and any first gated probe, the system must not:

- write candidates
- write candidate events
- write orchestrator state
- write cursor state
- write RunState
- write targets
- invoke Dispatcher
- invoke execution code
- invoke signing or broadcasting code

Allowed future probe outputs:

- console-visible structured result
- in-memory normalized response
- local non-persistent validation summary

Any persistence path requires a separate review after C-7.

---

## 6. Review Gates

Before any future live read probe, review:

- environment variable gate
- endpoint gate
- API key isolation
- rate-limit configuration
- retry policy
- timeout policy
- confirmation depth
- provider finality signal
- kill-switch triggers
- local logging policy
- redaction policy
- no-persistence enforcement

Required pre-probe checks:

- TypeScript check passes
- C-4 smoke passes
- C-5 hardening smoke passes
- stage-b-full-check passes
- git state is clean
- live-read approval is explicit

---

## 7. Final Rule

Stage C-7 approves live-read gate design only.

No live provider call is approved here.

No live adapter implementation is approved here.

No persistence is approved here.

The next step requires explicit approval.
