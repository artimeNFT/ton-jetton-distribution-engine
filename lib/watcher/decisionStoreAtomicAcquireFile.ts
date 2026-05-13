import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { preflightDecisionStorePath } from "./decisionStore";
import {
  validateDecisionStoreLockRecord,
  type DecisionStoreLockRecord,
} from "./decisionStoreLock";
import {
  planDecisionStoreAtomicAcquire,
  type DecisionStoreAtomicAcquirePlan,
} from "./decisionStoreAtomicAcquire";

export type DecisionStoreAtomicAcquireFileReason =
  | "invalid_input"
  | "invalid_path"
  | "read_failed"
  | "lock_parse_failed"
  | "invalid_existing_lock"
  | "plan_invalid_input"
  | "plan_invalid_now_ms"
  | "plan_invalid_requested_lock"
  | "plan_requested_lock_acquired_in_future"
  | "plan_requested_lock_already_expired"
  | "plan_invalid_existing_lock"
  | "plan_active_lock"
  | "create_conflict"
  | "stale_lock_changed"
  | "write_failed";

export type DecisionStoreAtomicAcquireFileResult =
  | {
      readonly ok: true;
      readonly action: "acquired";
      readonly mode: "created" | "replaced_stale";
      readonly normalizedPath: string;
      readonly lock: DecisionStoreLockRecord;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DecisionStoreAtomicAcquireFileReason;
      readonly normalizedPath?: string;
    };

interface AcquireFileInput {
  readonly path: unknown;
  readonly requestedLock: DecisionStoreLockRecord;
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

function rejectedNoPath(
  reason: DecisionStoreAtomicAcquireFileReason,
): DecisionStoreAtomicAcquireFileResult {
  return { ok: false, action: "rejected", reason };
}

function rejectedWithPath(
  reason: DecisionStoreAtomicAcquireFileReason,
  normalizedPath: string,
): DecisionStoreAtomicAcquireFileResult {
  return { ok: false, action: "rejected", reason, normalizedPath };
}

function serializeLock(lock: DecisionStoreLockRecord): string {
  return `${JSON.stringify(lock)}\n`;
}

function normalizeLock(lock: DecisionStoreLockRecord): string {
  return JSON.stringify({
    lockId: lock.lockId,
    ownerId: lock.ownerId,
    acquiredAtMs: lock.acquiredAtMs,
    expiresAtMs: lock.expiresAtMs,
  });
}

function lockRecordsEqual(
  a: DecisionStoreLockRecord,
  b: DecisionStoreLockRecord,
): boolean {
  return normalizeLock(a) === normalizeLock(b);
}

function mapPlanReason(reason: string): DecisionStoreAtomicAcquireFileReason {
  const map: Record<string, DecisionStoreAtomicAcquireFileReason> = {
    invalid_input: "plan_invalid_input",
    invalid_now_ms: "plan_invalid_now_ms",
    invalid_requested_lock: "plan_invalid_requested_lock",
    requested_lock_acquired_in_future: "plan_requested_lock_acquired_in_future",
    requested_lock_already_expired: "plan_requested_lock_already_expired",
    invalid_existing_lock: "plan_invalid_existing_lock",
    active_lock: "plan_active_lock",
  };

  return map[reason] ?? "plan_invalid_input";
}

function isErrnoWithCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    (error as { readonly code?: unknown }).code === code
  );
}

function hasValidLockShape(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value["lockId"]) &&
    isNonEmptyString(value["ownerId"]) &&
    isSafeNonNegativeInteger(value["acquiredAtMs"]) &&
    isSafeNonNegativeInteger(value["expiresAtMs"])
  );
}

async function readExistingLock(
  normalizedPath: string,
): Promise<
  | { readonly ok: true; readonly lock: DecisionStoreLockRecord | null }
  | { readonly ok: false; readonly reason: DecisionStoreAtomicAcquireFileReason }
> {
  let raw: string;

  try {
    raw = await readFile(normalizedPath, { encoding: "utf8" });
  } catch (error) {
    if (isErrnoWithCode(error, "ENOENT")) {
      return { ok: true, lock: null };
    }

    return { ok: false, reason: "read_failed" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "lock_parse_failed" };
  }

  if (!isNonArrayObject(parsed)) {
    return { ok: false, reason: "lock_parse_failed" };
  }

  if (!hasValidLockShape(parsed)) {
    return { ok: false, reason: "invalid_existing_lock" };
  }

  const lock = parsed as unknown as DecisionStoreLockRecord;
  const validation = validateDecisionStoreLockRecord(lock);

  if (!validation.ok) {
    return { ok: false, reason: "invalid_existing_lock" };
  }

  return { ok: true, lock };
}

export async function acquireDecisionStoreLockFileCompareAndWrite(
  input: unknown,
): Promise<DecisionStoreAtomicAcquireFileResult> {
  if (!isNonArrayObject(input)) {
    return rejectedNoPath("invalid_input");
  }

  const candidate = input as unknown as AcquireFileInput;

  if (!isNonEmptyString(candidate.path)) {
    return rejectedNoPath("invalid_path");
  }

  const pathPreflight = preflightDecisionStorePath(candidate.path);
  if (!pathPreflight.ok) {
    return rejectedNoPath("invalid_path");
  }

  const normalizedPath = pathPreflight.normalizedPath;
  const readResult = await readExistingLock(normalizedPath);

  if (!readResult.ok) {
    return rejectedWithPath(readResult.reason, normalizedPath);
  }

  const plan: DecisionStoreAtomicAcquirePlan = planDecisionStoreAtomicAcquire({
    existingLock: readResult.lock,
    requestedLock: candidate.requestedLock,
    nowMs: candidate.nowMs,
  });

  if (!plan.ok) {
    return rejectedWithPath(mapPlanReason(plan.reason), normalizedPath);
  }

  if (plan.action === "create_if_missing") {
    try {
      await mkdir(dirname(normalizedPath), { recursive: true });
    } catch {
      return rejectedWithPath("write_failed", normalizedPath);
    }

    try {
      await writeFile(normalizedPath, serializeLock(plan.requestedLock), {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      return rejectedWithPath(
        isErrnoWithCode(error, "EEXIST") ? "create_conflict" : "write_failed",
        normalizedPath,
      );
    }

    return {
      ok: true,
      action: "acquired",
      mode: "created",
      normalizedPath,
      lock: plan.requestedLock,
    };
  }

  const rereadResult = await readExistingLock(normalizedPath);
  if (!rereadResult.ok) {
    return rejectedWithPath(rereadResult.reason, normalizedPath);
  }

  if (
    rereadResult.lock === null ||
    !lockRecordsEqual(rereadResult.lock, plan.expectedExistingLock)
  ) {
    return rejectedWithPath("stale_lock_changed", normalizedPath);
  }

  const tempPath = `${normalizedPath}.tmp`;

  try {
    await writeFile(tempPath, serializeLock(plan.requestedLock), { encoding: "utf8" });
    await rename(tempPath, normalizedPath);
  } catch {
    try {
      await unlink(tempPath);
    } catch {
      // best-effort cleanup only
    }

    return rejectedWithPath("write_failed", normalizedPath);
  }

  return {
    ok: true,
    action: "acquired",
    mode: "replaced_stale",
    normalizedPath,
    lock: plan.requestedLock,
  };
}
