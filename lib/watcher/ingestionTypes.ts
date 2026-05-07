/**
 * ingestionTypes.ts
 *
 * All shared types and enums for the Stage B-2 Watcher ingestion layer.
 * No logic. No I/O. No imports from other watcher modules.
 *
 * Hard constraints enforced by this module:
 * - No WebSocket / API client types
 * - No Dispatcher types
 * - No RunState types
 * - No signing / sending / broadcasting types
 * - No decisions.jsonl record type (decisions are never written by the Watcher)
 */

// ─── Rejection Reason Codes ───────────────────────────────────────────────────
//
// TIMESTAMP_INVALID is intentionally absent: invalid or absent eventTimestamp
// silently becomes null and is never a hard reject in B2 first pass.
//
// FINALITY_INVALID is a hard reject because finality is a required, bounded
// field with exactly two valid values ("confirmed" | "finalized").

export type RejectionReasonCode =
  | "UNKNOWN_EVENT_SHAPE"
  | "UNSUPPORTED_EVENT_TYPE"
  | "INVALID_ADDRESS"
  | "MASTER_MISMATCH"
  | "MISSING_DESTINATION"
  | "MISSING_TX_HASH"
  | "MISSING_LT"
  | "AMOUNT_NON_INTEGER"
  | "AMOUNT_NON_POSITIVE"
  | "FINALITY_INVALID";

// ─── Raw Provider Event ───────────────────────────────────────────────────────
//
// Provider-specific wire formats are not admitted directly into the filter
// pipeline. Approved offline extractors must first map provider-shaped input
// into NeutralEventPayload before calling filterAndNormalize.
//
// Adding a provider literal here is type-contract admission only. It does not
// approve a client, network connection, live ingestion, polling, Dispatcher
// integration, RunState writes, targets writes, signing, sending, or execution.

export type ProviderName = "fixture" | "tonapi";

// ─── Advisory Profile ─────────────────────────────────────────────────────────
//
// Advisory profile metadata is pass-through only.
// It must not affect filtering, candidate identity, Dispatcher behavior,
// targets, signing, sending, broadcasting, or execution.

export interface AdvisoryAddressProfile {
  readonly walletTypeHint: string | null;
  readonly codeHash: string | null;
  readonly accountStatus: string | null;
  readonly entityLabel: string | null;
}

export interface AdvisoryProfile {
  readonly source: AdvisoryAddressProfile | null;
  readonly destination: AdvisoryAddressProfile | null;
}

export interface RawProviderEvent {
  readonly provider: ProviderName;
  readonly receivedAt: string;            // ISO 8601 wall clock
  readonly payload: NeutralEventPayload;
  readonly advisoryProfile?: AdvisoryProfile | null;
}

// Neutral event payload: the fixture contract for B2 first pass.
// Field names are protocol-neutral. Provider-specific adapters (future) map
// into this shape before the filter pipeline is entered.
export interface NeutralEventPayload {
  readonly eventType: string;             // must equal "jetton_transfer" to pass
  readonly sourceAddress: string | null | undefined;
  readonly destinationAddress: string;
  readonly jettonMaster: string;
  readonly amount: string;                // raw decimal string, validated in filter
  readonly txHash: string;               // required; absent → MISSING_TX_HASH
  readonly traceId: string | null | undefined;
  readonly actionIndex: number | null | undefined;
  readonly messageHash: string | null | undefined;
  readonly lt: string;
  readonly eventTimestamp: string | null | undefined; // invalid → null, never a reject
  readonly finality: string;              // must equal "confirmed"|"finalized" → FINALITY_INVALID
}

// ─── Normalized Event ─────────────────────────────────────────────────────────
//
// Produced only by eventFilter.filterAndNormalize on a passing event.
// All fields are validated and typed. Immutable.

export interface NormalizedEvent {
  readonly provider: string;
  readonly eventType: "jetton_transfer";
  // Source is nullable: absent source is not a rejection.
  // Present source that fails Address.parse is a hard reject (INVALID_ADDRESS).
  readonly sourceAddress: string | null;       // original wire string (audit only)
  readonly sourceCanonicalKey: string | null;  // <workchain>:<hash-hex>, null if absent
  readonly destinationAddress: string;         // original wire string (audit only)
  readonly destinationCanonicalKey: string;    // <workchain>:<hash-hex>
  readonly jettonMaster: string;               // original wire string (audit only)
  readonly jettonMasterCanonicalKey: string;   // <workchain>:<hash-hex>
  readonly amount: bigint;
  readonly amountDecimal: string;              // bigint as /^\d+$/ string
  readonly txHash: string;                     // always non-empty after filter
  readonly traceId: string | null;
  readonly actionIndex: number | null;
  readonly messageHash: string | null;
  readonly lt: string;                         // decimal string, no precision loss
  readonly detectedAt: string;                 // ISO 8601 wall clock (set by filter)
  readonly eventTimestamp: string | null;      // ISO 8601 from block, or null
  readonly finality: "confirmed" | "finalized";
  readonly advisoryProfile?: AdvisoryProfile | null;
}

// ─── Filter Result ────────────────────────────────────────────────────────────

