import * as assert from "assert/strict";
import {
  recoverDecisionStoreFromJsonl,
  serializeDecisionRecordToJsonl,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-12-decision-store-recovery-parser-smoke]";

function sampleInput(candidateId = "candidate-store-recovery-001"): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId,
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-recovery",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: `event-store-recovery-${candidateId}`,
      txHash: `tx-store-recovery-${candidateId}`,
      traceId: `trace-store-recovery-${candidateId}`,
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

function serialize(record: ReturnType<typeof buildCandidateDecisionRecord>): string {
  const result = serializeDecisionRecordToJsonl(record);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected serialization success");
  }
  return result.line;
}

function testRecoversValidJsonl(): void {
  const first = buildCandidateDecisionRecord(sampleInput("candidate-store-recovery-001"));
  const second = buildCandidateDecisionRecord(sampleInput("candidate-store-recovery-002"));

  const result = recoverDecisionStoreFromJsonl(serialize(first) + serialize(second));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.recoveredRecordCount, 2);
    assert.equal(result.index.validRecordCount, 2);
    assert.equal(result.index.byDecisionId.has(first.decisionId), true);
    assert.equal(result.index.byDecisionId.has(second.decisionId), true);
  }
}

function testSkipsBlankLines(): void {
  const record = buildCandidateDecisionRecord(sampleInput());
  const result = recoverDecisionStoreFromJsonl(`\n${serialize(record)}\n\n`);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.recoveredRecordCount, 1);
    assert.equal(result.index.validRecordCount, 1);
  }
}

function testInvalidJsonFailsWithLineNumber(): void {
  const result = recoverDecisionStoreFromJsonl("{not-json}");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "parse_failed");
    assert.equal(result.lineNumber, 1);
  }
}

function testConflictFailsClosed(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const result = recoverDecisionStoreFromJsonl(serialize(existing) + serialize(incoming));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "same_candidate_run_snapshot_conflict");
    assert.equal(result.lineNumber, 2);
  }
}

function main(): void {
  testRecoversValidJsonl();
  testSkipsBlankLines();
  testInvalidJsonFailsWithLineNumber();
  testConflictFailsClosed();
  console.log(`${LABEL} PASS`);
}

main();
