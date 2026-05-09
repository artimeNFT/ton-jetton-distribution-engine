import * as assert from "assert/strict";
import {
  buildDecisionStoreInMemoryIndex,
} from "../lib/watcher/decisionStore";
import {
  buildCandidateDecisionRecord,
} from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-4-decision-store-in-memory-index-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-index-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-index",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-index-001",
      txHash: "tx-store-index-001",
      traceId: "trace-store-index-001",
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

function testBuildsIndexForValidRecords(): void {
  const first = buildCandidateDecisionRecord(sampleInput());
  const second = buildCandidateDecisionRecord({
    ...sampleInput(),
    candidate: {
      ...sampleInput().candidate,
      candidateId: "candidate-store-index-002",
    } as CandidateRecord,
  });

  const result = buildDecisionStoreInMemoryIndex([first, second]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.index.validRecordCount, 2);
    assert.equal(result.index.identicalDuplicateCount, 0);
    assert.equal(result.index.byDecisionId.has(first.decisionId), true);
    assert.equal(result.index.byDecisionId.has(second.decisionId), true);
  }
}

function testIdenticalDuplicateIsCounted(): void {
  const record = buildCandidateDecisionRecord(sampleInput());

  const result = buildDecisionStoreInMemoryIndex([record, record]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.index.validRecordCount, 1);
    assert.equal(result.index.identicalDuplicateCount, 1);
  }
}

function testSnapshotConflictFailsClosed(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    rulesetSnapshot: {
      ...sampleInput().rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const result = buildDecisionStoreInMemoryIndex([existing, incoming]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "same_candidate_run_snapshot_conflict");
  }
}

function testSameCandidateRunDifferentContentFailsClosed(): void {
  const existing = buildCandidateDecisionRecord(sampleInput());
  const incoming = buildCandidateDecisionRecord({
    ...sampleInput(),
    decisionReason: "manual_override_accept",
  });

  const result = buildDecisionStoreInMemoryIndex([existing, incoming]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "same_candidate_run_different_content");
  }
}

function testInvalidRecordFailsClosed(): void {
  const invalid = {
    ...buildCandidateDecisionRecord(sampleInput()),
    candidateAgeMs: -1,
  };

  const result = buildDecisionStoreInMemoryIndex([invalid]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "record_validation_failed");
  }
}

function main(): void {
  testBuildsIndexForValidRecords();
  testIdenticalDuplicateIsCounted();
  testSnapshotConflictFailsClosed();
  testSameCandidateRunDifferentContentFailsClosed();
  testInvalidRecordFailsClosed();
  console.log(`${LABEL} PASS`);
}

main();
