import * as assert from "assert/strict";
import {
  decideDecisionStoreLockAcquire,
  decideDecisionStoreLockRelease,
  validateDecisionStoreLockRecord,
  type DecisionStoreLockRecord,
} from "../lib/watcher/decisionStoreLock";

const LABEL = "[stage-d8-15-decision-store-lock-contract-smoke]";

function sampleLock(overrides: Partial<DecisionStoreLockRecord> = {}): DecisionStoreLockRecord {
  return {
    lockId: "lock-001",
    ownerId: "owner-a",
    acquiredAtMs: 1_000,
    expiresAtMs: 2_000,
    ...overrides,
  };
}

function testValidLockRecordPasses(): void {
  assert.deepEqual(validateDecisionStoreLockRecord(sampleLock()), { ok: true });
}

function testInvalidLockRecordFails(): void {
  assert.deepEqual(validateDecisionStoreLockRecord(sampleLock({ lockId: "" })), {
    ok: false,
    reason: "empty_lock_id",
  });

  assert.deepEqual(validateDecisionStoreLockRecord(sampleLock({ expiresAtMs: 1_000 })), {
    ok: false,
    reason: "invalid_lock_time_range",
  });

  assert.deepEqual(validateDecisionStoreLockRecord(sampleLock({ acquiredAtMs: -1 })), {
    ok: false,
    reason: "invalid_acquired_at_ms",
  });

  assert.deepEqual(validateDecisionStoreLockRecord(sampleLock({ expiresAtMs: -1 })), {
    ok: false,
    reason: "invalid_expires_at_ms",
  });
}

function testAcquireAllowedWhenNoExistingLock(): void {
  assert.deepEqual(decideDecisionStoreLockAcquire(null, "owner-a", 1_500), {
    ok: true,
    action: "acquire_allowed",
    ownerId: "owner-a",
  });
}

function testAcquireDetectsActiveLock(): void {
  const lock = sampleLock();

  assert.deepEqual(decideDecisionStoreLockAcquire(lock, "owner-b", 1_500), {
    ok: false,
    action: "active_lock",
    existingLock: lock,
    requestedOwnerId: "owner-b",
  });
}

function testAcquireDetectsStaleLock(): void {
  const lock = sampleLock();

  assert.deepEqual(decideDecisionStoreLockAcquire(lock, "owner-b", 2_000), {
    ok: true,
    action: "stale_lock_recoverable",
    existingLock: lock,
    requestedOwnerId: "owner-b",
  });
}

function testAcquireRejectsInvalidInputs(): void {
  assert.deepEqual(decideDecisionStoreLockAcquire(null, "", 1_500), {
    ok: false,
    action: "invalid_lock_record",
    reason: "empty_owner_id",
  });

  assert.deepEqual(decideDecisionStoreLockAcquire(null, "owner-a", -1), {
    ok: false,
    action: "invalid_lock_record",
    reason: "invalid_now_ms",
  });

  assert.deepEqual(decideDecisionStoreLockAcquire(sampleLock({ lockId: "" }), "owner-b", 1_500), {
    ok: false,
    action: "invalid_lock_record",
    reason: "empty_lock_id",
  });
}

function testReleaseAllowedForSameOwner(): void {
  const lock = sampleLock();

  assert.deepEqual(decideDecisionStoreLockRelease(lock, "owner-a"), {
    ok: true,
    action: "release_allowed",
    lockId: "lock-001",
    ownerId: "owner-a",
  });
}

function testReleaseRejectsOwnerMismatch(): void {
  const lock = sampleLock();

  assert.deepEqual(decideDecisionStoreLockRelease(lock, "owner-b"), {
    ok: false,
    action: "release_owner_mismatch",
    existingLock: lock,
    requestedOwnerId: "owner-b",
  });
}


function testReleaseRejectsInvalidLock(): void {
  assert.deepEqual(decideDecisionStoreLockRelease(sampleLock({ ownerId: "" }), "owner-a"), {
    ok: false,
    action: "invalid_lock_record",
    reason: "empty_owner_id",
  });

  assert.deepEqual(decideDecisionStoreLockRelease(sampleLock(), ""), {
    ok: false,
    action: "invalid_lock_record",
    reason: "empty_owner_id",
  });
}

function main(): void {
  testValidLockRecordPasses();
  testInvalidLockRecordFails();
  testAcquireAllowedWhenNoExistingLock();
  testAcquireDetectsActiveLock();
  testAcquireDetectsStaleLock();
  testAcquireRejectsInvalidInputs();
  testReleaseAllowedForSameOwner();
  testReleaseRejectsOwnerMismatch();
  testReleaseRejectsInvalidLock();
  console.log(`${LABEL} PASS`);
}

main();
