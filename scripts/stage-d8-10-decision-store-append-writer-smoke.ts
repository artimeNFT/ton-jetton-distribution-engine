import * as assert from "assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
    gasEstimateSnapshot: {
      gasEstimateSource: "offline_fixed",
      gasEstimateMethod: "fixed-dry-run-v1",
      gasEstimatorVersion: "gas-estimator-v1",
      gasObservedAt: "2026-01-01T00:00:30.000Z",
      gasMaxFreshnessMs: 60_000,
      gasFreshnessDecision: "not_applicable_offline_fixed",
      gasChain: null,
      gasWorkchain: null,
      gasChainSeqno: null,
      gasChainConfigHash: null,
      gasChainConfigParamVersion: null,
      estimatedStorageFeeNanoTon: "10",
      estimatedComputeFeeNanoTon: "20",
      estimatedForwardFeeNanoTon: "30",
      estimatedActionFeeNanoTon: "40",
      estimatedTotalFeeNanoTon: "100",
      feeAllowanceNanoTon: "150",
      feePolicyVersion: "fee-policy-v1",
      feeDecision: "within_fee_allowance",
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

async function testRejectedPlansDoNotCreateFile(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-writer-reject-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    const path = "data/decision-store/decisions.jsonl";

    await appendApprovedDecisionStorePlan({
      ok: true,
      action: "skip_duplicate",
      normalizedPath: path,
      decisionId: "decision-id-skip",
      reason: "identical_duplicate",
    });

    await appendApprovedDecisionStorePlan({
      ok: false,
      action: "hard_fail",
      reason: "conflict",
      decisionId: "decision-id-hard-fail",
      candidateId: "candidate-hard-fail",
      decisionRunId: "run-hard-fail",
      normalizedPath: path,
    });

    assert.equal(await fileExists(path), false);
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function testTwoProceedPlansAppendTwoLinesInOrder(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-writer-double-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    const path = "data/decision-store/decisions.jsonl";

    const first = buildCandidateDecisionRecord(sampleInput());
    const second = buildCandidateDecisionRecord({
      ...sampleInput(),
      candidate: {
        ...sampleInput().candidate,
        candidateId: "candidate-store-writer-002",
      } as CandidateRecord,
    });

    const indexResult = buildDecisionStoreInMemoryIndex([]);
    assert.equal(indexResult.ok, true);
    if (!indexResult.ok) throw new Error("expected valid index");

    const firstPlan = buildDecisionStoreAppendPlan(path, indexResult.index, first);
    const secondPlan = buildDecisionStoreAppendPlan(path, indexResult.index, second);

    assert.equal(firstPlan.ok, true);
    assert.equal(secondPlan.ok, true);
    if (!firstPlan.ok || firstPlan.action !== "proceed_append") {
      throw new Error("expected first proceed_append");
    }
    if (!secondPlan.ok || secondPlan.action !== "proceed_append") {
      throw new Error("expected second proceed_append");
    }

    await appendApprovedDecisionStorePlan(firstPlan);
    await appendApprovedDecisionStorePlan(secondPlan);

    const content = await readFile(path, "utf8");
    assert.equal(content, firstPlan.serializedLine + secondPlan.serializedLine);
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await testApprovedPlanAppendsSerializedLine();
  await testRejectsNonProceedPlan();
  await testRejectsHardFailPlan();
  await testRejectedPlansDoNotCreateFile();
  await testTwoProceedPlansAppendTwoLinesInOrder();
  console.log(`${LABEL} PASS`);
}

void main();
