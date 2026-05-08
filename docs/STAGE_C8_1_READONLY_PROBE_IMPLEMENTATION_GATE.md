# STAGE_C8_1_READONLY_PROBE_IMPLEMENTATION_GATE

## 1. Status

Stage C-8.1 is docs-only.

No live TonAPI call is approved here.

No live adapter implementation is approved here.

No probe script implementation is approved here.

No fixture capture is approved here.

No disk write is approved here.

No Orchestrator persistence is approved here.

No candidate persistence is approved here.

No cursor persistence is approved here.

No Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is in scope.

This document defines the implementation gate for a future read-only probe script.

---

## 2. Future Probe Script Contract

A future probe script may be designed only after explicit approval.

Proposed future script path:

- scripts/stage-c8-readonly-tonapi-probe.ts

The future script must be:

- read-only
- single-run only
- Control Group only
- console-only
- manually abortable
- no persistence
- no polling loop
- no fixture capture
- no Orchestrator integration
- no Dispatcher integration
- no execution path

The script must exit non-zero on any gate failure.

---

## 3. Required Runtime Gates

A future probe script must enforce these gates before provider access:

- git clean check or explicit bypass review
- required env var exists
- Control Group is explicitly provided
- Control Group size is bounded
- endpoint config is approved
- rate-limit config is valid
- timeout config is valid
- minConfirmationDepth is set to 5 blocks
- manual pre-provider abort is cleared

A future probe script must enforce these gates after provider response:

- manual post-provider abort is cleared
- response is parsed in memory only
- finality gate is evaluated
- no disk write occurred
- no persistence path was called
- console-only summary is emitted

---

## 4. Console-Only Output Schema

A future probe script may emit only a console-visible structured summary.

Required summary fields:

- probeId
- sourceStage
- provider
- endpointPath
- controlGroupSize
- requestAttempted
- providerStatus
- eventsObserved
- skippedCount
- finalityDecision
- confirmationDepthUsed
- killSwitchState
- abortGateState

Forbidden summary fields:

- API key value
- authorization header
- raw environment variables
- local filesystem paths
- machine username
- private operator identifiers
- unredacted provider credentials

---

## 5. Implementation Constraints

A future implementation must not modify:

- TonapiClient public contract
- Dispatcher
- RunState
- targets
- Orchestrator persistence
- candidate store
- execution gate
- smart contracts

A future implementation may add only after approval:

- one probe script
- one offline smoke for the probe gates
- no CI wiring until separately reviewed

The future script must not import modules that can write candidates, cursors, RunState, targets, or audit CSV files.

Any dependency on persistence-capable modules must fail review.

---

## 6. Final Rule

Stage C-8.1 approves implementation-gate design only.

No live provider call is approved here.

No live adapter implementation is approved here.

No probe script implementation is approved here.

No disk write is approved here.

No persistence is approved here.

The next step requires explicit approval.
