// scripts/stage-b2-tonapi-fixture-smoke.ts

import * as fs from "fs";
import * as path from "path";
import { deriveCanonicalKey } from "../lib/watcher/canonicalAddress";
import { filterAndNormalize } from "../lib/watcher/eventFilter";
import {
  buildCandidateKeyString,
  hashCandidateKey,
} from "../lib/watcher/candidateId";
import { extractTonapiRawProviderEvents } from "../lib/watcher/tonapiExtractor";
import type {
  AdvisoryProfile,
  RawProviderEvent,
} from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-b2-tonapi-fixture-smoke]";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/synthetic/tonapi_synth_jetton_transfer_001.json",
);
const EXPECTED_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/expected/tonapi_synth_jetton_transfer_001.raw-provider-event.json",
);

const MISSING_TXHASH_FIXTURE_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/synthetic/tonapi_synth_missing_txhash_001.json",
);
const MISSING_TXHASH_EXPECTED_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/expected/tonapi_synth_missing_txhash_001.rejection.json",
);

const RECEIVED_AT = "2023-11-14T22:13:20.000Z";
const FINALITY = "confirmed" as const;

const SAFETY_BANNED_PATTERNS: string[] = [
  "wss://",
  "http://",
  "https://",
  "api_key",
  "api-key",
  "bearer",
  "cookie",
  "authorization",
  "mnemonic",
  "private_key",
  "private-key",
];

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed [${label}]: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertNull(actual: unknown, label: string): void {
  if (actual !== null) {
    throw new Error(
      `Assertion failed [${label}]: expected null, got ${JSON.stringify(actual)}`,
    );
  }
}

function readJsonFile(filePath: string): { raw: string; parsed: Record<string, unknown> } {
  const raw = fs.readFileSync(filePath, "utf-8");
  return {
    raw,
    parsed: JSON.parse(raw) as Record<string, unknown>,
  };
}

function checkSafety(raw: string): void {
  const lower = raw.toLowerCase();
  for (const pattern of SAFETY_BANNED_PATTERNS) {
    if (lower.includes(pattern)) {
      throw new Error(`Safety violation: banned pattern found: "${pattern}"`);
    }
  }
}

function getCanonicalMasterKey(jettonMaster: string): string {
  const canonicalResult = deriveCanonicalKey(jettonMaster);
  if (!canonicalResult.ok) {
    throw new Error(canonicalResult.detail);
  }

  return canonicalResult.key;
}

function assertRawProviderEventsEqual(
  actual: RawProviderEvent,
  expected: RawProviderEvent,
  label: string,
): void {
  assertEq(actual.provider, expected.provider, `${label}.provider`);
  assertEq(actual.receivedAt, expected.receivedAt, `${label}.receivedAt`);

  assertEq(actual.payload.eventType, expected.payload.eventType, `${label}.payload.eventType`);
  assertEq(actual.payload.sourceAddress, expected.payload.sourceAddress, `${label}.payload.sourceAddress`);
  assertEq(actual.payload.destinationAddress, expected.payload.destinationAddress, `${label}.payload.destinationAddress`);
  assertEq(actual.payload.jettonMaster, expected.payload.jettonMaster, `${label}.payload.jettonMaster`);
  assertEq(actual.payload.amount, expected.payload.amount, `${label}.payload.amount`);
  assertEq(actual.payload.txHash, expected.payload.txHash, `${label}.payload.txHash`);
  assertEq(actual.payload.traceId, expected.payload.traceId, `${label}.payload.traceId`);
  assertEq(actual.payload.actionIndex, expected.payload.actionIndex, `${label}.payload.actionIndex`);
  assertEq(actual.payload.messageHash, expected.payload.messageHash, `${label}.payload.messageHash`);
  assertEq(actual.payload.lt, expected.payload.lt, `${label}.payload.lt`);
  assertEq(actual.payload.eventTimestamp, expected.payload.eventTimestamp, `${label}.payload.eventTimestamp`);
  assertEq(actual.payload.finality, expected.payload.finality, `${label}.payload.finality`);
}

