import type { DispatchIntent } from "./decisionStoreRunStateAdapter";
import {
  makeStateKey,
  type RunState,
  type StateEntry,
  type StateKey,
} from "./stateStore";

export type RunStatePlanApplyReason =
  | "invalid_input"
  | "invalid_run_state"
  | "invalid_intent"
  | "state_key_mismatch"
  | "intent_entry_mismatch"
  | "existing_entry_conflict"
  | "terminal_existing_entry"
  | "active_existing_entry";

export type RunStatePlanApplyResult =
  | {
      readonly ok: true;
      readonly action: "insert_entry";
      readonly stateKey: StateKey;
      readonly entry: StateEntry;
    }
  | {
      readonly ok: true;
      readonly action: "skip_identical_existing";
      readonly stateKey: StateKey;
      readonly existingEntry: StateEntry;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: RunStatePlanApplyReason;
      readonly stateKey?: StateKey;
      readonly existingEntry?: StateEntry;
    };

interface RunStatePlanApplyInput {
  readonly runState: RunState;
  readonly intent: DispatchIntent;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPositiveDecimalString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;

  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isIsoLike(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function rejected(
  reason: RunStatePlanApplyReason,
  extras: { stateKey?: StateKey; existingEntry?: StateEntry } = {},
): RunStatePlanApplyResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: RunStatePlanApplyReason;
    stateKey?: StateKey;
    existingEntry?: StateEntry;
  } = { ok: false, action: "rejected", reason };

  if (extras.stateKey !== undefined) result.stateKey = extras.stateKey;
  if (extras.existingEntry !== undefined) result.existingEntry = extras.existingEntry;

  return result;
}

function isRunState(value: unknown): value is RunState {
  if (!isNonArrayObject(value)) return false;
  if (value["schemaVersion"] !== "stage-a-entry-centric-v1") return false;
  if (!isNonArrayObject(value["entries"])) return false;
  if (!isNonArrayObject(value["meta"])) return false;
  if (!isNonArrayObject(value["operators"])) return false;
  if (!isNonArrayObject(value["lock"])) return false;
  return true;
}

function isStateEntry(value: unknown): value is StateEntry {
  if (!isNonArrayObject(value)) return false;

  const status = value["status"];

  return (
    isNonEmptyString(value["batchId"]) &&
    isNonEmptyString(value["recipientAddress"]) &&
    isSafeNonNegativeInteger(value["recipientIndex"]) &&
    isPositiveDecimalString(value["amount"]) &&
    typeof status === "string" &&
    ["planned", "submitted", "success", "hard_failure", "cooldown", "skipped", "cancelled"].includes(status) &&
    isSafeNonNegativeInteger(value["attemptNumber"]) &&
    (typeof value["operatorId"] === "string" || value["operatorId"] === null) &&
    (typeof value["operatorLabel"] === "string" || value["operatorLabel"] === null) &&
    (typeof value["txHash"] === "string" || value["txHash"] === null) &&
    (typeof value["networkRef"] === "string" || value["networkRef"] === null) &&
    isIsoLike(value["createdAt"]) &&
    isIsoLike(value["updatedAt"]) &&
    (isIsoLike(value["submittedAt"]) || value["submittedAt"] === null) &&
    (isIsoLike(value["finalizedAt"]) || value["finalizedAt"] === null) &&
    (isIsoLike(value["cooldownUntil"]) || value["cooldownUntil"] === null) &&
    (typeof value["lastErrorCode"] === "string" || value["lastErrorCode"] === null) &&
    (typeof value["lastError"] === "string" || value["lastError"] === null) &&
    (
      value["lastDecision"] === null ||
      ["none", "retry_same_identity", "rotate_identity", "fail_batch", "stop_campaign"].includes(String(value["lastDecision"]))
    )
  );
}

