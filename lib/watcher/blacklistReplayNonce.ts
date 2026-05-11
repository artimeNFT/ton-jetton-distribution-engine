export type BlacklistReplayNonceReason =
  | "missing_nonce"
  | "invalid_nonce"
  | "invalid_input"
  | "missing_signer"
  | "invalid_signer"
  | "invalid_registry"
  | "duplicate_nonce";

export type BlacklistReplayNonceResult =
  | { readonly ok: true; readonly action: "accepted"; readonly nonce: string; readonly replayKey: string }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: BlacklistReplayNonceReason };

export interface BlacklistNonceRegistryView {
  readonly has: (replayKey: string) => boolean;
}

export interface BlacklistReplayNonceInput {
  readonly nonce: unknown;
  readonly signerPublicKeyHex: unknown;
  readonly registry: unknown;
}

const REPLAY_NONCE_DOMAIN = "blacklist-replay-nonce:v1:";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStrictLowercaseHex(value: string, byteLength: number): boolean {
  return new RegExp(`^[a-f0-9]{${byteLength * 2}}$`).test(value);
}

function isValidRegistry(value: unknown): value is BlacklistNonceRegistryView {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)["has"] === "function"
  );
}

export function buildReplayKey(signerPublicKeyHex: string, nonce: string): string {
  return `${REPLAY_NONCE_DOMAIN}${signerPublicKeyHex}:${nonce}`;
}

export function validateBlacklistReplayNonce(
  input: unknown,
): BlacklistReplayNonceResult {
  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, action: "rejected", reason: "invalid_input" };
  }

  const candidate = input as BlacklistReplayNonceInput;

  if (!isNonEmptyString(candidate.signerPublicKeyHex)) {
    return { ok: false, action: "rejected", reason: "missing_signer" };
  }

  const normalizedSigner = (candidate.signerPublicKeyHex as string).trim().toLowerCase();

  if (!isStrictLowercaseHex(normalizedSigner, 32)) {
    return { ok: false, action: "rejected", reason: "invalid_signer" };
  }

  if (!isNonEmptyString(candidate.nonce)) {
    return { ok: false, action: "rejected", reason: "missing_nonce" };
  }

  const normalizedNonce = (candidate.nonce as string).trim();

  if (!isStrictLowercaseHex(normalizedNonce, 32)) {
    return { ok: false, action: "rejected", reason: "invalid_nonce" };
  }

  if (!isValidRegistry(candidate.registry)) {
    return { ok: false, action: "rejected", reason: "invalid_registry" };
  }

  const registry = candidate.registry as BlacklistNonceRegistryView;
  const replayKey = buildReplayKey(normalizedSigner, normalizedNonce);

  let seen: unknown;
  try {
    seen = registry.has(replayKey);
  } catch {
    return { ok: false, action: "rejected", reason: "invalid_registry" };
  }

  if (typeof seen !== "boolean") {
    return { ok: false, action: "rejected", reason: "invalid_registry" };
  }

  if (seen) {
    return { ok: false, action: "rejected", reason: "duplicate_nonce" };
  }

  return { ok: true, action: "accepted", nonce: normalizedNonce, replayKey };
}
