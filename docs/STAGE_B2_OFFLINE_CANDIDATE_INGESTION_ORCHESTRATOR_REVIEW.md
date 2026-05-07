# STAGE_B2_OFFLINE_CANDIDATE_INGESTION_ORCHESTRATOR_REVIEW

## 1. Status

- Design/review only.
- No implementation.
- No type changes.
- No tests.
- No CI changes.
- No TonAPI live client.
- No WebSocket.
- No polling loop.
- No Dispatcher.
- No RunState.
- No targets.
- No signing, sending, broadcasting, or execution.

This document defines the required boundary for a future offline candidate ingestion orchestrator.

It does not approve live ingestion.

---

## 2. Purpose

Stage B-2 currently has verified primitives:

- offline extraction into RawProviderEvent[]
- filterAndNormalize
- buildCandidateRecord
- appendCandidate
- appendCandidateEvent
- loadDedupStore
- Commander safety-state reader
- deterministic rate-cap primitive

The missing component is an offline orchestrator boundary that composes these primitives without live provider access or execution coupling.

The future orchestrator may connect already-loaded events to candidate persistence.

It must remain an observation-plane component only.

---

## 3. Approved Offline Pipeline Shape

The future offline orchestrator may perform this sequence:

RawProviderEvent[]
→ filterAndNormalize
→ buildCandidateRecord
→ safety-state check
→ dedup check
→ rate-cap check
→ appendCandidate / appendCandidateEvent
→ cursor save

Each step must be explicit.

No step may infer execution intent.

No step may promote a candidate to targets.

No step may call Dispatcher.

No step may read or write RunState.

No step may perform network access.

---

## 4. Input Boundary

Allowed inputs:

- already-loaded RawProviderEvent[]
- configured Jetton Master canonical key
- campaign id
- watcher data directory
- deterministic clock provider where timestamps are required
- Commander safety-state reader
- dedup TTL configuration
- deterministic rate-cap configuration
- optional existing watcher cursor

Forbidden inputs:

- live TonAPI client
- API key or provider secret
- WebSocket object
- polling interval connected to a live source
- signer
- wallet mnemonic
- Dispatcher config
- RunState path
- targets path
- metadata mutation config

---

## 5. Candidate Write Rules

A passing normalized event may produce one pending CandidateRecord.

Before writing the candidate, the orchestrator must check:

1. Commander safety state allows candidate writes.
2. Candidate id has not already been seen by the dedup store.
3. Rate cap allows the write.
4. Candidate record was built by buildCandidateRecord.
5. Candidate identity comes only from candidateId.ts.

If Commander state is passive or unavailable, the orchestrator must fail closed and avoid candidate writes.

If candidate id is already seen, the orchestrator must not append a duplicate candidate. It may append a duplicate_observation candidate event.

If rate cap rejects the write, the orchestrator must append rate_cap_data_loss before dropping the candidate. A silent drop is forbidden.

---

## 6. Rejection and Event Rules

Rejected provider events must not become candidates.

Allowed candidate events include only existing CandidateEventType values:

- trace_invalidated
- gap_detected
- replay_started
- replay_completed
- buffer_overflow_data_loss
- rate_cap_data_loss
- duplicate_observation

A rejected event must not trigger:

- retry
- funding
- metadata mutation
- candidate approval
- target generation
- Dispatcher execution

---

## 7. Advisory Profile Boundary

The orchestrator must not inspect advisory profile fields for control flow.

Advisory profile metadata may only pass through this path:

RawProviderEvent.advisoryProfile
→ NormalizedEvent.advisoryProfile
→ CandidateRecord.profile

The orchestrator must not use advisory profile to:

- accept or reject events
- modify candidate identity
- modify candidate key components
- approve candidates
- reject candidates
- prioritize candidates
- generate targets
- trigger execution

CandidateRecord.decision must remain "pending".

CandidateRecord.profileStatus must not become "resolved" in this stage.

---

## 8. Determinism Requirements

The orchestrator must be deterministic for the same inputs.

Forbidden inside the orchestrator core:

- Date.now
- new Date without an injected clock boundary
- randomness
- network calls
- filesystem reads outside approved watcher artifacts
- filesystem writes outside candidate, candidate-event, and cursor paths
- environment-variable reads
- hidden global state

Allowed persistence paths are limited to the future candidate ingestion write path:

- candidates JSONL
- candidate-events JSONL
- watcher cursor JSON

---

## 9. Explicit Non-Goals

This review does not approve:

- live TonAPI client
- WebSocket ingestion
- API polling
- provider retry logic
- Dispatcher integration
- RunState integration
- target generation
- approval workflow
- decision layer writes
- signing
- sending
- broadcasting
- testnet execution
- mainnet execution

---

## 10. Future Implementation Gates

Future implementation must be split into separate commits:

1. Offline orchestrator type/signature boundary.
2. Offline orchestrator implementation using already-loaded events only.
3. Smoke coverage for pass, reject, duplicate, rate-cap, and passive Commander cases.
4. Full-check confirmation.

Any live provider access requires a separate docs-only review before implementation.

Any candidate-to-target promotion requires a separate Stage D review.

---

## 11. Final Rule

The future offline orchestrator may connect existing watcher primitives.

It must not expand the system boundary from observation to execution.

If a design choice is ambiguous, the safer interpretation wins:

observe, normalize, record, audit

not approve, promote, dispatch, execute
