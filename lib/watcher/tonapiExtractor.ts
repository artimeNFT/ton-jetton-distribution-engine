/**
 * tonapiExtractor.ts
 *
 * Offline TonAPI-shaped payload extractor for Stage B-2 watcher fixtures.
 *
 * This module is a pure mapper:
 *   already-loaded TonAPI-shaped object -> RawProviderEvent[]
 *
 * Hard constraints:
 * - No fs. No network. No WebSocket/API/polling.
 * - No Date.now() or current-time reads.
 * - No writes of any kind.
 * - No Dispatcher, RunState, targets, candidate store, signer, sending, or execution.
 * - No fallback txHash. txHash comes only from action.base_transactions[0].hash.
 * - No inferred lt. lt comes only from action.base_transactions[0].lt.
 * - No inferred actionIndex. actionIndex comes only from action.action_index.
 * - No action collapsing. One RawProviderEvent per JettonTransfer action.
 */

import type { RawProviderEvent } from "./ingestionTypes";

export interface ExtractTonapiOptions {
  /**
   * Explicit receipt timestamp supplied by the caller/test harness.
   * The extractor must not call Date.now().
   */
  readonly receivedAt: string;

  /**
   * Explicit offline finality value.
   *
   * This must not be inferred from action.status === "ok".
   * The downstream filter validates the bounded value.
   */
  readonly finality: "confirmed" | "finalized";
}

type JsonObject = Record<string, unknown>;

export function extractTonapiRawProviderEvents(
  input: unknown,
  options: ExtractTonapiOptions,
): RawProviderEvent[] {
  if (!isObject(input)) {
    return [];
  }

  const actions = input["actions"];
  if (!Array.isArray(actions)) {
    return [];
  }

  const output: RawProviderEvent[] = [];

  for (const action of actions) {
    if (!isObject(action)) {
      continue;
    }

    if (action["type"] !== "JettonTransfer") {
      continue;
    }

    output.push(extractJettonTransferAction(action, input, options));
  }

  return output;
}

function extractJettonTransferAction(
  action: JsonObject,
  root: JsonObject,
  options: ExtractTonapiOptions,
): RawProviderEvent {
  const transfer = isObject(action["JettonTransfer"])
    ? action["JettonTransfer"]
    : {};

  const sender = isObject(transfer["sender"]) ? transfer["sender"] : null;
  const recipient = isObject(transfer["recipient"]) ? transfer["recipient"] : {};
  const jetton = isObject(transfer["jetton"]) ? transfer["jetton"] : {};
  const baseTx = firstObject(action["base_transactions"]);

  return {
    provider: "tonapi",
    receivedAt: options.receivedAt,
    payload: {
      eventType: "jetton_transfer",
      sourceAddress: sender !== null ? optionalString(sender["address"]) : null,
      destinationAddress: requiredString(recipient["address"]),
      jettonMaster: requiredString(jetton["address"]),
      amount: requiredString(transfer["amount"]),

      // Strict causality preservation:
      // txHash has exactly one source. No fallback is permitted.
      txHash: requiredString(baseTx["hash"]),

      // traceId is preserved if present. Missing traceId is causality-degraded,
      // not synthesized.
      traceId: optionalString(action["trace_id"]),

      // actionIndex preserves 0. Missing/invalid action index becomes null;
      // no value is invented.
      actionIndex: optionalNonNegativeInteger(action["action_index"]),

      // messageHash is auxiliary and may be null. It never replaces txHash.
      messageHash: optionalString(action["message_hash"]),

      // lt has exactly one source and must remain a string. No numeric
      // conversion or timestamp fallback is permitted.
      lt: requiredString(baseTx["lt"]),

      eventTimestamp: extractEventTimestamp(baseTx["utime"], root["timestamp"]),

      // Explicit caller-provided offline value. Never inferred from action.status.
      finality: options.finality,
    },
  };
}

function extractEventTimestamp(
  baseTransactionUtime: unknown,
  eventTimestamp: unknown,
): string | null {
  const baseIso = unixSecondsToIso(baseTransactionUtime);
  if (baseIso !== null) {
    return baseIso;
  }

  return unixSecondsToIso(eventTimestamp);
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function firstObject(value: unknown): JsonObject {
  if (!Array.isArray(value) || value.length === 0) {
    return {};
  }

  const first = value[0];
  return isObject(first) ? first : {};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.length > 0 ? value : null;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    return value;
  }

  return null;
}
