import * as assert from "assert/strict";
import {
  validateBlacklistReplayNonce,
  buildReplayKey,
  type BlacklistNonceRegistryView,
} from "../lib/watcher/blacklistReplayNonce";

const LABEL = "[e-preflight-7-replay-nonce-contract-smoke]";

const VALID_NONCE = "a".repeat(64);

const SIGNER_A = "d".repeat(64);
const SIGNER_B = "e".repeat(64);

function emptyRegistry(): BlacklistNonceRegistryView {
  return { has: (_: string): boolean => false };
}

function registryWith(seenKeys: readonly string[]): BlacklistNonceRegistryView {
  const set = new Set(seenKeys);
  return { has: (key: string): boolean => set.has(key) };
}

function throwingRegistry(): BlacklistNonceRegistryView {
  return {
    has: (_: string): boolean => {
      throw new Error("registry fault");
    },
  };
}

function testFreshNonceAccepted(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    {
      ok: true,
      action: "accepted",
      nonce: VALID_NONCE,
      replayKey: buildReplayKey(SIGNER_A, VALID_NONCE),
    },
  );
}

function testDuplicateSameSignerNonceRejected(): void {
  const preseenKey = buildReplayKey(SIGNER_A, VALID_NONCE);

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: registryWith([preseenKey]),
    }),
    { ok: false, action: "rejected", reason: "duplicate_nonce" },
  );
}

function testSameNonceDifferentSignerAccepted(): void {
  const signerAKey = buildReplayKey(SIGNER_A, VALID_NONCE);

  const result = validateBlacklistReplayNonce({
    nonce: VALID_NONCE,
    signerPublicKeyHex: SIGNER_B,
    registry: registryWith([signerAKey]),
  });

  const expectedReplayKey = buildReplayKey(SIGNER_B, VALID_NONCE);

  assert.deepEqual(result, {
    ok: true,
    action: "accepted",
    nonce: VALID_NONCE,
    replayKey: expectedReplayKey,
  });

  assert.notEqual(expectedReplayKey, signerAKey);
}

function testMissingNonceRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: "",
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "missing_nonce" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: null,
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "missing_nonce" },
  );
}

function testInvalidNonceRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: "not-a-nonce",
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_nonce" },
  );
}

function testUppercaseNonceRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: "A".repeat(64),
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_nonce" },
  );
}

function testWrongNonceLengthRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: "a".repeat(63),
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_nonce" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: "a".repeat(65),
      signerPublicKeyHex: SIGNER_A,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_nonce" },
  );
}

function testMissingSignerRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: "",
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "missing_signer" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: null,
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "missing_signer" },
  );
}

function testInvalidSignerRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: "not-a-public-key",
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_signer" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: "d".repeat(62),
      registry: emptyRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_signer" },
  );
}

function testInvalidRegistryRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: null,
    }),
    { ok: false, action: "rejected", reason: "invalid_registry" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: "not-a-registry",
    }),
    { ok: false, action: "rejected", reason: "invalid_registry" },
  );

  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: { has: "not-a-function" },
    }),
    { ok: false, action: "rejected", reason: "invalid_registry" },
  );
}

function testRegistryHasThrowRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: throwingRegistry(),
    }),
    { ok: false, action: "rejected", reason: "invalid_registry" },
  );
}

function testInvalidInputRejected(): void {
  const expected = { ok: false, action: "rejected", reason: "invalid_input" } as const;

  assert.deepEqual(validateBlacklistReplayNonce(null), expected);
  assert.deepEqual(validateBlacklistReplayNonce(undefined), expected);
  assert.deepEqual(validateBlacklistReplayNonce("bad"), expected);
  assert.deepEqual(validateBlacklistReplayNonce([]), expected);
}

function testUppercaseSignerNormalized(): void {
  const result = validateBlacklistReplayNonce({
    nonce: VALID_NONCE,
    signerPublicKeyHex: SIGNER_A.toUpperCase(),
    registry: emptyRegistry(),
  });

  assert.deepEqual(result, {
    ok: true,
    action: "accepted",
    nonce: VALID_NONCE,
    replayKey: buildReplayKey(SIGNER_A, VALID_NONCE),
  });
}

function testRegistryHasNonBooleanRejected(): void {
  assert.deepEqual(
    validateBlacklistReplayNonce({
      nonce: VALID_NONCE,
      signerPublicKeyHex: SIGNER_A,
      registry: { has: (_: string) => "yes" as unknown as boolean },
    }),
    { ok: false, action: "rejected", reason: "invalid_registry" },
  );
}

function main(): void {
  testFreshNonceAccepted();
  testDuplicateSameSignerNonceRejected();
  testSameNonceDifferentSignerAccepted();
  testMissingNonceRejected();
  testInvalidNonceRejected();
  testUppercaseNonceRejected();
  testWrongNonceLengthRejected();
  testMissingSignerRejected();
  testInvalidSignerRejected();
  testInvalidRegistryRejected();
  testRegistryHasThrowRejected();
  testInvalidInputRejected();
  testUppercaseSignerNormalized();
  testRegistryHasNonBooleanRejected();

  console.log(`${LABEL} PASS`);
}

main();
