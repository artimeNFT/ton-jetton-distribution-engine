import * as assert from "assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendApprovedDecisionStorePlanWithOwnership } from "../lib/watcher/decisionStoreWriter";
import type { DecisionStoreAppendPlanResult } from "../lib/watcher/decisionStore";

type ApprovedAppendPlan = Extract<DecisionStoreAppendPlanResult, { readonly ok: true; readonly action: "proceed_append" }>;
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[e-2-decision-store-append-writer-lock-enforcement-smoke]";

const NOW_MS = 1_700_000_000_000;
const LOCK: DecisionStoreLockRecord = {
  lockId: "lock-e2-001",
  ownerId: "owner-e2-001",
  acquiredAtMs: 1_699_999_900_000,
  expiresAtMs: 1_700_000_100_000,
};

function approvedPlan(path: string): ApprovedAppendPlan {
  return {
    ok: true,
    action: "proceed_append",
    normalizedPath: path,
    decisionId: "decision-e2-001",
    serializedLine: JSON.stringify({ decisionId: "decision-e2-001" }) + "\n",
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-e2-writer-"));
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

async function assertRejectsWithoutWrite(
  overrides: Record<string, unknown>,
  expectedReason: string,
): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    const result = await appendApprovedDecisionStorePlanWithOwnership({
      plan: approvedPlan(path),
      existingLock: LOCK,
      expectedOwnerId: LOCK.ownerId,
      expectedLockId: LOCK.lockId,
      nowMs: NOW_MS,
      ...overrides,
    });

    assert.deepEqual(result, { ok: false, action: "rejected", reason: expectedReason });
    assert.equal(await fileExists(path), false);
  });
}

async function testValidOwnershipAppends(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    const plan = approvedPlan(path);

    const result = await appendApprovedDecisionStorePlanWithOwnership({
      plan,
      existingLock: LOCK,
      expectedOwnerId: LOCK.ownerId,
      expectedLockId: LOCK.lockId,
      nowMs: NOW_MS,
    });

    assert.deepEqual(result, {
      ok: true,
      action: "appended",
      normalizedPath: path,
    });

    assert.equal(await readFile(path, "utf8"), plan.serializedLine);
  });
}

async function testInvalidInputRejected(): Promise<void> {
  const result = await appendApprovedDecisionStorePlanWithOwnership(null);
  assert.deepEqual(result, { ok: false, action: "rejected", reason: "invalid_input" });
}

async function testInvalidPlanRejectedBeforeOwnership(): Promise<void> {
  await assertRejectsWithoutWrite({ plan: null }, "invalid_plan");
  await assertRejectsWithoutWrite({ plan: { ok: true, action: "skip_duplicate" } }, "plan_not_approved_for_append");
}

async function testMissingLockRejectedWithoutWrite(): Promise<void> {
  await assertRejectsWithoutWrite({ existingLock: null }, "ownership_missing_lock");
}

async function testWrongOwnerRejectedWithoutWrite(): Promise<void> {
  await assertRejectsWithoutWrite({ expectedOwnerId: "wrong-owner" }, "ownership_owner_id_mismatch");
}

async function testWrongLockRejectedWithoutWrite(): Promise<void> {
  await assertRejectsWithoutWrite({ expectedLockId: "wrong-lock" }, "ownership_lock_id_mismatch");
}

async function testExpiredLockRejectedWithoutWrite(): Promise<void> {
  await assertRejectsWithoutWrite(
    { existingLock: { ...LOCK, expiresAtMs: NOW_MS } },
    "ownership_lock_expired",
  );
}

async function testInvalidLockRejectedWithoutWrite(): Promise<void> {
  await assertRejectsWithoutWrite(
    { existingLock: { ...LOCK, ownerId: "" } },
    "ownership_invalid_lock_record",
  );
}

async function main(): Promise<void> {
  await testValidOwnershipAppends();
  await testInvalidInputRejected();
  await testInvalidPlanRejectedBeforeOwnership();
  await testMissingLockRejectedWithoutWrite();
  await testWrongOwnerRejectedWithoutWrite();
  await testWrongLockRejectedWithoutWrite();
  await testExpiredLockRejectedWithoutWrite();
  await testInvalidLockRejectedWithoutWrite();

  console.log(`${LABEL} PASS`);
}

void main();
