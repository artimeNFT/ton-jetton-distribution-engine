import * as assert from "assert/strict";
import { planDecisionStoreAtomicAcquire } from "../lib/watcher/decisionStoreAtomicAcquire";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[e-3-decision-store-atomic-acquire-contract-smoke]";

// ---------------------------------------------------------------------------
// Fixed timestamps
// ---------------------------------------------------------------------------

const NOW_MS = 1_700_000_000_000;
const ACQUIRED_MS = 1_699_999_990_000;   // 10s before NOW_MS
const EXPIRES_FUTURE_MS = 1_700_000_060_000; // 60s after NOW_MS
const EXPIRES_PAST_MS = 1_699_999_999_999;   // 1ms before NOW_MS
const EXPIRES_EQUAL_MS = NOW_MS;             // equal => expired (<=)

// ---------------------------------------------------------------------------
// Valid lock fixtures
// ---------------------------------------------------------------------------

const VALID_REQUESTED_LOCK: DecisionStoreLockRecord = {
  lockId: "lock-req-001",
  ownerId: "owner-req-001",
  acquiredAtMs: ACQUIRED_MS,
  expiresAtMs: EXPIRES_FUTURE_MS,
};

const VALID_EXISTING_LOCK_ACTIVE: DecisionStoreLockRecord = {
  lockId: "lock-existing-active-001",
  ownerId: "owner-existing-001",
  acquiredAtMs: ACQUIRED_MS,
  expiresAtMs: EXPIRES_FUTURE_MS,
};

const VALID_EXISTING_LOCK_STALE: DecisionStoreLockRecord = {
  lockId: "lock-existing-stale-001",
  ownerId: "owner-existing-001",
  acquiredAtMs: ACQUIRED_MS,
  expiresAtMs: EXPIRES_PAST_MS,
};

// ---------------------------------------------------------------------------
// Input factory
// ---------------------------------------------------------------------------

function makeInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    existingLock: null,
    requestedLock: VALID_REQUESTED_LOCK,
    nowMs: NOW_MS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: create_if_missing when existingLock is null
// ---------------------------------------------------------------------------

function testCreateIfMissingWhenExistingLockIsNull(): void {
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(makeInput({ existingLock: null })),
    {
      ok: true,
      action: "create_if_missing",
      requestedLock: VALID_REQUESTED_LOCK,
    },
  );
}

// ---------------------------------------------------------------------------
// Test 2: active existing lock rejects with active_lock and includes existingLock
// ---------------------------------------------------------------------------

function testActiveLockRejectsWithExistingLock(): void {
  const result = planDecisionStoreAtomicAcquire(
    makeInput({ existingLock: VALID_EXISTING_LOCK_ACTIVE }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "active_lock");
    assert.deepEqual(result.existingLock, VALID_EXISTING_LOCK_ACTIVE);
  }
}

// ---------------------------------------------------------------------------
// Test 3: stale existing lock returns replace_if_matches_existing_stale_lock
// ---------------------------------------------------------------------------

function testStaleLockReturnsReplacePlan(): void {
  const result = planDecisionStoreAtomicAcquire(
    makeInput({ existingLock: VALID_EXISTING_LOCK_STALE }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.action, "replace_if_matches_existing_stale_lock");
  }
}

// ---------------------------------------------------------------------------
// Test 4: stale takeover result includes exact expectedExistingLock
// ---------------------------------------------------------------------------

