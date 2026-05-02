/**
 * @file lib/dispatcher/dispatcher.ts
 * @description Dispatcher — entry-centric Orchestrator for the Identity & Mint engine.
 * Stage A: Hook & Lock stabilization.
 *
 * Execution source of truth: RunState.entries (never campaign-level arrays).
 *
 * Guaranteed invariant — the Hook & Lock rule:
 *   For every recipient, the corresponding StateEntry is atomically persisted
 *   with status="submitted" BEFORE executor.broadcast() is called.
 *
 * Startup sequence (non-negotiable order):
 *   1. reconciler.reconcileCampaign(...)
 *   2. reconciler.verifyMetadataPreflight(...)
 *   3. stateStore.update -> set meta.status = "running"
 *   4. Batch execution loop
 *
 * Patch notes (Stage A stabilization):
 *   1A. campaign_completed only emitted when final status truly is "completed".
 *   1B. All draft parameters explicitly typed as RunState.
 *       Unknown disposition never leaves entry as "submitted".
 *   1C. Dry-run success path writes batch_success audit.
 *   1E. Pacing sleep only between broadcasts, not before first or after last.
 *   1F. Config-driven pacing: DispatcherConfig.entryDelayMs controls inter-entry
 *       sleep (falls back to plan.pacingDelayMs when not set); batchDelayMs
 *       controls inter-batch sleep (not applied after the final batch or on
 *       stop_campaign). Both fields come exclusively from config — no hardcoded
 *       values inside this file.
 */

import * as path from "path";

import {
  planBatches,
  type BatchRecipient,
  type PlannedBatch,
} from "./batchPlanner";

import {
  makeStateKey,
  upsertEntry,
  JsonAtomicStateStore,
  type RunState,
  type StateEntry,
  type StateStatus,
  type RetryDisposition,
  type ISO8601,
} from "./stateStore";

import { type Reconciler, type TokenMetadata } from "./reconciler";

import { type MatchingEngine, type MatchingEnginePlan } from "../matchingEngine";

// --- Audit Contract (write-side) ---------------------------------------------

export type AuditEventType =
  | "campaign_started"
  | "batch_in_flight"
  | "batch_success"
  | "batch_failure"
  | "identity_rotated"
  | "campaign_completed"
  | "campaign_stopped"
  | "metadata_preflight_passed"
  | "metadata_preflight_failed";

export interface AuditRecordEvent {
  type: AuditEventType;
  campaignId: string;
  batchId?: string;
  operatorId?: string;
  attemptNumber?: number;
  ts: number;
  details?: Record<string, unknown>;
}

export interface AuditRecorder {
  write(event: AuditRecordEvent): Promise<void>;
}

// --- Provider / WalletPool ---------------------------------------------------

/** Snapshot of a provider returned by the pool for a single batch attempt. */
export interface Provider {
  id: string;
  label: string;
  maxBatchSize: number;
  maxTxPerHour: number;
}

export interface ProviderFailureInfo {
  reason: string;
  cooldownUntil?: string | null;
  failedUntil?: string | null;
  now: number;
}

export interface WalletPool {
  /** Returns the next available provider, or null if none are available. */
  getNextAvailableProvider(now: number): Provider | null;
  markSuccess(providerId: string, nowMs: number): void;
  markFailure(providerId: string, info: ProviderFailureInfo): void;
}

// --- Executor ----------------------------------------------------------------

export interface BroadcastParams {
  campaignId: string;
  batchId: string;
  recipientAddress: string;
  amount: string;
  operatorId: string;
  operatorLabel: string;
  attemptNumber: number;
  metadata: TokenMetadata;
}

export interface BroadcastResult {
  txHash: string;
  networkRef?: string | null;
}

export interface MintExecutor {
  broadcast(params: BroadcastParams): Promise<BroadcastResult>;
}

// --- Retry Policy ------------------------------------------------------------

export interface RetryDecision {
  disposition: RetryDisposition;
  reasonCode: string;
  reason: string;
  cooldownUntil?: string | null;
  failedUntil?: string | null;
}

export interface RetryPolicyInput {
  error: unknown;
  attemptNumber: number;
  batchId: string;
  campaignId: string;
  operatorId: string;
}

export interface RetryPolicy {
  classify(input: RetryPolicyInput): RetryDecision;
}

// --- Dispatcher Logger -------------------------------------------------------

export interface DispatcherLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// --- Campaign and Dispatcher Config ------------------------------------------

