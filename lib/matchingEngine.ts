/**
 * @file lib/matchingEngine.ts
 * @description Deterministic execution plan generator for the Identity & Mint engine.
 *
 * The MatchingEngine translates provider constraints (maxTxPerHour, maxBatchSize)
 * into a concrete pacing schedule and a stable, ordered recipient index sequence.
 *
 * Design invariants:
 *   - No randomisation, jitter, or heuristic ordering.
 *   - pacingDelayMs = ceil(3_600_000 / maxTxPerHour) — always.
 *   - orderedRecipientIndexes is always the identity sequence [0, 1, ..., n-1].
 *   - All validation errors are thrown synchronously inside the async method
 *     so callers can use try/catch or .catch() uniformly.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MatchingEnginePlanInput {
  campaignId: string;
  batchId: string;
  operatorId: string;
  recipientsCount: number;
  maxBatchSize: number;
  maxTxPerHour: number;
  now: number;
}

export interface MatchingEnginePlan {
  pacingDelayMs: number;
  orderedRecipientIndexes: number[];
  policyFlags: string[];
}

export interface MatchingEngine {
  prepareExecutionPlan(input: MatchingEnginePlanInput): Promise<MatchingEnginePlan>;
}

// ─── DefaultMatchingEngine ────────────────────────────────────────────────────

export class DefaultMatchingEngine implements MatchingEngine {
  public async prepareExecutionPlan(
    input: MatchingEnginePlanInput
  ): Promise<MatchingEnginePlan> {
    if (!Number.isInteger(input.recipientsCount) || input.recipientsCount <= 0) {
      throw new Error(
        "matchingEngine: recipientsCount must be a positive integer"
      );
    }

    if (!Number.isInteger(input.maxBatchSize) || input.maxBatchSize <= 0) {
      throw new Error(
        "matchingEngine: maxBatchSize must be a positive integer"
      );
    }

    if (!Number.isInteger(input.maxTxPerHour) || input.maxTxPerHour <= 0) {
      throw new Error(
        "matchingEngine: maxTxPerHour must be a positive integer"
      );
    }

    if (input.recipientsCount > input.maxBatchSize) {
      throw new Error(
        "matchingEngine: recipientsCount exceeds provider maxBatchSize"
      );
    }

    const pacingDelayMs = Math.ceil(3_600_000 / input.maxTxPerHour);

    const orderedRecipientIndexes = Array.from(
      { length: input.recipientsCount },
      (_, index) => index
    );

    return {
      pacingDelayMs,
      orderedRecipientIndexes,
      policyFlags: [
        `max_tx_per_hour:${input.maxTxPerHour}`,
        `max_batch_size:${input.maxBatchSize}`,
        `pacing_delay_ms:${pacingDelayMs}`,
      ],
    };
  }
}
