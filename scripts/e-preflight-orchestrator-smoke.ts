import * as assert from "assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  runBlacklistPreflight,
  type BlacklistPreflightTraceability,
} from "../lib/watcher/blacklistPreflightOrchestrator";
import {
  buildBlacklistSignedEnvelopePayload,
  canonicalizeBlacklistSignedEnvelopePayload,
} from "../lib/watcher/blacklistSignedEnvelope";
import {
  buildReplayKey,
  type BlacklistNonceRegistryView,
} from "../lib/watcher/blacklistReplayNonce";

const LABEL = "[e-preflight-orchestrator-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLACKLIST_CONTENT = JSON.stringify({ addresses: ["EQ_ORCH_TEST"] });
const VALID_UNTIL = "2026-06-01T00:10:00.000Z";
const NOW_ISO = "2026-06-01T00:00:00.000Z";

// 64 lowercase hex chars = 32 bytes; satisfies both isSaneNonce and isStrictLowercaseHex
const NONCE =
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";

// lt must be a pure decimal string (isDecimalString: /^[0-9]+$/)
const TRACEABILITY: BlacklistPreflightTraceability = {
  lt: "1000000001",
  traceId: "trace-orch-001",
};

// Policy: VALID_UNTIL is 10 min ahead of NOW_ISO; 15 min window passes
const FRESHNESS_POLICY = { maxFutureValidityMs: 15 * 60 * 1000 };

// ---------------------------------------------------------------------------
// Fixture generation — real Ed25519 keypairs built at runtime
// ---------------------------------------------------------------------------

function buildSignerFixture(canonicalPayload: string): {
  publicKeyHex: string;
  signatureHex: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  // SPKI DER for ed25519 = 12-byte prefix + 32-byte raw public key
  const pubDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const pubRaw = pubDer.subarray(pubDer.length - 32);
  const publicKeyHex = pubRaw.toString("hex"); // always lowercase from Buffer.toString
  const sigBuf = sign(null, Buffer.from(canonicalPayload, "utf8"), privateKey);
  const signatureHex = sigBuf.toString("hex");
  return { publicKeyHex, signatureHex };
}

const BASE_PAYLOAD = buildBlacklistSignedEnvelopePayload({
  blacklistContent: BLACKLIST_CONTENT,
  validUntil: VALID_UNTIL,
  nonce: NONCE,
});

const CANONICAL_PAYLOAD = canonicalizeBlacklistSignedEnvelopePayload(BASE_PAYLOAD);

const FIXTURE_A = buildSignerFixture(CANONICAL_PAYLOAD);
const FIXTURE_B = buildSignerFixture(CANONICAL_PAYLOAD);

const SIGNATURE_CONFIG_A = {
  algorithm: "ed25519" as const,
  publicKeyHex: FIXTURE_A.publicKeyHex,
  signatureHex: FIXTURE_A.signatureHex,
};

const SIGNATURE_CONFIG_B = {
  algorithm: "ed25519" as const,
  publicKeyHex: FIXTURE_B.publicKeyHex,
  signatureHex: FIXTURE_B.signatureHex,
};

// Replay keys use the already-lowercase hex produced by Buffer.toString("hex")
const REPLAY_KEY_A = buildReplayKey(FIXTURE_A.publicKeyHex, NONCE);
const REPLAY_KEY_B = buildReplayKey(FIXTURE_B.publicKeyHex, NONCE);

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function emptyRegistry(): BlacklistNonceRegistryView {
  return { has: (_: string): boolean => false };
}

function registryWith(seenKeys: readonly string[]): BlacklistNonceRegistryView {
  const set = new Set(seenKeys);
  return { has: (key: string): boolean => set.has(key) };
}

// ---------------------------------------------------------------------------
// Input factory
// ---------------------------------------------------------------------------

function makeInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    administrativeHalt: false,
    blacklistContent: BLACKLIST_CONTENT,
    envelopePayload: BASE_PAYLOAD,
    nowIso: NOW_ISO,
    freshnessPolicy: FRESHNESS_POLICY,
    signatureConfig: SIGNATURE_CONFIG_A,
    nonceRegistry: emptyRegistry(),
    traceability: TRACEABILITY,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testValidFullChainAccepted(): void {
  const result = runBlacklistPreflight(makeInput());
  assert.ok(result.ok, `expected accepted, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "accepted");
  assert.deepEqual(result.traceability, TRACEABILITY);
  assert.equal(result.metadata.envelopeVersion, "blacklist-envelope-v1");
  assert.equal(result.metadata.payloadKind, "blacklist-integrity");
  assert.equal(
    result.metadata.signerPublicKeyHex,
    FIXTURE_A.publicKeyHex.toLowerCase(),
  );
  assert.equal(result.metadata.checksum, BASE_PAYLOAD.blacklistSha256Hex);
  assert.equal(result.metadata.nonce, NONCE);
  assert.equal(result.metadata.replayKey, REPLAY_KEY_A);
  assert.equal(result.metadata.priority, null);
}

function testAdministrativeHaltRejectsImmediately(): void {
  // Proves no downstream validator is reached: throwing registry never fires
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({
        administrativeHalt: true,
        nonceRegistry: {
          has: (_: string): boolean => {
            throw new Error("must not be reached under administrative halt");
          },
        },
      }),
    ),
    { ok: false, action: "rejected", reason: "administrative_halt", traceability: null },
  );
}

function testInvalidTraceabilityRejected(): void {
  // lt is not a decimal string
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ traceability: { lt: "not-decimal", traceId: null } }),
    ),
    { ok: false, action: "rejected", reason: "invalid_traceability", traceability: null },
  );

  // lt is empty
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ traceability: { lt: "", traceId: null } }),
    ),
    { ok: false, action: "rejected", reason: "invalid_traceability", traceability: null },
  );

  // lt has leading space — not a pure decimal string
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ traceability: { lt: " 1000000001", traceId: null } }),
    ),
    { ok: false, action: "rejected", reason: "invalid_traceability", traceability: null },
  );

  // traceId is empty string — must be rejected
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ traceability: { lt: "1000000001", traceId: "" } }),
    ),
    { ok: false, action: "rejected", reason: "invalid_traceability", traceability: null },
  );

  // traceability is null
  assert.deepEqual(
    runBlacklistPreflight(makeInput({ traceability: null })),
    { ok: false, action: "rejected", reason: "invalid_traceability", traceability: null },
  );
}

function testChecksumMismatchRejected(): void {
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({
        blacklistContent: JSON.stringify({ addresses: ["TAMPERED"] }),
      }),
    ),
    {
      ok: false,
      action: "rejected",
      reason: "integrity_checksum_mismatch",
      traceability: TRACEABILITY,
    },
  );
}

function testSignatureConfigNullRejectsWithMissingForNonce(): void {
  // verifyBlacklistSignature returns skipped_optional (ok: true) for null config,
  // so rejection happens at the explicit signer-identity guard before nonce binding.
  assert.deepEqual(
    runBlacklistPreflight(makeInput({ signatureConfig: null })),
    {
      ok: false,
      action: "rejected",
      reason: "signature_config_missing_for_nonce",
      traceability: TRACEABILITY,
    },
  );
}

function testExpiredEnvelopeRejected(): void {
  // nowIso is past VALID_UNTIL → step 4 (envelope validation) rejects
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ nowIso: "2026-06-01T01:00:00.000Z" }),
    ),
    {
      ok: false,
      action: "rejected",
      reason: "envelope_envelope_expired",
      traceability: TRACEABILITY,
    },
  );
}

function testFutureTooFarRejected(): void {
  // VALID_UNTIL is 10 min from NOW_ISO; policy allows only 5 min → freshness rejects
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ freshnessPolicy: { maxFutureValidityMs: 5 * 60 * 1000 } }),
    ),
    {
      ok: false,
      action: "rejected",
      reason: "freshness_envelope_valid_too_far_in_future",
      traceability: TRACEABILITY,
    },
  );
}

function testDuplicateNonceRejected(): void {
  // Registry already contains REPLAY_KEY_A → same signer + nonce = duplicate
  assert.deepEqual(
    runBlacklistPreflight(
      makeInput({ nonceRegistry: registryWith([REPLAY_KEY_A]) }),
    ),
    {
      ok: false,
      action: "rejected",
      reason: "replay_nonce_duplicate_nonce",
      traceability: TRACEABILITY,
    },
  );
}

function testSameNonceDifferentSignerAccepted(): void {
  // Registry has REPLAY_KEY_A but not REPLAY_KEY_B → SIGNER_B + same nonce = accepted
  const result = runBlacklistPreflight(
    makeInput({
      signatureConfig: SIGNATURE_CONFIG_B,
      nonceRegistry: registryWith([REPLAY_KEY_A]),
    }),
  );

  assert.ok(result.ok, `expected accepted, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(
    result.metadata.signerPublicKeyHex,
    FIXTURE_B.publicKeyHex.toLowerCase(),
  );
  assert.equal(result.metadata.replayKey, REPLAY_KEY_B);
  assert.notEqual(REPLAY_KEY_A, REPLAY_KEY_B);
  assert.equal(result.metadata.nonce, NONCE);
  assert.equal(result.metadata.priority, null);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testAdministrativeHaltRejectsImmediately();
  testValidFullChainAccepted();
  testInvalidTraceabilityRejected();
  testChecksumMismatchRejected();
  testSignatureConfigNullRejectsWithMissingForNonce();
  testExpiredEnvelopeRejected();
  testFutureTooFarRejected();
  testDuplicateNonceRejected();
  testSameNonceDifferentSignerAccepted();

  console.log(`${LABEL} PASS`);
}

main();