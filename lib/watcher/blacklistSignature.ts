import { createPublicKey, verify } from "node:crypto";

export type BlacklistSignatureAlgorithm = "ed25519";

export type BlacklistSignatureVerificationReason =
  | "signature_config_missing"
  | "unsupported_signature_algorithm"
  | "public_key_missing"
  | "invalid_public_key_hex"
  | "signature_missing"
  | "invalid_signature_hex"
  | "signature_invalid"
  | "signature_verification_failed";

export type BlacklistSignatureVerificationResult =
  | { readonly ok: true; readonly action: "verified" }
  | { readonly ok: true; readonly action: "skipped_optional"; readonly reason: "signature_config_missing" }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: BlacklistSignatureVerificationReason };

export interface BlacklistSignatureConfig {
  readonly algorithm: BlacklistSignatureAlgorithm;
  readonly publicKeyHex: string;
  readonly signatureHex: string;
}

export interface BlacklistSignatureVerificationInput {
  readonly blacklistContent: string;
  readonly signatureConfig: BlacklistSignatureConfig | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHexOfBytes(value: string, bytes: number): boolean {
  return new RegExp(`^[a-fA-F0-9]{${bytes * 2}}$`).test(value);
}

function rawEd25519PublicKeyToDer(publicKey: Buffer): Buffer {
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return Buffer.concat([spkiPrefix, publicKey]);
}

export function verifyBlacklistSignature(
  input: BlacklistSignatureVerificationInput,
): BlacklistSignatureVerificationResult {
  if (input.signatureConfig === null) {
    return {
      ok: true,
      action: "skipped_optional",
      reason: "signature_config_missing",
    };
  }

  if (input.signatureConfig.algorithm !== "ed25519") {
    return {
      ok: false,
      action: "rejected",
      reason: "unsupported_signature_algorithm",
    };
  }

  if (!isNonEmptyString(input.signatureConfig.publicKeyHex)) {
    return { ok: false, action: "rejected", reason: "public_key_missing" };
  }

  const publicKeyHex = input.signatureConfig.publicKeyHex.trim();
  if (!isHexOfBytes(publicKeyHex, 32)) {
    return { ok: false, action: "rejected", reason: "invalid_public_key_hex" };
  }

  if (!isNonEmptyString(input.signatureConfig.signatureHex)) {
    return { ok: false, action: "rejected", reason: "signature_missing" };
  }

  const signatureHex = input.signatureConfig.signatureHex.trim();
  if (!isHexOfBytes(signatureHex, 64)) {
    return { ok: false, action: "rejected", reason: "invalid_signature_hex" };
  }

  try {
    const publicKey = createPublicKey({
      key: rawEd25519PublicKeyToDer(Buffer.from(publicKeyHex, "hex")),
      format: "der",
      type: "spki",
    });

    const signature = Buffer.from(signatureHex, "hex");
    const content = Buffer.from(input.blacklistContent, "utf8");

    const verified = verify(null, content, publicKey, signature);

    return verified
      ? { ok: true, action: "verified" }
      : { ok: false, action: "rejected", reason: "signature_invalid" };
  } catch {
    return { ok: false, action: "rejected", reason: "signature_verification_failed" };
  }
}
