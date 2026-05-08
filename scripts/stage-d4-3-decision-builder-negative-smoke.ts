import * as assert from "assert/strict";
import {
  buildCandidateDecisionRecord,
  type BuildCandidateDecisionRecordInput,
} from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d4-3-decision-builder-negative-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-immutability-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-immutability",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-immutability-001",
      txHash: "tx-immutability-001",
      traceId: "trace-immutability-001",
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

function testBuilderDoesNotMutateCandidate(): void {
  const input = sampleInput();
  const before = JSON.stringify(input.candidate);

  buildCandidateDecisionRecord(input);

  assert.equal(
    JSON.stringify(input.candidate),
    before,
    "builder must not mutate CandidateRecord",
  );
}

function testBuilderRunIdRemainsNullable(): void {
  const record = buildCandidateDecisionRecord(sampleInput());
  assert.equal(record.builderRunId, null);
}

function testBudgetPolicyVersionAffectsDecisionId(): void {
  const first = sampleInput();
  const second: BuildCandidateDecisionRecordInput = {
    ...sampleInput(),
    budgetSnapshot: {
      ...sampleInput().budgetSnapshot,
      budgetPolicyVersion: "budget-v2",
    },
  };

  assert.notEqual(
    buildCandidateDecisionRecord(first).decisionId,
    buildCandidateDecisionRecord(second).decisionId,
  );
}

function testRulesetVersionAffectsDecisionId(): void {
  const first = sampleInput();
  const second: BuildCandidateDecisionRecordInput = {
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  };

  assert.notEqual(
    buildCandidateDecisionRecord(first).decisionId,
    buildCandidateDecisionRecord(second).decisionId,
  );
}

function testBlacklistVersionAffectsDecisionId(): void {
  const first = sampleInput();
  const second: BuildCandidateDecisionRecordInput = {
    ...sampleInput(),
    blacklistSnapshot: {
      ...sampleInput().blacklistSnapshot,
      blacklistVersion: "blacklist-v2",
    },
  };

  assert.notEqual(
    buildCandidateDecisionRecord(first).decisionId,
    buildCandidateDecisionRecord(second).decisionId,
  );
}

function main(): void {
  testBuilderDoesNotMutateCandidate();
  testBuilderRunIdRemainsNullable();
  testBudgetPolicyVersionAffectsDecisionId();
  testRulesetVersionAffectsDecisionId();
  testBlacklistVersionAffectsDecisionId();
  console.log(`${LABEL} PASS`);
}

main();
