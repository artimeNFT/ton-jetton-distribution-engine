import * as assert from "assert/strict";
import * as fs from "fs/promises";
import * as path from "path";

import { deriveCanonicalKey } from "../lib/watcher/canonicalAddress";
import { createRateCap, loadDedupStore } from "../lib/watcher/candidateStore";
import { ingestOfflineCandidateEvents } from "../lib/watcher/offlineCandidateIngestionOrchestrator";
import type {
  CommanderStateReader,
} from "../lib/watcher/commanderState";
import type {
  RawProviderEvent,
  WatcherConfig,
} from "../lib/watcher/ingestionTypes";

function activeCommander(): CommanderStateReader {
  return {
    async readSafetyState() {
      return {
        status: "active",
        emergencyStop: false,
        lockdown: false,
        candidateWritesAllowed: true,
        reason: null,
        checkedAt: "2026-05-05T00:00:00.000Z",
      };
    },
  };
}

function passiveCommander(): CommanderStateReader {
  return {
    async readSafetyState() {
      return {
        status: "passive",
        emergencyStop: true,
        lockdown: false,
        candidateWritesAllowed: false,
        reason: "smoke_passive",
        checkedAt: "2026-05-05T00:00:00.000Z",
      };
    },
  };
}

async function main(): Promise<void> {
  const dataDir = path.resolve(".tmp/stage-b2-offline-orchestrator-smoke");
  const campaignId = "stage_b2_offline_orchestrator_smoke";
  await fs.rm(dataDir, { recursive: true, force: true });

  const jettonMaster = "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv";
  const destination = "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl";
  const source = "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv";

  const masterKey = deriveCanonicalKey(jettonMaster);
  if (!masterKey.ok) throw new Error(masterKey.detail);

  const config: WatcherConfig = {
    jettonMasterCanonicalKey: masterKey.key,
    campaignId,
    dedupTtlMs: 72 * 60 * 60 * 1000,
    maxCandidatesPerMinute: 500,
    dataDir,
  };

  const event: RawProviderEvent = {
    provider: "fixture",
    receivedAt: "2026-05-05T00:00:00.000Z",
    payload: {
      eventType: "jetton_transfer",
      sourceAddress: source,
      destinationAddress: destination,
      jettonMaster,
      amount: "1000",
      txHash: "tx-offline-orchestrator-001",
      traceId: "trace-offline-orchestrator-001",
      actionIndex: 0,
      messageHash: "msg-offline-orchestrator-001",
      lt: "900000001",
      eventTimestamp: "2026-05-05T00:00:01.000Z",
      finality: "confirmed",
    },
    advisoryProfile: {
      destination: {
        walletTypeHint: "w5",
        codeHash: "dest-w5-code-hash",
        accountStatus: "active",
        entityLabel: "dest-intel-label",
      },
      source: {
        walletTypeHint: "v4",
        codeHash: "source-code-hash",
        accountStatus: "active",
        entityLabel: "source-intel-label",
      },
    },
  };

  const dedup = await loadDedupStore(dataDir, campaignId, config.dedupTtlMs);
  const rateCap = createRateCap(10, () => 1000);

  const first = await ingestOfflineCandidateEvents({
    events: [event],
    config,
    commander: activeCommander(),
    dedup,
    rateCap,
  });

  assert.equal(first.processed, 1);
  assert.equal(first.accepted, 1);
  assert.equal(first.rejected, 0);
  assert.equal(first.duplicates, 0);
  assert.equal(first.rateLimited, 0);
  assert.equal(first.blockedByCommander, 0);
  assert.equal(first.cursor?.lt, "900000001");

  const candidatesPath = path.join(dataDir, `${campaignId}-candidates.jsonl`);
  const candidateLines = (await fs.readFile(candidatesPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(candidateLines.length, 1);

  const candidate = JSON.parse(candidateLines[0]!);
  assert.equal(candidate.profileStatus, "partial");
  assert.equal(candidate.profile.destination.walletType, "w5");
  assert.equal(candidate.profile.destination.codeHash, "dest-w5-code-hash");
  assert.equal(candidate.profile.source.walletType, "v4");
  assert.equal(candidate.profile.source.codeHash, "source-code-hash");

  const second = await ingestOfflineCandidateEvents({
    events: [event],
    config,
    commander: activeCommander(),
    dedup,
    rateCap,
  });

  assert.equal(second.processed, 1);
  assert.equal(second.accepted, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(second.rejected, 0);

  const candidateLinesAfterDuplicate = (await fs.readFile(candidatesPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(candidateLinesAfterDuplicate.length, 1);

  const eventsPath = path.join(dataDir, `${campaignId}-candidate-events.jsonl`);
  const eventLines = (await fs.readFile(eventsPath, "utf8")).trim().split("\n");
  assert.equal(eventLines.length, 1);

  const duplicateEvent = JSON.parse(eventLines[0]!);
  assert.equal(duplicateEvent.eventType, "duplicate_observation");
  assert.equal(duplicateEvent.cursorLt, "900000001");

  const rateLimitedEvent: RawProviderEvent = {
    ...event,
    payload: {
      ...event.payload,
      txHash: "tx-offline-orchestrator-rate-limited",
      traceId: "trace-offline-orchestrator-rate-limited",
      messageHash: "msg-offline-orchestrator-rate-limited",
      lt: "900000002",
    },
  };

  const exhaustedRateCap = createRateCap(1, () => 1000);
  assert.equal(exhaustedRateCap.isAllowed(), true);

  const rateLimited = await ingestOfflineCandidateEvents({
    events: [rateLimitedEvent],
    config,
    commander: activeCommander(),
    dedup,
    rateCap: exhaustedRateCap,
  });

  assert.equal(rateLimited.accepted, 0);
  assert.equal(rateLimited.rateLimited, 1);
  assert.equal(rateLimited.cursor?.lt, "900000002");

  const eventLinesAfterRateLimit = (await fs.readFile(eventsPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(eventLinesAfterRateLimit.length, 2);

  const rateCapEvent = JSON.parse(eventLinesAfterRateLimit[1]!);
  assert.equal(rateCapEvent.eventType, "rate_cap_data_loss");
  assert.equal(rateCapEvent.cursorLt, "900000002");

  const passiveEvent: RawProviderEvent = {
    ...event,
    payload: {
      ...event.payload,
      txHash: "tx-offline-orchestrator-passive",
      traceId: "trace-offline-orchestrator-passive",
      messageHash: "msg-offline-orchestrator-passive",
      lt: "900000003",
    },
  };

  const passive = await ingestOfflineCandidateEvents({
    events: [passiveEvent],
    config,
    commander: passiveCommander(),
    dedup,
    rateCap,
  });

  assert.equal(passive.accepted, 0);
  assert.equal(passive.blockedByCommander, 1);
  assert.equal(passive.cursor?.lt, "900000003");

  const candidateLinesAfterPassive = (await fs.readFile(candidatesPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(candidateLinesAfterPassive.length, 1);

  const eventLinesAfterPassive = (await fs.readFile(eventsPath, "utf8"))
    .trim()
    .split("\n");
  assert.equal(eventLinesAfterPassive.length, 2);

  await fs.rm(dataDir, { recursive: true, force: true });
  console.log("[stage-b2-offline-orchestrator-smoke] PASS");
}

main().catch((err: unknown) => {
  console.error("[stage-b2-offline-orchestrator-smoke] FAIL");
  console.error(err);
  process.exit(1);
});
