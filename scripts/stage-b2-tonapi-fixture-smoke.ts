// scripts/stage-b2-tonapi-fixture-smoke.ts

import * as fs from "fs";
import * as path from "path";
import { deriveCanonicalKey } from "../lib/watcher/canonicalAddress";
import { filterAndNormalize } from "../lib/watcher/eventFilter";
import {
  buildCandidateKeyString,
  hashCandidateKey,
} from "../lib/watcher/candidateId";

const LABEL = "[stage-b2-tonapi-fixture-smoke]";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/synthetic/tonapi_synth_jetton_transfer_001.json",
);
const EXPECTED_PATH = path.resolve(
  process.cwd(),
  "fixtures/tonapi/expected/tonapi_synth_jetton_transfer_001.raw-provider-event.json",
);

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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed [${label}]: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertNull(actual: unknown, label: string): void {
  if (actual !== null) {
    throw new Error(
      `Assertion failed [${label}]: expected null, got ${JSON.stringify(actual)}`
    );
  }
}

function checkSafety(raw: string): void {
  const lower = raw.toLowerCase();
  for (const pattern of SAFETY_BANNED_PATTERNS) {
    if (lower.includes(pattern)) {
      throw new Error(`Safety violation: banned pattern found: "${pattern}"`);
    }
  }
}

