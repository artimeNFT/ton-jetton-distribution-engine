import * as assert from "assert/strict";
import {
  parseDecisionRecordJsonlLine,
  serializeDecisionRecordToJsonl,
} from "../lib/watcher/decisionStore";
import { buildCandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-1-decision-store-serialization-smoke]";

function sampleInput(): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: "candidate-store-serialization-001",
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-serialization",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: "event-store-serialization-001",
      txHash: "tx-store-serialization-001",
      traceId: "trace-store-serialization-001",
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

function testSerializeProducesJsonlLine(): void {
  const record = buildCandidateDecisionRecord(sampleInput());
  const result = serializeDecisionRecordToJsonl(record);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.line.endsWith("\n"));
    assert.equal(result.line.trimEnd(), JSON.stringify(record));
  }
}

function testParseRoundtripPreservesDecisionId(): void {
  const record = buildCandidateDecisionRecord(sampleInput());
  const serialized = serializeDecisionRecordToJsonl(record);

  assert.equal(serialized.ok, true);
  if (!serialized.ok) return;

  const parsed = parseDecisionRecordJsonlLine(serialized.line.trimEnd());
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.record.decisionId, record.decisionId);
  }
}

function testParseRejectsNewline(): void {
  const parsed = parseDecisionRecordJsonlLine("{}\n{}");
  assert.equal(parsed.ok, false);
}

function testParseRejectsNonObject(): void {
  const parsed = parseDecisionRecordJsonlLine("123");
  assert.equal(parsed.ok, false);
}

function testParseRejectsMissingRequiredFields(): void {
  const parsed = parseDecisionRecordJsonlLine("{}");
  assert.equal(parsed.ok, false);
}

function main(): void {
  testSerializeProducesJsonlLine();
  testParseRoundtripPreservesDecisionId();
  testParseRejectsNewline();
  testParseRejectsNonObject();
  testParseRejectsMissingRequiredFields();
  console.log(`${LABEL} PASS`);
}

main();
