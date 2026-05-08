# STAGE_C8_FIRST_READONLY_TONAPI_PROBE_DESIGN

## 1. Status

Stage C-8 is design-only.

No live TonAPI probe is approved here.

No provider call is approved here.

No live adapter implementation is approved here.

No fixture capture is approved here.

No disk write is approved here.

No Orchestrator persistence is approved here.

No candidate persistence is approved here.

No cursor persistence is approved here.

No Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is in scope.

This document defines the design for a future first read-only TonAPI probe.

---

## 2. Control Group Requirement

A future first read-only probe must use an explicit Control Group.

The Control Group must contain only addresses that are known, reviewed, and approved before the probe.

Allowed Control Group sources:

- addresses controlled by the operator
- addresses previously validated in fixtures
- public reference addresses selected for deterministic validation
- test accounts with known expected history

Forbidden Control Group sources:

- random high-value accounts
- newly discovered candidates
- unreviewed external addresses
- production target addresses
- addresses selected during the probe

The Control Group must be documented before any provider call.

---

## 3. Output Protocol

A future first probe must be console-only.

Allowed output:

- console-visible structured summary
- in-memory validation result
- provider status summary
- finality gate result
- kill-switch state

Forbidden output:

- disk writes
- fixture writes
- candidate writes
- candidate event writes
- cursor writes
- Orchestrator writes
- RunState writes
- targets writes
- audit CSV writes
- structured logs containing secrets

If any persistence path is detected, the probe must abort before provider access.

---

## 4. Manual Abort Protocol

A future first probe must include manual abort gates.

Required gates:

- pre-provider manual abort
- post-provider manual abort
- post-validation manual abort

Pre-provider abort must happen after config validation and before any provider call.

Post-provider abort must happen after receiving provider data and before any persistence-capable code path.

Post-validation abort must happen after local validation summary and before any next-stage action.

Abort behavior:

- stop immediately
- do not retry automatically
- do not advance cursor
- do not write files
- do not write candidates
- do not call Orchestrator
- print a structured console-only abort result

---

## 5. API Key and Environment Boundary

A future first probe may use an API key only through the approved environment variable boundary.

Required environment variable:

- TONAPI_API_KEY

Rules:

- missing key fails closed before provider access
- key value must never be logged
- key value must never be written to disk
- key value must never be copied into fixtures
- key value must never appear in structured errors
- no API key may be read from JSON config
- no API key may be hard-coded

Environment validation must complete before the pre-provider manual abort gate.

---

## 6. C-7 Gate Inheritance

A future C-8 probe must inherit the C-7 live-read gates.

Required inherited gates:

- minConfirmationDepth: 5 blocks
- kill-switch fail-closed behavior
- rate-limit compliance
- timeout policy
- deterministic retry policy
- Infrastructure Reliability and Compliance terminology
- no-persistence enforcement
- local redaction discipline

The probe must not treat newest observed data as final unless the finality gate passes.

If finality cannot be verified, the probe must produce console-only non-final output and stop.

---

## 7. Review Gates

Before any future C-8 probe, review:

- Control Group list
- endpoint configuration
- API key environment gate
- no-persistence enforcement
- manual abort protocol
- kill-switch configuration
- finality and confirmation depth
- console-only output schema
- local redaction policy
- rollback path

Required pre-probe checks:

- TypeScript check passes
- C-4 smoke passes
- C-5 hardening smoke passes
- stage-b-full-check passes
- git state is clean
- explicit live-probe approval is present

---

## 8. Final Rule

Stage C-8 approves first read-only probe design only.

No provider call is approved here.

No live adapter implementation is approved here.

No disk write is approved here.

No persistence is approved here.

The next step requires explicit approval.
