import { createHash } from "node:crypto";

export type BlacklistIntegrityReason =
  | "blacklist_missing"
  | "expected_checksum_missing"
  | "invalid_expected_checksum"
  | "checksum_mismatch";

export type BlacklistIntegrityResult =
  | { readonly ok: true; readonly checksum: string }
  | { readonly ok: false; readonly reason: BlacklistIntegrityReason; readonly checksum?: string };

export interface BlacklistIntegrityInput {
  readonly blacklistContent: string | null;
  readonly expectedSha256Hex: string | null;
  readonly required: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function computeSha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function verifyBlacklistIntegrity(
  input: BlacklistIntegrityInput,
): BlacklistIntegrityResult {
  if (!isNonEmptyString(input.blacklistContent)) {
    return input.required
      ? { ok: false, reason: "blacklist_missing" }
      : { ok: true, checksum: computeSha256Hex("") };
  }

  if (!isNonEmptyString(input.expectedSha256Hex)) {
    return { ok: false, reason: "expected_checksum_missing" };
  }

  const expected = input.expectedSha256Hex.trim().toLowerCase();
  if (!isSha256Hex(expected)) {
    return { ok: false, reason: "invalid_expected_checksum" };
  }

  const actual = computeSha256Hex(input.blacklistContent);
  if (actual !== expected) {
    return { ok: false, reason: "checksum_mismatch", checksum: actual };
  }

  return { ok: true, checksum: actual };
}
