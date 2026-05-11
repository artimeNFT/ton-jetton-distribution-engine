import * as assert from "assert/strict";
import { verifyBlacklistSignature } from "../lib/watcher/blacklistSignature";
import {
  buildBlacklistSignedEnvelopePayload,
  canonicalizeBlacklistSignedEnvelopePayload,
} from "../lib/watcher/blacklistSignedEnvelope";

const LABEL = "[e-preflight-5-envelope-signature-verification-smoke]";

const BLACKLIST_CONTENT = JSON.stringify({ addresses: ["EQ_TEST"] });
const VALID_UNTIL = "2026-01-01T00:10:00.000Z";
const NONCE = "nonce-2026-0001";

const ENVELOPE_PUBLIC_KEY_HEX =
  "fdcb298e4380b17a6bb1168cb463f758d6ef66d562d9fc91f970c16e8c396b9a";

const ENVELOPE_SIGNATURE_HEX =
  "0c09ed79a9eba6375be253cfff8136ca5a0f1d4f887e7cc5f203d453c50048ad" +
  "e4ecf28bc747834c1a088b58fafcd0275b1c1b8b0ec2b4d68a20aa6529decf02";

function buildCanonicalEnvelopePayload(): string {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  return canonicalizeBlacklistSignedEnvelopePayload(payload);
}

function testValidEnvelopeSignaturePasses(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: buildCanonicalEnvelopePayload(),
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: ENVELOPE_PUBLIC_KEY_HEX,
        signatureHex: ENVELOPE_SIGNATURE_HEX,
      },
    }),
    {
      ok: true,
      action: "verified",
    },
  );
}

function verifyCanonicalPayload(canonicalPayload: string) {
  return verifyBlacklistSignature({
    blacklistContent: canonicalPayload,
    signatureConfig: {
      algorithm: "ed25519",
      publicKeyHex: ENVELOPE_PUBLIC_KEY_HEX,
      signatureHex: ENVELOPE_SIGNATURE_HEX,
    },
  });
}

function testTamperedBlacklistChecksumFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  const tampered = canonicalizeBlacklistSignedEnvelopePayload({
    ...payload,
    blacklistSha256Hex: "0".repeat(64),
  });

  assert.deepEqual(verifyCanonicalPayload(tampered), {
    ok: false,
    action: "rejected",
    reason: "signature_invalid",
  });
}

function testTamperedValidUntilFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  const tampered = canonicalizeBlacklistSignedEnvelopePayload({
    ...payload,
    validUntil: "2026-01-01T00:20:00.000Z",
  });

  assert.deepEqual(verifyCanonicalPayload(tampered), {
    ok: false,
    action: "rejected",
    reason: "signature_invalid",
  });
}

function testTamperedNonceFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  const tampered = canonicalizeBlacklistSignedEnvelopePayload({
    ...payload,
    nonce: "nonce-2026-0002",
  });

  assert.deepEqual(verifyCanonicalPayload(tampered), {
    ok: false,
    action: "rejected",
    reason: "signature_invalid",
  });
}

function testTamperedPayloadKindFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  const tampered = canonicalizeBlacklistSignedEnvelopePayload({
    ...payload,
    payloadKind: "bad-payload-kind" as "blacklist-integrity",
  });

  assert.deepEqual(verifyCanonicalPayload(tampered), {
    ok: false,
    action: "rejected",
    reason: "signature_invalid",
  });
}

function testTamperedEnvelopeVersionFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  const tampered = canonicalizeBlacklistSignedEnvelopePayload({
    ...payload,
    envelopeVersion: "bad-envelope-version" as "blacklist-envelope-v1",
  });

  assert.deepEqual(verifyCanonicalPayload(tampered), {
    ok: false,
    action: "rejected",
    reason: "signature_invalid",
  });
}

function testRawBlacklistContentDoesNotVerifyEnvelopeSignature(): void {
  assert.deepEqual(
    verifyBlacklistSignature({
      blacklistContent: BLACKLIST_CONTENT,
      signatureConfig: {
        algorithm: "ed25519",
        publicKeyHex: ENVELOPE_PUBLIC_KEY_HEX,
        signatureHex: ENVELOPE_SIGNATURE_HEX,
      },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "signature_invalid",
    },
  );
}

function main(): void {
  testValidEnvelopeSignaturePasses();
  testRawBlacklistContentDoesNotVerifyEnvelopeSignature();
  testTamperedBlacklistChecksumFailsClosed();
  testTamperedValidUntilFailsClosed();
  testTamperedNonceFailsClosed();
  testTamperedPayloadKindFailsClosed();
  testTamperedEnvelopeVersionFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();
