import * as assert from "assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readDecisionStoreLockFile,
  writeDecisionStoreLockFile,
} from "../lib/watcher/decisionStoreLockFile";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[stage-d8-16-decision-store-lock-file-shell-smoke]";

const LOCK_PATH = "data/decision-store/decisions.lock.json";

function sampleLock(overrides: Partial<DecisionStoreLockRecord> = {}): DecisionStoreLockRecord {
  return {
    lockId: "lock-file-001",
    ownerId: "owner-a",
    acquiredAtMs: 1_000,
    expiresAtMs: 2_000,
    ...overrides,
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-lock-file-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function testWritesAndReadsValidLockFile(): Promise<void> {
  await withTempCwd(async () => {
    const lock = sampleLock();

    const writeResult = await writeDecisionStoreLockFile(LOCK_PATH, lock);
    assert.deepEqual(writeResult, {
      ok: true,
      action: "written",
      normalizedPath: LOCK_PATH,
    });

    const readResult = await readDecisionStoreLockFile(LOCK_PATH);
    assert.deepEqual(readResult, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock,
    });
  });
}

async function testWriteUsesTempThenRenameNoTempLeft(): Promise<void> {
  await withTempCwd(async () => {
    const lock = sampleLock();

    const result = await writeDecisionStoreLockFile(LOCK_PATH, lock);
    assert.equal(result.ok, true);
    assert.equal(await fileExists(LOCK_PATH), true);
    assert.equal(await fileExists(`${LOCK_PATH}.tmp`), false);

    const content = await readFile(LOCK_PATH, "utf8");
    assert.equal(content, `${JSON.stringify(lock)}\n`);
  });
}

async function testInvalidPathFailsBeforeWrite(): Promise<void> {
  const result = await writeDecisionStoreLockFile("../decisions.lock.json", sampleLock());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "path_outside_decision_store_dir");
  }
}

async function testInvalidLockRecordDoesNotWrite(): Promise<void> {
  await withTempCwd(async () => {
    const result = await writeDecisionStoreLockFile(LOCK_PATH, sampleLock({ ownerId: "" }));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "empty_owner_id");
    }

    assert.equal(await fileExists(LOCK_PATH), false);
    assert.equal(await fileExists(`${LOCK_PATH}.tmp`), false);
  });
}

async function testInvalidJsonReadFailsTyped(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, "{not-json}", "utf8");

    const result = await readDecisionStoreLockFile(LOCK_PATH);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "lock_parse_failed");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function testInvalidPathFailsBeforeRead(): Promise<void> {
  const result = await readDecisionStoreLockFile("../decisions.lock.json");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "path_outside_decision_store_dir");
  }
}

async function testInvalidLockJsonRecordFailsTyped(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, JSON.stringify(sampleLock({ ownerId: "" })), "utf8");

    const result = await readDecisionStoreLockFile(LOCK_PATH);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "empty_owner_id");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function testMissingFileReadFailsTyped(): Promise<void> {
  await withTempCwd(async () => {
    const result = await readDecisionStoreLockFile(LOCK_PATH);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "lock_file_missing");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function main(): Promise<void> {
  await testWritesAndReadsValidLockFile();
  await testWriteUsesTempThenRenameNoTempLeft();
  await testInvalidPathFailsBeforeWrite();
  await testInvalidLockRecordDoesNotWrite();
  await testInvalidJsonReadFailsTyped();
  await testInvalidPathFailsBeforeRead();
  await testInvalidLockJsonRecordFailsTyped();
  await testMissingFileReadFailsTyped();
  console.log(`${LABEL} PASS`);
}

void main();
