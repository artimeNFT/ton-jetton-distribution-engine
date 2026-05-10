import * as assert from "assert/strict";
import {
  classifyDecisionStoreDuplicate,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-3-decision-store-duplicate-classifier-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-duplicate-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-duplicate",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-duplicate-001",
      txHash: "tx-store-duplicate-001",
      traceId: "trace-store-duplicate-001",
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

function testNullExistingIsNewRecord(): void {
  const incoming = buildCandidateDecisionRecord(sampleInput());

  assert.deepEqual(classifyDecisionStoreDuplicate(null, incoming), {
    kind: "new_record",
  });
}

function testIdenticalDuplicate(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord(sampleInput());

  const result = classifyDecisionStoreDuplicate(existing, incoming);
  assert.equal(result.kind, "identical_duplicate");
}

function testSameDecisionIdDifferentContentConflicts(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = {
    ...existing,
    decidedBy: "different-policy",
  };

  const result = classifyDecisionStoreDuplicate(existing, incoming);
  assert.equal(result.kind, "conflicting_duplicate");
  if (result.kind === "conflicting_duplicate") {
    assert.equal(result.reason, "same_decision_id_different_content");
  }
}

function testSameCandidateRunSnapshotConflict(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const result = classifyDecisionStoreDuplicate(existing, incoming);
  assert.equal(result.kind, "conflicting_duplicate");
  if (result.kind === "conflicting_duplicate") {
    assert.equal(result.reason, "same_candidate_run_snapshot_conflict");
  }
}

function testSameCandidateRunDifferentContentConflicts(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    decisionReason: "manual_override_accept",
  });

  const result = classifyDecisionStoreDuplicate(existing, incoming);
  assert.equal(result.kind, "conflicting_duplicate");
  if (result.kind === "conflicting_duplicate") {
    assert.equal(result.reason, "same_candidate_run_different_content");
  }
}

function testSameCandidateDifferentRunIsNewRecord(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    decisionRunId: "decision-run-store-duplicate-next",
  });

  assert.deepEqual(classifyDecisionStoreDuplicate(existing, incoming), {
    kind: "new_record",
  });
}

function main(): void {
  testNullExistingIsNewRecord();
  testIdenticalDuplicate();
  testSameDecisionIdDifferentContentConflicts();
  testSameCandidateRunSnapshotConflict();
  testSameCandidateRunDifferentContentConflicts();
  testSameCandidateDifferentRunIsNewRecord();
  console.log(`${LABEL} PASS`);
}

main();
