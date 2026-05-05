/**
 * candidateId.ts
 *
 * Deterministic, provider-independent candidate key construction and hashing
 * for the Stage B-2 Watcher ingestion layer.
 *
 * The candidateId must be stable across providers: the same on-chain event
 * observed by two different providers must produce the same candidateId.
 * Provider identity is stored as observation metadata, not as a key component.
 *
 * Key format (fields joined by ":::"):
 *   <traceId|"notrace">:::<txHash>:::<lt>:::<actionIndex|"noaction">:::
 *   <messageHash|"nomsg">:::<jettonMasterCanonicalKey>:::<destinationCanonicalKey>:::<amount>
 *
 * candidateId = SHA-256(keyString), hex-encoded.
 *
 * Hard constraints:
 * - Pure functions. No state. No I/O. No network.
 * - Uses only Node.js built-in crypto module.
 * - txHash is always non-empty here: eventFilter pre-validates it.
 * - No randomness.
 */

import { createHash } from "crypto";
import type { CandidateRecord, NormalizedEvent } from "./ingestionTypes";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the raw candidate key string from a normalized event.
 *
 * All fields that may be absent are replaced with their sentinel strings:
 *   traceId absent    → "notrace"
 *   actionIndex absent → "noaction"
 *   messageHash absent → "nomsg"
 *
 * txHash is always non-empty (eventFilter guarantees this).
 * Canonical keys are always non-empty (eventFilter guarantees this).
 * amount is the validated decimal string (no leading zeros, /^\d+$/).
 */
export function buildCandidateKeyString(event: NormalizedEvent): string {
  const parts: string[] = [
    event.traceId !== null ? event.traceId : "notrace",
    event.txHash,
    event.lt,
    event.actionIndex !== null ? String(event.actionIndex) : "noaction",
    event.messageHash !== null ? event.messageHash : "nomsg",
    event.jettonMasterCanonicalKey,
    event.destinationCanonicalKey,
    event.amountDecimal,
  ];
  return parts.join(":::");
}

/**
 * Returns the SHA-256 hex digest of the candidate key string.
 *
 * This is the candidateId stored in the candidate record and the dedup store.
 */
export function hashCandidateKey(keyString: string): string {
  return createHash("sha256").update(keyString, "utf8").digest("hex");
}

/**
 * Returns the typed candidateKeyComponents object for storage in CandidateRecord.
 *
 * These are the raw components before hashing, preserved for auditability.
 * Sentinels ("notrace", "noaction", "nomsg") appear here exactly as they do
 * in the key string so the record is self-describing.
 */
export function extractCandidateKeyComponents(
  event: NormalizedEvent,
): CandidateRecord["candidateKeyComponents"] {
  return {
    traceId: event.traceId !== null ? event.traceId : "notrace",
    txHash: event.txHash,
    lt: event.lt,
    actionIndex:
      event.actionIndex !== null ? String(event.actionIndex) : "noaction",
    messageHash: event.messageHash !== null ? event.messageHash : "nomsg",
    jettonMasterCanonicalKey: event.jettonMasterCanonicalKey,
    destinationCanonicalKey: event.destinationCanonicalKey,
    amount: event.amountDecimal,
  };
}
