import * as assert from "assert/strict";
import {
  validateDecisionStoreRecord,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
  buildDecisionId,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-2-decision-store-record-validation-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-validation-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-validation",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-validation-001",
      txHash: "tx-store-validation-001",
      traceId: "trace-store-validation-001",
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

function testValidRecordPasses(): void {
  const record = buildCandidateDecisionRecord(sampleInput());
  assert.deepEqual(validateDecisionStoreRecord(record), { ok: true });
}

function testInvalidRecordFailsValidation(): void {
  const record = {
    ...buildCandidateDecisionRecord(sampleInput()),
    candidateAgeMs: -1,
  };

  const result = validateDecisionStoreRecord(record);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "record_validation_failed");
  }
}

function testDecisionIdMismatchFailsClosed(): void {
  const base = buildCandidateDecisionRecord(sampleInput());
  const record = {
    ...base,
    decisionId: buildDecisionId({
      candidateId: base.candidateId,
      decisionRunId: "wrong-run",
      decisionReason: base.decisionReason,
      rulesetVersion: base.rulesetSnapshot.rulesetVersion,
      blacklistVersion: base.blacklistSnapshot.blacklistVersion,
      budgetPolicyVersion: base.budgetSnapshot.budgetPolicyVersion,
    }),
  };

  const result = validateDecisionStoreRecord(record);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "decision_id_mismatch");
  }
}

function main(): void {
  testValidRecordPasses();
  testInvalidRecordFailsValidation();
  testDecisionIdMismatchFailsClosed();
  console.log(`${LABEL} PASS`);
}

main();
