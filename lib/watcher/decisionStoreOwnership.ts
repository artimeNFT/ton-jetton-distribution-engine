import {
  validateDecisionStoreLockRecord,
  type DecisionStoreLockRecord,
} from "./decisionStoreLock";

export type DecisionStoreOwnershipReason =
  | "invalid_input"
  | "missing_lock"
  | "invalid_expected_owner_id"
  | "invalid_expected_lock_id"
  | "invalid_now_ms"
  | "invalid_lock_record"
  | "owner_id_mismatch"
  | "lock_id_mismatch"
  | "lock_expired";

export type DecisionStoreOwnershipResult =
  | {
      readonly ok: true;
      readonly action: "ownership_valid";
      readonly lockId: string;
      readonly ownerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DecisionStoreOwnershipReason;
      readonly lockReason?: string;
    };

interface DecisionStoreOwnershipInput {
  readonly existingLock: DecisionStoreLockRecord | null;
  readonly expectedOwnerId: unknown;
  readonly expectedLockId: unknown;
  readonly nowMs: unknown;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateLockShapeBeforeDelegation(
  value: Record<string, unknown>,
): { readonly ok: true } | { readonly ok: false; readonly lockReason: string } {
  if (typeof value["lockId"] !== "string" || value["lockId"].trim().length === 0) {
    return { ok: false, lockReason: "empty_lock_id" };
  }

  if (typeof value["ownerId"] !== "string" || value["ownerId"].trim().length === 0) {
    return { ok: false, lockReason: "empty_owner_id" };
  }

  if (!isSafeNonNegativeInteger(value["acquiredAtMs"])) {
    return { ok: false, lockReason: "invalid_acquired_at_ms" };
  }

  if (!isSafeNonNegativeInteger(value["expiresAtMs"])) {
    return { ok: false, lockReason: "invalid_expires_at_ms" };
  }

  return { ok: true };
}

function rejected(
  reason: DecisionStoreOwnershipReason,
  lockReason?: string,
): DecisionStoreOwnershipResult {
  return lockReason === undefined
    ? { ok: false, action: "rejected", reason }
    : { ok: false, action: "rejected", reason, lockReason };
}

export function validateDecisionStoreOwnership(
  input: unknown,
): DecisionStoreOwnershipResult {
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as DecisionStoreOwnershipInput;

  if (candidate.existingLock === null) {
    return rejected("missing_lock");
  }

  if (!isNonEmptyString(candidate.expectedOwnerId)) {
    return rejected("invalid_expected_owner_id");
  }

  if (!isNonEmptyString(candidate.expectedLockId)) {
    return rejected("invalid_expected_lock_id");
  }

  if (!isSafeNonNegativeInteger(candidate.nowMs)) {
    return rejected("invalid_now_ms");
  }

  if (!isNonArrayObject(candidate.existingLock)) {
    return rejected("invalid_lock_record");
  }

  const lockShapeValidation = validateLockShapeBeforeDelegation(candidate.existingLock);
  if (!lockShapeValidation.ok) {
    return rejected("invalid_lock_record", lockShapeValidation.lockReason);
  }

  const existingLock = candidate.existingLock as unknown as DecisionStoreLockRecord;
  const lockValidation = validateDecisionStoreLockRecord(existingLock);
  if (!lockValidation.ok) {
    return rejected("invalid_lock_record", lockValidation.reason);
  }

  if (existingLock.ownerId !== candidate.expectedOwnerId) {
    return rejected("owner_id_mismatch");
  }

  if (existingLock.lockId !== candidate.expectedLockId) {
    return rejected("lock_id_mismatch");
  }

  if (existingLock.expiresAtMs <= candidate.nowMs) {
    return rejected("lock_expired");
  }

  return {
    ok: true,
    action: "ownership_valid",
    lockId: existingLock.lockId,
    ownerId: existingLock.ownerId,
  };
}
