import * as assert from "assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  acquireDecisionStoreLockFileShell,
  readDecisionStoreLockFile,
  releaseDecisionStoreLockFileShell,
  writeDecisionStoreLockFile,
} from "../lib/watcher/decisionStoreLockFile";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[stage-d8-17-decision-store-lock-acquire-release-shell-smoke]";
const LOCK_PATH = "data/decision-store/decisions.lock.json";

function sampleLock(overrides: Partial<DecisionStoreLockRecord> = {}): DecisionStoreLockRecord {
  return {
    lockId: "lock-acquire-release-001",
    ownerId: "owner-a",
    acquiredAtMs: 1_000,
    expiresAtMs: 2_000,
    ...overrides,
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-lock-shell-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function testAcquireMissingLockWritesRequestedLock(): Promise<void> {
  await withTempCwd(async () => {
    const lock = sampleLock();

    const result = await acquireDecisionStoreLockFileShell(LOCK_PATH, lock, 1_500);
    assert.deepEqual(result, {
      ok: true,
      action: "acquired",
      normalizedPath: LOCK_PATH,
      lock,
    });

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock,
    });
  });
}

async function testAcquireActiveLockFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    const existingLock = sampleLock({ ownerId: "owner-a" });
    const requestedLock = sampleLock({
      lockId: "lock-acquire-release-002",
      ownerId: "owner-b",
    });

    await writeDecisionStoreLockFile(LOCK_PATH, existingLock);

    const result = await acquireDecisionStoreLockFileShell(LOCK_PATH, requestedLock, 1_500);

    assert.deepEqual(result, {
      ok: false,
      action: "active_lock",
      normalizedPath: LOCK_PATH,
      existingLock,
      requestedOwnerId: "owner-b",
    });

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock: existingLock,
    });
  });
}

async function testAcquireStaleLockOverwritesWithRequestedLock(): Promise<void> {
  await withTempCwd(async () => {
    const staleLock = sampleLock({
      lockId: "stale-lock",
      ownerId: "owner-a",
      acquiredAtMs: 1_000,
      expiresAtMs: 2_000,
    });
    const requestedLock = sampleLock({
      lockId: "fresh-lock",
      ownerId: "owner-b",
      acquiredAtMs: 2_100,
      expiresAtMs: 3_100,
    });

    await writeDecisionStoreLockFile(LOCK_PATH, staleLock);

    const result = await acquireDecisionStoreLockFileShell(LOCK_PATH, requestedLock, 2_000);

    assert.deepEqual(result, {
      ok: true,
      action: "acquired",
      normalizedPath: LOCK_PATH,
      lock: requestedLock,
    });

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock: requestedLock,
    });
  });
}

async function testAcquireCorruptLockFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, JSON.stringify(sampleLock({ ownerId: "" })), "utf8");

    const result = await acquireDecisionStoreLockFileShell(
      LOCK_PATH,
      sampleLock({ lockId: "new-lock", ownerId: "owner-b" }),
      1_500,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.action, "acquire_failed");
      assert.equal(result.reason, "empty_owner_id");
    }
  });
}

async function testReleaseAllowedForOwner(): Promise<void> {
  await withTempCwd(async () => {
    const lock = sampleLock({ ownerId: "owner-a" });
    await writeDecisionStoreLockFile(LOCK_PATH, lock);

    const result = await releaseDecisionStoreLockFileShell(LOCK_PATH, "owner-a");

    assert.deepEqual(result, {
      ok: true,
      action: "release_allowed",
      normalizedPath: LOCK_PATH,
      lockId: lock.lockId,
      ownerId: lock.ownerId,
    });

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock,
    });
  });
}

async function testReleaseRejectsOwnerMismatch(): Promise<void> {
  await withTempCwd(async () => {
    const lock = sampleLock({ ownerId: "owner-a" });
    await writeDecisionStoreLockFile(LOCK_PATH, lock);

    const result = await releaseDecisionStoreLockFileShell(LOCK_PATH, "owner-b");

    assert.deepEqual(result, {
      ok: false,
      action: "release_owner_mismatch",
      normalizedPath: LOCK_PATH,
      existingLock: lock,
      requestedOwnerId: "owner-b",
    });

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock,
    });
  });
}

async function testReleaseMissingLockFailsTyped(): Promise<void> {
  await withTempCwd(async () => {
    const result = await releaseDecisionStoreLockFileShell(LOCK_PATH, "owner-a");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.action, "release_failed");
      assert.equal(result.reason, "lock_file_missing");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function main(): Promise<void> {
  await testAcquireMissingLockWritesRequestedLock();
  await testAcquireActiveLockFailsClosed();
  await testAcquireStaleLockOverwritesWithRequestedLock();
  await testAcquireCorruptLockFailsClosed();
  await testReleaseAllowedForOwner();
  await testReleaseRejectsOwnerMismatch();
  await testReleaseMissingLockFailsTyped();
  console.log(`${LABEL} PASS`);
}

void main();