function isDispatchIntent(value: unknown): value is DispatchIntent {
  if (!isNonArrayObject(value)) return false;
  if (!isNonEmptyString(value["stateKey"])) return false;
  if (!isNonEmptyString(value["decisionId"])) return false;
  if (!isNonEmptyString(value["candidateId"])) return false;
  if (!isStateEntry(value["entry"])) return false;
  if (!isNonArrayObject(value["evidence"])) return false;
  return true;
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function canonicalEntry(entry: StateEntry): string {
  return stableStringify({
    batchId: entry.batchId,
    recipientAddress: entry.recipientAddress,
    recipientIndex: entry.recipientIndex,
    amount: entry.amount,
    status: entry.status,
    attemptNumber: entry.attemptNumber,
    operatorId: entry.operatorId,
    operatorLabel: entry.operatorLabel,
    txHash: entry.txHash,
    networkRef: entry.networkRef,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    submittedAt: entry.submittedAt,
    finalizedAt: entry.finalizedAt,
    cooldownUntil: entry.cooldownUntil,
    lastErrorCode: entry.lastErrorCode,
    lastError: entry.lastError,
    lastDecision: entry.lastDecision,
    metadata: entry.metadata ?? null,
  });
}

function isTerminalStatus(status: StateEntry["status"]): boolean {
  return (
    status === "success" ||
    status === "hard_failure" ||
    status === "skipped" ||
    status === "cancelled"
  );
}

function isActiveStatus(status: StateEntry["status"]): boolean {
  return status === "submitted" || status === "cooldown";
}

function validateIntentEntry(intent: DispatchIntent): RunStatePlanApplyReason | null {
  const expectedStateKey = makeStateKey(
    intent.entry.batchId,
    intent.entry.recipientAddress,
  );

  if (intent.stateKey !== expectedStateKey) {
    return "state_key_mismatch";
  }

  if (intent.entry.status !== "planned") {
    return "intent_entry_mismatch";
  }

  if (intent.entry.attemptNumber !== 0) {
    return "intent_entry_mismatch";
  }

  if (
    intent.entry.operatorId !== null ||
    intent.entry.operatorLabel !== null ||
    intent.entry.txHash !== null ||
    intent.entry.networkRef !== null ||
    intent.entry.submittedAt !== null ||
    intent.entry.finalizedAt !== null ||
    intent.entry.cooldownUntil !== null ||
    intent.entry.lastErrorCode !== null ||
    intent.entry.lastError !== null ||
    intent.entry.lastDecision !== null
  ) {
    return "intent_entry_mismatch";
  }

  return null;
}

export function planRunStateDispatchIntentApply(
  input: unknown,
): RunStatePlanApplyResult {
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as RunStatePlanApplyInput;

  if (!isRunState(candidate.runState)) {
    return rejected("invalid_run_state");
  }

  if (!isDispatchIntent(candidate.intent)) {
    return rejected("invalid_intent");
  }

  const intentValidation = validateIntentEntry(candidate.intent);
  if (intentValidation !== null) {
    return rejected(intentValidation, { stateKey: candidate.intent.stateKey });
  }

  const existing = candidate.runState.entries[candidate.intent.stateKey] ?? null;

  if (existing === null) {
    return {
      ok: true,
      action: "insert_entry",
      stateKey: candidate.intent.stateKey,
      entry: candidate.intent.entry,
    };
  }

  if (!isStateEntry(existing)) {
    return rejected("invalid_run_state", {
      stateKey: candidate.intent.stateKey,
      existingEntry: existing as StateEntry,
    });
  }

  if (isTerminalStatus(existing.status)) {
    return rejected("terminal_existing_entry", {
      stateKey: candidate.intent.stateKey,
      existingEntry: existing,
    });
  }

  if (isActiveStatus(existing.status)) {
    return rejected("active_existing_entry", {
      stateKey: candidate.intent.stateKey,
      existingEntry: existing,
    });
  }

  if (existing.status !== "planned") {
    return rejected("existing_entry_conflict", {
      stateKey: candidate.intent.stateKey,
      existingEntry: existing,
    });
  }

  if (canonicalEntry(existing) === canonicalEntry(candidate.intent.entry)) {
    return {
      ok: true,
      action: "skip_identical_existing",
      stateKey: candidate.intent.stateKey,
      existingEntry: existing,
    };
  }

  return rejected("existing_entry_conflict", {
    stateKey: candidate.intent.stateKey,
    existingEntry: existing,
  });
}
