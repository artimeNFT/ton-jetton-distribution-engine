# STAGE_C9_LIVE_READ_OFFLINE_ORCHESTRATOR_BOUNDARY_REVIEW

## 1. Status

Stage C-9 is docs-only.

No live-read to Orchestrator integration implementation is approved here.

No live provider call is approved here.

No Orchestrator persistence is approved here.

No candidate persistence is approved here.

No cursor persistence is approved here.

No Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is in scope.

This document defines the boundary for a future handoff from live-read observations to offline ingestion/orchestrator review.

---

## 2. Read-Only Strict Boundary

Stage C-9 is a handoff contract review only.

A future integration may inspect and validate live-read observations in memory.

It must not call persistence-capable Orchestrator or store functions.

Explicitly out of scope:

- appendCandidate
- appendCandidateEvent
- write candidate files
- write candidate event files
- write JSONL
- save cursor
- persist cursor
- write orchestrator state
- write RunState
- write targets
- write audit CSV
- invoke Dispatcher
- invoke signing or broadcasting code

Any function capable of writing state is forbidden in C-9.

---

## 3. Allowed Future Handoff Shape

A future handoff may pass only in-memory observation data.

Allowed handoff fields:

- provider
- endpointPath
- observedAt
- receivedAt
- txHash
- traceId
- lt
- actionIndex
- jettonMaster
- destinationAddress
- amount
- finalityDecision
- confirmationDepthUsed
- skippedCount
- advisoryProfile if already available

The handoff must not include:

- API key values
- authorization headers
- raw environment variables
- local filesystem paths
- private operator identifiers
- execution intent
- target-generation intent
- dispatcher intent

---

## 4. Cursor Approval Boundary

A future live-read layer may propose cursor metadata.

It must not persist cursor state during C-9.

Cursor movement may be approved only after:

- provider response is parsed
- finality gate passes
- skipped entries are accounted for
- malformed entries are recorded in memory
- no kill-switch trigger is active
- no persistence path was called
- operator approval is explicit

Until approved by a later implementation stage, cursor output is console-only or in-memory only.

---

## 5. Orchestrator Review Rule

Before any future integration implementation, review every imported Orchestrator dependency.

Forbidden dependency traits:

- writes files
- appends candidates
- appends candidate events
- writes cursor state
- writes RunState
- writes audit CSV
- invokes Dispatcher
- invokes execution logic

Allowed dependency traits:

- pure type definitions
- pure validation helpers
- pure normalization helpers
- in-memory mapping only
- no side effects

If a dependency has mixed read/write behavior, it is forbidden until split or wrapped behind a read-only adapter.

---

## 6. Final Rule

Stage C-9 approves handoff boundary review only.

No live-read integration implementation is approved here.

No Orchestrator persistence is approved here.

No cursor persistence is approved here.

No candidate persistence is approved here.

No Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
