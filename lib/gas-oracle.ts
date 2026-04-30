// =============================================================
// gas-oracle.ts
// Target: @ton/ton v13+, @ton/core, zero-wrapper / standalone
// =============================================================
//
// VERIFIED CALL CHAIN (from ton-org/ton TonClient4.ts source):
//
//   1. client.getLastBlock()
//        → { last: { seqno: number, ... } }
//
//   2. client.getConfig(seqno: number, ids?: number[])
//        → { config: { cell: string } }   ← base64 BOC
//          The cell is a HashmapE(32, ^Cell).
//          It does NOT expose a .get() method directly.
//
//   3. Cell.fromBase64(config.cell)        → Cell
//
//   4. Dictionary.loadDirect(
//        Dictionary.Keys.Int(32),
//        Dictionary.Values.Cell(),
//        rootCell.beginParse()             ← must be a Slice
//      )                                   → Dictionary<number, Cell>
//
//   5. dict.get(21)                        → Cell | undefined
//
//   6. configParseGasLimitsPrices(
//        paramCell.beginParse()            ← Slice, NOT Cell
//      )   as unknown as GasLimitsPrices   ← double-cast per directive
//
//   7. prices.gasPrice >> 16n              ← normalize ×2^16 fixed-point

import { TonClient4, configParseGasLimitsPrices } from "@ton/ton";
import { Cell, Dictionary }                        from "@ton/core";

// ── [DIRECTIVE 1] Local interface — the ONLY type used for the cast ───────────
// Do not rename, do not import externally. Error 2304 is resolved by keeping
// this interface self-contained in this file.

interface GasLimitsPrices {
  flatGasLimit:     bigint;
  flatGasPrice:     bigint;
  gasPrice:         bigint;  // on-chain value = real_price × 65536
  gasLimit:         bigint;
  gasCredit:        bigint;
  blockGasLimit:    bigint;
  freezeDueLimit:   bigint;
  deleteDueLimit:   bigint;
  specialGasLimit?: bigint;
}

// ── Public exported types ─────────────────────────────────────────────────────

export interface GasSnapshot {
  /** Raw on-chain gas_price (×2^16). Preserved for audit/logging. */
  gasPriceRaw:        bigint;
  /** Normalized nanotons-per-gas-unit (gasPriceRaw >> 16). */
  gasPriceNormalized: bigint;
  flatGasPrice:       bigint;
  flatGasLimit:       bigint;
  gasLimit:           bigint;
  /** Returns the compute-phase fee in nanotons for N gas units. */
  computeFeeForGas:   (gasUnits: bigint) => bigint;
}

export interface JettonAttachOptions {
  forwardTonAmount?:  bigint;   // nanotons forwarded to recipient wallet (default: 1n)
  hasForwardPayload?: boolean;  // set true if the transfer carries a payload Cell
  configId?:          20 | 21; // 20 = masterchain, 21 = workchain-0 (default)
}

export interface JettonAttachResult {
  totalValue: bigint;
  breakdown: {
    computeTransfer:  bigint;
    computeReceive:   bigint;
    computePayload:   bigint;
    msgFwdBuffer:     bigint;
    forwardTonAmount: bigint;
  };
}

// ── fetchGasSnapshot ──────────────────────────────────────────────────────────

export async function fetchGasSnapshot(
  client:   TonClient4,
  configId: 20 | 21 = 21,
): Promise<GasSnapshot> {

  // Step 1 — get a current masterchain seqno for the config query
  const { last } = await client.getLastBlock();

  // Step 2 — fetch only the config param(s) we need
  //   Passing ids avoids downloading the full ~40-param config dictionary.
  const configResponse = await client.getConfig(last.seqno, [configId]);

  // Step 3 — deserialise the root Cell from the base64 BOC string
  const rootCell: Cell = Cell.fromBase64(configResponse.config.cell);

  // Step 4 — parse the HashmapE(32, ^Cell) dictionary
  //   Keys  : signed 32-bit integers (config param indices)
  //   Values: Cell references, one per config param
  const dict: Dictionary<number, Cell> = Dictionary.loadDirect(
    Dictionary.Keys.Int(32),
    Dictionary.Values.Cell(),
    rootCell.beginParse(),  // ← loadDirect requires a Slice
  );

  // Step 5 — extract the specific param Cell
  const paramCell: Cell | undefined = dict.get(configId);
  if (paramCell === undefined) {
    throw new Error(
      `[gas-oracle] Config param ${configId} absent from block ${last.seqno}. ` +
      `Verify your endpoint is fully synced.`,
    );
  }

  // Step 6 — parse TL-B structure
  //   [DIRECTIVE 1]: use double-cast `as unknown as GasLimitsPrices`.
  //   configParseGasLimitsPrices accepts a Slice — call .beginParse() here.
  const prices = configParseGasLimitsPrices(
    paramCell.beginParse(),
  ) as unknown as GasLimitsPrices;

  // Step 7 — normalise the fixed-point price
  //   On-chain storage: gasPrice = real_price × 2^16.
  //   >> 16n is the exact inverse (pure BigInt, no float coercion risk).
  const gasPriceNormalized: bigint = prices.gasPrice >> 16n;

  const computeFeeForGas = (gasUnits: bigint): bigint =>
    prices.flatGasPrice + gasPriceNormalized * gasUnits;

  return {
    gasPriceRaw:        prices.gasPrice,
    gasPriceNormalized,
    flatGasPrice:       prices.flatGasPrice,
    flatGasLimit:       prices.flatGasLimit,
    gasLimit:           prices.gasLimit,
    computeFeeForGas,
  };
}

// ── calcJettonTransferValue ───────────────────────────────────────────────────

/**
 * Returns the minimum safe `value` to attach to a TEP-74 Jetton transfer
 * message, computed from live on-chain gas prices.
 *
 * Gas unit budgets are conservative upper bounds for the FunC reference
 * Jetton wallet implementation.  Re-measure if using a custom contract.
 */
export async function calcJettonTransferValue(
  client:  TonClient4,
  options: JettonAttachOptions = {},
): Promise<JettonAttachResult> {
  const {
    forwardTonAmount  = 1n,
    hasForwardPayload = false,
    configId          = 21,
  } = options;

  const gas = await fetchGasSnapshot(client, configId);

  // Empirical gas unit upper bounds per operation type
  const GAS_INTERNAL_TRANSFER = 15_000n; // sender JW  → internal_transfer
  const GAS_TRANSFER_NOTIF    = 10_000n; // receiver JW → transfer_notification + excess
  const GAS_FWD_PAYLOAD       =  5_000n; // extra compute for a non-empty forward_payload

  const computeTransfer = gas.computeFeeForGas(GAS_INTERNAL_TRANSFER);
  const computeReceive  = gas.computeFeeForGas(GAS_TRANSFER_NOTIF);
  const computePayload  = hasForwardPayload
    ? gas.computeFeeForGas(GAS_FWD_PAYLOAD)
    : 0n;

  // Flat buffer covering message routing (Config 25 msg_forward_prices).
  // 0.003 TON is safe for same-workchain, single-hop transfers.
  const msgFwdBuffer = 3_000_000n;

  const totalValue =
    computeTransfer + computeReceive + computePayload +
    msgFwdBuffer + forwardTonAmount;

  return {
    totalValue,
    breakdown: {
      computeTransfer,
      computeReceive,
      computePayload,
      msgFwdBuffer,
      forwardTonAmount,
    },
  };
}