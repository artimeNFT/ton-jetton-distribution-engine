# STAGE_C1_TONAPI_REST_LIVE_READ_CLIENT_REVIEW

## 1. Status

- Design/review only.
- No implementation.
- No TonAPI client code.
- No API calls.
- No API key usage.
- No polling loop.
- No WebSocket.
- No live ingestion.
- No Dispatcher.
- No RunState.
- No targets.
- No signing, sending, broadcasting, or execution.

This document defines the approved boundary for a future TonAPI REST live-read client.

It does not approve implementation.

---

## 2. Purpose

Stage C-1 prepares the REST live-read boundary for TonAPI.

The future client may observe TonAPI REST responses and convert them into provider-neutral observations.

The future client must stop at RawProviderEvent[].

Candidate persistence remains owned by the existing offline orchestrator.

---

## 3. Approved Client Boundary

The future TonAPI REST client may:

- issue bounded read-only REST requests
- receive raw TonAPI responses
- expose raw responses for fixture capture
- convert approved response shapes into RawProviderEvent[]
- return provider cursor metadata
- return provider health metadata

The future TonAPI REST client must not:

- write candidates
- write candidate events
- save cursor files
- construct CandidateRecord
- call Dispatcher
- read or write RunState
- read or write targets
- sign, send, or broadcast transactions

---

## 4. Authentication Boundary

API credentials may be loaded only from environment variables.

The future client config may name the environment variable that contains the API key.

Forbidden:

- hard-coded API keys
- API keys in repository files
- API keys in JSON config
- API keys in fixtures
- API keys in logs
- API keys in structured error output

Missing credentials must fail closed before any provider request is attempted.

---

## 5. Deterministic Load Management

The future client must use deterministic load management.

Allowed controls:

- fixed request interval
- fixed maximum requests per minute
- fixed retry attempt limit
- fixed deterministic backoff table
- explicit request timeout
- explicit page or batch size limit

Forbidden controls:

- random jitter
- human-like traffic simulation
- organic behavior simulation
- synthetic noise traffic
- hidden routing
- traffic shaping intended to conceal system behavior

All timing and retry behavior must be explainable from configuration.

---

## 6. Retry and Fail-Closed Policy

Retryable provider responses:

- HTTP 429
- HTTP 5xx
- network timeout
- connection reset
- malformed response envelope

Required behavior:

- apply deterministic backoff
- stop after max attempts
- return a structured failure result
- do not emit partial RawProviderEvent[] as successful output
- do not advance cursor on failed read

---

## 7. Cursor and Persistence Boundary

The future client may return a proposed next cursor.

The future client must not persist that cursor.

Cursor persistence may happen only after:

1. TonAPI read succeeds.
2. Response is converted into RawProviderEvent[].
3. Existing offline orchestrator processes the events.
4. Candidate and event writes complete successfully.

If orchestrator processing fails, the cursor must not advance.

---

## 9. Raw Response and Fixture Boundary

Raw TonAPI responses must be fixture-capable.

Allowed:

- expose raw response object to a caller-owned fixture capture path
- record endpoint name, status code, and fetchedAt timestamp
- redact credentials and sensitive headers before any fixture save
- replay saved fixtures through existing offline extractor/smoke paths

Forbidden:

- automatic fixture writes without explicit enablement
- saving API keys or authorization headers
- treating fixture capture as live ingestion approval
- using fixtures to bypass provider review

---

## 10. Final Rule

Stage C-1 approves design only.

No live-read implementation is approved here.

No TonAPI client file may be added under this stage.

No live smoke may be added under this stage.

The next allowed step is implementation only after explicit approval to proceed to Stage C-2.
