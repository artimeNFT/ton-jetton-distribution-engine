Watcher Architecture Specification
TON Jetton Distribution Engine — Stage B Design (Pre-Implementation)
Status: Design only. No code. No Dispatcher modifications. No contract changes.
Frozen baseline: Stage A (DRY_RUN, launchStageA.ts, Hook & Lock, entry-centric RunState)
Revision: Final correction pass — provider-independent candidateId, builder address serialization policy, trace_invalidated consistency, profileStatus scope, buffer overflow safety.

1. Component Boundary
Responsibilities
The Watcher is a passive ingestion layer. Its sole function is to observe TON network activity, filter for Jetton transfer events relevant to a configured Jetton Master, enrich candidates with profile metadata, deduplicate them, and write validated pending candidates to a staging queue on disk. Nothing beyond that scope is in its charter.
Concretely, the Watcher owns:

Maintaining a live or polled connection to a TON data source
Parsing raw transaction/action payloads into a normalized internal event shape
Filtering events by Jetton Master canonical key
Extracting transfer fields: source, destination, amount, txHash/traceId, lt, actionIndex or message hash, timestamp
Deriving canonical address keys via Address.parse for all address fields
Invoking the profiling layer per candidate destination/source
Computing a deterministic, provider-independent candidate key and deduplicating against a durable store
Appending pending candidate records to candidates.jsonl (immutable, append-only)
Appending system events to candidate-events.jsonl (gap markers, replay markers, invalidation notices, duplicate observations)
Emitting structured logs for every decision: written, rejected, duplicate, deferred

What the Watcher Must Never Do
The Watcher must never:

