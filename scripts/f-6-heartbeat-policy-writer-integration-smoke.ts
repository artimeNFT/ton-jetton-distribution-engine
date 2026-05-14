import * as assert from "assert/strict";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  planHeartbeatAppend,
} from "../lib/dispatcher/heartbeatAppendPolicy";
import {
  appendPassiveHeartbeatRecord,
  defaultPassiveHeartbeatPath,
} from "../lib/watcher/passiveHeartbeatWriter";
import type { PassiveHeartbeatRecord } from "../lib/watcher/passiveHeartbeat";

const LABEL = "[f-6-heartbeat-policy-writer-integration-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = "2026-01-01T00:01:00.000Z";
const LAST = "2026-01-01T00:00:00.000Z";
const PATH = defaultPassiveHeartbeatPath();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function makeHeartbeat(
  overrides: Partial<PassiveHeartbeatRecord> = {},
): PassiveHeartbeatRecord {
  return {
    schemaVersion: "passive-heartbeat-v1",
    heartbeatId: "heartbeat-f6-integration-001",
    heartbeatRunId: "heartbeat-run-f6-integration-001",
    campaignId: "campaign-f6-integration",
    emittedAt: NOW,
    source: "dispatcher",
    severity: "info",
    systemStatus: "alive",
    decisionStoreStatus: {
      status: "ok",
      path: "data/decision-store/decisions.jsonl",
      lastSuccessAt: NOW,
      lastFailureAt: null,
      reason: null,
    },
    heartbeatStoreStatus: {
      status: "ok",
      path: "data/heartbeat/heartbeats.jsonl",
      lastSuccessAt: NOW,
      lastFailureAt: null,
      reason: null,
    },
    lockStatus: {
      status: "owned",
      lockPath: "run_state.lock",
      ownerId: "dispatcher-f6-integration",
      lockId: "lock-f6-integration",
      acquiredAt: NOW,
      checkedAt: NOW,
      reason: null,
    },
    gasStatus: {
      status: "ok",
      lastGasObservedAt: NOW,
      gasEstimateSource: "fixture",
      feeDecision: "within_fee_allowance",
      reason: null,
    },
    blacklistStatus: {
      status: "ok",
      blacklistVersion: "v1",
      checksum: "checksum-f6-integration",
      checkedAt: NOW,
      reason: null,
    },
    rpcStatus: {
      status: "ok",
      provider: "fixture-provider",
      endpoint: "fixture-endpoint",
      observedLatencyMs: 1,
      checkedAt: NOW,
      reason: null,
    },
    operatorStatus: {
      status: "ok",
      activeOperatorCount: 1,
      pausedOperatorCount: 0,
      failedOperatorCount: 0,
      reason: null,
    },
    counters: {
      candidatesSeen: 1,
      decisionsWritten: 1,
      decisionsRejected: 0,
      duplicatesDetected: 0,
      recoveryAttempts: 0,
      heartbeatWriteFailures: 0,
    },
    lastKnownDecisionId: null,
    lastKnownCandidateId: null,
    lastKnownError: null,
    notes: null,
    ...overrides,
  } as unknown as PassiveHeartbeatRecord;
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const originalCwd = process.cwd();
  const tmpDir = await mkdtemp(join(tmpdir(), "f6-policy-writer-smoke-"));
  try {
    process.chdir(tmpDir);
    await run();
  } finally {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readLines(path: string): Promise<string[]> {
  const raw = await readFile(path, { encoding: "utf8" });
  return raw.split("\n").filter((l) => l.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Test 1: periodic append_allowed writes heartbeat
// ---------------------------------------------------------------------------

async function testPeriodicAllowedWrites(): Promise<void> {
  await withTempCwd(async () => {
    const policyInput = {
      trigger: "periodic" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    };

    const policy = planHeartbeatAppend(policyInput);
    assert.equal(policy.ok, true, `policy must allow, got: ${stringify(policy)}`);
    if (!policy.ok) return;
    assert.equal(policy.action, "append_allowed");

    const heartbeat = makeHeartbeat();
    const writeResult = await appendPassiveHeartbeatRecord(PATH, heartbeat);

    assert.equal(writeResult.ok, true, `writer must succeed, got: ${stringify(writeResult)}`);
    if (!writeResult.ok) return;
    assert.equal((writeResult as Record<string, unknown>)["path"] ?? PATH, PATH);

    const lines = await readLines(PATH);
    assert.equal(lines.length, 1, "must have exactly one JSONL line");

    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed["heartbeatId"], "heartbeat-f6-integration-001");
  });
}

// ---------------------------------------------------------------------------
// Test 2: forced boundary append_allowed writes despite throttle
// ---------------------------------------------------------------------------

async function testForcedBoundaryAllowedWrites(): Promise<void> {
  await withTempCwd(async () => {
    const policy = planHeartbeatAppend({
      trigger: "cross_store_divergence" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 999999999,
    });

    assert.equal(policy.ok, true, `policy must allow for forced boundary, got: ${stringify(policy)}`);
    if (!policy.ok) return;
    assert.equal(policy.action, "append_allowed");
    assert.equal((policy as Record<string, unknown>)["reason"], "forced_boundary_event");

    const heartbeat = makeHeartbeat({
      heartbeatId: "heartbeat-f6-integration-divergence",
    });
    const writeResult = await appendPassiveHeartbeatRecord(PATH, heartbeat);

    assert.equal(writeResult.ok, true, `writer must succeed, got: ${stringify(writeResult)}`);

    const lines = await readLines(PATH);
    assert.equal(lines.length, 1, "must have exactly one JSONL line");
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(parsed["heartbeatId"], "heartbeat-f6-integration-divergence");
  });
}

// ---------------------------------------------------------------------------
// Test 3: hot path append_skipped writes nothing
// ---------------------------------------------------------------------------

async function testHotPathSkippedWritesNothing(): Promise<void> {
  await withTempCwd(async () => {
    const policy = planHeartbeatAppend({
      trigger: "recipient_submitted" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    });

    assert.equal(policy.ok, true);
    if (!policy.ok) return;
    assert.equal(policy.action, "append_skipped");
    assert.equal((policy as Record<string, unknown>)["reason"], "skipped_hot_path_trigger");

    // Do NOT call writer — skipped policy means no write
    const exists = await fileExists(PATH);
    assert.equal(exists, false, "PATH must not exist after skipped hot-path policy");
  });
}

// ---------------------------------------------------------------------------
// Test 4: periodic throttled writes nothing
// ---------------------------------------------------------------------------

async function testPeriodicThrottledWritesNothing(): Promise<void> {
  await withTempCwd(async () => {
    const policy = planHeartbeatAppend({
      trigger: "periodic" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 120000,
    });

    assert.equal(policy.ok, true);
    if (!policy.ok) return;
    assert.equal(policy.action, "append_skipped");
    assert.equal((policy as Record<string, unknown>)["reason"], "skipped_throttled");

    const exists = await fileExists(PATH);
    assert.equal(exists, false, "PATH must not exist after throttled periodic policy");
  });
}

// ---------------------------------------------------------------------------
// Test 5: rejected policy writes nothing
// ---------------------------------------------------------------------------

async function testRejectedPolicyWritesNothing(): Promise<void> {
  await withTempCwd(async () => {
    const policy = planHeartbeatAppend({
      trigger: "periodic" as const,
      nowIso: "not-iso",
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    });

    assert.equal(policy.ok, false, "policy must reject for invalid nowIso");

    // Do NOT call writer — rejected policy means no write
    const exists = await fileExists(PATH);
    assert.equal(exists, false, "PATH must not exist after rejected policy");
  });
}

// ---------------------------------------------------------------------------
// Test 6: invalid heartbeat rejected by writer even if policy allows
// ---------------------------------------------------------------------------

async function testInvalidHeartbeatRejectedByWriter(): Promise<void> {
  await withTempCwd(async () => {
    const policy = planHeartbeatAppend({
      trigger: "batch_started" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    });

    assert.equal(policy.ok, true);
    if (!policy.ok) return;
    assert.equal(policy.action, "append_allowed");

    const invalidHeartbeat = makeHeartbeat({ heartbeatId: "" });
    const writeResult = await appendPassiveHeartbeatRecord(PATH, invalidHeartbeat);

    assert.equal(writeResult.ok, false, `writer must reject invalid heartbeat, got: ${stringify(writeResult)}`);
    if (writeResult.ok) return;
    assert.equal(
      (writeResult as Record<string, unknown>)["reason"],
      "record_validation_failed",
      `expected record_validation_failed, got ${String((writeResult as Record<string, unknown>)["reason"])}`,
    );

    const exists = await fileExists(PATH);
    assert.equal(exists, false, "PATH must not exist after invalid heartbeat rejection");
  });
}

// ---------------------------------------------------------------------------
// Test 7: multiple allowed appends remain JSONL
// ---------------------------------------------------------------------------

async function testMultipleAppendsRemainJsonl(): Promise<void> {
  await withTempCwd(async () => {
    // First: batch_started
    const policyA = planHeartbeatAppend({
      trigger: "batch_started" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    });
    assert.equal(policyA.ok, true);
    if (!policyA.ok) return;

    const heartbeatA = makeHeartbeat({
      heartbeatId: "heartbeat-f6-integration-A",
      heartbeatRunId: "run-A",
    });
    const writeA = await appendPassiveHeartbeatRecord(PATH, heartbeatA);
    assert.equal(writeA.ok, true, `writeA must succeed, got: ${stringify(writeA)}`);

    // Second: batch_completed
    const policyB = planHeartbeatAppend({
      trigger: "batch_completed" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    });
    assert.equal(policyB.ok, true);
    if (!policyB.ok) return;

    const heartbeatB = makeHeartbeat({
      heartbeatId: "heartbeat-f6-integration-B",
      heartbeatRunId: "run-B",
    });
    const writeB = await appendPassiveHeartbeatRecord(PATH, heartbeatB);
    assert.equal(writeB.ok, true, `writeB must succeed, got: ${stringify(writeB)}`);

    const lines = await readLines(PATH);
    assert.equal(lines.length, 2, "must have exactly two JSONL lines");

    const parsedA = JSON.parse(lines[0]) as Record<string, unknown>;
    const parsedB = JSON.parse(lines[1]) as Record<string, unknown>;

    assert.equal(parsedA["heartbeatId"], "heartbeat-f6-integration-A", "first line must be A");
    assert.equal(parsedB["heartbeatId"], "heartbeat-f6-integration-B", "second line must be B");
  });
}

// ---------------------------------------------------------------------------
// Test 8: does not mutate policy input or heartbeat
// ---------------------------------------------------------------------------

async function testDoesNotMutateInputs(): Promise<void> {
  await withTempCwd(async () => {
    const policyInput = {
      trigger: "periodic" as const,
      nowIso: NOW,
      lastHeartbeatAt: LAST,
      minIntervalMs: 60000,
    };
    const heartbeat = makeHeartbeat();

    const policyBefore = stringify(policyInput);
    const heartbeatBefore = stringify(heartbeat);

    const policy = planHeartbeatAppend(policyInput);
    assert.equal(policy.ok, true);
    if (!policy.ok) return;

    await appendPassiveHeartbeatRecord(PATH, heartbeat);

    assert.equal(stringify(policyInput), policyBefore, "policyInput must not be mutated");
    assert.equal(stringify(heartbeat), heartbeatBefore, "heartbeat must not be mutated");
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await testPeriodicAllowedWrites();
  await testForcedBoundaryAllowedWrites();
  await testHotPathSkippedWritesNothing();
  await testPeriodicThrottledWritesNothing();
  await testRejectedPolicyWritesNothing();
  await testInvalidHeartbeatRejectedByWriter();
  await testMultipleAppendsRemainJsonl();
  await testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

void main();
