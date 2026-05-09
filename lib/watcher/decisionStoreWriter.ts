/**
 * decisionStoreWriter.ts
 *
 * Minimal Decision Store append writer shell.
 *
 * Hard constraints:
 * - Accept only an approved proceed_append plan.
 * - Write only plan.serializedLine.
 * - Do not rebuild JSON.
 * - Do not validate records.
 * - Do not classify duplicates.
 * - Do not scan/recover.
 * - Do not lock.
 * - No Dispatcher / RunState / targets / execution coupling.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  preflightDecisionStorePath,
  recoverDecisionStoreFromJsonl,
  type DecisionStoreAppendPlanResult,
  type DecisionStoreRecoveryParseResult,
} from "./decisionStore";

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
