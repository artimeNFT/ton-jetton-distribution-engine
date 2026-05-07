/**
 * offlineCandidateIngestionOrchestrator.ts
 *
 * Offline-only candidate ingestion orchestrator for Stage B-2.
 *
 * No live provider access. No environment reads. No Dispatcher. No RunState.
 * No targets. No signing, sending, broadcasting, or execution.
 */

import { buildCandidateRecord } from "./candidateRecordBuilder";
import {
  appendCandidate,
  appendCandidateEvent,
  type RateCap,
  saveCursor,
} from "./candidateStore";
import {
  isCandidateWriteAllowed,
  type CommanderStateReader,
} from "./commanderState";
import { filterAndNormalize } from "./eventFilter";
import type {
  DedupStore,
  RawProviderEvent,
  WatcherConfig,
  WatcherCursor,
} from "./ingestionTypes";

export interface OfflineCandidateIngestionInput {
  readonly events: readonly RawProviderEvent[];
  readonly config: WatcherConfig;
  readonly commander: CommanderStateReader;
  readonly dedup: DedupStore;
  readonly rateCap: RateCap;
}

export interface OfflineCandidateIngestionSummary {
  readonly processed: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly rateLimited: number;
  readonly blockedByCommander: number;
  readonly cursor: WatcherCursor | null;
}

export async function ingestOfflineCandidateEvents(
  input: OfflineCandidateIngestionInput,
): Promise<OfflineCandidateIngestionSummary> {
  let processed = 0;
  let accepted = 0;
  let rejected = 0;
  let duplicates = 0;
  let rateLimited = 0;
  let blockedByCommander = 0;
  let cursor: WatcherCursor | null = null;

  for (const raw of input.events) {
    processed += 1;

    const filtered = filterAndNormalize(
      raw,
      input.config.jettonMasterCanonicalKey,
    );

    if (!filtered.pass) {
      rejected += 1;
      continue;
    }

    const event = filtered.event;
    const record = buildCandidateRecord(event);

    cursor = {
      lt: event.lt,
      lastEventId: event.txHash,
      updatedAt: event.detectedAt,
    };

    if (input.dedup.isSeen(record.candidateId)) {
      duplicates += 1;
      await appendCandidateEvent(input.config.dataDir, input.config.campaignId, {
        eventType: "duplicate_observation",
        ts: event.detectedAt,
        traceId: event.traceId,
        candidateId: record.candidateId,
        provider: event.provider,
        cursorLt: event.lt,
        detail: "offline orchestrator duplicate observation",
      });
      continue;
    }

    const safety = await input.commander.readSafetyState();
    if (!isCandidateWriteAllowed(safety)) {
      blockedByCommander += 1;
      continue;
    }

    if (!input.rateCap.isAllowed()) {
      rateLimited += 1;
      await appendCandidateEvent(input.config.dataDir, input.config.campaignId, {
        eventType: "rate_cap_data_loss",
        ts: event.detectedAt,
        traceId: event.traceId,
        candidateId: record.candidateId,
        provider: event.provider,
        cursorLt: event.lt,
        detail: "offline orchestrator rate cap data loss",
      });
      continue;
    }

    await appendCandidate(input.config.dataDir, input.config.campaignId, record);

    const seenAt = Date.parse(record.detectedAt);
    if (!Number.isFinite(seenAt)) {
      throw new Error(
        `[offlineCandidateIngestionOrchestrator] invalid detectedAt: ${record.detectedAt}`,
      );
    }

    await input.dedup.markSeen(record.candidateId, seenAt);
    accepted += 1;
  }

  if (cursor !== null) {
    await saveCursor(input.config.dataDir, cursor);
  }

  return {
    processed,
    accepted,
    rejected,
    duplicates,
    rateLimited,
    blockedByCommander,
    cursor,
  };
}
