import * as assert from "assert/strict";
import * as fs from "fs/promises";
import * as path from "path";

import { deriveCanonicalKey } from "../lib/watcher/canonicalAddress";
import { filterAndNormalize } from "../lib/watcher/eventFilter";
import {
  buildCandidateKeyString,
  extractCandidateKeyComponents,
  hashCandidateKey,
} from "../lib/watcher/candidateId";
import {
  appendCandidate,
  appendCandidateEvent,
  createRateCap,
  loadCursor,
  loadDedupStore,
  saveCursor,
} from "../lib/watcher/candidateStore";
import {
  createFileCommanderStateReader,
  isCandidateWriteAllowed,
} from "../lib/watcher/commanderState";
import type {
  CandidateRecord,
  RawProviderEvent,
} from "../lib/watcher/ingestionTypes";

async function main(): Promise<void> {
  const dataDir = path.resolve(".tmp/stage-b2-ingestion-smoke");
  const campaignId = "stage_b2_smoke";
  await fs.rm(dataDir, { recursive: true, force: true });

  const jettonMaster = "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv";
  const destination = "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl";
  const receivedAt = "2026-05-05T00:00:00.000Z";

  const masterKeyResult = deriveCanonicalKey(jettonMaster);
  if (!masterKeyResult.ok) throw new Error(masterKeyResult.detail);
  assert.equal(masterKeyResult.ok, true);

  const raw: RawProviderEvent = {
    provider: "fixture",
    receivedAt,
    payload: {
      eventType: "jetton_transfer",
      sourceAddress: null,
      destinationAddress: destination,
      jettonMaster,
      amount: "0001",
      txHash: "tx-smoke-001",
      traceId: "trace-smoke-001",
      actionIndex: 0,
      messageHash: "msg-smoke-001",
      lt: "123456789",
      eventTimestamp: "2026-05-05T00:00:01.000Z",
      finality: "confirmed",
    },
  };

  const filtered = filterAndNormalize(raw, masterKeyResult.key);
  if (!filtered.pass) throw new Error(filtered.detail);
  assert.equal(filtered.pass, true);

  assert.equal(filtered.event.amountDecimal, "1");
  assert.equal(filtered.event.detectedAt, receivedAt);
  assert.equal(filtered.event.actionIndex, 0);

  const keyString = buildCandidateKeyString(filtered.event);
  const candidateId = hashCandidateKey(keyString);

  const record: CandidateRecord = {
    candidateId,
    candidateKeyComponents: extractCandidateKeyComponents(filtered.event),
    observedByProvider: filtered.event.provider,
    sourceEventRef: filtered.event.txHash,
    jettonMaster: filtered.event.jettonMaster,
    jettonMasterCanonicalKey: filtered.event.jettonMasterCanonicalKey,
    destinationAddress: filtered.event.destinationAddress,
    destinationCanonicalKey: filtered.event.destinationCanonicalKey,
    sourceAddress: filtered.event.sourceAddress,
    sourceCanonicalKey: filtered.event.sourceCanonicalKey,
    amount: filtered.event.amountDecimal,
    lt: filtered.event.lt,
    detectedAt: filtered.event.detectedAt,
    eventTimestamp: filtered.event.eventTimestamp,
    finality: filtered.event.finality,
    profileStatus: "unresolved",
    profile: {
      destination: {
        accountStatus: null,
        codeHash: null,
        walletType: null,
        entityLabel: null,
      },
      source: {
        accountStatus: null,
        codeHash: null,
        walletType: null,
        entityLabel: null,
      },
    },
    decision: "pending",
  };

  await appendCandidate(dataDir, campaignId, record);

  const dedup = await loadDedupStore(dataDir, campaignId, 72 * 60 * 60 * 1000);
  assert.equal(dedup.isSeen(candidateId), true);

  await appendCandidateEvent(dataDir, campaignId, {
    eventType: "duplicate_observation",
    ts: receivedAt,
    traceId: filtered.event.traceId,
    candidateId,
    provider: filtered.event.provider,
    cursorLt: filtered.event.lt,
    detail: "duplicate candidate smoke check",
  });

  const cap = createRateCap(1, () => 1000);
  assert.equal(cap.isAllowed(), true);
  assert.equal(cap.isAllowed(), false);
  assert.throws(() => createRateCap(0), /positive integer/);

  await appendCandidateEvent(dataDir, campaignId, {
    eventType: "rate_cap_data_loss",
    ts: receivedAt,
    traceId: filtered.event.traceId,
    candidateId,
    provider: filtered.event.provider,
    cursorLt: filtered.event.lt,
    detail: "rate cap smoke check",
  });

  await saveCursor(dataDir, {
    lt: "123456789",
    lastEventId: "event-smoke-001",
    updatedAt: receivedAt,
  });

  const cursor = await loadCursor(dataDir);
  assert.equal(cursor?.lt, "123456789");

  const badAmount = filterAndNormalize(
    { ...raw, payload: { ...raw.payload, amount: "0" } },
    masterKeyResult.key,
  );
  assert.equal(badAmount.pass, false);
  if (badAmount.pass) throw new Error("badAmount unexpectedly passed");
  assert.equal(badAmount.reason, "AMOUNT_NON_POSITIVE");

  const missingTx = filterAndNormalize(
    { ...raw, payload: { ...raw.payload, txHash: "" } },
    masterKeyResult.key,
  );
  assert.equal(missingTx.pass, false);
  if (missingTx.pass) throw new Error("missingTx unexpectedly passed");
  assert.equal(missingTx.reason, "MISSING_TX_HASH");

  const wrongMaster = filterAndNormalize(
    raw,
    "0:0000000000000000000000000000000000000000000000000000000000000000",
  );
  assert.equal(wrongMaster.pass, false);
  if (wrongMaster.pass) throw new Error("wrongMaster unexpectedly passed");
  assert.equal(wrongMaster.reason, "MASTER_MISMATCH");

  const commander = createFileCommanderStateReader(
    path.join(dataDir, "missing-commander-state.json"),
    60_000,
  );
  const safety = await commander.readSafetyState();
  assert.equal(safety.status, "passive");
  assert.equal(isCandidateWriteAllowed(safety), false);

  const candidatesPath = path.join(dataDir, `${campaignId}-candidates.jsonl`);
  const eventsPath = path.join(dataDir, `${campaignId}-candidate-events.jsonl`);
  const candidates = (await fs.readFile(candidatesPath, "utf8")).trim().split("\n");
  const events = (await fs.readFile(eventsPath, "utf8")).trim().split("\n");

  assert.equal(candidates.length, 1);
  assert.equal(events.length, 2);

  await fs.rm(dataDir, { recursive: true, force: true });
  console.log("[stage-b2-smoke] PASS");
}

main().catch((err: unknown) => {
  console.error("[stage-b2-smoke] FAIL");
  console.error(err);
  process.exit(1);
});
