import * as assert from "assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireDecisionStoreLockFileCompareAndWrite } from "../lib/watcher/decisionStoreAtomicAcquireFile";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[e-5-decision-store-lock-fault-injection-hijack-resistance-smoke]";
const LOCK_PATH = "data/decision-store/decisions.lock.json";
const NOW_MS = 1_700_000_000_000;
const ACQUIRED_MS = 1_699_999_990_000;
const EXPIRES_FUTURE_MS = 1_700_000_060_000;
const EXPIRES_PAST_MS = 1_699_999_999_000;

function makeLock(overrides: Partial<DecisionStoreLockRecord> = {}): DecisionStoreLockRecord {
  return {
    lockId: "lock-default-001",
    ownerId: "owner-default-001",
    acquiredAtMs: ACQUIRED_MS,
    expiresAtMs: EXPIRES_FUTURE_MS,
    ...overrides,
  };
}

function serializeLock(lock: unknown): string {
  return `${JSON.stringify(lock)}\n`;
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-e5-fault-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeLock(lock: unknown): Promise<void> {
  await mkdir("data/decision-store", { recursive: true });
  await writeFile(LOCK_PATH, serializeLock(lock), "utf8");
}

async function readRawLock(): Promise<string> {
  return readFile(LOCK_PATH, "utf8");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function acquireInput(
  requestedLock: DecisionStoreLockRecord,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    path: LOCK_PATH,
    requestedLock,
    nowMs: NOW_MS,
    ...overrides,
  };
}

async function testOwnerIdHijackActiveLockRejected(): Promise<void> {
  await withTempCwd(async () => {
    const existingLock = makeLock({
      lockId: "lock-hijack-001",
      ownerId: "owner-attacker",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });
    await writeLock(existingLock);
    const rawBefore = await readRawLock();

    const requestedLock = makeLock({
      lockId: "lock-hijack-001",
      ownerId: "owner-legitimate",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });

    const result = await acquireDecisionStoreLockFileCompareAndWrite(acquireInput(requestedLock));

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_active_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), rawBefore);
  });
}

async function testLockIdHijackActiveLockRejected(): Promise<void> {
  await withTempCwd(async () => {
    const existingLock = makeLock({
      lockId: "lock-attacker-999",
      ownerId: "owner-shared-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });
    await writeLock(existingLock);
    const rawBefore = await readRawLock();

    const requestedLock = makeLock({
      lockId: "lock-legitimate-001",
      ownerId: "owner-shared-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });

    const result = await acquireDecisionStoreLockFileCompareAndWrite(acquireInput(requestedLock));

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_active_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), rawBefore);
  });
}

async function testCorruptLockFileRejectedWithoutMutation(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    const corruptContent = "{not-json}";
    await writeFile(LOCK_PATH, corruptContent, "utf8");

    const result = await acquireDecisionStoreLockFileCompareAndWrite(
      acquireInput(makeLock({ lockId: "lock-new-001", ownerId: "owner-new-001" })),
    );

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "lock_parse_failed",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), corruptContent);
  });
}

async function testInvalidLockShapeRejectedWithoutMutation(): Promise<void> {
  await withTempCwd(async () => {
    const invalidLock = {
      lockId: "lock-shape-001",
      ownerId: "",
      acquiredAtMs: ACQUIRED_MS,
      expiresAtMs: EXPIRES_FUTURE_MS,
    };
    await writeLock(invalidLock);
    const rawBefore = await readRawLock();

    const result = await acquireDecisionStoreLockFileCompareAndWrite(
      acquireInput(makeLock({ lockId: "lock-shape-new-001", ownerId: "owner-shape-001" })),
    );

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "invalid_existing_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), rawBefore);
  });
}

