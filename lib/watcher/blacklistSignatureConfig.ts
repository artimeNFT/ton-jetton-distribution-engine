import type {
  BlacklistSignatureConfig,
  BlacklistSignatureAlgorithm,
} from "./blacklistSignature";

export type BlacklistSignatureConfigLoadReason =
  | "signature_config_missing"
  | "partial_signature_config"
  | "unsupported_signature_algorithm"
  | "invalid_public_key_hex"
  | "invalid_signature_hex";

export type BlacklistSignatureConfigLoadResult =
  | { readonly ok: true; readonly action: "loaded"; readonly config: BlacklistSignatureConfig }
  | { readonly ok: true; readonly action: "skipped_optional"; readonly config: null; readonly reason: "signature_config_missing" }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: BlacklistSignatureConfigLoadReason };

export interface BlacklistSignatureEnv {
  readonly BLACKLIST_SIGNATURE_ALGORITHM?: string;
  readonly BLACKLIST_SIGNER_PUBLIC_KEY_HEX?: string;
  readonly BLACKLIST_SIGNATURE_HEX?: string;
}

function normalizeOptionalEnv(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isHexOfBytes(value: string, bytes: number): boolean {
  return new RegExp(`^[a-fA-F0-9]{${bytes * 2}}$`).test(value);
}

function isSupportedAlgorithm(value: string): value is BlacklistSignatureAlgorithm {
  return value === "ed25519";
}

export function loadBlacklistSignatureConfigFromEnv(
  env: BlacklistSignatureEnv,
): BlacklistSignatureConfigLoadResult {
  const algorithm = normalizeOptionalEnv(env.BLACKLIST_SIGNATURE_ALGORITHM);
  const publicKeyHex = normalizeOptionalEnv(env.BLACKLIST_SIGNER_PUBLIC_KEY_HEX);
  const signatureHex = normalizeOptionalEnv(env.BLACKLIST_SIGNATURE_HEX);

  if (algorithm === null && publicKeyHex === null && signatureHex === null) {
    return {
      ok: true,
      action: "skipped_optional",
      config: null,
      reason: "signature_config_missing",
    };
  }

  if (algorithm === null || publicKeyHex === null || signatureHex === null) {
    return { ok: false, action: "rejected", reason: "partial_signature_config" };
  }

  if (!isSupportedAlgorithm(algorithm)) {
    return { ok: false, action: "rejected", reason: "unsupported_signature_algorithm" };
  }

  if (!isHexOfBytes(publicKeyHex, 32)) {
    return { ok: false, action: "rejected", reason: "invalid_public_key_hex" };
  }

  if (!isHexOfBytes(signatureHex, 64)) {
    return { ok: false, action: "rejected", reason: "invalid_signature_hex" };
  }

  return {
    ok: true,
    action: "loaded",
    config: {
      algorithm,
      publicKeyHex: publicKeyHex.toLowerCase(),
      signatureHex: signatureHex.toLowerCase(),
    },
  };
}
