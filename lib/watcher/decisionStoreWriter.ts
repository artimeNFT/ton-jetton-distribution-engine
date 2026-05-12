/**
 * decisionStoreWriter.ts
 *
 * Minimal Decision Store append writer shell.
 *
 * Hard constraints for the legacy appendApprovedDecisionStorePlan:
 * - Accept only an approved proceed_append plan.
 * - Write only plan.serializedLine.
 * - Do not rebuild JSON.
 * - Do not validate records.
 * - Do not classify duplicates.
 * - Do not scan/recover.
 * - Do not lock.
 * - No Dispatcher / RunState / targets / execution coupling.
 *
 * E-2 adds appendApprovedDecisionStorePlanWithOwnership as a separate
 * fail-closed append boundary that verifies lock ownership immediately
 * before mkdir/appendFile.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  preflightDecisionStorePath,
  recoverDecisionStoreFromJsonl,
  type DecisionStoreAppendPlanResult,
  type DecisionStoreRecoveryParseResult,
} from "./decisionStore";
import { validateDecisionStoreOwnership } from "./decisionStoreOwnership";
import type { DecisionStoreLockRecord } from "./decisionStoreLock";

export type DecisionStoreAppendWriterResult =
  | { readonly ok: true; readonly action: "appended"; readonly normalizedPath: string }
  | { readonly ok: false; readonly action: "rejected"; readonly reason: string };

export async function appendApprovedDecisionStorePlan(
  plan: DecisionStoreAppendPlanResult,
): Promise<DecisionStoreAppendWriterResult> {
  if (!plan.ok || plan.action !== "proceed_append") {
    return { ok: false, action: "rejected", reason: "plan_not_approved_for_append" };
  }

  await mkdir(dirname(plan.normalizedPath), { recursive: true });
  await appendFile(plan.normalizedPath, plan.serializedLine, { encoding: "utf8" });

  return {
    ok: true,
    action: "appended",
    normalizedPath: plan.normalizedPath,
  };
}

interface AppendApprovedDecisionStorePlanWithOwnershipInput {
  readonly plan: DecisionStoreAppendPlanResult;
  readonly existingLock: DecisionStoreLockRecord | null;
  readonly expectedOwnerId: unknown;
  readonly expectedLockId: unknown;
  readonly nowMs: unknown;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function appendApprovedDecisionStorePlanWithOwnership(
  input: unknown,
): Promise<DecisionStoreAppendWriterResult> {
  if (!isNonArrayObject(input)) {
    return { ok: false, action: "rejected", reason: "invalid_input" };
  }

  const candidate = input as unknown as AppendApprovedDecisionStorePlanWithOwnershipInput;

  if (!isNonArrayObject(candidate.plan)) {
    return { ok: false, action: "rejected", reason: "invalid_plan" };
  }

  const plan = candidate.plan as DecisionStoreAppendPlanResult;
  if (!plan.ok || plan.action !== "proceed_append") {
    return { ok: false, action: "rejected", reason: "plan_not_approved_for_append" };
  }

  if (!isNonEmptyString(plan.normalizedPath) || !isNonEmptyString(plan.serializedLine)) {
    return { ok: false, action: "rejected", reason: "invalid_plan" };
  }

  const ownership = validateDecisionStoreOwnership({
    existingLock: candidate.existingLock,
    expectedOwnerId: candidate.expectedOwnerId,
    expectedLockId: candidate.expectedLockId,
    nowMs: candidate.nowMs,
  });

  if (!ownership.ok) {
    return {
      ok: false,
      action: "rejected",
      reason: `ownership_${ownership.reason}`,
    };
  }

  await mkdir(dirname(plan.normalizedPath), { recursive: true });
  await appendFile(plan.normalizedPath, plan.serializedLine, { encoding: "utf8" });

  return {
    ok: true,
    action: "appended",
    normalizedPath: plan.normalizedPath,
  };
}

export type DecisionStoreRecoveryFileReaderResult =
  | DecisionStoreRecoveryParseResult
  | { readonly ok: false; readonly reason: string; readonly normalizedPath?: string };

export async function recoverDecisionStoreFromFile(
  path: string,
): Promise<DecisionStoreRecoveryFileReaderResult> {
  const pathPreflight = preflightDecisionStorePath(path);

  if (!pathPreflight.ok) {
    return { ok: false, reason: pathPreflight.reason };
  }

  try {
    const content = await readFile(pathPreflight.normalizedPath, "utf8");
    return recoverDecisionStoreFromJsonl(content);
  } catch {
    return {
      ok: false,
      reason: "file_read_failed",
      normalizedPath: pathPreflight.normalizedPath,
    };
  }
}
