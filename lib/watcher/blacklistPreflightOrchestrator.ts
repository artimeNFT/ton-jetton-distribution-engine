import {
  verifyBlacklistIntegrity,
  type BlacklistIntegrityReason,
} from "./blacklistIntegrity";
import {
  verifyBlacklistSignature,
  type BlacklistSignatureConfig,
  type BlacklistSignatureVerificationReason,
} from "./blacklistSignature";
import {
  validateBlacklistSignedEnvelopePayload,
  canonicalizeBlacklistSignedEnvelopePayload,
  type BlacklistSignedEnvelopePayload,
  type BlacklistSignedEnvelopeValidationReason,
} from "./blacklistSignedEnvelope";
import {
  validateBlacklistEnvelopeFreshness,
  type BlacklistEnvelopeFreshnessPolicy,
  type BlacklistEnvelopeFreshnessPolicyReason,
} from "./blacklistEnvelopeFreshnessPolicy";
import {
  validateBlacklistReplayNonce,
  type BlacklistNonceRegistryView,
  type BlacklistReplayNonceReason,
} from "./blacklistReplayNonce";

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type BlacklistPreflightOrchestratorReason =
  | "administrative_halt"
  | "invalid_input"
  | "invalid_traceability"
  | "signature_config_missing_for_nonce"
  | `envelope_${BlacklistSignedEnvelopeValidationReason}`
  | `integrity_${BlacklistIntegrityReason}`
  | `signature_${BlacklistSignatureVerificationReason}`
  | `freshness_${BlacklistEnvelopeFreshnessPolicyReason}`
  | `replay_nonce_${BlacklistReplayNonceReason}`;

// ---------------------------------------------------------------------------
// Traceability
// ---------------------------------------------------------------------------

export interface BlacklistPreflightTraceability {
  readonly lt: string;
  readonly traceId: string | null;
}

// ---------------------------------------------------------------------------
// Accepted metadata
// ---------------------------------------------------------------------------