export interface CampaignConfig {
  campaignId: string;
  metadataFilePath: string;
  recipients: BatchRecipient[];
  batchSize: number;
  requireForceRefresh?: boolean;
  walletLabel?: string;
  shuffle?: boolean;
  seed?: string;
}

export interface DispatcherConfig {
  stateDir: string;
  reconciler: Reconciler;
  executor: MintExecutor;
  walletPool: WalletPool;
  retryPolicy: RetryPolicy;
  auditRecorder: AuditRecorder;
  matchingEngine: MatchingEngine;
  logger?: DispatcherLogger;
  dryRun?: boolean;
  /**
   * Optional inter-entry pacing delay in milliseconds.
   * Applied between consecutive recipient broadcasts within a single batch.
   * When set (> 0), overrides the matching engine's plan.pacingDelayMs.
   * When absent or 0, falls back to plan.pacingDelayMs derived from
   * provider.maxTxPerHour.
   * Must be a non-negative integer.
   */
  entryDelayMs?: number;
  /**
   * Optional inter-batch pacing delay in milliseconds.
   * Applied after each completed or aborted batch, except the final batch
   * and any batch that triggers a stop_campaign signal.
   * Must be a non-negative integer.
   */
  batchDelayMs?: number;
}

// --- Dispatch Report ---------------------------------------------------------

export interface BatchAttemptSummary {
  batchId: string;
  batchIndex: number;
  operatorId: string | null;
  succeeded: number;
  failed: number;
  cooldown: number;
  aborted: boolean;
}

export interface DispatchReport {
  campaignId: string;
  dryRun: boolean;
  totalBatches: number;
  totalRecipients: number;
  succeeded: number;
  failed: number;
  cooldown: number;
  skipped: number;
  stoppedEarly: boolean;
  completedAt: ISO8601;
  batchSummaries: BatchAttemptSummary[];
}

// --- Internal types ----------------------------------------------------------

type BatchSignal = "completed" | "aborted" | "stop_campaign";

interface BatchResult {
  signal: BatchSignal;
  summary: BatchAttemptSummary;
}

// --- Dispatcher Interface ----------------------------------------------------

export interface Dispatcher {
  dispatch(campaign: CampaignConfig): Promise<DispatchReport>;
}

// --- DefaultDispatcher -------------------------------------------------------

class DefaultDispatcher implements Dispatcher {
  private readonly stateDir: string;
  private readonly reconciler: Reconciler;
  private readonly executor: MintExecutor;
  private readonly walletPool: WalletPool;
  private readonly retryPolicy: RetryPolicy;
  private readonly auditRecorder: AuditRecorder;
  private readonly matchingEngine: MatchingEngine;
  private readonly logger: DispatcherLogger;
  private readonly dryRun: boolean;
  /** Inter-entry pacing delay (ms). 0 means fall back to plan.pacingDelayMs. */
  private readonly entryDelayMs: number;
  /** Inter-batch pacing delay (ms). 0 means no additional delay. */
  private readonly batchDelayMs: number;

  constructor(config: DispatcherConfig) {
    validateDispatcherConfig(config);
    this.stateDir = path.resolve(config.stateDir);
    this.reconciler = config.reconciler;
    this.executor = config.executor;
    this.walletPool = config.walletPool;
    this.retryPolicy = config.retryPolicy;
    this.auditRecorder = config.auditRecorder;
    this.matchingEngine = config.matchingEngine;
    this.dryRun = config.dryRun ?? false;
    this.logger = config.logger ?? buildConsoleLogger();
    this.entryDelayMs = config.entryDelayMs ?? 0;
    this.batchDelayMs = config.batchDelayMs ?? 0;
  }

