import * as assert from "assert/strict";
import {
  buildCandidateDecisionRecord,
  buildDecisionId,
  type BuildCandidateDecisionRecordInput,
} from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d4-2-candidate-decision-record-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-001",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-001",
      txHash: "tx-001",
      traceId: "trace-001",
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

function testBuildsAuditCompleteRecord(): void {
  const input = sampleInput();
  const record = buildCandidateDecisionRecord(input);

  assert.equal(record.candidateId, input.candidate.candidateId);
  assert.equal(record.decisionRunId, input.decisionRunId);
  assert.equal(record.builderRunId, null);
  assert.equal(record.candidateObservedAt, input.candidate.detectedAt);
  assert.equal(record.traceability.txHash, "tx-001");
  assert.equal(record.budgetSnapshot.budgetDecision, "within_budget");
  assert.equal(record.finalitySnapshot.confirmationDepthUsed, 5);
  assert.equal(record.gasEstimateSnapshot.feeDecision, "within_fee_allowance");
}

function testDecisionIdUsesSnapshotVersions(): void {
  const input = sampleInput();
  const record = buildCandidateDecisionRecord(input);

  const expected = buildDecisionId({
    candidateId: "candidate-001",
    decisionRunId: "decision-run-001",
    decisionReason: "policy_accept",
    rulesetVersion: "ruleset-v1",
    blacklistVersion: "blacklist-v1",
    budgetPolicyVersion: "budget-v1",
  });

  assert.equal(record.decisionId, expected);
}


function testGasSnapshotDoesNotAffectDecisionIdInD93(): void {
  const first = sampleInput();
  const second: BuildCandidateDecisionRecordInput = {
    ...sampleInput(),
    gasEstimateSnapshot: {
      ...sampleInput().gasEstimateSnapshot,
      feeAllowanceNanoTon: "999",
    },
  };

  assert.equal(
    buildCandidateDecisionRecord(first).decisionId,
    buildCandidateDecisionRecord(second).decisionId,
  );
}

function main(): void {
  testBuildsAuditCompleteRecord();
  testDecisionIdUsesSnapshotVersions();
  testGasSnapshotDoesNotAffectDecisionIdInD93();
  console.log(`${LABEL} PASS`);
}

main();
