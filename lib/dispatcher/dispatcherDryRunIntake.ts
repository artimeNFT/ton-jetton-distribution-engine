import type { PlannedBatch, BatchRecipient } from "./batchPlanner";
import {
  makeStateKey,
  type RunState,
  type StateEntry,
  type StateKey,
} from "./stateStore";

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type DispatcherDryRunIntakeReason =
  | "invalid_input"
  | "invalid_run_state"
  | "invalid_batch"
  | "invalid_recipient"
  | "missing_planned_entry"
  | "state_key_mismatch"
  | "entry_not_planned"
  | "recipient_mismatch"
  | "amount_mismatch"
  | "batch_id_mismatch"
  | "invalid_entry";

// ---------------------------------------------------------------------------
// DispatcherPlannedEntry
// ---------------------------------------------------------------------------

export interface DispatcherPlannedEntry {
  readonly stateKey: StateKey;
  readonly entry: StateEntry;
  readonly recipient: BatchRecipient;
  readonly originalIndex: number;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type DispatcherDryRunIntakeResult =
  | {
      readonly ok: true;
      readonly action: "planned_entries_ready";
      readonly batchId: string;
      readonly entries: readonly DispatcherPlannedEntry[];
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DispatcherDryRunIntakeReason;
      readonly batchId?: string;
      readonly stateKey?: StateKey;
      readonly recipientAddress?: string;
      readonly existingEntry?: StateEntry;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface DryRunIntakeInput {
  readonly runState: RunState;
  readonly batch: PlannedBatch;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

function isValidStateEntryShape(value: unknown): value is StateEntry {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["batchId"] === "string" &&
    typeof v["recipientAddress"] === "string" &&
    isSafeNonNegativeInteger(v["recipientIndex"]) &&
    isPositiveDecimalString(v["amount"]) &&
    typeof v["status"] === "string" &&
    [
      "planned",
      "submitted",
      "success",
      "hard_failure",
      "cooldown",
      "skipped",
      "cancelled",
    ].includes(v["status"]) &&
    isSafeNonNegativeInteger(v["attemptNumber"]) &&
    isNonEmptyString(v["createdAt"]) &&
    isNonEmptyString(v["updatedAt"])
  );
}

function rejected(
  reason: DispatcherDryRunIntakeReason,
  extras?: {
    batchId?: string;
    stateKey?: StateKey;
    recipientAddress?: string;
    existingEntry?: StateEntry;
  },
): DispatcherDryRunIntakeResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: DispatcherDryRunIntakeReason;
    batchId?: string;
    stateKey?: StateKey;
    recipientAddress?: string;
    existingEntry?: StateEntry;
  } = { ok: false, action: "rejected", reason };
  if (extras?.batchId !== undefined) result.batchId = extras.batchId;
  if (extras?.stateKey !== undefined) result.stateKey = extras.stateKey;
  if (extras?.recipientAddress !== undefined) result.recipientAddress = extras.recipientAddress;
  if (extras?.existingEntry !== undefined) result.existingEntry = extras.existingEntry;
  return result;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function planDispatcherDryRunIntake(
  input: unknown,
): DispatcherDryRunIntakeResult {
  // Rule 1: input must be a non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as DryRunIntakeInput;

  // Rule 2: runState validation
  if (!isNonArrayObject(candidate.runState)) {
    return rejected("invalid_run_state");
  }
  const runState = candidate.runState as unknown as Record<string, unknown>;
  if (
    runState["schemaVersion"] !== "stage-a-entry-centric-v1" ||
    !isNonArrayObject(runState["entries"])
  ) {
    return rejected("invalid_run_state");
  }

  const entries = runState["entries"] as Record<string, unknown>;

  // Rule 3 & 4 & 5: batch validation
  if (!isNonArrayObject(candidate.batch)) {
    return rejected("invalid_batch");
  }

  const batch = candidate.batch as unknown as Record<string, unknown>;

  if (!isNonEmptyString(batch["batchId"])) {
    return rejected("invalid_batch");
  }

  if (!isSafeNonNegativeInteger(batch["index"])) {
    return rejected("invalid_batch");
  }

  if (!Array.isArray(batch["recipients"]) || (batch["recipients"] as unknown[]).length === 0) {
    return rejected("invalid_batch");
  }

  const recipients = batch["recipients"] as unknown[];

  if (
    typeof batch["totalAmount"] !== "bigint" ||
    (batch["totalAmount"] as bigint) <= 0n
  ) {
    return rejected("invalid_batch");
  }

  if (
    !isSafeNonNegativeInteger(batch["size"]) ||
    (batch["size"] as number) < 1
  ) {
    return rejected("invalid_batch");
  }

  // Rule 4: size must equal recipients.length
  if ((batch["size"] as number) !== recipients.length) {
    return rejected("invalid_batch");
  }

  const batchId = batch["batchId"] as string;
  const totalAmount = batch["totalAmount"] as bigint;

  // Rule 5: sum of recipient.amount must equal totalAmount
  let recipientSum = 0n;
  for (const r of recipients) {
    if (!isNonArrayObject(r)) {
      return rejected("invalid_recipient");
    }
    const rv = r as Record<string, unknown>;
    if (typeof rv["amount"] !== "bigint") {
      return rejected("invalid_recipient");
    }
    recipientSum += rv["amount"] as bigint;
  }
  if (recipientSum !== totalAmount) {
    return rejected("invalid_batch");
  }

  // Rule 6: each recipient must have non-empty address and positive bigint amount
  for (const r of recipients) {
    const rv = r as Record<string, unknown>;
    if (!isNonEmptyString(rv["address"])) {
      return rejected("invalid_recipient");
    }
    if (typeof rv["amount"] !== "bigint" || (rv["amount"] as bigint) <= 0n) {
      return rejected("invalid_recipient");
    }
  }

  // Rules 7–13: per-recipient validation
  const plannedEntries: DispatcherPlannedEntry[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i] as BatchRecipient;
    const rv = recipient as unknown as Record<string, unknown>;
    const recipientAddress = rv["address"] as string;
    const recipientAmount = rv["amount"] as bigint;

    // Rule 7: look up expected state key
    const expectedStateKey = makeStateKey(batchId, recipientAddress);
    const existingRaw = entries[expectedStateKey];

    if (existingRaw === undefined || existingRaw === null) {
      return rejected("missing_planned_entry", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
      });
    }

