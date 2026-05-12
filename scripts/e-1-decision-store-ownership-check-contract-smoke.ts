import * as assert from "assert/strict";
import { validateDecisionStoreOwnership } from "../lib/watcher/decisionStoreOwnership";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[e-1-decision-store-ownership-check-contract-smoke]";

const NOW_MS = 1_700_000_000_000;
const ACQUIRED_AT_MS = 1_699_999_940_000;
const EXPIRES_FUTURE_MS = 1_700_000_060_000;
const EXPIRES_PAST_MS = 1_699_999_999_999;
const EXPIRES_EQUAL_MS = NOW_MS;

const VALID_LOCK: DecisionStoreLockRecord = {
  lockId: "lock-abc-001",
  ownerId: "owner-xyz-001",
  acquiredAtMs: ACQUIRED_AT_MS,
  expiresAtMs: EXPIRES_FUTURE_MS,
};

const EXPECTED_OWNER_ID = "owner-xyz-001";
const EXPECTED_LOCK_ID = "lock-abc-001";

function makeInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    existingLock: VALID_LOCK,
    expectedOwnerId: EXPECTED_OWNER_ID,
    expectedLockId: EXPECTED_LOCK_ID,
    nowMs: NOW_MS,
    ...overrides,
  };
}

function testValidOwnershipAccepted(): void {
  assert.deepEqual(validateDecisionStoreOwnership(makeInput()), {
    ok: true,
    action: "ownership_valid",
    lockId: VALID_LOCK.lockId,
    ownerId: VALID_LOCK.ownerId,
  });
}

function testNullExistingLockMissingLock(): void {
  assert.deepEqual(validateDecisionStoreOwnership(makeInput({ existingLock: null })), {
    ok: false,
    action: "rejected",
    reason: "missing_lock",
  });
}

function testNonObjectExistingLockInvalidLockRecord(): void {
  for (const existingLock of ["not-an-object", 42, []]) {
    assert.deepEqual(validateDecisionStoreOwnership(makeInput({ existingLock })), {
      ok: false,
      action: "rejected",
      reason: "invalid_lock_record",
    });
  }
}

function testInvalidLockRecordWithLockReason(): void {
  const cases: ReadonlyArray<{ readonly existingLock: unknown; readonly lockReason: string }> = [
    {
      existingLock: {
        ownerId: VALID_LOCK.ownerId,
        acquiredAtMs: ACQUIRED_AT_MS,
        expiresAtMs: EXPIRES_FUTURE_MS,
      },
      lockReason: "empty_lock_id",
    },
    {
      existingLock: {
        lockId: VALID_LOCK.lockId,
        acquiredAtMs: ACQUIRED_AT_MS,
        expiresAtMs: EXPIRES_FUTURE_MS,
      },
      lockReason: "empty_owner_id",
    },
    {
      existingLock: {
        lockId: VALID_LOCK.lockId,
        ownerId: VALID_LOCK.ownerId,
        expiresAtMs: EXPIRES_FUTURE_MS,
      },
      lockReason: "invalid_acquired_at_ms",
    },
    {
      existingLock: {
        lockId: VALID_LOCK.lockId,
        ownerId: VALID_LOCK.ownerId,
        acquiredAtMs: ACQUIRED_AT_MS,
        expiresAtMs: "not-a-number",
      },
      lockReason: "invalid_expires_at_ms",
    },
    {
      existingLock: {
        lockId: VALID_LOCK.lockId,
        ownerId: VALID_LOCK.ownerId,
        acquiredAtMs: EXPIRES_FUTURE_MS,
        expiresAtMs: ACQUIRED_AT_MS,
      },
      lockReason: "invalid_lock_time_range",
    },
  ];

  for (const entry of cases) {
    assert.deepEqual(
      validateDecisionStoreOwnership(makeInput({ existingLock: entry.existingLock })),
      {
        ok: false,
        action: "rejected",
        reason: "invalid_lock_record",
        lockReason: entry.lockReason,
      },
    );
  }
}

function testOwnerIdMismatch(): void {
  assert.deepEqual(validateDecisionStoreOwnership(makeInput({ expectedOwnerId: "wrong-owner" })), {
    ok: false,
    action: "rejected",
    reason: "owner_id_mismatch",
  });
}

function testLockIdMismatch(): void {
  assert.deepEqual(validateDecisionStoreOwnership(makeInput({ expectedLockId: "wrong-lock-id" })), {
    ok: false,
    action: "rejected",
    reason: "lock_id_mismatch",
  });
}

function testExpiredLock(): void {
  for (const expiresAtMs of [EXPIRES_PAST_MS, EXPIRES_EQUAL_MS]) {
    assert.deepEqual(
      validateDecisionStoreOwnership(makeInput({ existingLock: { ...VALID_LOCK, expiresAtMs } })),
      {
        ok: false,
        action: "rejected",
        reason: "lock_expired",
      },
    );
  }
}

function testInvalidExpectedOwnerId(): void {
  for (const expectedOwnerId of ["", "   ", null]) {
    assert.deepEqual(validateDecisionStoreOwnership(makeInput({ expectedOwnerId })), {
      ok: false,
      action: "rejected",
      reason: "invalid_expected_owner_id",
    });
  }
}

function testInvalidExpectedLockId(): void {
  for (const expectedLockId of ["", "   ", null]) {
    assert.deepEqual(validateDecisionStoreOwnership(makeInput({ expectedLockId })), {
      ok: false,
      action: "rejected",
      reason: "invalid_expected_lock_id",
    });
  }
}

function testInvalidNowMs(): void {
  for (const nowMs of [-1, 1.5, "1700000000000"]) {
    assert.deepEqual(validateDecisionStoreOwnership(makeInput({ nowMs })), {
      ok: false,
      action: "rejected",
      reason: "invalid_now_ms",
    });
  }
}

function testInvalidInput(): void {
  for (const input of [null, [], "bad"]) {
    assert.deepEqual(validateDecisionStoreOwnership(input), {
      ok: false,
      action: "rejected",
      reason: "invalid_input",
    });
  }
}

function main(): void {
  testValidOwnershipAccepted();
  testNullExistingLockMissingLock();
  testNonObjectExistingLockInvalidLockRecord();
  testInvalidLockRecordWithLockReason();
  testOwnerIdMismatch();
  testLockIdMismatch();
  testExpiredLock();
  testInvalidExpectedOwnerId();
  testInvalidExpectedLockId();
  testInvalidNowMs();
  testInvalidInput();

  console.log(`${LABEL} PASS`);
}

main();
