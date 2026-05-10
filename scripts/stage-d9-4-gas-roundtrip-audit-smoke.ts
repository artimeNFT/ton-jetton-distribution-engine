import * as assert from "assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDecisionStoreAppendPlan,
  buildDecisionStoreInMemoryIndex,
  recoverDecisionStoreFromJsonl,
  validateDecisionStoreRecord,
} from "../lib/watcher/decisionStore";
import {
  appendApprovedDecisionStorePlan,
  recoverDecisionStoreFromFile,
} from "../lib/watcher/decisionStoreWriter";
import { buildCandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-d9-4-gas-roundtrip-audit-smoke]";

function sampleInput(candidateId: string): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId,
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-store-roundtrip",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: `event-store-roundtrip-${candidateId}`,
      txHash: `tx-store-roundtrip-${candidateId}`,
      traceId: `trace-store-roundtrip-${candidateId}`,
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

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-roundtrip-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

function buildApprovedPlan(path: string, record: ReturnType<typeof buildCandidateDecisionRecord>) {
  const indexResult = buildDecisionStoreInMemoryIndex([]);
  assert.equal(indexResult.ok, true);
  if (!indexResult.ok) throw new Error("expected valid index");

  const plan = buildDecisionStoreAppendPlan(path, indexResult.index, record);
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.action !== "proceed_append") {
    throw new Error("expected proceed_append plan");
  }

  return plan;
}


function removeGasSnapshot(
  record: ReturnType<typeof buildCandidateDecisionRecord>,
): ReturnType<typeof buildCandidateDecisionRecord> {
  const copy = { ...record } as unknown as Record<string, unknown>;
  delete copy["gasEstimateSnapshot"];
  return copy as unknown as ReturnType<typeof buildCandidateDecisionRecord>;
}

function assertMissingGasSnapshotIssue(
  issues: readonly { readonly reason: string }[] | undefined,
): void {
  assert.ok(
    Array.isArray(issues) &&
      issues.some((issue) => issue.reason === "invalid_gas_estimate_snapshot"),
    "expected invalid_gas_estimate_snapshot issue",
  );
}


async function testRoundtripPreservesGasEstimateSnapshotExactly(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    const record = buildCandidateDecisionRecord(sampleInput("candidate-gas-roundtrip-001"));

    await appendApprovedDecisionStorePlan(buildApprovedPlan(path, record));
    const recovered = await recoverDecisionStoreFromFile(path);

    assert.equal(recovered.ok, true);
    if (recovered.ok) {
      assert.equal(recovered.recoveredRecordCount, 1);
      assert.deepEqual(recovered.records[0]?.gasEstimateSnapshot, record.gasEstimateSnapshot);
    }
  });
}


function testValidateRejectsMissingGasEstimateSnapshot(): void {
  const record = buildCandidateDecisionRecord(sampleInput("candidate-gas-missing-validation"));
  const malformed = removeGasSnapshot(record);

  const validation = validateDecisionStoreRecord(malformed);

  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.reason, "record_validation_failed");
    assertMissingGasSnapshotIssue(validation.issues);
  }
}


function testAppendPlanRejectsMissingGasEstimateSnapshot(): void {
  const record = buildCandidateDecisionRecord(sampleInput("candidate-gas-missing-append"));
  const malformed = removeGasSnapshot(record);

  const indexResult = buildDecisionStoreInMemoryIndex([]);
  assert.equal(indexResult.ok, true);
  if (!indexResult.ok) throw new Error("expected valid empty index");

  const plan = buildDecisionStoreAppendPlan(
    "data/decision-store/decisions.jsonl",
    indexResult.index,
    malformed,
  );

  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.action, "hard_fail");
    assert.equal(plan.reason, "record_validation_failed");
  }
}


function testRecoveryRejectsMissingGasEstimateSnapshot(): void {
  const record = buildCandidateDecisionRecord(sampleInput("candidate-gas-missing-recovery"));
  const malformed = removeGasSnapshot(record);

  const recovered = recoverDecisionStoreFromJsonl(`${JSON.stringify(malformed)}\n`);

  assert.equal(recovered.ok, false);
  if (!recovered.ok) {
    assert.equal(recovered.reason, "record_validation_failed");
    assert.equal(recovered.lineNumber, 1);
  }
}

async function testRoundtripPreservesRecordsDeepEqual(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    const first = buildCandidateDecisionRecord(sampleInput("candidate-store-roundtrip-001"));
    const second = buildCandidateDecisionRecord(sampleInput("candidate-store-roundtrip-002"));

    await appendApprovedDecisionStorePlan(buildApprovedPlan(path, first));
    await appendApprovedDecisionStorePlan(buildApprovedPlan(path, second));

    const recovered = await recoverDecisionStoreFromFile(path);

    assert.equal(recovered.ok, true);
    if (recovered.ok) {
      assert.equal(recovered.recoveredRecordCount, 2);
      assert.deepEqual(recovered.records, [first, second]);
      assert.deepEqual(recovered.index.byDecisionId.get(first.decisionId), first);
      assert.deepEqual(recovered.index.byDecisionId.get(second.decisionId), second);
    }
  });
}

async function testCorruptJsonReportsPhysicalLineNumber(): Promise<void> {
  await withTempCwd(async () => {
    const path = "data/decision-store/decisions.jsonl";
    const first = buildCandidateDecisionRecord(sampleInput("candidate-store-roundtrip-003"));
    const second = buildCandidateDecisionRecord(sampleInput("candidate-store-roundtrip-004"));

    await appendApprovedDecisionStorePlan(buildApprovedPlan(path, first));
    await appendApprovedDecisionStorePlan(buildApprovedPlan(path, second));
    await appendApprovedDecisionStorePlan({
      ok: true,
      action: "proceed_append",
      normalizedPath: path,
      decisionId: "corrupt-manual-line",
      serializedLine: "\n{not-json}\n",
    });

    const recovered = await recoverDecisionStoreFromFile(path);

    assert.equal(recovered.ok, false);
    if (!recovered.ok) {
      assert.equal(recovered.reason, "parse_failed");
      assert.equal("lineNumber" in recovered, true);
      if ("lineNumber" in recovered) {
        assert.equal(recovered.lineNumber, 4);
      }
    }
  });
}

async function main(): Promise<void> {
  await testRoundtripPreservesRecordsDeepEqual();
  await testRoundtripPreservesGasEstimateSnapshotExactly();
  testValidateRejectsMissingGasEstimateSnapshot();
  testAppendPlanRejectsMissingGasEstimateSnapshot();
  testRecoveryRejectsMissingGasEstimateSnapshot();
  await testCorruptJsonReportsPhysicalLineNumber();
  console.log(`${LABEL} PASS`);
}

void main();
