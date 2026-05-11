import * as assert from "assert/strict";
import { verifyBlacklistSignature } from "../lib/watcher/blacklistSignature";

const LABEL = "[e-preflight-2-blacklist-signature-verification-smoke]";

const RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

const RFC_ED25519_EMPTY_MESSAGE_SIGNATURE =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
  "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

function testMissingSignatureConfigSkipsOptional(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "[]",
      signatureConfig: null,
    }),
    {
      ok: true,
      action: "skipped_optional",
      reason: "signature_config_missing",
    },
  );
}

function testValidEd25519SignaturePasses(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY,
        signatureHex: RFC_ED25519_EMPTY_MESSAGE_SIGNATURE,
      },
    }),
    {
      ok: true,
      action: "verified",
    },
  );
}

function testInvalidSignatureFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "tampered",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY,
        signatureHex: RFC_ED25519_EMPTY_MESSAGE_SIGNATURE,
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "signature_invalid",
    },
  );
}

function testInvalidPublicKeyFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: "not-a-public-key",
        signatureHex: RFC_ED25519_EMPTY_MESSAGE_SIGNATURE,
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_public_key_hex",
    },
  );
}

function testMissingSignatureFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY,
        signatureHex: "",
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "signature_missing",
    },
  );
}

function testInvalidSignatureHexFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY,
        signatureHex: "not-a-signature",
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_signature_hex",
    },
  );
}

function main(): void {
  testMissingSignatureConfigSkipsOptional();
  testValidEd25519SignaturePasses();
  testInvalidSignatureFailsClosed();
  testInvalidPublicKeyFailsClosed();
  testMissingSignatureFailsClosed();
  testInvalidSignatureHexFailsClosed();
  testMissingPublicKeyFailsClosed();
  testUnsupportedAlgorithmFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();

function testMissingPublicKeyFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: "",
        signatureHex: RFC_ED25519_EMPTY_MESSAGE_SIGNATURE,
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "public_key_missing",
    },
  );
}

function testUnsupportedAlgorithmFailsClosed(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: "",
      signatureConfig: {
        algorithm: "unsupported" as "ed25519",
        publicKeyHex: RFC_ED25519_EMPTY_MESSAGE_PUBLIC_KEY,
        signatureHex: RFC_ED25519_EMPTY_MESSAGE_SIGNATURE,
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "unsupported_signature_algorithm",
    },
  );
}
