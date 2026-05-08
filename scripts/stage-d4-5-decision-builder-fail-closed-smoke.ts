import * as assert from "assert/strict";
import {
  tryBuildCandidateDecisionRecord,
  type BuildCandidateDecisionRecordInput,
} from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d4-5-decision-builder-fail-closed-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-fail-closed-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-fail-closed",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-fail-closed-001",
      txHash: "tx-fail-closed-001",
      traceId: "trace-fail-closed-001",
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

function testValidInputBuildsRecord(): void {
  const result = tryBuildCandidateDecisionRecord(sampleInput());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.record.candidateId, "candidate-fail-closed-001");
  }
}

function testInvalidInputFailsClosed(): void {
  const result = tryBuildCandidateDecisionRecord({
    ...sampleInput(),
    candidateAgeMs: -1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.reason === "invalid_candidate_age_ms"),
    );
  }
}

function main(): void {
  testValidInputBuildsRecord();
  testInvalidInputFailsClosed();
  console.log(`${LABEL} PASS`);
}

main();