export interface BlacklistPreflightOrchestratorMetadata {
  readonly envelopeVersion: "blacklist-envelope-v1";
  readonly payloadKind: "blacklist-integrity";
  readonly signerPublicKeyHex: string;
  readonly checksum: string;
  readonly nonce: string;
  readonly replayKey: string;
  readonly priority: null;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type BlacklistPreflightOrchestratorResult =
  | {
      readonly ok: true;
      readonly action: "accepted";
      readonly traceability: BlacklistPreflightTraceability;
      readonly metadata: BlacklistPreflightOrchestratorMetadata;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: BlacklistPreflightOrchestratorReason;
      readonly traceability: BlacklistPreflightTraceability | null;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

export interface BlacklistPreflightOrchestratorInput {
  readonly administrativeHalt: boolean;
  readonly blacklistContent: string | null;
  readonly envelopePayload: unknown;
  readonly nowIso: string;
  readonly freshnessPolicy: BlacklistEnvelopeFreshnessPolicy;
  readonly signatureConfig: BlacklistSignatureConfig | null;
  readonly nonceRegistry: BlacklistNonceRegistryView;
  readonly traceability: { lt: string; traceId: string | null };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDecimalString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function isValidTraceability(
  value: unknown,
): value is BlacklistPreflightTraceability {
  if (!isNonArrayObject(value)) {
    return false;
  }
  const lt = value["lt"];
  if (typeof lt !== "string" || !isDecimalString(lt)) {
    return false;
  }
  const traceId = value["traceId"];
  if (traceId === null) {
    return true;
  }
  if (typeof traceId !== "string") {
    return false;
  }
  return traceId.trim().length > 0;
}

function isValidSignatureConfigField(
  value: unknown,
): value is BlacklistSignatureConfig | null {
  return value === null || isNonArrayObject(value);
}

function rejectedNoTrace(
  reason: BlacklistPreflightOrchestratorReason,
): BlacklistPreflightOrchestratorResult {
  return { ok: false, action: "rejected", reason, traceability: null };
}

function rejected(
  reason: BlacklistPreflightOrchestratorReason,
  traceability: BlacklistPreflightTraceability,
): BlacklistPreflightOrchestratorResult {
  return { ok: false, action: "rejected", reason, traceability };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function runBlacklistPreflight(
  input: unknown,
): BlacklistPreflightOrchestratorResult {
  // Step 1: structural guard
  if (!isNonArrayObject(input)) {
    return rejectedNoTrace("invalid_input");
  }

  const candidate = input as unknown as BlacklistPreflightOrchestratorInput;

  // Step 2: administrativeHalt type guard — must be boolean before reading it
  if (typeof candidate.administrativeHalt !== "boolean") {
    return rejectedNoTrace("invalid_input");
  }

  // Step 3: administrativeHalt — fires before any downstream validator
  if (candidate.administrativeHalt === true) {
    return rejectedNoTrace("administrative_halt");
  }

  // Step 4: traceability
  if (!isValidTraceability(candidate.traceability)) {
    return rejectedNoTrace("invalid_traceability");
  }

  const traceability: BlacklistPreflightTraceability = {
    lt: candidate.traceability.lt,
    traceId: candidate.traceability.traceId,
  };

  // Step 5: signed envelope payload validation
  const envelopeResult = validateBlacklistSignedEnvelopePayload(
    candidate.envelopePayload,
    candidate.nowIso,
  );

  if (!envelopeResult.ok) {
    return rejected(`envelope_${envelopeResult.reason}`, traceability);
  }

  const validatedPayload = candidate.envelopePayload as BlacklistSignedEnvelopePayload;

  // Step 6: blacklist integrity
  const integrityResult = verifyBlacklistIntegrity({
    blacklistContent: candidate.blacklistContent,
    expectedSha256Hex: validatedPayload.blacklistSha256Hex,
    required: true,
  });

  if (!integrityResult.ok) {
    return rejected(`integrity_${integrityResult.reason}`, traceability);
  }

  // Step 7: canonicalize envelope payload
  const canonicalPayload =
    canonicalizeBlacklistSignedEnvelopePayload(validatedPayload);

  // Step 8: fail-closed guard on signatureConfig before verifyBlacklistSignature
  if (!isValidSignatureConfigField(candidate.signatureConfig)) {
    return rejected("invalid_input", traceability);
  }

  // Step 9: signature verification over the canonical envelope payload
  const signatureResult = verifyBlacklistSignature({
    blacklistContent: canonicalPayload,
    signatureConfig: candidate.signatureConfig,
  });

  if (!signatureResult.ok) {
    return rejected(`signature_${signatureResult.reason}`, traceability);
  }

  // Step 10: freshness check
  const freshnessResult = validateBlacklistEnvelopeFreshness({
    validUntil: validatedPayload.validUntil,
    nowIso: candidate.nowIso,
    policy: candidate.freshnessPolicy,
  });

  if (!freshnessResult.ok) {
    return rejected(`freshness_${freshnessResult.reason}`, traceability);
  }

  // Step 11: signer identity guard — nonce must be bound to a known signer
  const signatureConfig = candidate.signatureConfig;
  if (signatureConfig === null) {
    return rejected("signature_config_missing_for_nonce", traceability);
  }

  // Normalize signer public key hex once; used in nonce binding and metadata
  const normalizedSignerPublicKeyHex = signatureConfig.publicKeyHex.trim().toLowerCase();

  // Step 12: replay nonce validation, bound to normalized signer identity
  const nonceResult = validateBlacklistReplayNonce({
    nonce: validatedPayload.nonce,
    signerPublicKeyHex: normalizedSignerPublicKeyHex,
    registry: candidate.nonceRegistry,
  });

  if (!nonceResult.ok) {
    return rejected(`replay_nonce_${nonceResult.reason}`, traceability);
  }

  // Step 13: final freshness re-check using the same nowIso (deterministic guard)
  const finalFreshnessResult = validateBlacklistEnvelopeFreshness({
    validUntil: validatedPayload.validUntil,
    nowIso: candidate.nowIso,
    policy: candidate.freshnessPolicy,
  });

  if (!finalFreshnessResult.ok) {
    return rejected(`freshness_${finalFreshnessResult.reason}`, traceability);
  }

  // Step 14: all checks passed — immutable accepted result
  return {
    ok: true,
    action: "accepted",
    traceability,
    metadata: {
      envelopeVersion: "blacklist-envelope-v1",
      payloadKind: "blacklist-integrity",
      signerPublicKeyHex: normalizedSignerPublicKeyHex,
      checksum: validatedPayload.blacklistSha256Hex,
      nonce: nonceResult.nonce,
      replayKey: nonceResult.replayKey,
      priority: null,
    },
  };
}