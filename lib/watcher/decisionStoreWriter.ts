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

import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DecisionStoreAppendPlanResult } from "./decisionStore";

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
