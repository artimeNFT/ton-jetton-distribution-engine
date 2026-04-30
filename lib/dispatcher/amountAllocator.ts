/**
 * @file lib/dispatcher/amountAllocator.ts
 * @description Deterministic amount allocation engine for distribution campaigns.
 *
 * Supports:
 * - fixed:        use the recipient's existing amount unchanged
 * - predefined:   choose from a configured list of bigint values
 * - randomRange:  choose a deterministic stepped value within [min, max]
 */

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type AllocationMode = "fixed" | "predefined" | "randomRange";

export interface FixedAllocationConfig {
  mode: "fixed";
}

export interface PredefinedAllocationConfig {
  mode: "predefined";
  values: bigint[];
  cycle?: boolean;
  shuffle?: boolean;
  seed?: string;
}

export interface RandomRangeAllocationConfig {
  mode: "randomRange";
  min: bigint;
  max: bigint;
  step?: bigint; // default 1n
  seed?: string;
}

export type AllocationConfig =
  | FixedAllocationConfig
  | PredefinedAllocationConfig
  | RandomRangeAllocationConfig;

export interface AllocationContext {
  index: number;
  campaignId: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function allocateAmount(
  recipientAmount: bigint,
  config: AllocationConfig,
  context: AllocationContext
): bigint {
  validateContext(context);

  switch (config.mode) {
    case "fixed":
      return allocateFixed(recipientAmount);

    case "predefined":
      return allocatePredefined(config, context);

    case "randomRange":
      return allocateRandomRange(config, context);

    default: {
      const unreachable: never = config;
      throw new Error(
        `[amountAllocator] Unsupported allocation mode: ${String(unreachable)}`
      );
    }
  }
}

// ─── Fixed Allocation ─────────────────────────────────────────────────────────

function allocateFixed(recipientAmount: bigint): bigint {
  if (typeof recipientAmount !== "bigint" || recipientAmount <= 0n) {
    throw new Error(
      `[amountAllocator] fixed mode requires recipientAmount > 0n. Received: ${String(recipientAmount)}`
    );
  }

  return recipientAmount;
}

// ─── Predefined Allocation ────────────────────────────────────────────────────

function allocatePredefined(
  config: PredefinedAllocationConfig,
  context: AllocationContext
): bigint {
  validatePredefinedConfig(config);

  let values: bigint[] = [...config.values];

  if (config.shuffle) {
    const seed = config.seed ?? deriveSeedFromCampaignId(context.campaignId);
    values = seededShuffle(values, seed);
  }

  const selectedIndex = config.cycle
    ? context.index % values.length
    : context.index;

  if (selectedIndex < 0 || selectedIndex >= values.length) {
    throw new Error(
      `[amountAllocator] predefined mode index out of range. ` +
        `index=${context.index}, availableValues=${values.length}, cycle=${String(config.cycle ?? false)}`
    );
  }

  return values[selectedIndex]!;
}

function validatePredefinedConfig(config: PredefinedAllocationConfig): void {
  if (!Array.isArray(config.values) || config.values.length === 0) {
    throw new Error(
      `[amountAllocator] predefined mode requires a non-empty values array.`
    );
  }

  for (let i = 0; i < config.values.length; i++) {
    const value = config.values[i]!;
    if (typeof value !== "bigint" || value <= 0n) {
      throw new Error(
        `[amountAllocator] predefined mode value at index ${i} is invalid: ${String(value)}. ` +
          `Each value must be a positive bigint.`
      );
    }
  }
}

// ─── Random Range Allocation ──────────────────────────────────────────────────

function allocateRandomRange(
  config: RandomRangeAllocationConfig,
  context: AllocationContext
): bigint {
  validateRandomRangeConfig(config);

  const step = config.step ?? 1n;
  const range = config.max - config.min;
  const slots = range / step + 1n;

  const seed = config.seed ?? `${deriveSeedFromCampaignId(context.campaignId)}:${context.index}`;
  const rand = makeXorshift32(seedToUint32(seed));

  // slots is guaranteed >= 1 here
  const pick = randomBigIntBelow(slots, rand);
  return config.min + pick * step;
}

function validateRandomRangeConfig(config: RandomRangeAllocationConfig): void {
  if (typeof config.min !== "bigint" || config.min <= 0n) {
    throw new Error(
      `[amountAllocator] randomRange mode requires min > 0n. Received: ${String(config.min)}`
    );
  }

  if (typeof config.max !== "bigint" || config.max <= 0n) {
    throw new Error(
      `[amountAllocator] randomRange mode requires max > 0n. Received: ${String(config.max)}`
    );
  }

  if (config.max < config.min) {
    throw new Error(
      `[amountAllocator] randomRange mode requires max >= min. Received min=${String(config.min)}, max=${String(config.max)}`
    );
  }

  const step = config.step ?? 1n;
  if (typeof step !== "bigint" || step <= 0n) {
    throw new Error(
      `[amountAllocator] randomRange mode requires step > 0n. Received: ${String(step)}`
    );
  }

  const span = config.max - config.min;
  if (span % step !== 0n) {
    throw new Error(
      `[amountAllocator] randomRange mode requires (max - min) to align to step. ` +
        `Received min=${String(config.min)}, max=${String(config.max)}, step=${String(step)}`
    );
  }
}

// ─── Context Validation ───────────────────────────────────────────────────────

function validateContext(context: AllocationContext): void {
  if (!Number.isInteger(context.index) || context.index < 0) {
    throw new Error(
      `[amountAllocator] context.index must be an integer >= 0. Received: ${String(context.index)}`
    );
  }

  if (
    typeof context.campaignId !== "string" ||
    context.campaignId.trim().length === 0
  ) {
    throw new Error(
      `[amountAllocator] context.campaignId must be a non-empty string.`
    );
  }
}

// ─── Deterministic Shuffle / Seed Helpers ─────────────────────────────────────

function deriveSeedFromCampaignId(campaignId: string): string {
  let hash = 5381;

  for (let i = 0; i < campaignId.length; i++) {
    hash = ((hash << 5) + hash) ^ campaignId.charCodeAt(i);
    hash = hash >>> 0;
  }

  return String(hash);
}

function seedToUint32(seed: string): number {
  let n = 0;

  for (let i = 0; i < seed.length; i++) {
    n = ((n << 5) - n + seed.charCodeAt(i)) >>> 0;
  }

  return n === 0 ? 1 : n;
}

function makeXorshift32(seed: number): () => number {
  let state = seed;

  return function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state = state >>> 0;
    return state / 0x100000000;
  };
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  const rand = makeXorshift32(seedToUint32(seed));

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }

  return copy;
}

