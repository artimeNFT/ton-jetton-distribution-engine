/**
 * @file lib/dispatcher/batchPlanner.ts
 * @description Deterministic batch planner for Jetton distribution campaigns.
 *
 * Splits a flat list of recipients into stable, ordered batches suitable for
 * sequential processing by the distribution engine. Supports optional
 * seeded-shuffle for randomised (but reproducible) ordering.
 */

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface BatchRecipient {
  address: string;
  amount: bigint;
  tag?: string;
  memo?: string;
}

export interface PlannedBatch {
  batchId: string;
  index: number;
  recipients: BatchRecipient[];
  totalAmount: bigint;
  size: number;
}

export interface BatchPlanOptions {
  batchSize: number;
  campaignId: string;
  shuffle?: boolean;
  /**
   * Optional seed for deterministic shuffle.
   * When `shuffle` is true and `seed` is omitted, a stable seed is derived
   * from `campaignId` so the output remains reproducible.
   */
  seed?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Splits `recipients` into one or more {@link PlannedBatch} objects.
 *
 * - Input is never mutated.
 * - Batch IDs follow the format `<campaignId>-batch-<N>` (1-indexed).
 * - When `shuffle` is true the same (recipients + seed) pair always produces
 *   the same ordering, regardless of how many times this function is called.
 *
 * @throws {Error} on any validation failure with a descriptive message.
 */
export function planBatches(
  recipients: BatchRecipient[],
  options: BatchPlanOptions
): PlannedBatch[] {
  validateOptions(options);
  validateRecipients(recipients);

  // Work on a shallow copy so callers keep their original ordering.
  let ordered: BatchRecipient[] = [...recipients];

  if (options.shuffle) {
    const seed = options.seed ?? deriveSeedFromCampaignId(options.campaignId);
    ordered = seededShuffle(ordered, seed);
  }

  const batches: PlannedBatch[] = [];
  const { batchSize, campaignId } = options;

  for (let start = 0; start < ordered.length; start += batchSize) {
    const slice = ordered.slice(start, start + batchSize);
    const index = batches.length;

    batches.push({
      batchId: `${campaignId}-batch-${index + 1}`,
      index,
      recipients: slice,
      totalAmount: sumAmounts(slice),
      size: slice.length,
    });
  }

  return batches;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateOptions(options: BatchPlanOptions): void {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error(
      `[batchPlanner] batchSize must be an integer >= 1, received: ${options.batchSize}`
    );
  }

  if (typeof options.campaignId !== "string" || options.campaignId.trim().length === 0) {
    throw new Error(
      `[batchPlanner] campaignId must be a non-empty string.`
    );
  }
}

function validateRecipients(recipients: BatchRecipient[]): void {
  if (!Array.isArray(recipients)) {
    throw new Error(`[batchPlanner] recipients must be an array.`);
  }

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]!;

    if (typeof r.address !== "string" || r.address.trim().length === 0) {
      throw new Error(
        `[batchPlanner] Recipient at index ${i} has an empty or missing address.`
      );
    }

    if (typeof r.amount !== "bigint" || r.amount <= 0n) {
      throw new Error(
        `[batchPlanner] Recipient at index ${i} (${r.address}) has an invalid amount: ` +
          `${String(r.amount)}. Amount must be a positive bigint.`
      );
    }
  }
}

// ─── Amount Aggregation ───────────────────────────────────────────────────────

function sumAmounts(recipients: BatchRecipient[]): bigint {
  return recipients.reduce((acc, r) => acc + r.amount, 0n);
}

// ─── Deterministic Seeded Shuffle ────────────────────────────────────────────

/**
 * Derives a numeric seed from an arbitrary string using a simple but stable
 * hash function (djb2 variant). This ensures shuffle behaviour is consistent
 * across Node.js versions and platforms.
 */
function deriveSeedFromCampaignId(campaignId: string): string {
  let hash = 5381;
  for (let i = 0; i < campaignId.length; i++) {
    // hash = hash * 33 ^ charCode  (djb2)
    hash = ((hash << 5) + hash) ^ campaignId.charCodeAt(i);
    hash = hash >>> 0; // keep it a 32-bit unsigned integer
  }
  return String(hash);
}

/**
 * Converts a seed string to a 32-bit unsigned integer for use as the
 * PRNG initial state.
 */
function seedToUint32(seed: string): number {
  let n = 0;
  for (let i = 0; i < seed.length; i++) {
    n = ((n << 5) - n + seed.charCodeAt(i)) >>> 0;
  }
  // Ensure non-zero so the PRNG doesn't get stuck.
  return n === 0 ? 1 : n;
}

/**
 * Xorshift32 PRNG — extremely fast, zero external dependencies, and fully
 * deterministic for any given seed. Returns a float in [0, 1).
 *
 * Reference: Marsaglia, G. (2003). "Xorshift RNGs". Journal of Statistical
 * Software, 8(14).
 */
function makeXorshift32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0; // keep unsigned
    return state / 0x100000000; // map to [0, 1)
  };
}

/**
 * Returns a new shuffled copy of `arr` using the Fisher-Yates algorithm
 * driven by a deterministic PRNG seeded from `seed`.
 *
 * Identical inputs always produce identical outputs.
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  const rand = makeXorshift32(seedToUint32(seed));

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    // Swap copy[i] and copy[j]
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }

  return copy;
}
