import * as assert from "assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recoverDecisionStoreFromJsonl,
  serializeDecisionRecordToJsonl,
} from "../lib/watcher/decisionStore";
import {
  acquireDecisionStoreLockFileShell,
  readDecisionStoreLockFile,
  releaseDecisionStoreLockFileShell,
  writeDecisionStoreLockFile,
} from "../lib/watcher/decisionStoreLockFile";
import { buildCandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { BuildCandidateDecisionRecordInput } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";
import type { DecisionStoreLockRecord } from "../lib/watcher/decisionStoreLock";

const LABEL = "[stage-d8-18-decision-store-lock-fault-injection-smoke]";
const LOCK_PATH = "data/decision-store/decisions.lock.json";

function sampleDecisionInput(candidateId: string): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId,
      detectedAt: "2026-01-01T00:00:00.000Z",
      finality: "confirmed",
    } as CandidateRecord,
    decisionRunId: "decision-run-fault-injection",
    builderRunId: null,
    decision: "accepted",
    decisionReason: "policy_accept",
    decisionAt: "2026-01-01T00:01:00.000Z",
    candidateAgeMs: 60_000,
    decidedBy: "offline-policy",
    manualOverride: false,
    schemaVersion: "candidate-decision-v1",
    traceability: {
      eventId: `event-fault-${candidateId}`,
      txHash: `tx-fault-${candidateId}`,
      traceId: `trace-fault-${candidateId}`,
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

function serializeDecision(record: ReturnType<typeof buildCandidateDecisionRecord>): string {
  const result = serializeDecisionRecordToJsonl(record);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected serialization success");
  }
  return result.line;
}

function sampleLock(overrides: Partial<DecisionStoreLockRecord> = {}): DecisionStoreLockRecord {
  return {
    lockId: "lock-fault-001",
    ownerId: "owner-a",
    acquiredAtMs: 1_000,
    expiresAtMs: 2_000,
    ...overrides,
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-fault-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

function testPartialDecisionJsonlLineFailsWithExactLineNumber(): void {
  const first = buildCandidateDecisionRecord(sampleDecisionInput("candidate-fault-001"));
  const second = buildCandidateDecisionRecord(sampleDecisionInput("candidate-fault-002"));

  const content =
    serializeDecision(first) +
    serializeDecision(second) +
    '{"decisionId":"partial","candidateId":';

  const result = recoverDecisionStoreFromJsonl(content);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "parse_failed");
    assert.equal(result.lineNumber, 3);
  }
}

function testConflictingDecisionRecordsFailClosed(): void {
  const existing = buildCandidateDecisionRecord(sampleDecisionInput("candidate-fault-conflict"));
  const incoming = buildCandidateDecisionRecord({
    ...sampleDecisionInput("candidate-fault-conflict"),
    rulesetSnapshot: {
      ...sampleDecisionInput("candidate-fault-conflict").rulesetSnapshot,
      rulesetVersion: "ruleset-v2",
    },
  });

  const result = recoverDecisionStoreFromJsonl(serializeDecision(existing) + serializeDecision(incoming));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "same_candidate_run_snapshot_conflict");
    assert.equal(result.lineNumber, 2);
  }
}

async function testOwnerIdHijackWithSameLockIdFailsClosed(): Promise<void> {
  await withTempCwd(async () => {
    const originalLock = sampleLock({
      lockId: "same-lock-id",
      ownerId: "owner-a",
    });
    const hijackedLock = sampleLock({
      lockId: "same-lock-id",
      ownerId: "owner-b",
    });

    await writeDecisionStoreLockFile(LOCK_PATH, originalLock);
    await writeDecisionStoreLockFile(LOCK_PATH, hijackedLock);

    const result = await releaseDecisionStoreLockFileShell(LOCK_PATH, "owner-a");

    assert.deepEqual(result, {
      ok: false,
      action: "release_owner_mismatch",
      normalizedPath: LOCK_PATH,
      existingLock: hijackedLock,
      requestedOwnerId: "owner-a",
    });
  });
}

async function testLockIdHijackIsObservableByReadback(): Promise<void> {
  await withTempCwd(async () => {
    const originalLock = sampleLock({
      lockId: "original-lock-id",
      ownerId: "owner-a",
    });
    const hijackedLock = sampleLock({
      lockId: "hijacked-lock-id",
      ownerId: "owner-a",
    });

    await writeDecisionStoreLockFile(LOCK_PATH, originalLock);
    await writeDecisionStoreLockFile(LOCK_PATH, hijackedLock);

    const readBack = await readDecisionStoreLockFile(LOCK_PATH);

    assert.deepEqual(readBack, {
      ok: true,
      normalizedPath: LOCK_PATH,
      lock: hijackedLock,
    });
  });
}

async function testCorruptLockFileFailsClosedOnRead(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, "{not-json}", "utf8");

    const result = await readDecisionStoreLockFile(LOCK_PATH);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "lock_parse_failed");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function testStaleLockTakeoverPreventsOriginalOwnerRelease(): Promise<void> {
  await withTempCwd(async () => {
    const staleLock = sampleLock({
      lockId: "stale-lock",
      ownerId: "owner-a",
      acquiredAtMs: 1_000,
      expiresAtMs: 2_000,
    });
    const takeoverLock = sampleLock({
      lockId: "takeover-lock",
      ownerId: "owner-b",
      acquiredAtMs: 2_100,
      expiresAtMs: 3_100,
    });

    await writeDecisionStoreLockFile(LOCK_PATH, staleLock);

    await writeDecisionStoreLockFile(LOCK_PATH, takeoverLock);

    const result = await releaseDecisionStoreLockFileShell(LOCK_PATH, "owner-a");

    assert.deepEqual(result, {
      ok: false,
      action: "release_owner_mismatch",
      normalizedPath: LOCK_PATH,
      existingLock: takeoverLock,
      requestedOwnerId: "owner-a",
    });
  });
}

async function testCorruptLockFileFailsClosedOnAcquire(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(LOCK_PATH, "{not-json}", "utf8");

    const result = await acquireDecisionStoreLockFileShell(
      LOCK_PATH,
      sampleLock({ lockId: "new-lock", ownerId: "owner-b" }),
      1_500,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.action, "acquire_failed");
      assert.equal(result.reason, "lock_parse_failed");
      assert.equal(result.normalizedPath, LOCK_PATH);
    }
  });
}

async function main(): Promise<void> {
  testPartialDecisionJsonlLineFailsWithExactLineNumber();
  testConflictingDecisionRecordsFailClosed();
  await testOwnerIdHijackWithSameLockIdFailsClosed();
  await testLockIdHijackIsObservableByReadback();
  await testCorruptLockFileFailsClosedOnRead();
  await testCorruptLockFileFailsClosedOnAcquire();
  await testStaleLockTakeoverPreventsOriginalOwnerRelease();
  console.log(`${LABEL} PASS`);
}

void main();