Call executor.broadcast() or any method that touches the TON chain directly
Read or write RunState.entries (the Dispatcher's exclusive source of truth)
Call store.update() on any AtomicStateStore instance
Invoke Dispatcher.dispatch() or any part of the dispatch pipeline
Produce a targets.json file autonomously — that is the job of the separate candidate-to-targets builder
Mark any candidate as accepted or rejected — the Watcher writes pending only; acceptance belongs exclusively to the decision layer
Make acceptance decisions based on profiling API failures — unknown profile means pending with profileStatus: "unresolved", never auto-accepted or auto-rejected
Auto-promote a candidate to the Dispatcher without an explicit intermediary step

Why It Must Not Write RunState Directly
RunState.entries is governed by the Hook & Lock invariant: no execution may begin before a submitted state entry is atomically persisted. If the Watcher were to write entries directly it would bypass this invariant entirely — entries could appear in state without a corresponding broadcast lifecycle, corrupting the audit trail and making zombie detection unreliable. The Reconciler's zombie recovery logic depends on the guarantee that every submitted entry originated from inside the dispatch loop. Any path that circumvents this creates a class of phantom entries that the Reconciler cannot distinguish from real in-flight work.
Keeping the Watcher entirely outside the state model also means it can be restarted, replayed, or replaced without any risk of corrupting active campaign state.

2. Connectivity Options
TonAPI WebSocket
TonAPI's WebSocket (wss://tonapi.io/v2/websocket) pushes account-level and transaction-level events in near real-time. It supports subscribing to specific account addresses and delivers structured action payloads including parsed Jetton transfer data.
Latency: 1–3 seconds typical from block finalization.
Finality: Events are delivered after the block is accepted by the validator but before full finalization depth. TON's single-round finality model makes shallow reorgs rare in practice.
Reliability: Dependent on TonAPI SLA. No replay guarantee on reconnect without explicit cursor/since-lt replay.
Reconnect complexity: Moderate. The API does not guarantee event delivery during disconnected windows without cursor-anchored replay.
API dependency: Hard dependency on TonAPI availability and rate limits.
Best for: Low-latency detection, readable structured payloads, minimal parsing overhead.
TON Center Streaming API
TON Center Streaming API v2 is a full streaming service supporting both Server-Sent Events (SSE) and WebSocket transports. It exposes multiple event group subscriptions including:

transactions — raw transaction events per account
actions — parsed high-level actions (including Jetton transfers)
trace — full execution traces
account_state_change — account state delta events
jettons_change — Jetton balance change events per account
trace_invalidated — trace invalidation events for reorganization handling

The trace_invalidated event group is particularly relevant for the Watcher: it provides an explicit signal when a previously delivered trace has been invalidated, enabling the Watcher to record a system event in candidate-events.jsonl so affected pending candidates can be flagged for review. See Section 7 for the full treatment of invalidation events.
Latency: Comparable to TonAPI WebSocket for action-level events; slightly higher for trace-level events due to trace assembly.
Finality: jettons_change events typically reflect confirmed balance changes; trace_invalidated provides explicit reorg notification.
Reliability: SSE mode is more resilient under transient disconnects; client can resume from a known SSE last-event-ID without cursor reconstruction.
Reconnect complexity: Low to moderate. SSE last-event-ID resume is simpler than lt-cursor WebSocket replay.
API dependency: Dependent on TON Center availability and rate limits; generally permissive for moderate throughput.
Best for: Structured Jetton-aware event streams with explicit reorg notification. SSE mode reduces reconnect complexity relative to WebSocket.
LiteServer / Block Polling
Direct LiteServer connection via @ton/ton client libraries, polling for new blocks and scanning every transaction in each block for matching Jetton operations.
Latency: Near real-time if polling aggressively, but adds parsing burden.
Finality: Highest confidence — polling applied blocks gives full confirmation.
Reliability: No third-party dependency; resilience is self-managed.
Reconnect complexity: Highest. Requires managing block cursors, missed-block recovery, and LiteServer endpoint rotation.
API dependency: None beyond LiteServer nodes, which can be self-hosted.
Best for: Production-grade independence, no rate limit constraints, maximum trust in data.
Recommended Approach for Stage B
Start with TonAPI WebSocket or TON Center Streaming API (action or jettons_change stream) for Stage B2. TON Center's trace_invalidated support and SSE resume make it particularly attractive when reorg safety and reconnect simplicity are priorities. Back either choice with a lt-cursor or SSE event-ID resume mechanism. Transition to LiteServer polling for Stage C or whenever API rate limits or reliability become constraints.

3. Event Subscription Model
What to Subscribe To
Subscribing to every Jetton Wallet address associated with a high-volume Jetton Master such as USDT is not practical at Stage B. The number of distinct Jetton Wallet addresses can be in the hundreds of thousands or more; enumerating and subscribing to each is operationally infeasible and would exceed any reasonable API rate limit.
The viable Stage B subscription options are:
Watchlist-based monitoring. Subscribe to a curated, bounded set of destination addresses that the operator knows in advance are relevant — for example, a list of known recipient wallets. This is the most tractable option for Stage B2 where the recipient population is controlled and finite. Events from addresses outside the watchlist are ignored.
Provider-supported action stream filtered by Jetton Master. Use a stream type (TonAPI or TON Center actions or jettons_change) that allows filtering by Jetton Master address server-side or at the API level. This shifts the fan-out problem to the indexer and delivers only events relevant to the configured master, without requiring per-wallet subscription. This is the preferred approach where the API supports it.
Indexed query / polling by Jetton Master. Periodically query a Jetton-aware indexer for recent transfers involving the configured master address, using lt-cursor pagination. Less real-time than streaming but simpler to implement reliably and easier to replay. Suitable as a complementary or fallback channel.
Full wallet indexing. Subscribe to or index every wallet associated with the Jetton Master by scanning the master's transaction history and discovering wallets dynamically. This is a Stage C option only. It requires a durable wallet registry, incremental discovery logic, and subscription management at scale. It must not be attempted in Stage B.
Which Stream Type Is Safest
For Jetton Transfer detection, action-level or jettons_change streams are safer than raw transaction streams. Raw transactions require parsing the cell payload according to the TL-B schema for Jetton messages (op code 0x0f8a7ea5 for Transfer, 0x178d4519 for InternalTransfer), which is error-prone and schema-dependent.
TonAPI action streams and TON Center actions / jettons_change groups pre-parse these into structured objects with source, destination, amount, Jetton master, and trace identifiers. This is the recommended input format for Stage B.
The TON Center trace_invalidated event must be consumed alongside the primary stream when using TON Center. On receipt, the Watcher appends an invalidation system event to candidate-events.jsonl referencing the affected traceId. See Section 7.
Confirmed vs Finalized Events
In TON, "confirmed" means the transaction has been included in a masterchain or workchain block that has been accepted. "Finalized" means the block has been referenced by a sufficient number of subsequent masterchain blocks that reorg is considered practically impossible.
For distribution targeting purposes, confirmed is sufficient for candidate ingestion. The Watcher records the finality field on each candidate as "confirmed" or "finalized" per the data source's classification. The candidate-to-targets builder may apply a finality policy — for example, requiring "finalized" before acceptance — but this is a decision-layer concern, not a Watcher concern.

4. Event Filtering
Filter Criteria
Only events that pass all of the following conditions are forwarded to the profiling layer. Any failure at any step results in immediate rejection with a structured log entry.

Event type is exactly a Jetton transfer action or jettons_change event per the chosen data source's schema
The jettonMaster field, when parsed via Address.parse, produces a canonical key that matches the configured Jetton Master canonical key. Raw string equality is not used.
The event has a non-empty, non-null destination field that can be parsed by Address.parse without error
The event has a non-empty, non-null amount field that satisfies /^\d+$/ after trimming and can be converted to a positive bigint
A transaction hash or trace ID is present and non-empty
The lt field is present and parseable as a non-negative integer
The event timestamp is a valid ISO 8601 string or a parseable Unix epoch

Address Normalization
TON addresses appear in multiple representations: user-friendly (base64url with checksum, bounceable or non-bounceable), raw (<workchain>:<hex-hash>), and URL-safe variants. Lowercasing a user-friendly address corrupts its base64url checksum and produces a string that is no longer a valid TON address. Lowercasing must never be applied to TON addresses.
For all address fields — destination, source, jettonMaster — the Watcher applies the following normalization:

Parse the raw address string using Address.parse from @ton/core. If parsing fails, the event is rejected with INVALID_ADDRESS.
Derive a canonical comparison key from the parsed result: <workchain>:<hash-hex-lowercase>. This key is used exclusively for deduplication, candidate key construction, and equality checks. It is stable, unambiguous, and independent of the friendly address representation.
Preserve the original address string as received from the event payload for storage in the candidate record's audit fields (destinationAddress, sourceAddress, jettonMaster). This is the address as observed on the wire and must not be mutated.
Store both the original string and the canonical key in the candidate record.

The original address stored in the candidate record is audit metadata only. The candidate-to-targets builder must not blindly forward it to targets.generated.json. See Section 8 for the builder's address serialization policy.
Extracted Fields
From a passing event the Watcher extracts and normalizes:

source: original address string as received; plus sourceCanonicalKey: <workchain>:<hash-hex>
destination: original address string as received; plus destinationCanonicalKey: <workchain>:<hash-hex>
jettonMaster: original address string as received; plus jettonMasterCanonicalKey: <workchain>:<hash-hex>
amount: bigint, converted from the raw string with strict /^\d+$/ validation before conversion
txHash: string, the transaction hash
traceId: string or null, the trace ID if available from the data source
actionIndex: integer or null, the index of this action within the trace if available
messageHash: string or null, the inbound message hash if available
lt: string (decimal representation of the logical time, preserved as string to avoid precision issues)
detectedAt: ISO 8601 string, wall-clock time the Watcher observed this event
eventTimestamp: ISO 8601 string derived from the block timestamp if available, otherwise null
finality: "confirmed" | "finalized" per the data source's classification

Rejection Behavior
Any event that cannot be fully extracted and validated produces a single structured log line at warn level with the raw event payload (truncated to 512 bytes), the specific field that failed validation, and a rejection reason code such as AMOUNT_NON_INTEGER, MASTER_MISMATCH, MISSING_DESTINATION, MISSING_TX_REF, or INVALID_ADDRESS. Rejected events are never written to any queue.

5. Profiling Layer
Purpose
The profiling layer enriches each candidate with metadata about the destination address. It does not make acceptance decisions — it annotates. The downstream decision layer uses profile metadata as inputs to human or automated review policies, not as hard gates.
profileStatus reflects exclusively the outcome of the enrichment process. It has three possible values: "resolved" (all enrichment calls succeeded), "partial" (some calls succeeded, others failed or timed out), and "unresolved" (no enrichment data could be obtained). Finality state, invalidation, and gap events are entirely separate concerns recorded in candidate-events.jsonl and must never be expressed through profileStatus.
Enrichment Targets
For each candidate's destination canonical key, the profiling layer attempts to collect:

Code hash: The SHA256 hash of the deployed contract code. Fetched via getAccountState using the canonical key for the RPC call.
Account status: active, uninit, frozen, or nonexist. uninit or nonexist destinations are flagged but not auto-rejected.
Wallet type heuristic: Whether the code hash matches known Jetton Wallet, v3R2, v4, W5, or other common wallet contracts. Maintained as a local lookup table of well-known code hashes. This is a hint, not ground truth.
Known entity label: If the canonical key matches a local registry of known exchange hot wallets, DEX contracts, or bridge contracts, a label is attached. This registry is version-controlled and updated manually. Labels are never fetched from a live API at event time.
Source profile: Same enrichment applied to the source canonical key if present.

Label Safety Rules
No label from the profiling layer is treated as a hard filter unless explicitly configured. The Watcher does not know business intent. Labels surface in candidate metadata for human or policy review.
If the profiling API call fails, the candidate is written with profileStatus: "unresolved". It is never auto-accepted or auto-rejected on the basis of a profiling failure.
All enrichment calls must be rate-limited and batched. If the chosen RPC client supports batch requests, the profiling layer should coalesce address lookups over a 500ms window before dispatching.

6. Deduplication
Candidate Key and Provider Independence
The candidate key must be provider-independent. The same chain event observed by two different providers (e.g., TonAPI and TON Center) represents a single canonical on-chain event and must resolve to the same candidateId. Including the provider in the key would cause the same event to be admitted twice if the Watcher switches providers or uses multiple providers concurrently, defeating deduplication entirely.
The provider is stored as observation metadata on the candidate record — not as a key component. If the same canonical event is observed from multiple providers, the dedup store drops the duplicate and the providersSeen field on the existing candidate record is updated to record the additional observation. This update is append-only (a new entry in candidate-events.jsonl of type "duplicate_observation" rather than a mutation of the immutable candidate record).
The deterministic candidate key is constructed from the following fields, in order, joined by :::
<traceId or "notrace">::<txHash>::<lt>::<actionIndex or "noaction">::<messageHash or "nomsg">::<jettonMasterCanonicalKey>::<destinationCanonicalKey>::<amount>
Where:

traceId is the trace ID if available; "notrace" if absent
txHash is the raw transaction hash as returned by the data source
lt is the logical time as a decimal string
actionIndex is the zero-based action index within the trace if available; "noaction" if absent
messageHash is the inbound message hash if available; "nomsg" if absent
jettonMasterCanonicalKey is <workchain>:<hash-hex> derived from Address.parse
destinationCanonicalKey is <workchain>:<hash-hex> derived from Address.parse
amount is the decimal string representation of the bigint amount

The candidateId stored in the candidate record is the SHA-256 hash of this full key, hex-encoded. The raw key components are stored alongside the candidateId for auditability.
TTL-Based Dedupe
The deduplication store records the candidate key and the wall-clock time it was first seen. A configurable TTL (recommended default: 72 hours) determines how long a key is retained. After TTL expiry, a key may be re-admitted. This guards against unbounded store growth without permanently suppressing future legitimate events.
Durable Dedupe Store Options
JSONL file: Simplest option for early Stage B. Append-only file of { key, seenAt } records. On startup, the full file is read into a Map<string, number> in memory. TTL expiry is enforced at read time. Suitable up to tens of thousands of candidates per campaign.
SQLite: Preferred for Stage B2+. Single-file, ACID-compliant, indexed lookups, TTL-based deletion by query. Schema: one table dedup_log(key TEXT PRIMARY KEY, seen_at INTEGER). Compaction is a single DELETE WHERE seen_at < ? statement. Scales to millions of records without memory concern.
PostgreSQL: Stage C option. Required only when multi-process Watcher instances share deduplicate state or when audit requirements demand persistent, queryable history beyond SQLite's operational simplicity.
Why In-Memory Dedupe Alone Is Insufficient
In-memory deduplication is lost on every Watcher restart. Given that reconnect replay re-delivers recent events from the cursor position, an in-memory-only store would re-admit every candidate seen before the restart, producing duplicate entries in the staging queue. Duplicates in the queue translate directly to duplicate recipients in the generated targets file, violating the idempotency invariant and potentially causing double-distribution if a live executor is ever introduced.

7. Candidate Queue and Event Log
Staging Model
The Watcher writes to a staging queue, not to any Dispatcher-managed data structure. The staging queue is an intermediary that decouples detection from execution. Nothing in the current Dispatcher pipeline reads from the candidate queue.
File Structure
The JSONL staging model uses three strictly separate append-only files:
data/candidates/<campaignId>-candidates.jsonl — immutable candidate records. Written by the Watcher only. Each record represents a single observed event at the moment of detection, with decision: "pending" always. No record in this file is ever modified after writing.
data/candidates/<campaignId>-decisions.jsonl — decision records written by the candidate-to-targets builder or the decision layer only. Each record references a candidateId and carries accepted | rejected | invalidated. The effective decision for a given candidateId is the last decision record for that ID in the file (last-write-wins within the decision log). This file is never written by the Watcher.
data/candidates/<campaignId>-candidate-events.jsonl — system event records written by the Watcher only. Records events that affect how candidates should be interpreted but do not belong in the immutable candidate record itself. This file is the correct and exclusive home for: trace invalidation notices, gap markers, replay markers, buffer overflow data-loss markers, and duplicate observation notices. The decision layer reads this file alongside candidates.jsonl and decisions.jsonl to build a complete picture of candidate health before making acceptance decisions.
This three-file structure preserves strict separation of concerns: the Watcher owns candidates and system events; the decision layer owns decisions.
If mutable decision state is required — for example, to support queries like "give me all pending candidates" without scanning full JSONL files — replace the JSONL decision model with SQLite. A candidates table holds the immutable record; a decisions table holds mutable state keyed by candidateId; a candidate_events table holds system events. SQLite is the recommended upgrade path when decision query complexity grows.
Trace Invalidation Handling
When a trace_invalidated event is received (TON Center), the Watcher must:

Record a system event of type "trace_invalidated" in candidate-events.jsonl, referencing the invalidated traceId
Log a TRACE_INVALIDATED structured log entry at warn level
Take no further action — specifically, the Watcher must not modify any existing candidate record and must not write to decisions.jsonl

The decision layer is responsible for reading invalidation events from candidate-events.jsonl, identifying which candidateId values reference the invalidated traceId, and writing a decision record of "invalidated" for each affected candidate to decisions.jsonl. This keeps invalidation handling cleanly within the decision layer's authority.
profileStatus is not used to express invalidation. profileStatus reflects enrichment outcome only: "resolved" | "partial" | "unresolved".
Recommended model: Introduce "invalidated" as a first-class value in the decisions.jsonl decision field, alongside "accepted" and "rejected". This is cleaner than attempting to express finality state through profileStatus or through a separate flag on the candidate record. The decision layer writes { candidateId, decision: "invalidated", decisionReason: "trace_invalidated", decisionAt } for each affected candidate. The candidate-to-targets builder treats "invalidated" identically to "rejected" — invalidated candidates are never promoted to targets.
Candidate Record Schema
Written to candidates.jsonl by the Watcher. Immutable after writing.
{
  "candidateId":              string,        // SHA-256 hex of the full candidate key
  "candidateKeyComponents": {                // raw key parts for audit
    "traceId":                string,
    "txHash":                 string,
    "lt":                     string,
    "actionIndex":            string,
    "messageHash":            string,
    "jettonMasterCanonicalKey": string,
    "destinationCanonicalKey":  string,
    "amount":                 string
  },
  "observedByProvider":       string,        // provider that produced this record
  "sourceEventRef":           string,        // txHash or traceId
  "jettonMaster":             string,        // original address string from event (audit only)
  "jettonMasterCanonicalKey": string,        // <workchain>:<hash-hex>
  "destinationAddress":       string,        // original address string from event (audit only)
  "destinationCanonicalKey":  string,        // <workchain>:<hash-hex>
  "sourceAddress":            string | null, // original address string from event (audit only)
  "sourceCanonicalKey":       string | null, // <workchain>:<hash-hex>
  "amount":                   string,        // bigint as decimal string (/^\d+$/)
  "lt":                       string,        // logical time as decimal string
  "detectedAt":               string,        // ISO 8601, Watcher wall clock
  "eventTimestamp":           string | null, // ISO 8601, block timestamp if available
  "finality":                 "confirmed" | "finalized",
  "profileStatus":            "resolved" | "partial" | "unresolved",
  "profile": {
    "destination": {
      "accountStatus":        string | null,
      "codeHash":             string | null,
      "walletType":           string | null,  // hint only
      "entityLabel":          string | null   // hint only
    },
    "source": {
      "accountStatus":        string | null,
      "codeHash":             string | null,
      "walletType":           string | null,
      "entityLabel":          string | null
    }
  },
  "decision":                 "pending"      // always "pending" when written by Watcher
}
Decision Record Schema
Written to decisions.jsonl by the decision layer only. Never written by the Watcher.
{
  "candidateId":    string,
  "decision":       "accepted" | "rejected" | "invalidated",
  "decisionReason": string | null,
  "decisionAt":     string        // ISO 8601
}
Candidate Event Record Schema
Written to candidate-events.jsonl by the Watcher only.
{
  "eventType":      "trace_invalidated"
                  | "gap_detected"
                  | "replay_started"
                  | "replay_completed"
                  | "buffer_overflow_data_loss"
                  | "duplicate_observation",
  "ts":             string,        // ISO 8601, wall clock
  "traceId":        string | null, // for trace_invalidated and duplicate_observation
  "candidateId":    string | null, // for duplicate_observation
  "provider":       string | null, // provider that generated the additional observation
  "cursorLt":       string | null, // for gap, replay events
  "detail":         string | null  // human-readable context
}

8. Dispatcher Integration
Safe Integration with Stage A
The integration path must not touch any file currently owned by the Dispatcher. The flow is:
Watcher
  → data/candidates/<campaignId>-candidates.jsonl    (pending records, append-only)
  → data/candidates/<campaignId>-candidate-events.jsonl  (system events, append-only)

Decision Layer (human review or policy script, separate process)
  → reads candidates.jsonl + candidate-events.jsonl
  → writes data/candidates/<campaignId>-decisions.jsonl

Candidate-to-Targets Builder (separate process, human-triggered)
  → reads candidates.jsonl + decisions.jsonl + candidate-events.jsonl
  → resolves effective decision per candidateId (last-write-wins)
  → filters: decision === "accepted", profileStatus !== "unresolved"
  → deduplicates by destinationCanonicalKey
  → serializes output addresses per configured output policy
  → writes data/targets.generated.json

launchStageA.ts
  → TARGETS_PATH=data/targets.generated.json
  → behavior unchanged
No file currently read or written by launchStageA.ts is touched.
Candidate-to-Targets Builder Address Serialization Policy
The builder must not blindly forward destinationAddress from the candidate record to targets.generated.json. The original address string stored in the candidate record is audit metadata — it captures exactly what was observed on the wire and may be in any valid TON address representation (bounceable, non-bounceable, URL-safe, raw).
Before writing a recipient address to targets.generated.json, the builder must:

Parse the stored destinationAddress using Address.parse from @ton/core to obtain the canonical Address object. If parsing fails at this stage, the candidate is logged as BUILDER_ADDRESS_PARSE_FAILURE and excluded from output — it must not be written to the targets file.
Serialize the parsed Address to a string using the configured output policy:

network: "mainnet" or "testnet" — controls whether the address is serialized with the testnet flag set. Must match the deployment target. No default; must be explicitly configured.
bounceable: boolean — controls whether the output address is in bounceable (EQ...) or non-bounceable (UQ...) form. Default is false (non-bounceable) for distribution targets, since recipients are typically end-user wallets that should receive non-bounceable addresses to prevent accidental bounce on failed delivery.


Write the serialized address string to the output file. The serialized form replaces the original for all downstream use. The original destinationAddress remains in the candidate record as the audit reference.

This policy ensures targets.generated.json contains addresses in a uniform, intentional format regardless of how different providers happened to encode the address in their event payload. Mixed address formats in the targets file are prevented by construction.
Candidate-to-Targets Builder Logic
The builder:

Reads candidates.jsonl, decisions.jsonl, and candidate-events.jsonl
Resolves the effective decision for each candidateId (last decision record wins in decisions.jsonl)
Filters for decision === "accepted" and profileStatus !== "unresolved" (policy configurable)
Deduplicates by destinationCanonicalKey — if the same canonical destination appears in multiple accepted candidates, the one with the highest amount or the most recent detectedAt is kept (policy configurable)
Parses and re-serializes each destinationAddress per the configured output policy (network + bounceable)
Writes data/targets.generated.json as a root array of { address, amount } objects in the format expected by loadRecipients() in launchStageA.ts
Logs a summary: total accepted, total deduplicated, total address parse failures, output path and record count

The builder is intentionally stateless and idempotent. Running it twice on the same input files produces the same output.
Stage B+ Enqueue API
If a future iteration requires the Watcher to trigger dispatch programmatically (without human-triggered builder runs), the correct design is an enqueueTarget(candidate: AcceptedCandidate): Promise<void> function that appends to the targets queue file with advisory locking, and a separate Dispatcher invocation loop that polls the queue. This design is Stage B+ only and must not be anticipated or scaffolded in Stage A or B0–B2.

9. Resilience
Reconnect Strategy
On any connection drop (WebSocket close, SSE stream termination, timeout, API error), the Watcher must:

Log the disconnection event with timestamp and last-seen lt cursor and/or SSE last-event-ID
Wait for an initial backoff period before attempting reconnect
Apply exponential backoff with jitter: baseMs * 2^attempt + random(0, baseMs), capped at a configured maximum (recommended: 60 seconds)
On successful reconnect, request replay from the last confirmed cursor (lt for WebSocket sources, SSE last-event-ID for SSE sources)
Reset the backoff counter after a stable connection window (recommended: 5 minutes without disconnection)

Cursor Persistence
The last successfully processed event's lt and, where applicable, the SSE lastEventId must be persisted to disk after every batch of processed events. A dedicated data/watcher-cursor.json file with { lt: string, lastEventId: string | null, updatedAt: ISO8601 } is sufficient. This file is written atomically (write-to-temp + rename, mirroring saveStateAtomic). On startup, the cursor is loaded and used as the replay starting point. If no cursor file exists, the Watcher begins from now.
Heartbeat / Ping Timeout
For WebSocket connections, the Watcher must send a protocol-level ping every 30 seconds. If a pong is not received within 10 seconds of the ping, the connection is treated as dead and the reconnect sequence begins immediately. For SSE connections, the absence of any server-sent event for a configurable idle timeout (recommended: 60 seconds) triggers reconnect. This prevents silent hangs where the transport appears alive but the server has stopped delivering events.
Stale Cursor Behavior
If on startup or reconnect the loaded cursor's lt age exceeds the configured maximum replay window (recommended: 10 minutes), the Watcher must not silently start from now. The gap is potentially significant and silently discarding it could cause missed candidates that affect distribution correctness.
Instead, the Watcher must:

Emit a WATCHER_GAP structured log entry at error level, including the cursor lt, the current network lt, and the estimated gap duration
Append a "gap_detected" system event to candidate-events.jsonl with the cursor lt, current lt, and timestamp
Halt further processing and await an explicit operator decision delivered via one of three mechanisms:

Replay bounded window: operator instructs the Watcher to replay from the stale cursor up to a defined lt ceiling, accepting that events within the gap will be processed. On beginning replay, the Watcher appends a "replay_started" event to candidate-events.jsonl. On completion, it appends "replay_completed".
Skip gap knowingly: operator explicitly instructs the Watcher to advance the cursor to now, acknowledging that events in the gap window are abandoned and will not be detected. The Watcher logs a WATCHER_GAP_SKIPPED audit event and appends a "gap_detected" system event to candidate-events.jsonl with detail: "operator_skipped".
Pause Watcher: operator decides not to proceed until the gap can be investigated and potentially back-filled from an alternative source. The Watcher remains halted until explicitly resumed.



No gap resolution mode is applied automatically. The fail-closed rule is: unknown gap = halt and surface, not silently advance.
Replay Window
When a bounded replay is authorized, the replay window is bounded at both ends: from the stale cursor lt to a ceiling of min(staleAt + authorizedReplayWindowMs, now). Events within this window are processed normally; the dedup store ensures already-seen events are dropped. Events beyond the ceiling are not replayed — the Watcher resumes live streaming from the ceiling point.
Idempotent Reprocessing
Because the deduplication store is durable, any event replayed during reconnect or authorized replay that was already processed will be dropped at the dedup check with a DUPLICATE log entry at debug level. The candidate queue and dedup store are the idempotency backstop — the Watcher does not need to track processed state separately.

10. Performance
Bounded Queue and Buffer Overflow Safety
The in-memory buffer between the event stream and the processing pipeline (profiling + dedup + write) must be bounded. A maximum of 1000 pending events is a reasonable default.
Buffer overflow must not silently drop events unless replay is guaranteed by the data source and the cursor state is current. The appropriate behavior on buffer overflow depends on whether the dropped events can be recovered:
If the data source guarantees replay from cursor (SSE with last-event-ID, or lt-cursor with confirmed replay support): the Watcher may drop the overflowing event from the in-memory buffer, log BUFFER_OVERFLOW at warn level, and rely on cursor-anchored replay on the next reconnect to re-deliver the dropped events. The cursor must not be advanced past the dropped event.
If replay is not guaranteed or the cursor state is uncertain: the Watcher must treat the overflow as a potential data loss event. It must: log BUFFER_OVERFLOW at error level; append a "buffer_overflow_data_loss" system event to candidate-events.jsonl with the current cursor lt and timestamp; and either trigger a controlled reconnect immediately (to re-establish the stream from a known cursor) or halt and emit a WATCHER_GAP requiring operator acknowledgement, depending on the severity and frequency of the overflow. Silent discard without a gap marker is never acceptable when replay is not guaranteed.
In all cases, backpressure is preferred over overflow. If the processing pipeline is slower than event arrival rate, the ingestion loop must pause or slow its consumption rate rather than allowing the buffer to fill. Buffer overflow is a last resort, not a normal operating mode.
Rate Limits
All outbound RPC calls (profiling, enrichment, reconnect) must be subject to a configured rate limit. Recommended: no more than 10 profiling API calls per second. Calls exceeding this are queued, not dropped. If the queue grows beyond a threshold, excess candidates are written with profileStatus: "unresolved" and decision: "pending" without waiting for enrichment.
Batching Enrichment Calls
If the chosen RPC client supports batch requests, the profiling layer should coalesce address lookups over a 500ms window before dispatching. This reduces API call count by up to an order of magnitude under burst conditions.
Max Candidates Per Minute
A configurable rate cap on candidate writes. Recommended default: 500 candidates per minute. Candidates exceeding this rate are held in memory for the next window. If the in-memory hold buffer exceeds its bound, excess candidates are dropped with a CANDIDATE_RATE_CAP log entry and, if replay is not guaranteed, a "buffer_overflow_data_loss" event is appended to candidate-events.jsonl.
Structured Logs
Every decision in the Watcher pipeline must produce a single structured JSON log line. Log fields must include at minimum: level, msg, candidateId or eventRef, decision, reason, ts. No unstructured string concatenation.

11. Safety / Fail-Closed Rules
These are non-negotiable. Every rule defaults to the most conservative action.
ConditionActionUnknown or unrecognized event shapeReject immediately. Log UNKNOWN_EVENT_SHAPE.Address field fails Address.parseReject immediately. Log INVALID_ADDRESS.Missing or unparseable amountReject immediately. Log AMOUNT_INVALID.Amount is zero or negativeReject immediately. Log AMOUNT_NON_POSITIVE.Jetton Master canonical key does not match configured valueReject immediately. Log MASTER_MISMATCH.Missing transaction hash or trace IDReject immediately. Log MISSING_TX_REF.Missing ltReject immediately. Log MISSING_LT.Profiling API call fails or times outWrite candidate with profileStatus: "unresolved", decision: "pending". Log PROFILE_UNRESOLVED. Never auto-accept or auto-reject.Candidate key already in dedupe store within TTLDrop from processing. Append "duplicate_observation" to candidate-events.jsonl. Log DUPLICATE at debug level.trace_invalidated received for a known traceIdAppend "trace_invalidated" to candidate-events.jsonl. Log TRACE_INVALIDATED at warn. Do not modify any candidate record. Do not write to decisions.jsonl.Disk write to candidate queue failsLog QUEUE_WRITE_FAILURE at error. Do not silently continue. Trigger reconnect/retry if persistent.Buffer overflow with replay guaranteedDrop from in-memory buffer. Log BUFFER_OVERFLOW at warn. Do not advance cursor past dropped event.Buffer overflow with replay not guaranteedLog BUFFER_OVERFLOW at error. Append "buffer_overflow_data_loss" to candidate-events.jsonl. Trigger controlled reconnect or halt for operator acknowledgement. Never silently discard.Cursor file write failsLog CURSOR_WRITE_FAILURE. Continue processing. Do not halt.Stale cursor detected on startup or reconnectHalt. Emit WATCHER_GAP. Append "gap_detected" to candidate-events.jsonl. Await explicit operator decision. Do not auto-advance.Builder encounters destinationAddress that fails Address.parseExclude from output. Log BUILDER_ADDRESS_PARSE_FAILURE. Do not write malformed address to targets file.Any unhandled exception in processing pipelineCatch at the pipeline boundary. Log PIPELINE_ERROR with stack. Drop the triggering event. Do not crash the Watcher process.Any scenarioNever auto-execute. Never call broadcast. Never write RunState. Never write accepted or invalidated decisions — the Watcher writes pending candidates and system events only.

12. Stage Plan
Stage B0 — Design Only (current document)
No code. No files. Architecture specification frozen and reviewed. All design questions — provider-independent candidateId, address normalization, output serialization policy, three-file JSONL model, trace_invalidated handling, buffer overflow safety, stale cursor policy — resolved before implementation begins.
Stage B1 — Offline Parser
Record a sample of real TonAPI WebSocket and TON Center Streaming API event payloads to test/fixtures/watcher-events/. Build an offline parser that reads these fixtures, applies the filter and extraction logic (including Address.parse normalization and provider-independent candidate key construction), and outputs normalized pending candidate records to stdout. No live connection. No profiling. No disk writes. Goal: validate parsing, address normalization, candidate key construction, and filtering logic against real event shapes before any live connection work.
Stage B2 — Live Watcher to Candidate Queue
Introduce Watcher class and createWatcher() factory. WebSocket or SSE connection to chosen provider. Cursor persistence (lt + SSE last-event-ID). Reconnect with exponential backoff. Stale cursor detection and WATCHER_GAP halt with operator decision requirement. Buffer overflow safety with gap marker on data loss. Event filter + extraction pipeline with Address.parse normalization and provider-independent candidateId. Profiling layer with unresolved fallback. Deduplication against SQLite store. Append pending records to candidates.jsonl. Append system events to candidate-events.jsonl. Structured logging throughout. No integration with Dispatcher or targets files.
Stage B3 — Candidate-to-Targets Builder
Introduce buildTargetsFromCandidates.ts as a standalone script. Reads candidates.jsonl, decisions.jsonl, and candidate-events.jsonl. Resolves effective decision per candidate (last-write-wins). Applies acceptance policy. Deduplicates by destinationCanonicalKey. Parses and re-serializes each destination address per configured output policy (network + bounceable). Writes data/targets.generated.json as root array of { address, amount } objects. Human-triggered only.
Stage B4 — Dispatcher Dry Run from Generated Targets
Run launchStageA.ts with TARGETS_PATH=data/targets.generated.json. No Dispatcher changes. Validate that the full pipeline — Watcher → candidates → decision log → builder → targets → Dispatcher dry run — produces correct audit output and clean RunState. Fix any integration issues at this stage before any live execution path is considered.
Stage C — Optional Live Executor
Only after Stage B4 is fully validated and the live MintExecutor is implemented. The Watcher pipeline does not change. The Dispatcher changes are isolated to the executor. Full wallet indexing as a subscription strategy may be revisited at this stage if operational scale requires it. The Watcher remains an ingestion layer permanently.

End of final corrected Watcher Architecture Specification. No code produced. No files modified. No Dispatcher changes implied.Sonnet 4.6Adaptive