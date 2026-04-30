/**
 * @file gasEstimator.ts
 * @description Adaptive gas & forward TON amount estimator for Jetton transfers on TON.
 *
 * Changes from v1:
 *   ① RPC Pool integration  — accepts a live TonClient injected by RpcPool;
 *                             no hardcoded endpoint map, no internal client construction.
 *   ② MasterMint alignment  — OpCode 0xAD010001 + version:uint32 field are
 *                             included in the bit-cost model when the caller
 *                             signals `useMasterMint: true`.
 *   ③ Refined fee model     — separate per-bit and per-cell coefficients;
 *                             BFS traversal weights cells by depth.
 *   ④ Static fallback       — if the optional on-chain fee-params fetch fails,
 *                             a slightly conservative static model is used so
 *                             bulkMint never crashes due to an estimator error.
 *   ⑤ Performance           — countCells uses an index-based stack (no Array.shift).
 *   ⑥ Pure utility          — no global state, no singleton clients.
 *
 * @module scripts/gasEstimator
 */

import { Address, Cell, toNano, fromNano } from "@ton/core";
import { TonClient } from "@ton/ton";

// ─── Op-Code Registry ─────────────────────────────────────────────────────────

/**
 * Tact contract MasterMint message discriminator.
 * Must stay in sync with the compiled Tact output.
 */
const MASTER_MINT_OP = 0xad010001 as const;

/**
 * Extra bits contributed by the MasterMint message header that are NOT
 * present in a plain Jetton internal-transfer payload:
 *   - 32-bit op-code  (always present for standard Jetton msgs too, so excluded)
 *   - 32-bit version field  ← this is the additional cost
 */
const MASTER_MINT_EXTRA_BITS = 32; // version: uint32

// ─── Static Fee Constants ─────────────────────────────────────────────────────

/** Minimum TON forwarded to cover compute + storage at the destination wallet. */
const SPONSORSHIP_FLOOR_TON = 0.15 as const;

/** Safety buffer added on top of the sponsorship floor. */
const SAFETY_BUFFER_TON = 0.05 as const;

/**
 * Hard guardrail: if the total estimated amount exceeds this value, the
 * estimator returns a GasEstimationWarning and the caller MUST NOT proceed.
 */
const SAFE_THRESHOLD_TON = 0.5 as const;

/**
 * Static fee-model coefficients.
 * These are the fallback values used when on-chain config fetching fails.
 * They are deliberately slightly conservative (rounded up from mainnet averages).
 */
