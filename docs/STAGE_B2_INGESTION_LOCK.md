# Stage B-2 Watcher Ingestion Lock

## Status

Design/specification document only.

No ingestion code is approved by this document.

No WebSocket client, API client, polling loop, signer, broadcaster, live executor, testnet execution, or mainnet execution is implemented or approved here.

## Purpose

Stage B-2 defines the locked specification for a future real-time or near-real-time Watcher ingestion layer.

The ingestion layer observes external data sources, filters relevant events, normalizes them, deduplicates them, and writes pending candidate records or system events to staging artifacts.

Stage B-2 must preserve the Stage A and Stage B invariants:

- no execution outside the state machine
- no RunState mutation by the Watcher
- no signer loading
- no transaction signing
- no transaction sending
- no transaction broadcasting
- deterministic behavior only in execution-critical paths
- auditability over convenience

## Core boundary

The Watcher ingestion layer is an observation plane.

It is not an execution plane.

It must not trigger Dispatcher execution.

It must not promote candidates directly into targets.

It must not mutate RunState.

It must not perform metadata mutation.

It must not perform funding.

It must not create, sign, send, or broadcast any transaction.

## Data source model

Stage B-2 may use read-only sources only:

- WebSocket event stream
- Server-Sent Events stream
- indexed API polling
- future LiteServer/block polling

Provider events are observations only.

Provider events are never execution instructions.

Provider payloads must be normalized before filtering or persistence.

## Data filtering

The ingestion layer must reject noisy or malformed events before persistence.

Minimum acceptance checks:

- supported Jetton event type
- configured Jetton Master match by canonical key
- valid destination address
- positive integer amount
- usable transaction or trace reference
- usable logical time or provider cursor

Rejected events are logged with reason codes.

Rejected events are never candidates.

Rejected events never trigger dispatch, retry, funding, or metadata mutation.

## No execution trigger

A valid ingested event creates only a pending observation.

The ingestion layer may write:

- pending candidate records
- duplicate observation events
- replay markers
- gap markers
- trace invalidation events
- provider health events

The ingestion layer must not write:

- targets.json
- RunState.entries
- audit terminal rows
- Dispatcher commands
- operator runtime state
- metadata mutation requests

## Commander synchronization

Ingestion must be aware of Commander safety state.

If emergency stop is active, ingestion must enter passive mode.

Passive mode may:

- keep provider connection health checks
- record provider health status
- avoid candidate writes unless explicitly allowed by policy

Passive mode must not:

- create new candidates
- promote candidates
- trigger builder steps
- trigger dispatch
- mutate metadata
- perform funding actions

If Commander state is unavailable, ingestion must fail closed into passive mode.

## Deterministic rate limiting

Stage B-2 may use rate limits to protect providers and local resources.

Rate limiting must be deterministic and bounded.

Allowed mechanisms:

- fixed polling interval
- fixed reconnect backoff table
- provider quota ceilings
- deterministic batch size
- deterministic cursor checkpoint interval

Forbidden mechanisms:

- human-like timing simulation
- random execution timing
- randomized dispatch timing
- synthetic noise traffic
- timing changes intended to mask system behavior

Rate limiting must never affect Dispatcher execution order.

## Treasury segregation readiness

Stage B-2 may expose read-only metadata needed by future treasury segregation planning.

This is monitoring/readiness only.

Allowed:

- observe operator labels
- record source/destination canonical keys
- report candidate concentration by destination
- report candidate concentration by source when available
- expose funding-risk signals to Commander as read-only findings

Forbidden:

- funding relays
- hidden routing
- unlinkability design
- synthetic funding paths
- funding transactions
- automatic operator funding
- automatic balance movement

Treasury segregation belongs to a future Stage C funding safety design.

## Forbidden behaviors

Stage B-2 must not implement or enable:

- execution triggers from ingested events
- direct candidate-to-target promotion
- metadata changes based on recipient or event profile
- synthetic load injection
- synthetic noise transactions
- amount randomization for pattern masking
- timing randomization for behavior masking
- funding obfuscation
- relay-based funding paths
- hidden routing between operators
- any action intended to conceal Dispatcher behavior

The system must prefer transparent auditability over behavioral camouflage.
