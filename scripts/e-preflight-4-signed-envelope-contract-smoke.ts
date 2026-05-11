import * as assert from "assert/strict";
import {
  buildBlacklistSignedEnvelopePayload,
  canonicalizeBlacklistSignedEnvelopePayload,
  validateBlacklistSignedEnvelopePayload,
} from "../lib/watcher/blacklistSignedEnvelope";
import { computeSha256Hex } from "../lib/watcher/blacklistIntegrity";

const LABEL = "[e-preflight-4-signed-envelope-contract-smoke]";
const BLACKLIST_CONTENT = JSON.stringify({ addresses: ["EQ_TEST"] });
const VALID_UNTIL = "2026-01-01T00:10:00.000Z";
const NOW = "2026-01-01T00:00:00.000Z";
const NONCE = "nonce-2026-0001";

function testBuildPayloadIncludesChecksumValidityAndNonce(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  assert.deepEqual(payload, {
    envelopeVersion: "blacklist-envelope-v1",
    payloadKind: "blacklist-integrity",
    blacklistSha256Hex: computeSha256Hex(BLACKLIST_CONTENT),
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });
}

function testCanonicalPayloadUsesStableFieldOrder(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  assert.equal(
    canonicalizeBlacklistSignedEnvelopePayload(payload),
    JSON.stringify({
      envelopeVersion: "blacklist-envelope-v1",
      payloadKind: "blacklist-integrity",
      blacklistSha256Hex: computeSha256Hex(BLACKLIST_CONTENT),
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
  );
}

function testValidEnvelopePayloadPasses(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: VALID_UNTIL,
    nonce: NONCE,
  });

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: true,
    action: "accepted",
  });
}

function testExpiredEnvelopeFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: "2025-12-31T23:59:59.000Z",
    nonce: NONCE,
  });

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: false,
    action: "rejected",
    reason: "envelope_expired",
  });
}

function testMissingNonceFailsClosed(): void {
  const payload = {
    ...buildBlacklistSignedEnvelopePayload({
      blacklistContent: BLACKLIST_CONTENT,
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
    nonce: "",
  };

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: false,
    action: "rejected",
    reason: "missing_nonce",
  });
}

function testInvalidNonceFailsClosed(): void {
  const payload = {
    ...buildBlacklistSignedEnvelopePayload({
      blacklistContent: BLACKLIST_CONTENT,
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
    nonce: "bad nonce with spaces",
  };

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: false,
    action: "rejected",
    reason: "invalid_nonce",
  });
}

function testInvalidEnvelopeVersionFailsClosed(): void {
  const payload = {
    ...buildBlacklistSignedEnvelopePayload({
      blacklistContent: BLACKLIST_CONTENT,
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
    envelopeVersion: "bad-envelope-version",
  };

  assert.deepEqual(
    validateBlacklistSignedEnvelopePayload(payload as any, NOW),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_envelope_version",
    },
  );
}

function testInvalidPayloadKindFailsClosed(): void {
  const payload = {
    ...buildBlacklistSignedEnvelopePayload({
      blacklistContent: BLACKLIST_CONTENT,
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
    payloadKind: "bad-payload-kind",
  };

  assert.deepEqual(
    validateBlacklistSignedEnvelopePayload(payload as any, NOW),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_payload_kind",
    },
  );
}

function testInvalidBlacklistChecksumFailsClosed(): void {
  const payload = {
    ...buildBlacklistSignedEnvelopePayload({
      blacklistContent: BLACKLIST_CONTENT,
      validUntil: VALID_UNTIL,
      nonce: NONCE,
    }),
    blacklistSha256Hex: "not-a-sha256",
  };

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: false,
    action: "rejected",
    reason: "invalid_blacklist_checksum",
  });
}

function testInvalidValidUntilFailsClosed(): void {
  const payload = buildBlacklistSignedEnvelopePayload({
    blacklistContent: BLACKLIST_CONTENT,
    validUntil: "not-a-date",
    nonce: NONCE,
  });

  assert.deepEqual(validateBlacklistSignedEnvelopePayload(payload, NOW), {
    ok: false,
    action: "rejected",
    reason: "invalid_valid_until",
  });
}

function main(): void {
  testBuildPayloadIncludesChecksumValidityAndNonce();
  testCanonicalPayloadUsesStableFieldOrder();
  testValidEnvelopePayloadPasses();
  testExpiredEnvelopeFailsClosed();
  testMissingNonceFailsClosed();
  testInvalidNonceFailsClosed();
  testInvalidEnvelopeVersionFailsClosed();
  testInvalidPayloadKindFailsClosed();
  testInvalidBlacklistChecksumFailsClosed();
  testInvalidValidUntilFailsClosed();
  testEnvelopeNotObjectFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();

function testEnvelopeNotObjectFailsClosed(): void {
  assert.deepEqual(validateBlacklistSignedEnvelopePayload(null, NOW), {
    ok: false,
    action: "rejected",
    reason: "envelope_not_object",
  });

  assert.deepEqual(validateBlacklistSignedEnvelopePayload([], NOW), {
    ok: false,
    action: "rejected",
    reason: "envelope_not_object",
  });
}
