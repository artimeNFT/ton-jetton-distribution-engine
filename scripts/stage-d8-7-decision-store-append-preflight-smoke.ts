import * as assert from "assert/strict";
import {
  buildDecisionStoreInMemoryIndex,
  preflightDecisionStoreAppend,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-7-decision-store-append-preflight-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-preflight-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-preflight",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-preflight-001",
      txHash: "tx-store-preflight-001",
      traceId: "trace-store-preflight-001",
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

function buildValidIndex(records: ReturnType<typeof buildCandidateDecisionRecord>[]) {
  const result = buildDecisionStoreInMemoryIndex(records);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected valid index");
  }
  return result.index;
}

function testNewRecordProceeds(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    candidate: {
      ...sampleInput().candidate,
      candidateId: "candidate-store-preflight-002",
    } as CandidateRecord,
  });

  const result = preflightDecisionStoreAppend(buildValidIndex([existing]), incoming);

  assert.deepEqual(result, {
    ok: true,
    action: "proceed",
    decisionId: incoming.decisionId,
  });
}

function testIdenticalDuplicateSkips(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord(sampleInput());

  const result = preflightDecisionStoreAppend(buildValidIndex([existing]), incoming);

  assert.deepEqual(result, {
    ok: true,
    action: "skip",
    decisionId: incoming.decisionId,
    reason: "identical_duplicate",
  });
}

function testConflictingDuplicateHardFails(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const result = preflightDecisionStoreAppend(buildValidIndex([existing]), incoming);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.action, "hard_fail");
    assert.equal(result.reason, "same_candidate_run_snapshot_conflict");
  }
}

function testInvalidRecordHardFails(): void {
  const incoming = {
    ...buildCandidateDecisionRecord(sampleInput()),
    candidateAgeMs: -1,
  };

  const result = preflightDecisionStoreAppend(buildValidIndex([]), incoming);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.action, "hard_fail");
    assert.equal(result.reason, "record_validation_failed");
  }
}

function main(): void {
  testNewRecordProceeds();
  testIdenticalDuplicateSkips();
  testConflictingDuplicateHardFails();
  testInvalidRecordHardFails();
  console.log(`${LABEL} PASS`);
}

main();
