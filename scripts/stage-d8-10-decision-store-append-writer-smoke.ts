import * as assert from "assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDecisionStoreAppendPlan,
  buildDecisionStoreInMemoryIndex,
} from "../lib/watcher/decisionStore";
import { appendApprovedDecisionStorePlan } from "../lib/watcher/decisionStoreWriter";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-10-decision-store-append-writer-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-writer-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-writer",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-writer-001",
      txHash: "tx-store-writer-001",
      traceId: "trace-store-writer-001",
      lt: "123",
      actionIndex: "0",
      sourceProvider: "tonapi",
      sourceEndpoint: "/v2/accounts/{account_id}/jettons/history",
      observedAt: "2026-01-01T00:00:00.000Z",
      receivedAt: "2026-01-01T00:00:01.000Z",
    },
    budgetSnapshot: {
      globalBudgetLimit: "1000",
      globalBudgetUsedBeforeDecision: "100",
      globalBudgetAvailableBeforeDecision: "900",
      candidateAmount: "50",
      budgetCurrencyOrUnit: "jetton-base-unit",
      budgetSnapshotAt: "2026-01-01T00:01:00.000Z",
      budgetPolicyVersion: "budget-v1",
      budgetDecision: "within_budget",
    },
    finalitySnapshot: {
      finality: "confirmed",
      confirmationDepthUsed: 5,
      finalityDecision: "confirmed_depth_5",
    },
    rulesetSnapshot: {
      rulesetVersion: "ruleset-v1",
      ruleIds: ["rule-policy-accept"],
    },
    blacklistSnapshot: {
      blacklistVersion: "blacklist-v1",
      matched: false,
      matchReason: null,
    },
  };
}

function buildApprovedPlan(path: string) {
  const record = buildCandidateDecisionRecord(sampleInput());
  const indexResult = buildDecisionStoreInMemoryIndex([]);
  assert.equal(indexResult.ok, true);
  if (!indexResult.ok) throw new Error("expected valid index");

  const plan = buildDecisionStoreAppendPlan(path, indexResult.index, record);
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.action !== "proceed_append") {
    throw new Error("expected proceed_append plan");
  }

  return { plan, record };
}

async function testApprovedPlanAppendsSerializedLine(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-writer-"));
  const previousCwd = process.cwd();
  try {
    process.chdir(dir);
    const path = "data/decision-store/decisions.jsonl";
    const { plan } = buildApprovedPlan(path);

    const result = await appendApprovedDecisionStorePlan(plan);
    assert.deepEqual(result, {
      ok: true,
      action: "appended",
      normalizedPath: plan.normalizedPath,
    });

    const content = await readFile(plan.normalizedPath, "utf8");
    assert.equal(content, plan.serializedLine);
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function testRejectsNonProceedPlan(): Promise<void> {
  const rejected = await appendApprovedDecisionStorePlan({
    ok: true,
    action: "skip_duplicate",
    normalizedPath: "data/decision-store/decisions.jsonl",
    decisionId: "decision-id-skip",
    reason: "identical_duplicate",
  });

  assert.deepEqual(rejected, {
    ok: false,
    action: "rejected",
    reason: "plan_not_approved_for_append",
  });
}

async function testRejectsHardFailPlan(): Promise<void> {
  const rejected = await appendApprovedDecisionStorePlan({
    ok: false,
    action: "hard_fail",
    reason: "conflict",
    decisionId: "decision-id-hard-fail",
    candidateId: "candidate-hard-fail",
    decisionRunId: "run-hard-fail",
    normalizedPath: "data/decision-store/decisions.jsonl",
  });

  assert.deepEqual(rejected, {
    ok: false,
    action: "rejected",
    reason: "plan_not_approved_for_append",
  });
}

async function main(): Promise<void> {
  await testApprovedPlanAppendsSerializedLine();
  await testRejectsNonProceedPlan();
  await testRejectsHardFailPlan();
  console.log(`${LABEL} PASS`);
}

void main();
