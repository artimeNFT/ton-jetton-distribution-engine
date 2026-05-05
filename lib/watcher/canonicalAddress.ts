/**
 * canonicalAddress.ts
 *
 * Address.parse wrapper and canonical key derivation for the Stage B-2 Watcher.
 *
 * Scope rule: All Address.parse calls inside the new lib/watcher modules must
 * go through this file. Existing non-watcher modules are out of scope.
 *
 * Canonical key format: "<workchain>:<hash-hex-lowercase>"
 * This matches Address.toRawString() from @ton/core, which returns exactly
 * this format. The canonical key is:
 *   - Stable across address representations (bounceable, non-bounceable, raw)
 *   - Independent of provider encoding choices
 *   - Safe to use for equality checks and Map keys
 *   - Never produced by lowercasing a user-friendly address string
 *
 * Hard constraints:
 * - No logging. Callers handle structured log output.
 * - No I/O.
 * - No state.
 * - Never throws. All errors are returned as typed Result values.
 */

import { Address } from "@ton/core";

// ─── Result Types ─────────────────────────────────────────────────────────────

export type CanonicalKeyOk = { readonly ok: true; readonly key: string };
export type CanonicalKeyErr = {
  readonly ok: false;
  readonly reason: "INVALID_ADDRESS";
  readonly detail: string;
};
export type CanonicalKeyResult = CanonicalKeyOk | CanonicalKeyErr;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derives a canonical key from a raw address string.
 *
 * Returns ok: true with key "<workchain>:<hash-hex-lowercase>" on success.
 * Returns ok: false with reason "INVALID_ADDRESS" on any parse failure.
 *
 * Never throws. Callers must handle both branches explicitly.
 *
 * The key is derived via Address.toRawString(), which is stable across all
 * valid TON address representations. Lowercasing the input is never applied.
 */
export function deriveCanonicalKey(raw: string): CanonicalKeyResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      ok: false,
      reason: "INVALID_ADDRESS",
      detail: `Address input is empty or not a string: ${JSON.stringify(raw)}`,
    };
  }

  try {
    const parsed = Address.parse(raw);
    // toRawString() returns "<workchain>:<hash-hex-lowercase>",
    // e.g. "0:f814fabe3d10e27b240a922cc54d1b520f2b9c508aab8f4bffcd7266a9a0e9eb"
    const key = parsed.toRawString();
    return { ok: true, key };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "INVALID_ADDRESS",
      detail: `Address.parse failed for ${JSON.stringify(raw)}: ${msg}`,
    };
  }
}

/**
 * Returns true iff the two canonical key strings are strictly equal.
 *
 * Both arguments must already be derived canonical keys (output of
 * deriveCanonicalKey). Raw address strings must not be passed here.
 *
 * Pure. No Address.parse call.
 */
export function matchesJettonMaster(
  derived: string,
  configuredKey: string,
): boolean {
  return derived === configuredKey;
}