function assertHappyAdvisoryProfile(profile: AdvisoryProfile | null | undefined): void {
  assert(profile !== null && profile !== undefined, "happy advisoryProfile must exist");
  assertNull(profile.source, "happy advisoryProfile.source");
  assert(profile.destination !== null, "happy advisoryProfile.destination must exist");

  assertEq(profile.destination.walletTypeHint, "v4", "happy advisoryProfile.destination.walletTypeHint");
  assertEq(
    profile.destination.codeHash,
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "happy advisoryProfile.destination.codeHash",
  );
  assertEq(profile.destination.accountStatus, "active", "happy advisoryProfile.destination.accountStatus");
  assertNull(profile.destination.entityLabel, "happy advisoryProfile.destination.entityLabel");
}

function validatePassingFixture(): void {
  const { raw: fixtureRaw, parsed: fixture } = readJsonFile(FIXTURE_PATH);
  const { raw: expectedRaw, parsed: expected } = readJsonFile(EXPECTED_PATH);

  for (const key of [
    "metadata",
    "tonapiPayload",
    "profilingMetadata",
    "noiseSuppressionMetadata",
  ]) {
    assert(key in fixture, `fixture missing top-level key: ${key}`);
  }

  for (const key of ["provider", "receivedAt", "payload"]) {
    assert(key in expected, `expected RawProviderEvent missing key: ${key}`);
  }

  const metadata = fixture["metadata"] as Record<string, unknown>;
  assertEq(metadata["fixtureId"], "tonapi_synth_jetton_transfer_001", "metadata.fixtureId");
  assertEq(metadata["provider"], "tonapi", "metadata.provider");
  assertEq(metadata["fixtureClass"], "synthetic_provider_sample", "metadata.fixtureClass");
  assertEq(metadata["captureSource"], "hand_crafted", "metadata.captureSource");
  assertEq(metadata["captureDate"], "synthetic", "metadata.captureDate");
  assertEq(metadata["realOrSynthetic"], "synthetic", "metadata.realOrSynthetic");
  assertEq(metadata["redactionStatus"], "none", "metadata.redactionStatus");
  assertNull(metadata["redactionNotes"], "metadata.redactionNotes");
  assertEq(metadata["chain"], "ton_mainnet", "metadata.chain");
  assertEq(metadata["network"], "mainnet", "metadata.network");
  assertEq(metadata["tonapiSourceKind"], "websocket_events", "metadata.tonapiSourceKind");
  assertEq(metadata["tonapiEndpointOrStreamName"], "tonapi_websocket_events", "metadata.tonapiEndpointOrStreamName");
  assertEq(
    metadata["jettonMaster"],
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "metadata.jettonMaster",
  );
  assertEq(metadata["expectedOutcome"], "normalize_pass", "metadata.expectedOutcome");
  assertEq(metadata["reviewStatus"], "approved_for_fixture_commit", "metadata.reviewStatus");

  checkSafety(fixtureRaw);
  checkSafety(expectedRaw);

  const profilingMetadata = fixture["profilingMetadata"] as Record<string, unknown>;
  assertEq(profilingMetadata["walletTypeHint"], "v4", "profilingMetadata.walletTypeHint");
  assertEq(
    profilingMetadata["contractCodeHash"],
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "profilingMetadata.contractCodeHash",
  );
  assertEq(profilingMetadata["accountStatus"], "active", "profilingMetadata.accountStatus");
  assertNull(profilingMetadata["entityLabel"], "profilingMetadata.entityLabel");

  const tonapiPayload = fixture["tonapiPayload"] as Record<string, unknown>;
  const actions = tonapiPayload["actions"] as Array<Record<string, unknown>>;
  assert(Array.isArray(actions) && actions.length > 0, "tonapiPayload.actions must be non-empty array");

  const action = actions[0];
  const jettonTransfer = action["JettonTransfer"] as Record<string, unknown>;
  const baseTransactions = action["base_transactions"] as Array<Record<string, unknown>>;
  const expectedPayload = expected["payload"] as Record<string, unknown>;

  assertEq(action["type"], "JettonTransfer", "action.type");
  assertEq(action["status"], "ok", "action.status");
  assertNull(jettonTransfer["sender"] as null, "JettonTransfer.sender");
  assertEq(
    (jettonTransfer["recipient"] as Record<string, unknown>)["address"],
    expectedPayload["destinationAddress"],
    "recipient.address vs expected.payload.destinationAddress",
  );
  assertEq(
    (jettonTransfer["jetton"] as Record<string, unknown>)["address"],
    expectedPayload["jettonMaster"],
    "jetton.address vs expected.payload.jettonMaster",
  );
  assertEq(jettonTransfer["amount"], expectedPayload["amount"], "JettonTransfer.amount vs expected.payload.amount");
  assert(
    Array.isArray(baseTransactions) && baseTransactions.length > 0,
    "base_transactions must be non-empty array",
  );
  assertEq(
    baseTransactions[0]["hash"],
    expectedPayload["txHash"],
    "base_transactions[0].hash vs expected.payload.txHash",
  );
  assertEq(
    baseTransactions[0]["lt"],
    expectedPayload["lt"],
    "base_transactions[0].lt vs expected.payload.lt",
  );
  assertEq(
    action["trace_id"],
    expectedPayload["traceId"],
    "action.trace_id vs expected.payload.traceId",
  );
  assertEq(
    action["action_index"],
    expectedPayload["actionIndex"],
    "action.action_index vs expected.payload.actionIndex",
  );
  assertNull(action["message_hash"] as null, "action.message_hash");
  assertNull(expectedPayload["messageHash"] as null, "expected.payload.messageHash");

  assertEq(expected["provider"], "tonapi", "expected.provider");
  assertEq(expected["receivedAt"], RECEIVED_AT, "expected.receivedAt");
  assertEq(expectedPayload["eventType"], "jetton_transfer", "expected.payload.eventType");
  assertNull(expectedPayload["sourceAddress"] as null, "expected.payload.sourceAddress");
  assertEq(
    expectedPayload["destinationAddress"],
    "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    "expected.payload.destinationAddress",
  );
  assertEq(
    expectedPayload["jettonMaster"],
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "expected.payload.jettonMaster",
  );
  assertEq(expectedPayload["amount"], "1000000", "expected.payload.amount");
  assertEq(
    expectedPayload["txHash"],
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "expected.payload.txHash",
  );
  assertEq(
    expectedPayload["traceId"],
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "expected.payload.traceId",
  );
  assertEq(expectedPayload["actionIndex"], 0, "expected.payload.actionIndex");
  assertNull(expectedPayload["messageHash"] as null, "expected.payload.messageHash");
  assertEq(expectedPayload["lt"], "47000000000001", "expected.payload.lt");
  assertEq(expectedPayload["eventTimestamp"], RECEIVED_AT, "expected.payload.eventTimestamp");
  assertEq(expectedPayload["finality"], FINALITY, "expected.payload.finality");

  const manualRaw = expected as unknown as RawProviderEvent;
  const extractedEvents = extractTonapiRawProviderEvents(tonapiPayload, {
    receivedAt: RECEIVED_AT,
    finality: FINALITY,
    profilingMetadata: fixture["profilingMetadata"],
  });

  assertEq(extractedEvents.length, 1, "happy extractor event count");
  assertRawProviderEventsEqual(extractedEvents[0], manualRaw, "happy extractor output");
  assertHappyAdvisoryProfile(extractedEvents[0].advisoryProfile);

  const canonicalMasterKey = getCanonicalMasterKey(manualRaw.payload.jettonMaster);

  const manualResult = filterAndNormalize(manualRaw, canonicalMasterKey);
  if (!manualResult.pass) {
    throw new Error(`manual happy normalize failed: ${manualResult.reason} ${manualResult.detail}`);
  }

  const extractedResult = filterAndNormalize(extractedEvents[0], canonicalMasterKey);
  if (!extractedResult.pass) {
    throw new Error(`extracted happy normalize failed: ${extractedResult.reason} ${extractedResult.detail}`);
  }

  const norm = extractedResult.event;

  assertEq(norm.provider, "tonapi", "norm.provider");
  assertEq(norm.amountDecimal, "1000000", "norm.amountDecimal");
  assertEq(norm.detectedAt, expected["receivedAt"] as string, "norm.detectedAt");
  assertNull(norm.sourceAddress as null, "norm.sourceAddress");
  assertEq(
    norm.destinationAddress,
    "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    "norm.destinationAddress",
  );
  assertEq(
    norm.jettonMaster,
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "norm.jettonMaster",
  );
  assertEq(
    norm.txHash,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "norm.txHash",
  );
  assertEq(norm.lt, "47000000000001", "norm.lt");
  assertEq(norm.finality, "confirmed", "norm.finality");
  assertHappyAdvisoryProfile(norm.advisoryProfile);

  const candidateKeyString = buildCandidateKeyString(norm);
  assert(
    typeof candidateKeyString === "string" && candidateKeyString.length > 0,
    "candidateKeyString must be a non-empty string",
  );

  const hash1 = hashCandidateKey(candidateKeyString);
  const hash2 = hashCandidateKey(candidateKeyString);
  assertEq(hash1, hash2, "candidateKey hash determinism (hash1 === hash2)");

  const candidateId = hash1;
  assert(
    typeof candidateId === "string" && candidateId.length > 0,
    "candidateId must be non-empty string",
  );
  assert(
    /^[0-9a-f]{64}$/.test(candidateId),
    `candidateId must be lowercase hex SHA-256 (64 chars), got: "${candidateId}"`,
  );
}

