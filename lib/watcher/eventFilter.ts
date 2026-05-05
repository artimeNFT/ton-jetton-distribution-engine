/**
 * eventFilter.ts
 *
 * Stateless filter and field extractor for the Stage B-2 Watcher ingestion layer.
 *
 * B2 first pass: accepts only RawProviderEvent with provider === "fixture".
 * TonAPI- and TonCenter-specific payload extractors are not implemented here.
 * They are gated on approved real fixture samples and belong to a future pass.
 *
 * Hard constraints:
 * - No state. No I/O. No network. No logging.
 * - All Address.parse calls go through canonicalAddress.ts.
 * - Returns FilterResult; never throws.
 * - detectedAt is taken from raw.receivedAt (not an internal new Date() call),
 *   so the output is fully determined by the inputs.
 * - TIMESTAMP_INVALID does not exist: invalid eventTimestamp silently → null.
 * - FINALITY_INVALID is a hard reject for any finality value that is not
 *   exactly "confirmed" or "finalized".
 * - Missing txHash is a hard reject (MISSING_TX_HASH).
 * - Missing sourceAddress is not a rejection; both source fields → null.
 * - Present sourceAddress that fails Address.parse → INVALID_ADDRESS reject.
 */

import { deriveCanonicalKey, matchesJettonMaster } from "./canonicalAddress";
import type {
  FilterResult,
  NormalizedEvent,
  RawProviderEvent,
  RejectionReasonCode,
} from "./ingestionTypes";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Filters and normalizes a raw provider event.
 *
 * Returns { pass: true, event: NormalizedEvent } on success.
 * Returns { pass: false, reason, detail } on any validation failure.
 *
 * detectedAt is taken from raw.receivedAt. The output is therefore fully
 * determined by the inputs; no internal wall-clock reads occur.
 *
 * All execution-critical determinism (candidateId, dedup, rate cap) is
 * handled downstream, not here.
 */
export function filterAndNormalize(
  raw: RawProviderEvent,
  jettonMasterCanonicalKey: string,
): FilterResult {
  const p = raw.payload;
  const provider = raw.provider;

  // ── 1. Event type ──────────────────────────────────────────────────────────
  if (typeof p.eventType !== "string") {
    return reject("UNKNOWN_EVENT_SHAPE", "eventType field is not a string");
  }
  if (p.eventType !== "jetton_transfer") {
    return reject(
      "UNSUPPORTED_EVENT_TYPE",
      `eventType is ${JSON.stringify(p.eventType)}, expected "jetton_transfer"`,
    );
  }

  // ── 2. Jetton Master ───────────────────────────────────────────────────────
  if (typeof p.jettonMaster !== "string" || p.jettonMaster.trim().length === 0) {
    return reject("INVALID_ADDRESS", "jettonMaster field is absent or empty");
  }
  const jettonMasterResult = deriveCanonicalKey(p.jettonMaster);
  if (!jettonMasterResult.ok) {
    return reject("INVALID_ADDRESS", jettonMasterResult.detail);
  }
  if (!matchesJettonMaster(jettonMasterResult.key, jettonMasterCanonicalKey)) {
    return reject(
      "MASTER_MISMATCH",
      `jettonMaster canonical key ${jettonMasterResult.key} does not match configured key ${jettonMasterCanonicalKey}`,
    );
  }

  // ── 3. Destination ────────────────────────────────────────────────────────
  if (
    typeof p.destinationAddress !== "string" ||
    p.destinationAddress.trim().length === 0
  ) {
    return reject("MISSING_DESTINATION", "destinationAddress is absent or empty");
  }
  const destResult = deriveCanonicalKey(p.destinationAddress);
  if (!destResult.ok) {
    return reject("INVALID_ADDRESS", destResult.detail);
  }

  // ── 4. Source (nullable — absent is not a rejection) ─────────────────────
  const sourceResult = extractSource(p.sourceAddress);
  if (!sourceResult.ok) {
    return reject("INVALID_ADDRESS", sourceResult.detail);
  }

  // ── 5. txHash (required) ──────────────────────────────────────────────────
  if (
    typeof p.txHash !== "string" ||
    p.txHash.trim().length === 0
  ) {
    return reject("MISSING_TX_HASH", "txHash is absent or empty");
  }
  const txHash = p.txHash.trim();

  // ── 6. lt ─────────────────────────────────────────────────────────────────
  const ltResult = validateLt(p.lt);
  if (!ltResult.ok) {
    return reject("MISSING_LT", ltResult.detail);
  }

  // ── 7. Amount ─────────────────────────────────────────────────────────────
  const amountResult = validateAmount(p.amount);
  if (!amountResult.ok) {
    return reject(amountResult.reason, amountResult.detail);
  }

  // ── 8. Finality (hard reject on invalid value) ────────────────────────────
  const finality = validateFinality(p.finality);
  if (finality === null) {
    return reject(
      "FINALITY_INVALID",
      `finality must be "confirmed" or "finalized", got ${JSON.stringify(p.finality)}`,
    );
  }

  // ── 9. eventTimestamp (optional; invalid → null, never a reject) ──────────
  const eventTimestamp = normalizeEventTimestamp(p.eventTimestamp);

  // ── 10. Optional fields ───────────────────────────────────────────────────
  const traceId =
    typeof p.traceId === "string" && p.traceId.trim().length > 0
      ? p.traceId.trim()
      : null;

  const actionIndex =
    typeof p.actionIndex === "number" &&
    Number.isInteger(p.actionIndex) &&
    p.actionIndex >= 0
      ? p.actionIndex
      : null;

  const messageHash =
    typeof p.messageHash === "string" && p.messageHash.trim().length > 0
      ? p.messageHash.trim()
      : null;

  // ── Assemble NormalizedEvent ──────────────────────────────────────────────
  const event: NormalizedEvent = {
    provider,
    eventType: "jetton_transfer",
    sourceAddress: sourceResult.address,
    sourceCanonicalKey: sourceResult.canonicalKey,
    destinationAddress: p.destinationAddress,
    destinationCanonicalKey: destResult.key,
    jettonMaster: p.jettonMaster,
    jettonMasterCanonicalKey: jettonMasterResult.key,
    amount: amountResult.amount,
    amountDecimal: amountResult.decimal,
    txHash,
    traceId,
    actionIndex,
    messageHash,
    lt: ltResult.lt,
    detectedAt: raw.receivedAt,
    eventTimestamp,
    finality,
  };

  return { pass: true, event };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────
// Not exported. Tested only through filterAndNormalize.

function reject(
  reason: RejectionReasonCode,
  detail: string,
): FilterResult {
  return { pass: false, reason, detail };
}

/**
 * Validates and normalizes the amount field.
 *
 * Accepts a raw string, trims it, validates /^\d+$/, converts to bigint.
 * Rejects zero or negative values.
 */
function validateAmount(
  raw: unknown,
):
  | { ok: true; amount: bigint; decimal: string }
  | {
      ok: false;
      reason: "AMOUNT_NON_INTEGER" | "AMOUNT_NON_POSITIVE";
      detail: string;
    } {
  if (typeof raw !== "string") {
    return {
      ok: false,
      reason: "AMOUNT_NON_INTEGER",
      detail: `amount is not a string: ${JSON.stringify(raw)}`,
    };
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      reason: "AMOUNT_NON_INTEGER",
      detail: `amount does not match /^\\d+$/: ${JSON.stringify(trimmed)}`,
    };
  }
  const amount = BigInt(trimmed);
  if (amount <= 0n) {
    return {
      ok: false,
      reason: "AMOUNT_NON_POSITIVE",
      detail: `amount must be positive, got ${trimmed}`,
    };
  }
  // Use amount.toString() — not the raw trimmed string — so that equivalent
  // amounts with different representations ("001" vs "1") produce identical
  // amountDecimal values and therefore identical candidateId hashes.
  return { ok: true, amount, decimal: amount.toString() };
}