  async dispatch(campaign: CampaignConfig): Promise<DispatchReport> {
    validateCampaignConfig(campaign);

    const { campaignId } = campaign;
    const statePath = path.join(this.stateDir, `${campaignId}.state.json`);
    const store = new JsonAtomicStateStore(statePath, campaignId);

    this.logger.info("[Dispatcher] Orchestration started", {
      campaignId,
      totalRecipients: campaign.recipients.length,
      batchSize: campaign.batchSize,
      dryRun: this.dryRun,
      entryDelayMs: this.entryDelayMs,
      batchDelayMs: this.batchDelayMs,
    });

    // Phase 1: Integrity Check
    try {
      await this.reconciler.reconcileCampaign({ campaignId });
    } catch (err: unknown) {
      throw new DispatcherError(
        `[Dispatcher] Integrity Check failed for campaign "${campaignId}". Cause: ${errorMessage(err)}`,
        "INTEGRITY_CHECK_FAILURE"
      );
    }

    this.logger.info("[Dispatcher] Integrity Check passed", { campaignId });

    // Phase 2: Preflight Validation
    let metadata: TokenMetadata;
    try {
      metadata = await this.reconciler.verifyMetadataPreflight({
        metadataFilePath: campaign.metadataFilePath,
        requireForceRefresh: campaign.requireForceRefresh,
      });
    } catch (err: unknown) {
      await this.auditRecorder.write({
        type: "metadata_preflight_failed",
        campaignId,
        ts: Date.now(),
        details: { error: errorMessage(err) },
      }).catch(() => undefined);
      throw new DispatcherError(
        `[Dispatcher] Preflight Validation failed for campaign "${campaignId}". Cause: ${errorMessage(err)}`,
        "PREFLIGHT_FAILURE"
      );
    }

    await this.auditRecorder.write({
      type: "metadata_preflight_passed",
      campaignId,
      ts: Date.now(),
      details: {
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        contentVersion: String(metadata.contentVersion),
      },
    }).catch(() => undefined);

    this.logger.info("[Dispatcher] Preflight Validation passed", {
      campaignId,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
    });

    // Phase 3: Mark campaign as running. (1B: draft explicitly RunState)
    await store.update((draft: RunState) => {
      draft.meta.status = "running";
      if (!draft.meta.startedAt) {
        draft.meta.startedAt = nowIso();
      }
      draft.meta.finishedAt = null;
      draft.meta.stopReason = null;
      draft.meta.lastError = null;
    });

    await this.auditRecorder.write({
      type: "campaign_started",
      campaignId,
      ts: Date.now(),
    }).catch(() => undefined);

    // Phase 4: Batch Planning
    let batches: PlannedBatch[];
    try {
      batches = planBatches(campaign.recipients, {
        batchSize: campaign.batchSize,
        campaignId,
        shuffle: campaign.shuffle,
        seed: campaign.seed,
      });
    } catch (err: unknown) {
      throw new DispatcherError(
        `[Dispatcher] Batch Planning failed for campaign "${campaignId}". Cause: ${errorMessage(err)}`,
        "BATCH_PLAN_FAILURE"
      );
    }

    this.logger.info("[Dispatcher] Batch Planning complete", {
      campaignId,
      totalBatches: batches.length,
    });

    // Phase 5: Execution Shaping loop
    const batchSummaries: BatchAttemptSummary[] = [];
    let stoppedEarly = false;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]!;
      const now = Date.now();

      const currentState = await store.read();
      const eligible = buildEligibleList(currentState, batch, now);

      if (eligible.length === 0) {
        this.logger.info("[Dispatcher] Batch has no eligible recipients, skipping", {
          campaignId,
          batchId: batch.batchId,
          batchIndex,
        });
        batchSummaries.push({
          batchId: batch.batchId,
          batchIndex,
          operatorId: null,
          succeeded: 0,
          failed: 0,
          cooldown: 0,
          aborted: false,
        });

        // 1F: Batch pacing — apply even for skipped batches (not after last).
        if (this.batchDelayMs > 0 && batchIndex < batches.length - 1) {
          await this.sleep(this.batchDelayMs);
        }
        continue;
      }

      // Increment batchAttempts counter. (1B: draft explicitly RunState)
      await store.update((draft: RunState) => {
        draft.meta.batchAttempts[batch.batchId] =
          (draft.meta.batchAttempts[batch.batchId] ?? 0) + 1;
      });

      const provider = this.walletPool.getNextAvailableProvider(Date.now());
      if (!provider) {
        this.logger.warn("[Dispatcher] No available provider for batch, deferring", {
          campaignId,
          batchId: batch.batchId,
        });
        batchSummaries.push({
          batchId: batch.batchId,
          batchIndex,
          operatorId: null,
          succeeded: 0,
          failed: 0,
          cooldown: eligible.length,
          aborted: true,
        });

        // 1F: Batch pacing — not after last batch.
        if (this.batchDelayMs > 0 && batchIndex < batches.length - 1) {
          await this.sleep(this.batchDelayMs);
        }
        continue;
      }

      const cappedEligible = eligible.slice(0, provider.maxBatchSize);