    // Rule 8: existingEntry must be a valid StateEntry shape
    if (!isValidStateEntryShape(existingRaw)) {
      return rejected("invalid_entry", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
      });
    }

    const existingEntry = existingRaw as unknown as StateEntry;

    // Rule 9: status must be "planned"
    if (existingEntry.status !== "planned") {
      return rejected("entry_not_planned", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
        existingEntry,
      });
    }

    // Rule 10: batchId must match
    if (existingEntry.batchId !== batchId) {
      return rejected("batch_id_mismatch", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
        existingEntry,
      });
    }

    // Rule 11: state key derived from entry must match expectedStateKey
    const derivedStateKey = makeStateKey(
      existingEntry.batchId,
      existingEntry.recipientAddress,
    );
    if (derivedStateKey !== expectedStateKey) {
      return rejected("state_key_mismatch", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
        existingEntry,
      });
    }

    // Rule 12: recipientAddress must match (case-insensitive, trimmed)
    if (
      existingEntry.recipientAddress.trim().toLowerCase() !==
      recipientAddress.trim().toLowerCase()
    ) {
      return rejected("recipient_mismatch", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
        existingEntry,
      });
    }

    // Rule 13: amount must match exactly
    if (existingEntry.amount !== recipientAmount.toString()) {
      return rejected("amount_mismatch", {
        batchId,
        stateKey: expectedStateKey,
        recipientAddress,
        existingEntry,
      });
    }

    plannedEntries.push({
      stateKey: expectedStateKey,
      entry: existingEntry,
      recipient,
      originalIndex: i,
    });
  }

  // Rule 14: return all entries in batch order
  return {
    ok: true,
    action: "planned_entries_ready",
    batchId,
    entries: plannedEntries,
  };
}