function validateMissingTxHashFixture(): void {
  const { raw: fixtureRaw, parsed: fixture } = readJsonFile(MISSING_TXHASH_FIXTURE_PATH);
  const { raw: expectedRaw, parsed: expected } = readJsonFile(MISSING_TXHASH_EXPECTED_PATH);

  checkSafety(fixtureRaw);
  checkSafety(expectedRaw);

  for (const key of [
    "metadata",
    "tonapiPayload",
    "profilingMetadata",
    "noiseSuppressionMetadata",
  ]) {
    assert(key in fixture, `missing txHash fixture missing top-level key: ${key}`);
  }

  const metadata = fixture["metadata"] as Record<string, unknown>;
  assertEq(metadata["fixtureId"], "tonapi_synth_missing_txhash_001", "missing.metadata.fixtureId");
  assertEq(metadata["provider"], "tonapi", "missing.metadata.provider");
  assertEq(metadata["fixtureClass"], "synthetic_provider_sample", "missing.metadata.fixtureClass");
  assertEq(metadata["realOrSynthetic"], "synthetic", "missing.metadata.realOrSynthetic");
  assertEq(metadata["tonapiEndpointOrStreamName"], "tonapi_websocket_events", "missing.metadata.tonapiEndpointOrStreamName");
  assertEq(
    metadata["jettonMaster"],
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "missing.metadata.jettonMaster",
  );
  assertEq(metadata["expectedOutcome"], "reject_missing_tx_hash", "missing.metadata.expectedOutcome");
  assertEq(metadata["codeLevelReason"], "MISSING_TX_HASH", "missing.metadata.codeLevelReason");
  assertEq(metadata["reviewStatus"], "approved_for_fixture_commit", "missing.metadata.reviewStatus");
  assertNull(fixture["profilingMetadata"], "missing.profilingMetadata");

  const tonapiPayload = fixture["tonapiPayload"] as Record<string, unknown>;
  const actions = tonapiPayload["actions"] as Array<Record<string, unknown>>;
  assert(Array.isArray(actions) && actions.length > 0, "missing.tonapiPayload.actions must be non-empty array");

  const action = actions[0];
  const jettonTransfer = action["JettonTransfer"] as Record<string, unknown>;
  const baseTransactions = action["base_transactions"] as Array<Record<string, unknown>>;
  assert(
    Array.isArray(baseTransactions) && baseTransactions.length > 0,
    "missing.base_transactions must be non-empty array",
  );

  assertEq(action["type"], "JettonTransfer", "missing.action.type");
  assertEq(action["status"], "ok", "missing.action.status");
  assertNull(jettonTransfer["sender"] as null, "missing.JettonTransfer.sender");
  assertEq(baseTransactions[0]["hash"], "", "missing.base_transactions[0].hash");

  assertEq(expected["fixtureId"], "tonapi_synth_missing_txhash_001", "missing.expected.fixtureId");
  assertEq(expected["expectedOutcome"], "reject_missing_tx_hash", "missing.expected.expectedOutcome");

  const expectedResult = expected["expectedResult"] as Record<string, unknown>;
  assertEq(expectedResult["pass"], false, "missing.expectedResult.pass");
  assertEq(
    expectedResult["codeLevelReason"],
    "MISSING_TX_HASH",
    "missing.expectedResult.codeLevelReason",
  );

  const rawProviderEvent = (expected["rawProviderEvent"] as unknown) as RawProviderEvent;
  const rawPayload = rawProviderEvent.payload;

  assertEq(rawProviderEvent.provider, "tonapi", "missing.rawProviderEvent.provider");
  assertEq(rawProviderEvent.receivedAt, RECEIVED_AT, "missing.rawProviderEvent.receivedAt");
  assertEq(rawPayload.eventType, "jetton_transfer", "missing.payload.eventType");
  assertNull(rawPayload.sourceAddress as null, "missing.payload.sourceAddress");
  assertEq(
    rawPayload.destinationAddress,
    (jettonTransfer["recipient"] as Record<string, unknown>)["address"],
    "missing.destination mapping",
  );
  assertEq(
    rawPayload.jettonMaster,
    (jettonTransfer["jetton"] as Record<string, unknown>)["address"],
    "missing.jettonMaster mapping",
  );
  assertEq(rawPayload.amount, jettonTransfer["amount"], "missing.amount mapping");
  assertEq(rawPayload.txHash, "", "missing.payload.txHash");
  assertEq(rawPayload.lt, baseTransactions[0]["lt"], "missing.lt mapping");
  assertEq(rawPayload.traceId, action["trace_id"], "missing.traceId mapping");
  assertEq(rawPayload.actionIndex, action["action_index"], "missing.actionIndex mapping");
  assertNull(rawPayload.messageHash as null, "missing.payload.messageHash");
  assertEq(rawPayload.finality, FINALITY, "missing.payload.finality");

  const extractedEvents = extractTonapiRawProviderEvents(tonapiPayload, {
    receivedAt: RECEIVED_AT,
    finality: FINALITY,
    profilingMetadata: fixture["profilingMetadata"],
  });

  assertEq(extractedEvents.length, 1, "missing extractor event count");
  assertRawProviderEventsEqual(extractedEvents[0], rawProviderEvent, "missing extractor output");
  assertNull(extractedEvents[0].advisoryProfile ?? null, "missing extractor advisoryProfile");

  const canonicalMasterKey = getCanonicalMasterKey(rawPayload.jettonMaster);

  const manualResult = filterAndNormalize(rawProviderEvent, canonicalMasterKey);
  if (manualResult.pass) {
    throw new Error("manual missing txHash unexpectedly passed normalization");
  }
  assertEq(manualResult.reason, "MISSING_TX_HASH", "manual missing filterAndNormalize reason");

  const extractedResult = filterAndNormalize(extractedEvents[0], canonicalMasterKey);
  if (extractedResult.pass) {
    throw new Error("extracted missing txHash unexpectedly passed normalization");
  }
  assertEq(extractedResult.reason, "MISSING_TX_HASH", "extracted missing filterAndNormalize reason");
}

async function main(): Promise<void> {
  validatePassingFixture();
  validateMissingTxHashFixture();
  console.log(`${LABEL} PASS`);
}

main().catch((err: unknown) => {
  console.error(`${LABEL} FAIL`);
  console.error(err);
  process.exit(1);
});