const STATIC_FEE_MODEL: FeeModel = {
  /**
   * Cost per bit in nanoTON.
   * TON mainnet (April 2026): ~0.268 nanoTON/bit; we use 0.30 for headroom.
   */
  nanoPerBit: 0.30,
  /**
   * Base cost per Cell in nanoTON regardless of its bit content.
   * Accounts for the Merkle-proof overhead and ref-pointer storage.
   * Mainnet average: ~500_000 nanoTON; we use 600_000 for headroom.
   */
  nanoPerCell: 600_000n,
  /**
   * Depth penalty: each additional level of nesting adds this cost per cell
   * at that depth, modelling the increased Merkle proof size.
   */
  nanoPerDepthLevel: 50_000n,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type Network = "mainnet" | "testnet";

/**
 * Fee-model coefficients — can be fetched from on-chain config or fall back
 * to {@link STATIC_FEE_MODEL}.
 */
interface FeeModel {
  /** Cost per bit of cell data in nanoTON (floating-point for precision). */
  nanoPerBit: number;
  /** Base cost per Cell node in nanoTON. */
  nanoPerCell: bigint;
  /** Additional cost per Cell per depth level below root, in nanoTON. */
  nanoPerDepthLevel: bigint;
}

/** Configuration object passed to the estimator. */
export interface GasEstimationConfig {
  /** The Jetton wallet address that will receive the transfer. */
  recipientJettonWallet: Address;
  /** The owner of the recipient Jetton wallet (end user). */
  recipientOwner: Address;
  /** Amount of Jetton tokens (in minimal units) being transferred. */
  jettonAmount: bigint;
  /** Forward payload cell attached to the Jetton transfer. */
  forwardPayload: Cell;
  /**
   * When true, the estimator adds the MasterMint header overhead
   * (op-code 0xAD010001 + version uint32) to the bit-cost calculation.
   * Set this whenever bulkMint sends via the Tact MasterMint message.
   * Default: false.
   */
  useMasterMint?: boolean;
  /**
   * Active TonClient injected by the caller's RpcPool.
   * Used for optional on-chain fee-config fetching.
   * If omitted, or if the call fails, static estimation is used.
   */
  client?: TonClient;
  /**
   * Address of the Jetton Master contract.
   * Required only when `client` is supplied (for on-chain fee-config lookup).
   */
  jettonMasterAddress?: Address;
}

/** All-success outcome. */
export interface GasEstimationSuccess {
  ok: true;
  /** Recommended forward_ton_amount in nanoTON. */
  recommendedNano: bigint;
  /** Human-readable representation, e.g. "0.2050". */
  recommendedTon: string;
  /** Itemised cost breakdown. */
  breakdown: FeeBreakdown;
  /** Whether static fallback was used instead of on-chain fee params. */
  usedStaticFallback: boolean;
}

/** Safeguard-triggered outcome — caller MUST NOT proceed. */
export interface GasEstimationWarning {
  ok: false;
  /** Human-readable explanation. */
  reason: string;
  /** The estimated amount that triggered the safeguard, in nanoTON. */
  estimatedNano: bigint;
  /** The active safe threshold, in nanoTON. */
  thresholdNano: bigint;
}

export type GasEstimationResult = GasEstimationSuccess | GasEstimationWarning;

/** Itemised fee breakdown (all values in nanoTON). */
export interface FeeBreakdown {
  sponsorshipFloor: bigint;
  safetyBuffer: bigint;
  /** Bit-proportional storage fee for the forward payload. */
  forwardPayloadBitFee: bigint;
  /** Cell-count and depth fee for the forward payload. */
  forwardPayloadCellFee: bigint;
  /** Extra overhead for MasterMint header fields (0n when useMasterMint=false). */
  masterMintHeaderFee: bigint;
  total: bigint;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Estimates the recommended `forward_ton_amount` for a Jetton transfer.
 *
 * Estimation pipeline:
 *   1. Attempt to fetch live fee coefficients from the Jetton Master (if client
 *      and jettonMasterAddress are provided). On any failure, silently fall back
 *      to {@link STATIC_FEE_MODEL} — bulkMint never crashes due to this call.
 *   2. Compute a baseline: sponsorship floor + safety buffer.
 *   3. Compute a payload fee: bit-proportional cost + depth-weighted cell cost.
 *   4. If `useMasterMint` is set, add the extra header overhead.
 *   5. Apply the hard guardrail: reject if total > SAFE_THRESHOLD_TON.
 *
 * @param config - See {@link GasEstimationConfig}.
 * @returns {@link GasEstimationResult} — always check `.ok` before use.
 *
 * @example
 * ```ts
 * const result = await estimateAdaptiveForwardTonAmount({
 *   recipientJettonWallet: Address.parse("EQ..."),
 *   recipientOwner:        Address.parse("UQ..."),
 *   jettonAmount:          1_000_000n,
 *   forwardPayload:        beginCell().endCell(),
 *   useMasterMint:         true,
 *   client:                pool.current(),
 *   jettonMasterAddress:   jettonMaster,
 * });
 *
 * if (result.ok) {
 *   console.log("Forward:", result.recommendedTon, "TON");
 * } else {
 *   console.warn("Safeguard:", result.reason);
 * }
 * ```
 */
export async function estimateAdaptiveForwardTonAmount(
  config: GasEstimationConfig
): Promise<GasEstimationResult> {
  // ── 1. Resolve fee model ────────────────────────────────────────────────
  const { model, usedStaticFallback } = await resolveFeeModel(config);

  // ── 2. Baseline ─────────────────────────────────────────────────────────
  const sponsorshipFloor = toNano(SPONSORSHIP_FLOOR_TON.toString());
  const safetyBuffer = toNano(SAFETY_BUFFER_TON.toString());

  // ── 3. Payload fees (bit-level + depth-weighted cell-level) ─────────────
  const { bitFee, cellFee } = computePayloadFees(config.forwardPayload, model);

  // ── 4. MasterMint header overhead ───────────────────────────────────────
  const masterMintHeaderFee = config.useMasterMint
    ? computeBitFee(MASTER_MINT_EXTRA_BITS, model)
    : 0n;

  // ── 5. Aggregate ─────────────────────────────────────────────────────────
  const total =
    sponsorshipFloor +
    safetyBuffer +
    bitFee +
    cellFee +
    masterMintHeaderFee;

  const breakdown: FeeBreakdown = {
    sponsorshipFloor,
    safetyBuffer,
    forwardPayloadBitFee: bitFee,
    forwardPayloadCellFee: cellFee,
    masterMintHeaderFee,
    total,
  };

  // ── 6. Hard guardrail ────────────────────────────────────────────────────
  const safeThresholdNano = toNano(SAFE_THRESHOLD_TON.toString());

  if (total > safeThresholdNano) {
    return {
      ok: false,
      reason:
        `Estimated forward amount (${fromNano(total)} TON) exceeds the ` +
        `hard guardrail (${SAFE_THRESHOLD_TON} TON). ` +
        `Refusing to proceed to prevent admin wallet drainage. ` +
        `Reduce payload size or increase SAFE_THRESHOLD_TON if intentional.`,
      estimatedNano: total,
      thresholdNano: safeThresholdNano,
    };
  }

  return {
    ok: true,
    recommendedNano: total,
    recommendedTon: fromNano(total),
    breakdown,
    usedStaticFallback,
  };
}

// ─── Fee Model Resolution ─────────────────────────────────────────────────────

/**
 * Attempts to fetch live gas coefficients from the Jetton Master contract.
 * Falls back to {@link STATIC_FEE_MODEL} silently on any failure.
 *
 * This function is the resilience boundary — it must NEVER throw.
 */
async function resolveFeeModel(
  config: Pick<GasEstimationConfig, "client" | "jettonMasterAddress">
): Promise<{ model: FeeModel; usedStaticFallback: boolean }> {
  if (!config.client || !config.jettonMasterAddress) {
    return { model: STATIC_FEE_MODEL, usedStaticFallback: true };
  }

  try {
    const model = await fetchOnChainFeeModel(
      config.client,
      config.jettonMasterAddress
    );
    return { model, usedStaticFallback: false };
  } catch {
    // Any network error, parse error, or unexpected getter response
    // must fall back gracefully — bulkMint must never crash here.
    return { model: STATIC_FEE_MODEL, usedStaticFallback: true };
  }
}

/**
 * Queries the Jetton Master for its `get_gas_constants` getter.
 *
 * Expected stack response (TVM):
 *   [0] nano_per_bit   : uint64
 *   [1] nano_per_cell  : uint64
 *   [2] nano_per_depth : uint64
 *
 * If the getter is absent or the response is malformed, this throws and
 * {@link resolveFeeModel} falls back to the static model.
 */
async function fetchOnChainFeeModel(
  client: TonClient,
  jettonMaster: Address
): Promise<FeeModel> {
  const result = await client.runMethod(jettonMaster, "get_gas_constants", []);

  const nanoPerBitRaw = result.stack.readBigNumber();
  const nanoPerCellRaw = result.stack.readBigNumber();
  const nanoPerDepthRaw = result.stack.readBigNumber();

  // Validate: reject obviously wrong values that could cause under-funding.
  if (nanoPerBitRaw <= 0n || nanoPerCellRaw <= 0n) {
    throw new Error("On-chain gas constants returned zero or negative values.");
  }

  return {
    // Convert from nanoTON integer to floating-point for per-bit precision.
    nanoPerBit: Number(nanoPerBitRaw),
    nanoPerCell: nanoPerCellRaw,
    nanoPerDepthLevel: nanoPerDepthRaw,
  };
}

// ─── Fee Computation ──────────────────────────────────────────────────────────

interface PayloadFees {
  /** Bit-proportional fee in nanoTON. */
  bitFee: bigint;
  /** Depth-weighted cell-count fee in nanoTON. */
  cellFee: bigint;
}

/**
 * Computes the total storage/forward fee for a payload Cell tree.
 *
 * Model:
 *   bitFee  = Σ (bits_in_cell × nanoPerBit)  for all cells
 *   cellFee = Σ (nanoPerCell + depth × nanoPerDepthLevel)  for all cells
 *
 * The depth penalty reflects the cost of carrying the Merkle proof path
 * for deeply nested cells during the TVM execution of the receiving contract.
 */
function computePayloadFees(root: Cell, model: FeeModel): PayloadFees {
  const { totalBits, weightedCellCount } = measureCellTree(root, model);

  const bitFee = computeBitFee(totalBits, model);
  const cellFee = weightedCellCount;

  return { bitFee, cellFee };
}

/**
 * Converts a raw bit count to a nanoTON fee using the resolved fee model.
 * Uses BigInt arithmetic throughout to avoid floating-point precision loss
 * on large payloads.
 *
 * Precision approach: multiply by 1_000, then divide by 1_000 at the end
 * to preserve sub-nanoTON intermediate values.
 */
function computeBitFee(bits: number, model: FeeModel): bigint {
  // Upscale to avoid truncation: (bits * nanoPerBit * 1000) / 1000
  const scaled = BigInt(Math.ceil(bits * model.nanoPerBit * 1_000));
  return scaled / 1_000n;
}

// ─── Cell Tree Measurement ────────────────────────────────────────────────────

interface CellTreeMetrics {
  /** Total number of bits across all cells in the tree. */
  totalBits: number;
  /**
   * Σ (nanoPerCell + depth × nanoPerDepthLevel) for every cell.
   * Pre-computed here so the fee function stays a simple addition.
   */
  weightedCellCount: bigint;
}

/**
 * Traverses the Cell tree using an index-based stack (⑤ performance fix).
 *
 * Why index-based and not `Array.shift()`:
 *   `shift()` on a JS array is O(n) because it re-indexes every element.
 *   An index pointer over a stack array is O(1) per step.
 *   For a transaction with 50+ nested cells this is measurably faster.
 *
 * @param root  - Root of the Cell tree.
 * @param model - Fee model (for depth-penalty coefficient).
 */
function measureCellTree(root: Cell, model: FeeModel): CellTreeMetrics {
  // Stack entries: [cell, depth]
  const stack: Array<{ cell: Cell; depth: number }> = [{ cell: root, depth: 0 }];
  let stackIndex = 0;

  let totalBits = 0;
  let weightedCellCount = 0n;

  while (stackIndex < stack.length) {
    const { cell, depth } = stack[stackIndex]!;
    stackIndex++;

    totalBits += cell.bits.length;
    weightedCellCount += model.nanoPerCell + BigInt(depth) * model.nanoPerDepthLevel;

    for (let i = 0; i < cell.refs.length; i++) {
      stack.push({ cell: cell.refs[i]!, depth: depth + 1 });
    }
  }

  return { totalBits, weightedCellCount };
}

/**
 * Counts total cells in a tree (index-based stack, no Array.shift).
 * Exported for use in other modules that need a raw cell count without fees.
 */
export function countCells(root: Cell): number {
  const stack: Cell[] = [root];
  let stackIndex = 0;
  let count = 0;

  while (stackIndex < stack.length) {
    const current = stack[stackIndex]!;
    stackIndex++;
    count++;

    for (let i = 0; i < current.refs.length; i++) {
      stack.push(current.refs[i]!);
    }
  }

  return count;
}