async function testStaleTakeoverSucceedsAndReplacesExactly(): Promise<void> {
  await withTempCwd(async () => {
    const staleLock = makeLock({
      lockId: "lock-stale-001",
      ownerId: "owner-stale-001",
      expiresAtMs: EXPIRES_PAST_MS,
    });
    const requestedLock = makeLock({
      lockId: "lock-new-takeover-001",
      ownerId: "owner-new-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });

    await writeLock(staleLock);

    const result = await acquireDecisionStoreLockFileCompareAndWrite(acquireInput(requestedLock));

    assert.deepEqual(result, {
      ok: true,
      action: "acquired",
      mode: "replaced_stale",
      normalizedPath: LOCK_PATH,
      lock: requestedLock,
    });
    assert.equal(await readRawLock(), serializeLock(requestedLock));
  });
}

async function testAlreadyRequestedActiveLockRejectsReacquire(): Promise<void> {
  await withTempCwd(async () => {
    const activeLock = makeLock({
      lockId: "lock-active-reacquire-001",
      ownerId: "owner-active-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });
    await writeLock(activeLock);
    const rawBefore = await readRawLock();

    const result = await acquireDecisionStoreLockFileCompareAndWrite(acquireInput(activeLock));

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_active_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), rawBefore);
  });
}

async function testCreateConflictNoAccidentalOverwrite(): Promise<void> {
  await withTempCwd(async () => {
    const precreatedLock = makeLock({
      lockId: "lock-precreated-001",
      ownerId: "owner-precreated-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });
    await writeLock(precreatedLock);
    const rawBefore = await readRawLock();

    const result = await acquireDecisionStoreLockFileCompareAndWrite(
      acquireInput(makeLock({ lockId: "lock-new-create-001", ownerId: "owner-new-001" })),
    );

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_active_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await readRawLock(), rawBefore);
  });
}

async function testInvalidRequestedLockNoFileCreated(): Promise<void> {
  await withTempCwd(async () => {
    const invalidRequestedLock = {
      ownerId: "owner-invalid-001",
      acquiredAtMs: ACQUIRED_MS,
      expiresAtMs: EXPIRES_FUTURE_MS,
    } as unknown as DecisionStoreLockRecord;

    const result = await acquireDecisionStoreLockFileCompareAndWrite(
      acquireInput(invalidRequestedLock),
    );

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_invalid_requested_lock",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await fileExists(LOCK_PATH), false);
  });
}

async function testInvalidNowMsNoFileCreated(): Promise<void> {
  await withTempCwd(async () => {
    const requestedLock = makeLock({
      lockId: "lock-invalid-now-001",
      ownerId: "owner-invalid-now-001",
    });

    const result = await acquireDecisionStoreLockFileCompareAndWrite(
      acquireInput(requestedLock, { nowMs: -1 }),
    );

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_invalid_now_ms",
      normalizedPath: LOCK_PATH,
    });
    assert.equal(await fileExists(LOCK_PATH), false);
  });
}

async function testTempFileAbsentAfterSuccessfulStaleTakeover(): Promise<void> {
  await withTempCwd(async () => {
    const staleLock = makeLock({
      lockId: "lock-stale-cleanup-001",
      ownerId: "owner-stale-cleanup-001",
      expiresAtMs: EXPIRES_PAST_MS,
    });
    const requestedLock = makeLock({
      lockId: "lock-new-cleanup-001",
      ownerId: "owner-new-cleanup-001",
      expiresAtMs: EXPIRES_FUTURE_MS,
    });

    await writeLock(staleLock);

    const result = await acquireDecisionStoreLockFileCompareAndWrite(acquireInput(requestedLock));

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.mode, "replaced_stale");
    }
    assert.equal(await fileExists(`${LOCK_PATH}.tmp`), false);
  });
}

// stale_lock_changed requires an internal race hook and is intentionally not asserted here.
// The public API does not expose a hook to inject a concurrent writer between read and re-read.

async function main(): Promise<void> {
  await testOwnerIdHijackActiveLockRejected();
  await testLockIdHijackActiveLockRejected();
  await testCorruptLockFileRejectedWithoutMutation();
  await testInvalidLockShapeRejectedWithoutMutation();
  await testStaleTakeoverSucceedsAndReplacesExactly();
  await testAlreadyRequestedActiveLockRejectsReacquire();
  await testCreateConflictNoAccidentalOverwrite();
  await testInvalidRequestedLockNoFileCreated();
  await testInvalidNowMsNoFileCreated();
  await testTempFileAbsentAfterSuccessfulStaleTakeover();

  console.log(`${LABEL} PASS`);
}

void main();