export type FilterResult =
  | { readonly pass: true;  readonly event: NormalizedEvent }
  | { readonly pass: false; readonly reason: RejectionReasonCode; readonly detail: string };

// ─── Profile ─────────────────────────────────────────────────────────────────
//
// profileStatus is always "unresolved" in B2 first pass.
// Profiling RPC calls are not implemented this pass.

export type ProfileStatus = "resolved" | "partial" | "unresolved";

export interface AddressProfile {
  readonly accountStatus: string | null;
  readonly codeHash: string | null;
  readonly walletType: string | null;    // hint only; never a hard gate
  readonly entityLabel: string | null;   // hint only; never a hard gate
}

export interface CandidateProfile {
  readonly destination: AddressProfile;
  readonly source: AddressProfile;
}

// ─── Candidate Record ─────────────────────────────────────────────────────────
//
// Written to candidates.jsonl by the Watcher only.
// Immutable after write. decision is always "pending" when written by the Watcher.
// decisions.jsonl is never written by any Watcher module.

export interface CandidateRecord {
  readonly candidateId: string;           // SHA-256 hex of full candidate key string
  readonly candidateKeyComponents: {
    readonly traceId: string;             // traceId or "notrace"
    readonly txHash: string;
    readonly lt: string;
    readonly actionIndex: string;         // actionIndex or "noaction"
    readonly messageHash: string;         // messageHash or "nomsg"
    readonly jettonMasterCanonicalKey: string;
    readonly destinationCanonicalKey: string;
    readonly amount: string;
  };
  readonly observedByProvider: string;
  readonly sourceEventRef: string;        // txHash; always non-empty
  readonly jettonMaster: string;
  readonly jettonMasterCanonicalKey: string;
  readonly destinationAddress: string;
  readonly destinationCanonicalKey: string;
  readonly sourceAddress: string | null;
  readonly sourceCanonicalKey: string | null;
  readonly amount: string;
  readonly lt: string;
  readonly detectedAt: string;
  readonly eventTimestamp: string | null;
  readonly finality: "confirmed" | "finalized";
  readonly profileStatus: ProfileStatus;
  readonly profile: CandidateProfile;
  readonly decision: "pending";
}

// ─── Candidate Event Record ───────────────────────────────────────────────────
//
// Written to candidate-events.jsonl by the Watcher only.
// rate_cap_data_loss: dropped candidate due to rate cap. Not log-only.
// All drop events that lose a candidate must emit a candidate event record.

export type CandidateEventType =
  | "trace_invalidated"
  | "gap_detected"
  | "replay_started"
  | "replay_completed"
  | "buffer_overflow_data_loss"
  | "rate_cap_data_loss"
  | "duplicate_observation";

export interface CandidateEventRecord {
  readonly eventType: CandidateEventType;
  readonly ts: string;                    // ISO 8601 wall clock
  readonly traceId: string | null;
  readonly candidateId: string | null;
  readonly provider: string | null;
  readonly cursorLt: string | null;
  readonly detail: string | null;
}

// ─── Dedup Store ──────────────────────────────────────────────────────────────
//
// In-memory Map rebuilt from candidates.jsonl on startup.
// No separate dedup log file. seenAt is derived from detectedAt on load.

export interface DedupEntry {
  readonly candidateId: string;
  readonly seenAt: number;               // Unix ms
}

export interface DedupStore {
  isSeen(candidateId: string): boolean;
  markSeen(candidateId: string, seenAt: number): Promise<void>;
  prune(nowMs: number, ttlMs: number): void;
}

// ─── Watcher Cursor ───────────────────────────────────────────────────────────

export interface WatcherCursor {
  readonly lt: string;
  readonly lastEventId: string | null;
  readonly updatedAt: string;            // ISO 8601
}

// ─── Watcher Config ───────────────────────────────────────────────────────────
//
// campaignId comes from WatcherConfig only.
// Do not read environment variables inside lib/watcher modules.

export interface WatcherConfig {
  readonly jettonMasterCanonicalKey: string; // pre-validated at startup
  readonly campaignId: string;
  readonly dedupTtlMs: number;               // default: 72 * 60 * 60 * 1000
  readonly maxCandidatesPerMinute: number;   // default: 500
  readonly dataDir: string;                  // default: "data/candidates"
}

// ─── Clock Provider ───────────────────────────────────────────────────────────
//
// Injectable clock for deterministic tests.
// Production callers pass () => Date.now().
// Tests inject a controlled function that returns a fixed or stepped value.

export type ClockProvider = () => number;

// ─── Deterministic Reconnect Backoff Table ────────────────────────────────────
//
// No jitter. No randomness. Fixed table only.
// Index is attempt count (0-based). Past last entry: repeat last value.
//
// Consumers: use this constant directly, or import getReconnectDelayMs from
// the module that owns reconnect logic (future watcher connection layer).
// The lookup function is not defined here; ingestionTypes.ts is types and
// constants only.

export const RECONNECT_BACKOFF_MS: readonly number[] = [
  1_000,
  2_000,
  4_000,
  8_000,
  16_000,
  30_000,
  60_000,
] as const;