      let plan: MatchingEnginePlan;
      try {
        plan = await this.matchingEngine.prepareExecutionPlan({
          campaignId,
          batchId: batch.batchId,
          operatorId: provider.id,
          recipientsCount: cappedEligible.length,
          maxBatchSize: provider.maxBatchSize,
          maxTxPerHour: provider.maxTxPerHour,
          now: Date.now(),
        });
      } catch (err: unknown) {
        this.logger.error("[Dispatcher] Matching engine planning failed", {
          campaignId,
          batchId: batch.batchId,
          cause: errorMessage(err),
        });
        batchSummaries.push({
          batchId: batch.batchId,
          batchIndex,
          operatorId: provider.id,
          succeeded: 0,
          failed: 0,
          cooldown: cappedEligible.length,
          aborted: true,
        });

        // 1F: Batch pacing — not after last batch.
        if (this.batchDelayMs > 0 && batchIndex < batches.length - 1) {
          await this.sleep(this.batchDelayMs);
        }
        continue;
      }

      const batchAttemptNumber =
        (await store.read()).meta.batchAttempts[batch.batchId] ?? 1;

      // Set RunLock. (1B: draft explicitly RunState)
      await store.update((draft: RunState) => {
        draft.lock.activeBatchId = batch.batchId;
        draft.lock.activeOperatorId = provider.id;
        draft.lock.activeAttemptNumber = batchAttemptNumber;
        draft.lock.lockedAt = nowIso();
      });

      await this.auditRecorder.write({
        type: "batch_in_flight",
        campaignId,
        batchId: batch.batchId,
        operatorId: provider.id,
        attemptNumber: batchAttemptNumber,
        ts: Date.now(),
        details: { eligibleCount: cappedEligible.length },
      }).catch(() => undefined);

      const batchResult = await this.processBatch({
        batch,
        batchIndex,
        cappedEligible,
        plan,
        provider,
        campaign,
        metadata,
        store,
      });

      batchSummaries.push(batchResult.summary);

      // Clear RunLock. (1B: draft explicitly RunState)
      await store.update((draft: RunState) => {
        draft.lock.activeBatchId = null;
        draft.lock.activeOperatorId = null;
        draft.lock.activeAttemptNumber = null;
        draft.lock.lockedAt = null;
      });

      // 1F: Inter-batch pacing — applied after lock release, before the
      // stop_campaign check, so we never sleep on the final batch or when
      // the campaign is being terminated.
      if (
        this.batchDelayMs > 0 &&
        batchResult.signal !== "stop_campaign" &&
        batchIndex < batches.length - 1
      ) {
        this.logger.info("[Dispatcher] Batch pacing: sleeping between batches", {
          campaignId,
          batchIndex,
          batchDelayMs: this.batchDelayMs,
        });
        await this.sleep(this.batchDelayMs);
      }

