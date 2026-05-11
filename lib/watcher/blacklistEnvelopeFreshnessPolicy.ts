export type BlacklistEnvelopeFreshnessPolicyReason =
  | "invalid_input"
  | "invalid_now"
  | "invalid_valid_until"
  | "invalid_policy"
  | "invalid_max_future_validity_ms"
  | "envelope_expired"
  | "envelope_valid_too_far_in_future";

export type BlacklistEnvelopeFreshnessPolicyResult =
  | { readonly ok: true; readonly action: "accepted" }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: BlacklistEnvelopeFreshnessPolicyReason };

export interface BlacklistEnvelopeFreshnessPolicy {
  readonly maxFutureValidityMs: number;
}

export interface ValidateBlacklistEnvelopeFreshnessInput {
  readonly validUntil: string;
  readonly nowIso: string;
  readonly policy: BlacklistEnvelopeFreshnessPolicy;
}

function parseTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isValidMaxFutureValidityMs(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function validateBlacklistEnvelopeFreshness(
  input: unknown,
): BlacklistEnvelopeFreshnessPolicyResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, action: "rejected", reason: "invalid_input" };
  }

  const candidate = input as ValidateBlacklistEnvelopeFreshnessInput;

  const nowMs = parseTimestampMs(candidate.nowIso);
  if (nowMs === null) {
    return { ok: false, action: "rejected", reason: "invalid_now" };
  }

  const validUntilMs = parseTimestampMs(candidate.validUntil);
  if (validUntilMs === null) {
    return { ok: false, action: "rejected", reason: "invalid_valid_until" };
  }

  if (candidate.policy === null || typeof candidate.policy !== "object") {
    return { ok: false, action: "rejected", reason: "invalid_policy" };
  }

  if (!isValidMaxFutureValidityMs(candidate.policy.maxFutureValidityMs)) {
    return { ok: false, action: "rejected", reason: "invalid_max_future_validity_ms" };
  }

  if (nowMs > validUntilMs) {
    return { ok: false, action: "rejected", reason: "envelope_expired" };
  }

  const futureValidityMs = validUntilMs - nowMs;
  if (futureValidityMs > candidate.policy.maxFutureValidityMs) {
    return {
      ok: false,
      action: "rejected",
      reason: "envelope_valid_too_far_in_future",
    };
  }

  return { ok: true, action: "accepted" };
}
