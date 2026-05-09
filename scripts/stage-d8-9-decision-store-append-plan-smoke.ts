import * as assert from "assert/strict";
import {
  buildDecisionStoreAppendPlan,
  buildDecisionStoreInMemoryIndex,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-9-decision-store-append-plan-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-plan-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-plan",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-plan-001",
      txHash: "tx-store-plan-001",
      traceId: "trace-store-plan-001",
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

const VALID_PATH = "data/decision-store/decisions.jsonl";

function buildValidIndex(records: ReturnType<typeof buildCandidateDecisionRecord>[]) {
  const result = buildDecisionStoreInMemoryIndex(records);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected valid index");
  }
  return result.index;
}

function testProceedAppendIncludesSerializedLine(): void {
  const incoming = buildCandidateDecisionRecord(sampleInput());
  const plan = buildDecisionStoreAppendPlan(VALID_PATH, buildValidIndex([]), incoming);

  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.action, "proceed_append");
    assert.equal(plan.normalizedPath, VALID_PATH);
    assert.equal(plan.decisionId, incoming.decisionId);
    assert.equal(plan.serializedLine, `${JSON.stringify(incoming)}\n`);
  }
}

function testSkipDuplicateDoesNotIncludeSerializedLine(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord(sampleInput());
  const plan = buildDecisionStoreAppendPlan(VALID_PATH, buildValidIndex([existing]), incoming);

  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.action, "skip_duplicate");
    assert.equal("serializedLine" in plan, false);
  }
}

function testHardFailDoesNotIncludeSerializedLine(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const plan = buildDecisionStoreAppendPlan(VALID_PATH, buildValidIndex([existing]), incoming);

  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.action, "hard_fail");
    assert.equal("serializedLine" in plan, false);
  }
}

function testInvalidPathHardFails(): void {
  const incoming = buildCandidateDecisionRecord(sampleInput());
  const plan = buildDecisionStoreAppendPlan("../decisions.jsonl", buildValidIndex([]), incoming);

  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.action, "hard_fail");
    assert.equal(plan.reason, "path_outside_decision_store_dir");
    assert.equal("serializedLine" in plan, false);
  }
}

function main(): void {
  testProceedAppendIncludesSerializedLine();
  testSkipDuplicateDoesNotIncludeSerializedLine();
  testHardFailDoesNotIncludeSerializedLine();
  testInvalidPathHardFails();
  console.log(`${LABEL} PASS`);
}

main();
