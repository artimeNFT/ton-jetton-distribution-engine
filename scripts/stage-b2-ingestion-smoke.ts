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
import { buildCandidateRecord } from "../lib/watcher/candidateRecordBuilder";
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
  RawProviderEvent,
} from "../lib/watcher/ingestionTypes";

async function main(): Promise<void> {
  const dataDir = path.resolve(".tmp/stage-b2-ingestion-smoke");
  const campaignId = "stage_b2_smoke";
  await fs.rm(dataDir, { recursive: true, force: true });

  const jettonMaster = "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv";
  const destination = "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl";
  const source = "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv";
  const receivedAt = "2026-05-05T00:00:00.000Z";

  const masterKeyResult = deriveCanonicalKey(jettonMaster);
  if (!masterKeyResult.ok) throw new Error(masterKeyResult.detail);
  assert.equal(masterKeyResult.ok, true);

  const raw: RawProviderEvent = {
    provider: "fixture",
    receivedAt,
    payload: {
      eventType: "jetton_transfer",
      sourceAddress: source,
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
    advisoryProfile: {
      destination: {
        walletTypeHint: "v4",
        codeHash: "dest-code-hash-smoke",
        accountStatus: "active",
        entityLabel: "destination-label-smoke",
      },
      source: {
        walletTypeHint: "highload-v2",
        codeHash: "source-code-hash-smoke",
        accountStatus: "active",
        entityLabel: "source-label-smoke",
      },
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

  const record = buildCandidateRecord(filtered.event);

  assert.equal(record.candidateId, candidateId);
  assert.deepEqual(
    record.candidateKeyComponents,
    extractCandidateKeyComponents(filtered.event),
  );
  assert.equal(record.decision, "pending");
  assert.equal(record.profileStatus, "partial");

  assert.deepEqual(record.profile.destination, {
    accountStatus: "active",
    codeHash: "dest-code-hash-smoke",
    walletType: "v4",
    entityLabel: "destination-label-smoke",
  });

  assert.deepEqual(record.profile.source, {
    accountStatus: "active",
    codeHash: "source-code-hash-smoke",
    walletType: "highload-v2",
    entityLabel: "source-label-smoke",
  });

  const noAdvisory = filterAndNormalize(
    {
      ...raw,
      advisoryProfile: null,
      payload: {
        ...raw.payload,
        txHash: "tx-smoke-no-advisory",
        traceId: "trace-smoke-no-advisory",
        messageHash: "msg-smoke-no-advisory",
        lt: "123456790",
      },
    },
    masterKeyResult.key,
  );
  if (!noAdvisory.pass) throw new Error(noAdvisory.detail);
  assert.equal(noAdvisory.pass, true);

  const noAdvisoryRecord = buildCandidateRecord(noAdvisory.event);
  assert.equal(noAdvisoryRecord.decision, "pending");
  assert.equal(noAdvisoryRecord.profileStatus, "unresolved");
  assert.deepEqual(noAdvisoryRecord.profile.destination, {
    accountStatus: null,
    codeHash: null,
    walletType: null,
    entityLabel: null,
  });
  assert.deepEqual(noAdvisoryRecord.profile.source, {
    accountStatus: null,
    codeHash: null,
    walletType: null,
    entityLabel: null,
  });

  await appendCandidate(dataDir, campaignId, record);

  const dedup = await loadDedupStore(dataDir, campaignId, 365 * 24 * 60 * 60 * 1000);
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
