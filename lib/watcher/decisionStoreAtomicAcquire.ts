import {
  validateDecisionStoreLockRecord,
  type DecisionStoreLockRecord,
} from "./decisionStoreLock";

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type DecisionStoreAtomicAcquireReason =
  | "invalid_input"
  | "invalid_now_ms"
  | "invalid_requested_lock"
  | "requested_lock_acquired_in_future"
  | "requested_lock_already_expired"
  | "invalid_existing_lock"
  | "active_lock";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type DecisionStoreAtomicAcquirePlan =
  | {
      readonly ok: true;
      readonly action: "create_if_missing";
      readonly requestedLock: DecisionStoreLockRecord;
    }
  | {
      readonly ok: true;
      readonly action: "replace_if_matches_existing_stale_lock";
      readonly expectedExistingLock: DecisionStoreLockRecord;
      readonly requestedLock: DecisionStoreLockRecord;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DecisionStoreAtomicAcquireReason;
      readonly lockReason?: string;
      readonly existingLock?: DecisionStoreLockRecord;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface DecisionStoreAtomicAcquireInput {
  readonly existingLock: DecisionStoreLockRecord | null;
  readonly requestedLock: DecisionStoreLockRecord;
  readonly nowMs: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Structural shape guard for a lock record candidate.
 * Returns null if the shape is valid, or a lockReason token if invalid.
 * Reason tokens are aligned with validateDecisionStoreLockRecord style.
 */
function checkLockRecordShape(value: Record<string, unknown>): string | null {
  if (!isNonEmptyString(value["lockId"])) {
    return "empty_lock_id";
  }
  if (!isNonEmptyString(value["ownerId"])) {
    return "empty_owner_id";
  }
  if (!isSafeNonNegativeInteger(value["acquiredAtMs"])) {
    return "invalid_acquired_at_ms";
  }
  if (!isSafeNonNegativeInteger(value["expiresAtMs"])) {
    return "invalid_expires_at_ms";
  }
  return null;
}

function rejected(
  reason: DecisionStoreAtomicAcquireReason,
  extras?: { lockReason?: string; existingLock?: DecisionStoreLockRecord },
): DecisionStoreAtomicAcquirePlan {
  const result: {
    ok: false;
    action: "rejected";
    reason: DecisionStoreAtomicAcquireReason;
    lockReason?: string;
    existingLock?: DecisionStoreLockRecord;
  } = { ok: false, action: "rejected", reason };
  if (extras?.lockReason !== undefined) {
    result.lockReason = extras.lockReason;
  }
  if (extras?.existingLock !== undefined) {
    result.existingLock = extras.existingLock;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function planDecisionStoreAtomicAcquire(
  input: unknown,
): DecisionStoreAtomicAcquirePlan {
  // Rule 1: input must be a non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as DecisionStoreAtomicAcquireInput;

  // Rule 2: nowMs must be a safe integer >= 0
  if (!isSafeNonNegativeInteger(candidate.nowMs)) {
    return rejected("invalid_now_ms");
  }

  const nowMs = candidate.nowMs;

  // Rule 3: requestedLock must be a non-null, non-array object
  if (!isNonArrayObject(candidate.requestedLock)) {
    return rejected("invalid_requested_lock");
  }

  // Rule 3 (shape): structural guard before delegating to validateDecisionStoreLockRecord
  const requestedShapeReason = checkLockRecordShape(
    candidate.requestedLock as unknown as Record<string, unknown>,
  );
  if (requestedShapeReason !== null) {
    return rejected("invalid_requested_lock", { lockReason: requestedShapeReason });
  }

  // Rule 4: requestedLock must pass validateDecisionStoreLockRecord
  const requestedValidation = validateDecisionStoreLockRecord(candidate.requestedLock);
  if (!requestedValidation.ok) {
    return rejected("invalid_requested_lock", { lockReason: requestedValidation.reason });
  }

  const requestedLock = candidate.requestedLock as DecisionStoreLockRecord;

  // Rule 5: requestedLock.acquiredAtMs must be <= nowMs
  if (requestedLock.acquiredAtMs > nowMs) {
    return rejected("requested_lock_acquired_in_future");
  }

  // Rule 6: requestedLock.expiresAtMs must be > nowMs
  if (requestedLock.expiresAtMs <= nowMs) {
    return rejected("requested_lock_already_expired");
  }

  // Rule 7: existingLock null => create is allowed
  if (candidate.existingLock === null) {
    return {
      ok: true,
      action: "create_if_missing",
      requestedLock,
    };
  }

  // Rule 8: existingLock must be a non-null, non-array object
  if (!isNonArrayObject(candidate.existingLock)) {
    return rejected("invalid_existing_lock");
  }

  // Rule 8 (shape): structural guard before delegating to validateDecisionStoreLockRecord
  const existingShapeReason = checkLockRecordShape(
    candidate.existingLock as unknown as Record<string, unknown>,
  );
  if (existingShapeReason !== null) {
    return rejected("invalid_existing_lock", { lockReason: existingShapeReason });
  }

  // Rule 9: existingLock must pass validateDecisionStoreLockRecord
  const existingValidation = validateDecisionStoreLockRecord(candidate.existingLock);
  if (!existingValidation.ok) {
    return rejected("invalid_existing_lock", { lockReason: existingValidation.reason });
  }

  const existingLock = candidate.existingLock as DecisionStoreLockRecord;

  // Rule 10: if existingLock is still active, reject
  if (existingLock.expiresAtMs > nowMs) {
    return rejected("active_lock", { existingLock });
  }

  // Rule 11 & 12: existingLock is stale — stale takeover with exact compare precondition
  return {
    ok: true,
    action: "replace_if_matches_existing_stale_lock",
    expectedExistingLock: existingLock,
    requestedLock,
  };
}