/**
 * Validates the lt field.
 *
 * lt must be a non-empty string whose trimmed value is a non-negative decimal
 * integer. Stored as a string to avoid precision loss on large logical times.
 */
function validateLt(
  raw: unknown,
): { ok: true; lt: string } | { ok: false; detail: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, detail: `lt is absent or empty: ${JSON.stringify(raw)}` };
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      detail: `lt does not match /^\\d+$/: ${JSON.stringify(trimmed)}`,
    };
  }
  // Verify it can be represented as a non-negative integer (BigInt check).
  if (BigInt(trimmed) < 0n) {
    return { ok: false, detail: `lt is negative: ${trimmed}` };
  }
  return { ok: true, lt: trimmed };
}

/**
 * Validates the finality field.
 *
 * Returns "confirmed" | "finalized" on success, null on any other value.
 * Null triggers FINALITY_INVALID hard reject in the caller.
 */
function validateFinality(raw: unknown): "confirmed" | "finalized" | null {
  if (raw === "confirmed" || raw === "finalized") {
    return raw;
  }
  return null;
}

/**
 * Normalizes the eventTimestamp field.
 *
 * Returns an ISO 8601 string if the value is present and parseable as a date.
 * Returns null for absent, null, undefined, or unparseable values.
 *
 * Never causes a rejection. TIMESTAMP_INVALID does not exist in B2 first pass.
 */
function normalizeEventTimestamp(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  // Accept ISO 8601 strings and Unix epoch strings (all-digit).
  // Verify parseability via Date; store as ISO 8601.
  const trimmed = raw.trim();
  const asUnix = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  const candidate = Number.isFinite(asUnix)
    ? new Date(asUnix * 1000)
    : new Date(trimmed);

  if (isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString();
}

/**
 * Extracts the source address fields.
 *
 * If sourceAddress is absent, null, or undefined: ok true, both fields null.
 * If sourceAddress is a non-empty string: parse it.
 *   - Parse success: ok true, both fields populated.
 *   - Parse failure: ok false → INVALID_ADDRESS hard reject.
 */
function extractSource(raw: string | null | undefined):
  | { ok: true; address: string | null; canonicalKey: string | null }
  | { ok: false; detail: string } {
  if (raw == null || (typeof raw === "string" && raw.trim().length === 0)) {
    return { ok: true, address: null, canonicalKey: null };
  }
  if (typeof raw !== "string") {
    return {
      ok: false,
      detail: `sourceAddress is not a string: ${JSON.stringify(raw)}`,
    };
  }
  const result = deriveCanonicalKey(raw);
  if (!result.ok) {
    return { ok: false, detail: result.detail };
  }
  return { ok: true, address: raw, canonicalKey: result.key };
}