import type { DispatchIntent } from "./decisionStoreRunStateAdapter";
import {
  planRunStateDispatchIntentApply,
  type RunStatePlanApplyReason,
} from "./runStatePlanApply";
import type {
  AtomicStateStore,
  RunState,
  StateEntry,
  StateKey,
} from "./stateStore";

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type RunStateApplyShellReason =
  | "invalid_input"
  | "invalid_store"
  | "read_failed"
  | "write_failed"
  | "plan_invalid_input"
  | "plan_invalid_run_state"
  | "plan_invalid_intent"
  | "plan_state_key_mismatch"
  | "plan_intent_entry_mismatch"
  | "plan_existing_entry_conflict"
  | "plan_terminal_existing_entry"
  | "plan_active_existing_entry"
  | "plan_changed_during_update";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type RunStateApplyShellResult =
  | {
      readonly ok: true;
      readonly action: "inserted_entry";
      readonly stateKey: StateKey;
      readonly entry: StateEntry;
    }
  | {
      readonly ok: true;
      readonly action: "skipped_identical_existing";
      readonly stateKey: StateKey;
      readonly existingEntry: StateEntry;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: RunStateApplyShellReason;
      readonly stateKey?: StateKey;
      readonly existingEntry?: StateEntry;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface ApplyShellInput {
  readonly store: AtomicStateStore;
  readonly intent: DispatchIntent;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidStore(value: unknown): value is AtomicStateStore {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v["read"] === "function" && typeof v["update"] === "function";
}

function mapPlanReason(reason: RunStatePlanApplyReason): RunStateApplyShellReason {
  const map: Record<RunStatePlanApplyReason, RunStateApplyShellReason> = {
    invalid_input: "plan_invalid_input",
    invalid_run_state: "plan_invalid_run_state",
    invalid_intent: "plan_invalid_intent",
    state_key_mismatch: "plan_state_key_mismatch",
    intent_entry_mismatch: "plan_intent_entry_mismatch",
    existing_entry_conflict: "plan_existing_entry_conflict",
    terminal_existing_entry: "plan_terminal_existing_entry",
    active_existing_entry: "plan_active_existing_entry",
  };
  return map[reason] ?? "plan_invalid_input";
}

function rejected(
  reason: RunStateApplyShellReason,
  extras?: { stateKey?: StateKey; existingEntry?: StateEntry },
): RunStateApplyShellResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: RunStateApplyShellReason;
    stateKey?: StateKey;
    existingEntry?: StateEntry;
  } = { ok: false, action: "rejected", reason };
  if (extras?.stateKey !== undefined) result.stateKey = extras.stateKey;
  if (extras?.existingEntry !== undefined) result.existingEntry = extras.existingEntry;
  return result;
}

// ---------------------------------------------------------------------------
// Sentinel for captured re-plan failures inside store.update
// ---------------------------------------------------------------------------

const REPLAN_REJECTION_TAG = Symbol("replan_rejection");

interface ReplanRejection {
  readonly tag: typeof REPLAN_REJECTION_TAG;
  readonly reason: RunStateApplyShellReason;
  readonly stateKey?: StateKey;
  readonly existingEntry?: StateEntry;
}

function isReplanRejection(value: unknown): value is ReplanRejection {
  return (
    isNonArrayObject(value) &&
    value["tag"] === REPLAN_REJECTION_TAG
  );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function applyDispatchIntentToRunState(
  input: unknown,
): Promise<RunStateApplyShellResult> {
  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as ApplyShellInput;

  // Rule 2: store must have read and update functions
  if (!isValidStore(candidate.store)) {
    return rejected("invalid_store");
  }

  const store = candidate.store;
  const intent = candidate.intent;

  // Rule 3: initial store.read()
  let runState: RunState;
  try {
    runState = await store.read();
  } catch {
    return rejected("read_failed");
  }

  // Rule 4: initial plan
  const initialPlan = planRunStateDispatchIntentApply({ runState, intent });

  // Rule 5: if initial plan rejects, return prefixed reason
  if (!initialPlan.ok) {
    return rejected(mapPlanReason(initialPlan.reason), {
      stateKey: (initialPlan as Record<string, unknown>)["stateKey"] as StateKey | undefined,
      existingEntry: (initialPlan as Record<string, unknown>)["existingEntry"] as StateEntry | undefined,
    });
  }

  // Rule 6: skip_identical_existing is a true no-op — do NOT call store.update
  if (initialPlan.action === "skip_identical_existing") {
    return {
      ok: true,
      action: "skipped_identical_existing",
      stateKey: initialPlan.stateKey,
      existingEntry: initialPlan.existingEntry,
    };
  }

  // Rule 7: insert_entry — re-plan inside store.update
  if (initialPlan.action === "insert_entry") {
    let insertedKey: StateKey | undefined;
    let insertedEntry: StateEntry | undefined;

    try {
      await store.update((draft: RunState) => {
        // Re-plan inside update to preserve state-before-action boundary
        const rePlan = planRunStateDispatchIntentApply({ runState: draft, intent });

        if (rePlan.ok && rePlan.action === "insert_entry") {
          // Safe to write
          draft.entries[rePlan.stateKey] = rePlan.entry;
          insertedKey = rePlan.stateKey;
          insertedEntry = rePlan.entry;
          return;
        }

        if (rePlan.ok && rePlan.action === "skip_identical_existing") {
          // State changed between initial read and update — treat as conflict
          const capture: ReplanRejection = {
            tag: REPLAN_REJECTION_TAG,
            reason: "plan_changed_during_update",
            stateKey: rePlan.stateKey,
            existingEntry: rePlan.existingEntry,
          };
          throw capture;
        }

        // rePlan rejected
        if (!rePlan.ok) {
          const capture: ReplanRejection = {
            tag: REPLAN_REJECTION_TAG,
            reason: mapPlanReason(rePlan.reason),
            stateKey: (rePlan as Record<string, unknown>)["stateKey"] as StateKey | undefined,
            existingEntry: (rePlan as Record<string, unknown>)["existingEntry"] as StateEntry | undefined,
          };
          throw capture;
        }
      });
    } catch (err) {
      // Rule 8: captured re-plan rejection
      if (isReplanRejection(err)) {
        return rejected(err.reason, {
          stateKey: err.stateKey,
          existingEntry: err.existingEntry,
        });
      }
      // Rule 9: any other update error maps to write_failed
      return rejected("write_failed");
    }

    if (insertedKey === undefined || insertedEntry === undefined) {
      return rejected("write_failed");
    }

    return {
      ok: true,
      action: "inserted_entry",
      stateKey: insertedKey,
      entry: insertedEntry,
    };
  }

  // Exhaustiveness guard
  return rejected("write_failed");
}
