import * as assert from "assert/strict";
import { loadBlacklistSignatureConfigFromEnv } from "../lib/watcher/blacklistSignatureConfig";

const LABEL = "[e-preflight-3-signature-config-loader-smoke]";

const PUBLIC_KEY_HEX =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

const SIGNATURE_HEX =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
  "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

function testMissingConfigSkipsOptional(): void {
  assert.deepEqual(loadBlacklistSignatureConfigFromEnv({}), {
    ok: true,
    action: "skipped_optional",
    config: null,
    reason: "signature_config_missing",
  });
}

function testValidConfigLoads(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: "ed25519",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: PUBLIC_KEY_HEX,
      BLACKLIST_SIGNATURE_HEX: SIGNATURE_HEX,
    }),
    {
      ok: true,
      action: "loaded",
      config: {
        algorithm: "ed25519",
        publicKeyHex: PUBLIC_KEY_HEX,
        signatureHex: SIGNATURE_HEX,
      },
    },
  );
}

function testPartialConfigFailsClosed(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: "ed25519",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: PUBLIC_KEY_HEX,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "partial_signature_config",
    },
  );
}

function testUnsupportedAlgorithmFailsClosed(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: "rsa",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: PUBLIC_KEY_HEX,
      BLACKLIST_SIGNATURE_HEX: SIGNATURE_HEX,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "unsupported_signature_algorithm",
    },
  );
}

function testInvalidPublicKeyFailsClosed(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: "ed25519",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: "not-a-public-key",
      BLACKLIST_SIGNATURE_HEX: SIGNATURE_HEX,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_public_key_hex",
    },
  );
}

function testInvalidSignatureFailsClosed(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: "ed25519",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: PUBLIC_KEY_HEX,
      BLACKLIST_SIGNATURE_HEX: "not-a-signature",
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_signature_hex",
    },
  );
}

function main(): void {
  testMissingConfigSkipsOptional();
  testValidConfigLoads();
  testPartialConfigFailsClosed();
  testUnsupportedAlgorithmFailsClosed();
  testInvalidPublicKeyFailsClosed();
  testInvalidSignatureFailsClosed();
  testConfigWhitespaceAndCaseAreNormalized();

  console.log(`${LABEL} PASS`);
}

main();

function testConfigWhitespaceAndCaseAreNormalized(): void {
  assert.deepEqual(
    loadBlacklistSignatureConfigFromEnv({
      BLACKLIST_SIGNATURE_ALGORITHM: " ed25519 ",
      BLACKLIST_SIGNER_PUBLIC_KEY_HEX: ` ${PUBLIC_KEY_HEX.toUpperCase()} `,
      BLACKLIST_SIGNATURE_HEX: ` ${SIGNATURE_HEX.toUpperCase()} `,
    }),
    {
      ok: true,
      action: "loaded",
      config: {
        algorithm: "ed25519",
        publicKeyHex: PUBLIC_KEY_HEX,
        signatureHex: SIGNATURE_HEX,
      },
    },
  );
}
