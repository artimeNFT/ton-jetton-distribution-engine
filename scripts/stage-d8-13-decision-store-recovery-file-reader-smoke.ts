import * as assert from "assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recoverDecisionStoreFromFile } from "../lib/watcher/decisionStoreWriter";
import { serializeDecisionRecordToJsonl } from "../lib/watcher/decisionStore";
import { buildCandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d8-13-decision-store-recovery-file-reader-smoke]";

function sampleInput(candidateId = "candidate-store-reader-001"): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId,
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-reader",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: `event-store-reader-${candidateId}`,
      txHash: `tx-store-reader-${candidateId}`,
      traceId: `trace-store-reader-${candidateId}`,
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

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-reader-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

async function testRecoversValidFile(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    await mkdir("data/decision-store", { recursive: true });

    const first = buildCandidateDecisionRecord(sampleInput("candidate-store-reader-001"));
    const second = buildCandidateDecisionRecord(sampleInput("candidate-store-reader-002"));
    await writeFile(path, serialize(first) + serialize(second), "utf8");

    const result = await recoverDecisionStoreFromFile(path);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.recoveredRecordCount, 2);
      assert.equal(result.index.validRecordCount, 2);
    }
  });
}

async function testInvalidPathFailsBeforeRead(): Promise<void> {
  const result = await recoverDecisionStoreFromFile("../decisions.jsonl");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "path_outside_decision_store_dir");
  }
}

async function testInvalidJsonFileFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(path, "{not-json}", "utf8");

    const result = await recoverDecisionStoreFromFile(path);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "parse_failed");
      assert.equal("lineNumber" in result, true);
      if ("lineNumber" in result) {
        assert.equal(result.lineNumber, 1);
      }
    }
  });
}

async function testMissingFileFailsTyped(): Promise<void> {
  await withTempCwd(async () => {
    const result = await recoverDecisionStoreFromFile("data/decision-store/missing.jsonl");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "file_read_failed");
      assert.equal("normalizedPath" in result, true);
    }
  });
}

async function main(): Promise<void> {
  await testRecoversValidFile();
  await testInvalidPathFailsBeforeRead();
  await testInvalidJsonFileFailsClosed();
  await testMissingFileFailsTyped();
  console.log(`${LABEL} PASS`);
}

void main();