function testStaleTakeoverIncludesExactExpectedExistingLock(): void {
  const result = planDecisionStoreAtomicAcquire(
    makeInput({ existingLock: VALID_EXISTING_LOCK_STALE }),
  );
  assert.equal(result.ok, true);
  if (result.ok && result.action === "replace_if_matches_existing_stale_lock") {
    assert.deepEqual(result.expectedExistingLock, VALID_EXISTING_LOCK_STALE);
    assert.deepEqual(result.requestedLock, VALID_REQUESTED_LOCK);
  }

  // Also covers boundary: expiresAtMs === nowMs => stale
  const resultEqual = planDecisionStoreAtomicAcquire(
    makeInput({
      existingLock: { ...VALID_EXISTING_LOCK_STALE, expiresAtMs: EXPIRES_EQUAL_MS },
    }),
  );
  assert.equal(resultEqual.ok, true);
  if (resultEqual.ok && resultEqual.action === "replace_if_matches_existing_stale_lock") {
    assert.equal(resultEqual.expectedExistingLock.expiresAtMs, EXPIRES_EQUAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Test 5: invalid input rejects invalid_input
// ---------------------------------------------------------------------------

function testInvalidInputRejects(): void {
  const expected = { ok: false, action: "rejected", reason: "invalid_input" } as const;

  assert.deepEqual(planDecisionStoreAtomicAcquire(null), expected);
  assert.deepEqual(planDecisionStoreAtomicAcquire([]), expected);
  assert.deepEqual(planDecisionStoreAtomicAcquire("bad"), expected);
}

// ---------------------------------------------------------------------------
// Test 6: invalid nowMs rejects invalid_now_ms
// ---------------------------------------------------------------------------

function testInvalidNowMsRejects(): void {
  const expected = { ok: false, action: "rejected", reason: "invalid_now_ms" } as const;

  assert.deepEqual(planDecisionStoreAtomicAcquire(makeInput({ nowMs: -1 })), expected);
  assert.deepEqual(planDecisionStoreAtomicAcquire(makeInput({ nowMs: 1.5 })), expected);
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(makeInput({ nowMs: "1700000000000" })),
    expected,
  );
}

// ---------------------------------------------------------------------------
// Test 7: invalid requestedLock rejects invalid_requested_lock with lockReason
// ---------------------------------------------------------------------------

function testInvalidRequestedLockRejectsWithLockReason(): void {
  // missing lockId => empty_lock_id
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          ownerId: "owner-req-001",
          acquiredAtMs: ACQUIRED_MS,
          expiresAtMs: EXPIRES_FUTURE_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "empty_lock_id");
    }
  }

  // empty lockId => empty_lock_id
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          lockId: "   ",
          ownerId: "owner-req-001",
          acquiredAtMs: ACQUIRED_MS,
          expiresAtMs: EXPIRES_FUTURE_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "empty_lock_id");
    }
  }

  // missing ownerId => empty_owner_id
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          lockId: "lock-req-001",
          acquiredAtMs: ACQUIRED_MS,
          expiresAtMs: EXPIRES_FUTURE_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "empty_owner_id");
    }
  }

  // missing acquiredAtMs => invalid_acquired_at_ms
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          lockId: "lock-req-001",
          ownerId: "owner-req-001",
          expiresAtMs: EXPIRES_FUTURE_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "invalid_acquired_at_ms");
    }
  }

  // missing expiresAtMs => invalid_expires_at_ms
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          lockId: "lock-req-001",
          ownerId: "owner-req-001",
          acquiredAtMs: ACQUIRED_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "invalid_expires_at_ms");
    }
  }

  // invalid time range: acquiredAtMs >= expiresAtMs => invalid_lock_time_range
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          lockId: "lock-req-001",
          ownerId: "owner-req-001",
          acquiredAtMs: EXPIRES_FUTURE_MS,
          expiresAtMs: ACQUIRED_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_requested_lock");
      assert.equal(result.lockReason, "invalid_lock_time_range");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 8: requestedLock.acquiredAtMs > nowMs => requested_lock_acquired_in_future
// ---------------------------------------------------------------------------

function testRequestedLockAcquiredInFutureRejects(): void {
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: {
          ...VALID_REQUESTED_LOCK,
          acquiredAtMs: NOW_MS + 1,
          expiresAtMs: NOW_MS + 60_000,
        },
      }),
    ),
    { ok: false, action: "rejected", reason: "requested_lock_acquired_in_future" },
  );
}

// ---------------------------------------------------------------------------
// Test 9: requestedLock.expiresAtMs <= nowMs => requested_lock_already_expired
// ---------------------------------------------------------------------------

function testRequestedLockAlreadyExpiredRejects(): void {
  // strictly before
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: { ...VALID_REQUESTED_LOCK, expiresAtMs: EXPIRES_PAST_MS },
      }),
    ),
    { ok: false, action: "rejected", reason: "requested_lock_already_expired" },
  );

  // equal to nowMs (boundary)
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(
      makeInput({
        requestedLock: { ...VALID_REQUESTED_LOCK, expiresAtMs: EXPIRES_EQUAL_MS },
      }),
    ),
    { ok: false, action: "rejected", reason: "requested_lock_already_expired" },
  );
}

// ---------------------------------------------------------------------------
// Test 10: invalid existingLock rejects invalid_existing_lock
// ---------------------------------------------------------------------------

function testInvalidExistingLockRejects(): void {
  // string
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(makeInput({ existingLock: "not-an-object" })),
    { ok: false, action: "rejected", reason: "invalid_existing_lock" },
  );

  // array
  assert.deepEqual(
    planDecisionStoreAtomicAcquire(makeInput({ existingLock: [] })),
    { ok: false, action: "rejected", reason: "invalid_existing_lock" },
  );

  // missing lockId => invalid_existing_lock with lockReason empty_lock_id
  {
    const result = planDecisionStoreAtomicAcquire(
      makeInput({
        existingLock: {
          ownerId: "owner-existing-001",
          acquiredAtMs: ACQUIRED_MS,
          expiresAtMs: EXPIRES_PAST_MS,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_existing_lock");
      assert.equal(result.lockReason, "empty_lock_id");
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testCreateIfMissingWhenExistingLockIsNull();
  testActiveLockRejectsWithExistingLock();
  testStaleLockReturnsReplacePlan();
  testStaleTakeoverIncludesExactExpectedExistingLock();
  testInvalidInputRejects();
  testInvalidNowMsRejects();
  testInvalidRequestedLockRejectsWithLockReason();
  testRequestedLockAcquiredInFutureRejects();
  testRequestedLockAlreadyExpiredRejects();
  testInvalidExistingLockRejects();

  console.log(`${LABEL} PASS`);
}

main();
