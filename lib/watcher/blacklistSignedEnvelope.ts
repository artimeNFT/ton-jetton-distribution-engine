import { computeSha256Hex } from "./blacklistIntegrity";

export type BlacklistSignedEnvelopeVersion = "blacklist-envelope-v1";
export type BlacklistSignedEnvelopePayloadKind = "blacklist-integrity";

export interface BlacklistSignedEnvelopePayload {
  readonly envelopeVersion: BlacklistSignedEnvelopeVersion;
  readonly payloadKind: BlacklistSignedEnvelopePayloadKind;
  readonly blacklistSha256Hex: string;
  readonly validUntil: string;
  readonly nonce: string;
}

export type BlacklistSignedEnvelopeValidationReason =
  | "envelope_not_object"
  | "invalid_envelope_version"
  | "invalid_payload_kind"
  | "invalid_blacklist_checksum"
  | "invalid_valid_until"
  | "envelope_expired"
  | "missing_nonce"
  | "invalid_nonce";

export type BlacklistSignedEnvelopeValidationResult =
  | { readonly ok: true; readonly action: "accepted" }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: BlacklistSignedEnvelopeValidationReason };

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSaneNonce(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(value);
}

function parseTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function canonicalizeBlacklistSignedEnvelopePayload(
  payload: BlacklistSignedEnvelopePayload,
): string {
  return JSON.stringify({
    envelopeVersion: payload.envelopeVersion,
    payloadKind: payload.payloadKind,
    blacklistSha256Hex: payload.blacklistSha256Hex,
    validUntil: payload.validUntil,
    nonce: payload.nonce,
  });
}

export function buildBlacklistSignedEnvelopePayload(
  input: {
    readonly blacklistContent: string;
    readonly validUntil: string;
    readonly nonce: string;
  },
): BlacklistSignedEnvelopePayload {
  return {
    envelopeVersion: "blacklist-envelope-v1",
    payloadKind: "blacklist-integrity",
    blacklistSha256Hex: computeSha256Hex(input.blacklistContent),
    validUntil: input.validUntil,
    nonce: input.nonce,
  };
}

export function validateBlacklistSignedEnvelopePayload(
  payload: unknown,
  nowIso: string,
): BlacklistSignedEnvelopeValidationResult {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, action: "rejected", reason: "envelope_not_object" };
  }

  const candidate = payload as BlacklistSignedEnvelopePayload;

  if (candidate.envelopeVersion !== "blacklist-envelope-v1") {
    return { ok: false, action: "rejected", reason: "invalid_envelope_version" };
  }

  if (candidate.payloadKind !== "blacklist-integrity") {
    return { ok: false, action: "rejected", reason: "invalid_payload_kind" };
  }

  if (!isSha256Hex(candidate.blacklistSha256Hex)) {
    return { ok: false, action: "rejected", reason: "invalid_blacklist_checksum" };
  }

  const validUntilMs = parseTimestampMs(candidate.validUntil);
  if (validUntilMs === null) {
    return { ok: false, action: "rejected", reason: "invalid_valid_until" };
  }

  const nowMs = parseTimestampMs(nowIso);
  if (nowMs === null) {
    return { ok: false, action: "rejected", reason: "invalid_valid_until" };
  }

  if (nowMs > validUntilMs) {
    return { ok: false, action: "rejected", reason: "envelope_expired" };
  }

  if (!isNonEmptyString(candidate.nonce)) {
    return { ok: false, action: "rejected", reason: "missing_nonce" };
  }

  if (!isSaneNonce(candidate.nonce)) {
    return { ok: false, action: "rejected", reason: "invalid_nonce" };
  }

  return { ok: true, action: "accepted" };
}