// ─── Random bigint helper ─────────────────────────────────────────────────────

/**
 * Returns a bigint in [0, upperExclusive).
 * Uses rejection-free chunk composition from deterministic 32-bit PRNG output.
 */
function randomBigIntBelow(
  upperExclusive: bigint,
  rand: () => number
): bigint {
  if (upperExclusive <= 0n) {
    throw new Error(
      `[amountAllocator] randomBigIntBelow requires upperExclusive > 0n. Received: ${String(upperExclusive)}`
    );
  }

  // Fast path for small ranges
  if (upperExclusive <= BigInt(Number.MAX_SAFE_INTEGER)) {
    const n = Number(upperExclusive);
    return BigInt(Math.floor(rand() * n));
  }

  const bits = bitLength(upperExclusive - 1n);
  const chunks = Math.ceil(bits / 32);

  while (true) {
    let value = 0n;

    for (let i = 0; i < chunks; i++) {
      const chunk = BigInt(Math.floor(rand() * 0x100000000));
      value = (value << 32n) | chunk;
    }

    const excessBits = BigInt(chunks * 32 - bits);
    if (excessBits > 0n) {
      value = value & ((1n << BigInt(bits)) - 1n);
    }

    if (value < upperExclusive) {
      return value;
    }
  }
}

function bitLength(value: bigint): number {
  let v = value;
  let bits = 0;

  while (v > 0n) {
    v >>= 1n;
    bits++;
  }

  return bits === 0 ? 1 : bits;
}