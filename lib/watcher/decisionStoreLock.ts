/**
 * decisionStoreLock.ts
 *
 * Pure Decision Store lock contract.
 *
 * No filesystem.
 * No lock file I/O.
 * No append/recovery.
 * No Dispatcher / RunState / targets / execution coupling.
 */

export type DecisionStoreLockRecord = {
  readonly lockId: string;
  readonly ownerId: string;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
};

export type DecisionStoreLockValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function validateDecisionStoreLockRecord(
  record: DecisionStoreLockRecord,
): DecisionStoreLockValidationResult {
  if (record.lockId.trim().length === 0) {
    return { ok: false, reason: "empty_lock_id" };
  }

  if (record.ownerId.trim().length === 0) {
    return { ok: false, reason: "empty_owner_id" };
  }

  if (!Number.isSafeInteger(record.acquiredAtMs) || record.acquiredAtMs < 0) {
    return { ok: false, reason: "invalid_acquired_at_ms" };
  }

  if (!Number.isSafeInteger(record.expiresAtMs) || record.expiresAtMs < 0) {
    return { ok: false, reason: "invalid_expires_at_ms" };
  }

  if (record.expiresAtMs <= record.acquiredAtMs) {
    return { ok: false, reason: "invalid_lock_time_range" };
  }

  return { ok: true };
}

export type DecisionStoreAcquireLockDecision =
  | {
      readonly ok: true;
      readonly action: "acquire_allowed";
      readonly ownerId: string;
    }
  | {
      readonly ok: true;
      readonly action: "stale_lock_recoverable";
      readonly existingLock: DecisionStoreLockRecord;
      readonly requestedOwnerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "active_lock";
      readonly existingLock: DecisionStoreLockRecord;
      readonly requestedOwnerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "invalid_lock_record";
      readonly reason: string;
    };

export function decideDecisionStoreLockAcquire(
  existingLock: DecisionStoreLockRecord | null,
  requestedOwnerId: string,
  nowMs: number,
): DecisionStoreAcquireLockDecision {
  if (requestedOwnerId.trim().length === 0) {
    return { ok: false, action: "invalid_lock_record", reason: "empty_owner_id" };
  }

  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, action: "invalid_lock_record", reason: "invalid_now_ms" };
  }

  if (existingLock === null) {
    return { ok: true, action: "acquire_allowed", ownerId: requestedOwnerId };
  }

  const validation = validateDecisionStoreLockRecord(existingLock);
  if (!validation.ok) {
    return { ok: false, action: "invalid_lock_record", reason: validation.reason };
  }

  if (existingLock.expiresAtMs <= nowMs) {
    return {
      ok: true,
      action: "stale_lock_recoverable",
      existingLock,
      requestedOwnerId,
    };
  }

  return {
    ok: false,
    action: "active_lock",
    existingLock,
    requestedOwnerId,
  };
}

export type DecisionStoreReleaseLockDecision =
  | {
      readonly ok: true;
      readonly action: "release_allowed";
      readonly lockId: string;
      readonly ownerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "release_owner_mismatch";
      readonly existingLock: DecisionStoreLockRecord;
      readonly requestedOwnerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "invalid_lock_record";
      readonly reason: string;
    };

export function decideDecisionStoreLockRelease(
  existingLock: DecisionStoreLockRecord,
  requestedOwnerId: string,
): DecisionStoreReleaseLockDecision {
  if (requestedOwnerId.trim().length === 0) {
    return { ok: false, action: "invalid_lock_record", reason: "empty_owner_id" };
  }

  const validation = validateDecisionStoreLockRecord(existingLock);
  if (!validation.ok) {
    return { ok: false, action: "invalid_lock_record", reason: validation.reason };
  }

  if (existingLock.ownerId !== requestedOwnerId) {
    return {
      ok: false,
      action: "release_owner_mismatch",
      existingLock,
      requestedOwnerId,
    };
  }

  return {
    ok: true,
    action: "release_allowed",
    lockId: existingLock.lockId,
    ownerId: existingLock.ownerId,
  };
}