async function main(): Promise<void> {
  // 1. Read both JSON files from disk
  const fixtureRaw = fs.readFileSync(FIXTURE_PATH, "utf-8");
  const expectedRaw = fs.readFileSync(EXPECTED_PATH, "utf-8");

  // 2. Parse both files as JSON
  const fixture = JSON.parse(fixtureRaw) as Record<string, unknown>;
  const expected = JSON.parse(expectedRaw) as Record<string, unknown>;

  // 3. Validate fixture top-level keys
  for (const key of [
    "metadata",
    "tonapiPayload",
    "profilingMetadata",
    "noiseSuppressionMetadata",
  ]) {
    assert(key in fixture, `fixture missing top-level key: ${key}`);
  }

  // 4. Validate expected RawProviderEvent shape
  for (const key of ["provider", "receivedAt", "payload"]) {
    assert(key in expected, `expected RawProviderEvent missing key: ${key}`);
  }

  // 5. Validate metadata exactly
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
    "metadata.jettonMaster"
  );
  assertEq(metadata["expectedOutcome"], "normalize_pass", "metadata.expectedOutcome");
  assertEq(metadata["reviewStatus"], "approved_for_fixture_commit", "metadata.reviewStatus");

  // 6. Validate safety — scan both raw file strings
  checkSafety(fixtureRaw);
  checkSafety(expectedRaw);

  // 7. Validate TonAPI synthetic payload mapping
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
    "recipient.address vs expected.payload.destinationAddress"
  );
  assertEq(
    (jettonTransfer["jetton"] as Record<string, unknown>)["address"],
    expectedPayload["jettonMaster"],
    "jetton.address vs expected.payload.jettonMaster"
  );
  assertEq(jettonTransfer["amount"], expectedPayload["amount"], "JettonTransfer.amount vs expected.payload.amount");
  assert(
    Array.isArray(baseTransactions) && baseTransactions.length > 0,
    "base_transactions must be non-empty array"
  );
  assertEq(
    baseTransactions[0]["hash"],
    expectedPayload["txHash"],
    "base_transactions[0].hash vs expected.payload.txHash"
  );
  assertEq(
    baseTransactions[0]["lt"],
    expectedPayload["lt"],
    "base_transactions[0].lt vs expected.payload.lt"
  );
  assertEq(
    action["trace_id"],
    expectedPayload["traceId"],
    "action.trace_id vs expected.payload.traceId"
  );
  assertEq(
    action["action_index"],
    expectedPayload["actionIndex"],
    "action.action_index vs expected.payload.actionIndex"
  );
  assertNull(action["message_hash"] as null, "action.message_hash");
  assertNull(expectedPayload["messageHash"] as null, "expected.payload.messageHash");

  // 8. Validate expected RawProviderEvent fields
  assertEq(expected["provider"], "tonapi", "expected.provider");
  assertEq(expected["receivedAt"], "2023-11-14T22:13:20.000Z", "expected.receivedAt");
  assertEq(expectedPayload["eventType"], "jetton_transfer", "expected.payload.eventType");
  assertNull(expectedPayload["sourceAddress"] as null, "expected.payload.sourceAddress");
  assertEq(
    expectedPayload["destinationAddress"],
    "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    "expected.payload.destinationAddress"
  );
  assertEq(
    expectedPayload["jettonMaster"],
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "expected.payload.jettonMaster"
  );
  assertEq(expectedPayload["amount"], "1000000", "expected.payload.amount");
  assertEq(
    expectedPayload["txHash"],
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "expected.payload.txHash"
  );
  assertEq(
    expectedPayload["traceId"],
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "expected.payload.traceId"
  );
  assertEq(expectedPayload["actionIndex"], 0, "expected.payload.actionIndex");
  assertNull(expectedPayload["messageHash"] as null, "expected.payload.messageHash");
  assertEq(expectedPayload["lt"], "47000000000001", "expected.payload.lt");
  assertEq(
    expectedPayload["eventTimestamp"],
    "2023-11-14T22:13:20.000Z",
    "expected.payload.eventTimestamp"
  );
  assertEq(expectedPayload["finality"], "confirmed", "expected.payload.finality");

  // 9–10. Derive canonical key from expected.payload.jettonMaster
  const canonicalResult = deriveCanonicalKey(
    expectedPayload["jettonMaster"] as string
  );
  if (!canonicalResult.ok) {
    throw new Error(canonicalResult.detail);
  }
  const canonicalMasterKey = canonicalResult.key;

  // 11. Run filterAndNormalize
  const result = filterAndNormalize(
    expected as unknown as Parameters<typeof filterAndNormalize>[0],
    canonicalMasterKey
  );

  // 12. Assert pass and narrow FilterResult
  if (!result.pass) {
    throw new Error(`filterAndNormalize failed: ${result.reason} ${result.detail}`);
  }

  const norm = result.event;

  // 13. Assert normalized event fields
  assertEq(norm.provider, "tonapi", "norm.provider");
  assertEq(norm.amountDecimal, "1000000", "norm.amountDecimal");
  assertEq(norm.detectedAt, expected["receivedAt"] as string, "norm.detectedAt");
  assertNull(norm.sourceAddress as null, "norm.sourceAddress");
  assertEq(
    norm.destinationAddress,
    "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    "norm.destinationAddress"
  );
  assertEq(
    norm.jettonMaster,
    "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "norm.jettonMaster"
  );
  assertEq(
    norm.txHash,
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "norm.txHash"
  );
  assertEq(norm.lt, "47000000000001", "norm.lt");
  assertEq(norm.finality, "confirmed", "norm.finality");

  // 14. Build candidate key string from normalized event
  const candidateKeyString = buildCandidateKeyString(norm);
  assert(
    typeof candidateKeyString === "string" && candidateKeyString.length > 0,
    "candidateKeyString must be a non-empty string"
  );

  // 15. Hash candidate key twice and assert hashes are equal
  const hash1 = hashCandidateKey(candidateKeyString);
  const hash2 = hashCandidateKey(candidateKeyString);
  assertEq(hash1, hash2, "candidateKey hash determinism (hash1 === hash2)");

  // 16. Assert candidateId is a non-empty lowercase hex SHA-256 string
  const candidateId = hash1;
  assert(
    typeof candidateId === "string" && candidateId.length > 0,
    "candidateId must be non-empty string"
  );
  assert(
    /^[0-9a-f]{64}$/.test(candidateId),
    `candidateId must be lowercase hex SHA-256 (64 chars), got: "${candidateId}"`
  );

  // 17. Print PASS
  console.log(`${LABEL} PASS`);
}

main().catch((err: unknown) => {
  console.error(`${LABEL} FAIL`);
  console.error(err);
  process.exit(1);
});