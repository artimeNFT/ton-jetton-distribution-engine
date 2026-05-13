import * as assert from "assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireDecisionStoreLockFileCompareAndWrite } from "../lib/watcher/decisionStoreAtomicAcquireFile";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[e-4-decision-store-atomic-acquire-file-shell-smoke]";
const LOCK_PATH = "data/decision-store/decisions.lock.json";
const NOW_MS = 1_700_000_000_000;

const REQUESTED_LOCK: DecisionStoreLockRecord = {
  lockId: "lock-e4-requested",
  ownerId: "owner-e4-requested",
  acquiredAtMs: 1_699_999_990_000,
  expiresAtMs: 1_700_000_060_000,
};

const ACTIVE_LOCK: DecisionStoreLockRecord = {
  lockId: "lock-e4-active",
  ownerId: "owner-e4-active",
  acquiredAtMs: 1_699_999_900_000,
  expiresAtMs: 1_700_000_060_000,
};

const STALE_LOCK: DecisionStoreLockRecord = {
  lockId: "lock-e4-stale",
  ownerId: "owner-e4-stale",
  acquiredAtMs: 1_699_999_800_000,
  expiresAtMs: 1_699_999_999_999,
};

function serializeLock(lock: DecisionStoreLockRecord): string {
  return `${JSON.stringify(lock)}\n`;
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-e4-acquire-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeLock(path: string, lock: DecisionStoreLockRecord): Promise<void> {
  await mkdir("data/decision-store", { recursive: true });
  await writeFile(path, serializeLock(lock), "utf8");
}

async function testCreateIfMissingCreatesLockFile(): Promise<void> {
  await withTempCwd(async () => {
    const result = await acquireDecisionStoreLockFileCompareAndWrite({
      path: LOCK_PATH,
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: true,
      action: "acquired",
      mode: "created",
      normalizedPath: LOCK_PATH,
      lock: REQUESTED_LOCK,
    });

    assert.equal(await readFile(LOCK_PATH, "utf8"), serializeLock(REQUESTED_LOCK));
  });
}

async function testActiveLockRejectsWithoutOverwrite(): Promise<void> {
  await withTempCwd(async () => {
    await writeLock(LOCK_PATH, ACTIVE_LOCK);

    const result = await acquireDecisionStoreLockFileCompareAndWrite({
      path: LOCK_PATH,
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "plan_active_lock",
      normalizedPath: LOCK_PATH,
    });

    assert.equal(await readFile(LOCK_PATH, "utf8"), serializeLock(ACTIVE_LOCK));
  });
}

async function testStaleLockReplacedOnlyAfterCompare(): Promise<void> {
  await withTempCwd(async () => {
    await writeLock(LOCK_PATH, STALE_LOCK);

    const result = await acquireDecisionStoreLockFileCompareAndWrite({
      path: LOCK_PATH,
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: true,
      action: "acquired",
      mode: "replaced_stale",
      normalizedPath: LOCK_PATH,
      lock: REQUESTED_LOCK,
    });

    assert.equal(await readFile(LOCK_PATH, "utf8"), serializeLock(REQUESTED_LOCK));
  });
}

async function testInvalidInputAndPathRejected(): Promise<void> {
  assert.deepEqual(await acquireDecisionStoreLockFileCompareAndWrite(null), {
    ok: false,
    action: "rejected",
    reason: "invalid_input",
  });

  assert.deepEqual(
    await acquireDecisionStoreLockFileCompareAndWrite({
      path: "",
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    }),
    { ok: false, action: "rejected", reason: "invalid_path" },
  );

  assert.deepEqual(
    await acquireDecisionStoreLockFileCompareAndWrite({
      path: "../decisions.lock.json",
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    }),
    { ok: false, action: "rejected", reason: "invalid_path" },
  );
}

async function testCorruptLockFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, "{not-json}", "utf8");

    const result = await acquireDecisionStoreLockFileCompareAndWrite({
      path: LOCK_PATH,
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "lock_parse_failed",
      normalizedPath: LOCK_PATH,
    });
  });
}

async function testInvalidExistingLockFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(
      LOCK_PATH,
      JSON.stringify({ ...STALE_LOCK, ownerId: "" }) + "\n",
      "utf8",
    );

    const result = await acquireDecisionStoreLockFileCompareAndWrite({
      path: LOCK_PATH,
      requestedLock: REQUESTED_LOCK,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: false,
      action: "rejected",
      reason: "invalid_existing_lock",
      normalizedPath: LOCK_PATH,
    });
  });
}

async function testPlanRejectionsArePrefixed(): Promise<void> {
  await withTempCwd(async () => {
    const futureRequestedLock: DecisionStoreLockRecord = {
      ...REQUESTED_LOCK,
      acquiredAtMs: NOW_MS + 1,
      expiresAtMs: NOW_MS + 60_000,
    };

    assert.deepEqual(
      await acquireDecisionStoreLockFileCompareAndWrite({
        path: LOCK_PATH,
        requestedLock: futureRequestedLock,
        nowMs: NOW_MS,
      }),
      {
        ok: false,
        action: "rejected",
        reason: "plan_requested_lock_acquired_in_future",
        normalizedPath: LOCK_PATH,
      },
    );

    assert.deepEqual(
      await acquireDecisionStoreLockFileCompareAndWrite({
        path: LOCK_PATH,
        requestedLock: REQUESTED_LOCK,
        nowMs: -1,
      }),
      {
        ok: false,
        action: "rejected",
        reason: "plan_invalid_now_ms",
        normalizedPath: LOCK_PATH,
      },
    );
  });
}

async function main(): Promise<void> {
  await testCreateIfMissingCreatesLockFile();
  await testActiveLockRejectsWithoutOverwrite();
  await testStaleLockReplacedOnlyAfterCompare();
  await testInvalidInputAndPathRejected();
  await testCorruptLockFailsClosed();
  await testInvalidExistingLockFailsClosed();
  await testPlanRejectionsArePrefixed();

  console.log(`${LABEL} PASS`);
}

void main();