      if (batchResult.signal === "stop_campaign") {
        stoppedEarly = true;
        break;
      }
    }

    // Phase 6: Finalize campaign meta
    const finalState = await store.read();

    const expectedStateKeys = batches.flatMap((batch) =>
      batch.recipients.map((recipient) => makeStateKey(batch.batchId, recipient.address))
    );

    const allExpectedEntriesTerminal =
      !stoppedEarly &&
      expectedStateKeys.length === campaign.recipients.length &&
      expectedStateKeys.every((key) => {
        const entry = finalState.entries[key];
        return (
          entry !== undefined &&
          (
            entry.status === "success" ||
            entry.status === "hard_failure" ||
            entry.status === "skipped" ||
            entry.status === "cancelled"
          )
        );
      });

    const finalStatus: "stopped" | "completed" | "running" = stoppedEarly
      ? "stopped"
      : allExpectedEntriesTerminal
      ? "completed"
      : "running";

    // (1B: draft explicitly RunState)
    await store.update((draft: RunState) => {
      draft.meta.status = finalStatus;
      if (finalStatus !== "running") {
        draft.meta.finishedAt = nowIso();
      }
    });

    // 1A: Audit event must match persisted final status exactly.
    // campaign_completed -> only when finalStatus === "completed".
    // campaign_stopped   -> only when finalStatus === "stopped".
    // "running"          -> no terminal audit event.
    if (finalStatus === "completed") {
      await this.auditRecorder.write({
        type: "campaign_completed",
        campaignId,
        ts: Date.now(),
      }).catch(() => undefined);
    } else if (finalStatus === "stopped") {
      await this.auditRecorder.write({
        type: "campaign_stopped",
        campaignId,
        ts: Date.now(),
      }).catch(() => undefined);
    }

    const report = buildDispatchReport(
      campaignId,
      this.dryRun,
      batches.length,
      campaign.recipients.length,
      stoppedEarly,
      batchSummaries
    );

    this.logger.info("[Dispatcher] Orchestration complete", {
      campaignId,
      succeeded: report.succeeded,
      failed: report.failed,
      cooldown: report.cooldown,
      skipped: report.skipped,
      stoppedEarly,
      completedAt: report.completedAt,
    });

    return report;
  }

  private async processBatch(ctx: {
    batch: PlannedBatch;
    batchIndex: number;
    cappedEligible: EligibleEntry[];
    plan: MatchingEnginePlan;
    provider: Provider;
    campaign: CampaignConfig;
    metadata: TokenMetadata;
    store: JsonAtomicStateStore;
  }): Promise<BatchResult> {
    const {
      batch,
      batchIndex,
      cappedEligible,
      plan,
      provider,
      campaign,
      metadata,
      store,
    } = ctx;
    const { campaignId } = campaign;

    // 1F: Effective entry delay — config value takes precedence; fall back to
    // plan.pacingDelayMs (derived from provider.maxTxPerHour) when not set.
    const effectiveEntryDelay: number =
      this.entryDelayMs > 0 ? this.entryDelayMs : plan.pacingDelayMs;

    let succeeded = 0;
    let failed = 0;
    let cooldown = 0;
    let aborted = false;
    let signal: BatchSignal = "completed";

    for (let planIdx = 0; planIdx < plan.orderedRecipientIndexes.length; planIdx++) {
      const recipientIdx = plan.orderedRecipientIndexes[planIdx]!;
      const eligible = cappedEligible[recipientIdx];

      if (!eligible) {
        this.logger.warn("[Dispatcher] Plan index out of range in eligible list", {
          campaignId,
          batchId: batch.batchId,
          planIdx,
          recipientIdx,
        });
        continue;
      }

      const { recipient, originalIndex } = eligible;
      const stateKey = makeStateKey(batch.batchId, recipient.address);
      const currentNow = nowIso();

      // Hook & Lock: persist "submitted" BEFORE broadcast.
      const preState = await store.read();
      const existing: StateEntry | undefined = preState.entries[stateKey];
      const nextAttemptNumber = (existing?.attemptNumber ?? 0) + 1;
      const entryCreatedAt = existing?.createdAt ?? currentNow;

      const submittedEntry: StateEntry = {
        batchId: batch.batchId,
        recipientAddress: recipient.address,
        recipientIndex: originalIndex,
        amount: recipient.amount.toString(),
        status: "submitted",
        attemptNumber: nextAttemptNumber,
        operatorId: provider.id,
        operatorLabel: provider.label,
        txHash: null,
        networkRef: null,
        createdAt: entryCreatedAt,
        updatedAt: currentNow,
        submittedAt: currentNow,
        finalizedAt: null,
        cooldownUntil: null,
        lastErrorCode: null,
        lastError: null,
        lastDecision: "none",
      };

      // Atomic persistence of submitted state. (1B: draft explicitly RunState)
      await store.update((draft: RunState) => {
        upsertEntry(draft, stateKey, submittedEntry);
      });

      this.logger.info("[Dispatcher] Hook & Lock: entry submitted", {
        campaignId,
        batchId: batch.batchId,
        stateKey,
        attemptNumber: nextAttemptNumber,
        operatorId: provider.id,
      });

      // Broadcast
      if (this.dryRun) {
        const successNow = nowIso();
        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "success",
            updatedAt: successNow,
            finalizedAt: successNow,
            txHash: "dry-run-tx",
            networkRef: null,
            lastErrorCode: null,
            lastError: null,
            lastDecision: "none",
          });
        });
        this.walletPool.markSuccess(provider.id, Date.now());

        // 1C: Dry-run success writes batch_success audit, identical shape to live path.
        await this.auditRecorder.write({
          type: "batch_success",
          campaignId,
          batchId: batch.batchId,
          operatorId: provider.id,
          attemptNumber: nextAttemptNumber,
          ts: Date.now(),
          details: {
            stateKey,
            txHash: "dry-run-tx",
            networkRef: null,
            dryRun: true,
          },
        }).catch(() => undefined);

        succeeded++;

        // 1E + 1F: sleep after success only if another recipient follows.
        if (planIdx < plan.orderedRecipientIndexes.length - 1) {
          await this.sleep(effectiveEntryDelay);
        }
        continue;
      }

      let broadcastResult: BroadcastResult | null = null;
      let broadcastError: unknown = null;

      try {
        broadcastResult = await this.executor.broadcast({
          campaignId,
          batchId: batch.batchId,
          recipientAddress: recipient.address,
          amount: recipient.amount.toString(),
          operatorId: provider.id,
          operatorLabel: provider.label,
          attemptNumber: nextAttemptNumber,
          metadata,
        });
      } catch (err: unknown) {
        broadcastError = err;
      }

      // Success path
      if (broadcastResult !== null) {
        const successNow = nowIso();
        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "success",
            txHash: broadcastResult!.txHash,
            networkRef: broadcastResult!.networkRef ?? null,
            updatedAt: successNow,
            finalizedAt: successNow,
            lastErrorCode: null,
            lastError: null,
            lastDecision: "none",
          });
        });

        this.walletPool.markSuccess(provider.id, Date.now());

        await this.auditRecorder.write({
          type: "batch_success",
          campaignId,
          batchId: batch.batchId,
          operatorId: provider.id,
          attemptNumber: nextAttemptNumber,
          ts: Date.now(),
          details: {
            stateKey,
            txHash: broadcastResult.txHash,
            networkRef: broadcastResult.networkRef ?? null,
          },
        }).catch(() => undefined);

        succeeded++;

        this.logger.info("[Dispatcher] Broadcast succeeded", {
          campaignId,
          batchId: batch.batchId,
          stateKey,
          txHash: broadcastResult.txHash,
        });

        // 1E + 1F: sleep after success only if another recipient follows.
        if (planIdx < plan.orderedRecipientIndexes.length - 1) {
          await this.sleep(effectiveEntryDelay);
        }
        continue;
      }

      // Failure path
      const decision = this.retryPolicy.classify({
        error: broadcastError,
        attemptNumber: nextAttemptNumber,
        batchId: batch.batchId,
        campaignId,
        operatorId: provider.id,
      });

      this.logger.warn("[Dispatcher] Outcome Classification: failure", {
        campaignId,
        batchId: batch.batchId,
        stateKey,
        disposition: decision.disposition,
        reasonCode: decision.reasonCode,
        reason: decision.reason,
      });

      await this.auditRecorder.write({
        type: "batch_failure",
        campaignId,
        batchId: batch.batchId,
        operatorId: provider.id,
        attemptNumber: nextAttemptNumber,
        ts: Date.now(),
        details: {
          stateKey,
          disposition: decision.disposition,
          reasonCode: decision.reasonCode,
          reason: decision.reason,
        },
      }).catch(() => undefined);

      // Branch: retry_same_identity
      if (decision.disposition === "retry_same_identity") {
        const retryNow = nowIso();
        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "planned",
            updatedAt: retryNow,
            finalizedAt: retryNow,
            lastErrorCode: decision.reasonCode,
            lastError: decision.reason,
            lastDecision: "retry_same_identity",
          });
        });
        // Do NOT call walletPool.markFailure for retry_same_identity.
        continue;
      }

      // Branch: rotate_identity
      if (decision.disposition === "rotate_identity") {
        this.walletPool.markFailure(provider.id, {
          reason: decision.reason,
          cooldownUntil: decision.cooldownUntil ?? null,
          failedUntil: decision.failedUntil ?? null,
          now: Date.now(),
        });

        const rotateNow = nowIso();
        const isCooldown =
          decision.cooldownUntil != null &&
          new Date(decision.cooldownUntil).getTime() > Date.now();

        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: isCooldown ? "cooldown" : "planned",
            cooldownUntil: decision.cooldownUntil
              ? new Date(decision.cooldownUntil).toISOString()
              : null,
            updatedAt: rotateNow,
            finalizedAt: rotateNow,
            lastErrorCode: decision.reasonCode,
            lastError: decision.reason,
            lastDecision: "rotate_identity",
          });
        });

        await this.auditRecorder.write({
          type: "identity_rotated",
          campaignId,
          batchId: batch.batchId,
          operatorId: provider.id,
          attemptNumber: nextAttemptNumber,
          ts: Date.now(),
          details: {
            stateKey,
            reason: decision.reason,
            cooldownUntil: decision.cooldownUntil ?? null,
          },
        }).catch(() => undefined);

        aborted = true;
        cooldown += plan.orderedRecipientIndexes.length - planIdx - 1;
        signal = "aborted";
        break;
      }

      // Branch: fail_batch
      if (decision.disposition === "fail_batch") {
        const failNow = nowIso();
        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "hard_failure",
            updatedAt: failNow,
            finalizedAt: failNow,
            lastErrorCode: decision.reasonCode,
            lastError: decision.reason,
            lastDecision: "fail_batch",
          });
        });

        failed++;
        aborted = true;
        cooldown += plan.orderedRecipientIndexes.length - planIdx - 1;
        signal = "aborted";
        break;
      }

      // Branch: stop_campaign
      if (decision.disposition === "stop_campaign") {
        const stopNow = nowIso();
        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "hard_failure",
            updatedAt: stopNow,
            finalizedAt: stopNow,
            lastErrorCode: decision.reasonCode,
            lastError: decision.reason,
            lastDecision: "stop_campaign",
          });
          draft.meta.status = "stopped";
          draft.meta.finishedAt = stopNow;
          draft.meta.stopReason = decision.reason;
          draft.meta.lastError = decision.reason;
        });

        failed++;
        signal = "stop_campaign";
        break;
      }

      // Branch: unknown disposition
      // 1B: Unknown disposition must NEVER leave entry as "submitted".
      {
        const unknownDisposition = String((decision as RetryDecision).disposition);
        const unknownNow = nowIso();

        this.logger.error(
          "[Dispatcher] Unknown retry disposition, aborting batch to prevent zombie",
          {
            campaignId,
            batchId: batch.batchId,
            stateKey,
            disposition: unknownDisposition,
          }
        );

        // (1B: draft explicitly RunState)
        await store.update((draft: RunState) => {
          upsertEntry(draft, stateKey, {
            ...submittedEntry,
            status: "hard_failure",
            updatedAt: unknownNow,
            finalizedAt: unknownNow,
            lastErrorCode: "unknown_retry_disposition",
            lastError: `Unsupported retry disposition: "${unknownDisposition}". Entry aborted to prevent zombie.`,
            lastDecision: "fail_batch",
          });
        });

        await this.auditRecorder.write({
          type: "batch_failure",
          campaignId,
          batchId: batch.batchId,
          operatorId: provider.id,
          attemptNumber: nextAttemptNumber,
          ts: Date.now(),
          details: {
            stateKey,
            disposition: unknownDisposition,
            reasonCode: "unknown_retry_disposition",
            reason: `Unsupported retry disposition: "${unknownDisposition}"`,
          },
        }).catch(() => undefined);

        failed++;
        aborted = true;
        cooldown += plan.orderedRecipientIndexes.length - planIdx - 1;
        signal = "aborted";
        break;
      }
    }

    return {
      signal,
      summary: {
        batchId: batch.batchId,
        batchIndex,
        operatorId: provider.id,
        succeeded,
        failed,
        cooldown,
        aborted,
      },
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

// --- Factory -----------------------------------------------------------------

export function createDispatcher(config: DispatcherConfig): Dispatcher {
  return new DefaultDispatcher(config);
}

// --- DispatcherError ---------------------------------------------------------

export type DispatcherErrorCode =
  | "CONFIG_INVALID"
  | "INTEGRITY_CHECK_FAILURE"
  | "PREFLIGHT_FAILURE"
  | "BATCH_PLAN_FAILURE"
  | "STATE_SAVE_FAILURE";

export class DispatcherError extends Error {
  public readonly code: DispatcherErrorCode;
  constructor(message: string, code: DispatcherErrorCode) {
    super(message);
    this.name = "DispatcherError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// --- Eligible-Entry Resolution -----------------------------------------------

interface EligibleEntry {
  recipient: BatchRecipient;
  originalIndex: number;
}

function buildEligibleList(
  state: RunState,
  batch: PlannedBatch,
  nowMs: number
): EligibleEntry[] {
  const eligible: EligibleEntry[] = [];

  for (let i = 0; i < batch.recipients.length; i++) {
    const recipient = batch.recipients[i]!;
    const key = makeStateKey(batch.batchId, recipient.address);
    const entry: StateEntry | undefined = state.entries[key];

    if (entry === undefined) {
      eligible.push({ recipient, originalIndex: i });
      continue;
    }
    if (entry.status === "planned") {
      eligible.push({ recipient, originalIndex: i });
      continue;
    }
    if (entry.status === "cooldown") {
      if (!entry.cooldownUntil || new Date(entry.cooldownUntil).getTime() <= nowMs) {
        eligible.push({ recipient, originalIndex: i });
      }
      continue;
    }
    // "success", "hard_failure", "skipped", "cancelled", "submitted" -> not eligible.
  }

  return eligible;
}

// --- Report Builder ----------------------------------------------------------

function buildDispatchReport(
  campaignId: string,
  dryRun: boolean,
  totalBatches: number,
  totalRecipients: number,
  stoppedEarly: boolean,
  summaries: BatchAttemptSummary[]
): DispatchReport {
  const agg = summaries.reduce(
    (acc, s) => ({
      succeeded: acc.succeeded + s.succeeded,
      failed: acc.failed + s.failed,
      cooldown: acc.cooldown + s.cooldown,
    }),
    { succeeded: 0, failed: 0, cooldown: 0 }
  );

  const skipped = totalRecipients - agg.succeeded - agg.failed - agg.cooldown;

  return {
    campaignId,
    dryRun,
    totalBatches,
    totalRecipients,
    succeeded: agg.succeeded,
    failed: agg.failed,
    cooldown: agg.cooldown,
    skipped: Math.max(0, skipped),
    stoppedEarly,
    completedAt: nowIso(),
    batchSummaries: summaries,
  };
}

// --- Config Validation -------------------------------------------------------

function validateDispatcherConfig(config: DispatcherConfig): void {
  if (!config || typeof config !== "object") {
    throw new DispatcherError(
      "[Dispatcher] DispatcherConfig must be a non-null object.",
      "CONFIG_INVALID"
    );
  }
  requireNonEmptyString(config.stateDir, "stateDir");
  requireInterface(config.reconciler, "reconciler", [
    "reconcileCampaign",
    "verifyMetadataPreflight",
  ]);
  requireInterface(config.executor, "executor", ["broadcast"]);
  requireInterface(config.walletPool, "walletPool", [
    "getNextAvailableProvider",
    "markSuccess",
    "markFailure",
  ]);
  requireInterface(config.retryPolicy, "retryPolicy", ["classify"]);
  requireInterface(config.auditRecorder, "auditRecorder", ["write"]);
  requireInterface(config.matchingEngine, "matchingEngine", ["prepareExecutionPlan"]);

  // 1F: Validate optional pacing fields when provided.
  if (
    config.entryDelayMs !== undefined &&
    (!Number.isInteger(config.entryDelayMs) || config.entryDelayMs < 0)
  ) {
    throw new DispatcherError(
      `[Dispatcher] "entryDelayMs" must be a non-negative integer when provided. ` +
        `Got: ${String(config.entryDelayMs)}.`,
      "CONFIG_INVALID"
    );
  }
  if (
    config.batchDelayMs !== undefined &&
    (!Number.isInteger(config.batchDelayMs) || config.batchDelayMs < 0)
  ) {
    throw new DispatcherError(
      `[Dispatcher] "batchDelayMs" must be a non-negative integer when provided. ` +
        `Got: ${String(config.batchDelayMs)}.`,
      "CONFIG_INVALID"
    );
  }
}

function validateCampaignConfig(config: CampaignConfig): void {
  if (!config || typeof config !== "object") {
    throw new DispatcherError(
      "[Dispatcher] CampaignConfig must be a non-null object.",
      "CONFIG_INVALID"
    );
  }
  requireNonEmptyString(config.campaignId, "campaignId");
  requireNonEmptyString(config.metadataFilePath, "metadataFilePath");
  if (!Array.isArray(config.recipients) || config.recipients.length === 0) {
    throw new DispatcherError(
      "[Dispatcher] CampaignConfig.recipients must be a non-empty array.",
      "CONFIG_INVALID"
    );
  }
  if (!Number.isInteger(config.batchSize) || config.batchSize < 1) {
    throw new DispatcherError(
      `[Dispatcher] CampaignConfig.batchSize must be a positive integer. Got: ${String(config.batchSize)}.`,
      "CONFIG_INVALID"
    );
  }
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DispatcherError(
      `[Dispatcher] "${field}" must be a non-empty string.`,
      "CONFIG_INVALID"
    );
  }
}

function requireInterface(obj: unknown, name: string, methods: string[]): void {
  if (!obj || typeof obj !== "object") {
    throw new DispatcherError(
      `[Dispatcher] config.${name} must be a non-null object.`,
      "CONFIG_INVALID"
    );
  }
  for (const method of methods) {
    if (typeof (obj as Record<string, unknown>)[method] !== "function") {
      throw new DispatcherError(
        `[Dispatcher] config.${name} is missing required method "${method}".`,
        "CONFIG_INVALID"
      );
    }
  }
}

// --- Utilities ---------------------------------------------------------------

function nowIso(): ISO8601 {
  return new Date().toISOString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildConsoleLogger(): DispatcherLogger {
  const fmt = (level: string, msg: string, meta?: Record<string, unknown>): string =>
    JSON.stringify({ level, msg, ...(meta ?? {}), ts: new Date().toISOString() });

  return {
    info: (msg, meta) => console.log(fmt("info", msg, meta)),
    warn: (msg, meta) => console.warn(fmt("warn", msg, meta)),
    error: (msg, meta) => console.error(fmt("error", msg, meta)),
  };
}

// --- Re-export state types for external callers ------------------------------
export type { RunState, StateEntry, StateStatus, RetryDisposition } from "./stateStore";