import * as assert from "assert/strict";
import {
  validateBuildCandidateDecisionRecordInput,
  type BuildCandidateDecisionRecordInput,
} from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d4-4-decision-validation-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-validation-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-validation",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-validation-001",
      txHash: "tx-validation-001",
      traceId: "trace-validation-001",
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

function assertIssue(
  input: BuildCandidateDecisionRecordInput,
  reason: string,
): void {
  const result = validateBuildCandidateDecisionRecordInput(input);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.reason === reason),
      `expected issue ${reason}`,
    );
  }
}

function testValidInputPasses(): void {
  assert.deepEqual(validateBuildCandidateDecisionRecordInput(sampleInput()), {
    ok: true,
  });
}

function testRejectsNegativeCandidateAge(): void {
  assertIssue(
    { ...sampleInput(), candidateAgeMs: -1 },
    "invalid_candidate_age_ms",
  );
}

function testRejectsMissingDecisionRunId(): void {
  assertIssue(
    { ...sampleInput(), decisionRunId: "" },
    "missing_decision_run_id",
  );
}

function testRejectsMissingTxHash(): void {
  assertIssue(
    {
      ...sampleInput(),
      traceability: { ...sampleInput().traceability, txHash: "" },
    },
    "missing_trace_tx_hash",
  );
}

function testRejectsInvalidTxHash(): void {
  assertIssue(
    {
      ...sampleInput(),
      traceability: { ...sampleInput().traceability, txHash: "bad tx hash" },
    },
    "invalid_trace_tx_hash",
  );
}

function testRejectsInvalidTraceId(): void {
  assertIssue(
    {
      ...sampleInput(),
      traceability: { ...sampleInput().traceability, traceId: "bad trace id" },
    },
    "invalid_trace_id",
  );
}

function testRejectsInvalidBudgetAmount(): void {
  assertIssue(
    {
      ...sampleInput(),
      budgetSnapshot: {
        ...sampleInput().budgetSnapshot,
        candidateAmount: "-1",
      },
    },
    "invalid_budget_amount",
  );
}

function testRejectsInconsistentBudgetSnapshot(): void {
  assertIssue(
    {
      ...sampleInput(),
      budgetSnapshot: {
        ...sampleInput().budgetSnapshot,
        globalBudgetAvailableBeforeDecision: "899",
      },
    },
    "invalid_budget_consistency",
  );
}

function testRejectsNegativeFinalityDepth(): void {
  assertIssue(
    {
      ...sampleInput(),
      finalitySnapshot: {
        ...sampleInput().finalitySnapshot,
        confirmationDepthUsed: -1,
      },
    },
    "invalid_finality_depth",
  );
}

function main(): void {
  testValidInputPasses();
  testRejectsNegativeCandidateAge();
  testRejectsMissingDecisionRunId();
  testRejectsMissingTxHash();
  testRejectsInvalidTxHash();
  testRejectsInvalidTraceId();
  testRejectsInvalidBudgetAmount();
  testRejectsInconsistentBudgetSnapshot();
  testRejectsNegativeFinalityDepth();
  console.log(`${LABEL} PASS`);
}

main();
