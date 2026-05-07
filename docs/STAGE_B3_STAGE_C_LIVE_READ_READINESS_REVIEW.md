# STAGE_B3_STAGE_C_LIVE_READ_READINESS_REVIEW

## 1. Status

- Design/review only.
- No implementation.
- No TonAPI client.
- No API key usage.
- No WebSocket.
- No polling loop.
- No live ingestion.
- No Dispatcher.
- No RunState.
- No targets.
- No signing, sending, broadcasting, or execution.

This document defines the readiness boundary for future Stage C live read.

It does not approve implementation.

---

## 2. Purpose

Stage B-2 closed with an offline watcher pipeline:

- TonAPI-shaped fixture extraction
- event filtering and normalization
- CandidateRecord building
- append-only candidate persistence
- dedup safety
- cursor persistence
- Commander write gate
- offline orchestrator
- smoke coverage in full-check

Stage B-3 prepares the live-read boundary before any live provider client exists.

The goal is provider-safe, auditable, read-only ingestion.

---

## 3. Live Read Boundary

Future Stage C may introduce a read-only provider client.

The client may only fetch observations.

Allowed future outputs:

- already-loaded RawProviderEvent[]
- provider cursor metadata
- provider health status
- structured read-only logs

Forbidden outputs:

- CandidateRecord direct writes
- targets files
- decisions files
- RunState writes
- Dispatcher commands
- metadata mutation requests
- transaction objects for signing
- signed payloads
- broadcast calls

The client must not decide whether a candidate is accepted, rejected, or promoted.

The client must feed the existing offline orchestrator boundary.

---

## 4. Interface to Existing Orchestrator

The future live-read client must stop at RawProviderEvent[].

The existing boundary remains:

RawProviderEvent[]
→ filterAndNormalize
→ buildCandidateRecord
→ Commander safety check
→ dedup check
→ rate-cap check
→ appendCandidate / appendCandidateEvent
→ cursor save

The live-read client must not call appendCandidate directly.

The live-read client must not construct CandidateRecord directly.

The live-read client must not inspect advisoryProfile for control flow.

All candidate persistence remains owned by the offline orchestrator boundary.

---

## 5. Provider Safety Requirements

Future live read must be bounded and transparent.

Required controls:

- explicit provider selection
- explicit endpoint or stream name
- configured request or stream rate limit
- configured reconnect backoff
- configured idle timeout
- cursor-based resume
- structured provider health logs
- fail-closed behavior on malformed provider data

Forbidden behavior:

- unbounded polling
- randomized traffic patterns
- synthetic noise traffic
- hidden routing
- provider calls from candidate decision logic
- provider calls from Dispatcher logic
- provider calls from target generation logic

Provider rate limits must protect reliability and auditability.

---

## 6. Cursor and Replay Requirements

The future live-read client must support restart-safe ingestion.

Required behavior:

- load last approved cursor before reading
- request replay from cursor when provider supports it
- never advance cursor past an event that was not handed to the orchestrator
- preserve provider event id when available
- preserve lt when available
- report cursor gaps as explicit findings
- rely on dedup to suppress replayed candidates

Cursor is the resume point.

Dedup is the duplicate-safety backstop.

If replay is not guaranteed by the provider, the client must document the data-loss risk before implementation approval.

---

## 7. Advisory Metadata Boundary

Provider profiling metadata is advisory only.

Allowed path:

provider profiling metadata
→ RawProviderEvent.advisoryProfile
→ NormalizedEvent.advisoryProfile
→ CandidateRecord.profile

Forbidden uses:

- filtering decisions
- candidate identity
- candidate key components
- candidate approval
- candidate rejection
- target generation
- Dispatcher behavior
- execution behavior

If advisory metadata is missing, ingestion must still work with unresolved profile data.

If advisory metadata is present, it must remain auditable and must not become a control signal.

---

## 8. Implementation Gates

Before any live-read implementation, a separate review must approve:

1. Provider choice.
2. Endpoint or stream type.
3. Authentication model.
4. Rate-limit policy.
5. Cursor and replay behavior.
6. Failure taxonomy.
7. Fixture capture/redaction process.
8. Smoke test plan.
9. Full-check integration plan.

Implementation must be split into separate commits:

1. Provider client type boundary.
2. Provider client implementation.
3. Offline fixture coverage.
4. Live-read gated smoke, if explicitly approved.
5. Full-check wiring.

No implementation may include Dispatcher, RunState, targets, signing, sending, broadcasting, or execution.

---

## 9. Final Rule

Stage C live read is allowed to observe only.

It must not mutate execution state.

It must not create execution intent.

It must not promote candidates.

It must not optimize behavior for concealment.

The only approved future integration path is:

provider read
→ RawProviderEvent[]
→ existing offline orchestrator
→ pending candidates

Any expansion beyond this requires a separate review.
