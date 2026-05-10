import * as assert from "assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { PassiveHeartbeatRecord } from "../lib/watcher/passiveHeartbeat";
import {
  appendPassiveHeartbeatRecord,
  defaultPassiveHeartbeatPath,
  preflightPassiveHeartbeatPath,
  serializePassiveHeartbeatRecord,
} from "../lib/watcher/passiveHeartbeatWriter";

const LABEL = "[stage-d9-6-passive-heartbeat-writer-shell-smoke]";

function sampleHeartbeat(): PassiveHeartbeatRecord {
  return {
    schemaVersion: "passive-heartbeat-v1",
    heartbeatId: "heartbeat-writer-001",
    heartbeatRunId: "heartbeat-run-writer-001",
    campaignId: "campaign-001",
    emittedAt: "2026-01-01T00:00:00.000Z",
    source: "manual_smoke",
    severity: "info",
    systemStatus: "alive",
    decisionStoreStatus: {
      status: "blocked",
      path: "data/decision-store/decisions.jsonl",
      lastSuccessAt: null,
      lastFailureAt: "2026-01-01T00:00:00.000Z",
      reason: "decision_store_locked",
    },
    heartbeatStoreStatus: {
      status: "ok",
      path: "data/heartbeat/heartbeats.jsonl",
      lastSuccessAt: "2026-01-01T00:00:00.000Z",
      lastFailureAt: null,
      reason: null,
    },
    lockStatus: {
      status: "owned",
      lockPath: "data/decision-store/decisions.lock",
      ownerId: "run-001",
      lockId: "lock-001",
      acquiredAt: "2026-01-01T00:00:00.000Z",
      checkedAt: "2026-01-01T00:00:00.000Z",
      reason: null,
    },
    gasStatus: {
      status: "ok",
      lastGasObservedAt: "2026-01-01T00:00:00.000Z",
      gasEstimateSource: "offline_fixed",
      feeDecision: "within_fee_allowance",
      reason: null,
    },
    blacklistStatus: {
      status: "ok",
      blacklistVersion: "blacklist-v1",
      checksum: "sha256:abc123",
      checkedAt: "2026-01-01T00:00:00.000Z",
      reason: null,
    },
    rpcStatus: {
      status: "ok",
      provider: "manual-smoke",
      endpoint: null,
      observedLatencyMs: 10,
      checkedAt: "2026-01-01T00:00:00.000Z",
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
      candidatesSeen: 10,
      decisionsWritten: 7,
      decisionsRejected: 2,
      duplicatesDetected: 1,
      recoveryAttempts: 0,
      heartbeatWriteFailures: 0,
    },
    lastKnownDecisionId: "decision-001",
    lastKnownCandidateId: "candidate-001",
    lastKnownError: null,
    notes: null,
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "heartbeat-writer-shell-"));
  const previousCwd = process.cwd();
  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
  }
}

function testDefaultPathIsIsolatedHeartbeatPath(): void {
  assert.equal(defaultPassiveHeartbeatPath(), "data/heartbeat/heartbeats.jsonl");
}

function testRejectsDecisionStorePath(): void {
  const result = preflightPassiveHeartbeatPath("data/decision-store/decisions.jsonl");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "path_outside_heartbeat_dir");
  }
}

function testSerializesValidHeartbeat(): void {
  const result = serializePassiveHeartbeatRecord(sampleHeartbeat());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(JSON.parse(result.line).heartbeatId, "heartbeat-writer-001");
  }
}

async function testAppendWritesJsonlToHeartbeatPathOnly(): Promise<void> {
  await withTempCwd(async () => {
    const path = defaultPassiveHeartbeatPath();
    const result = await appendPassiveHeartbeatRecord(path, sampleHeartbeat());

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected append success");

    const content = await readFile(path, "utf8");
    const lines = content.trim().split("\n");

    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).heartbeatId, "heartbeat-writer-001");
  });
}

async function testAppendRejectsInvalidHeartbeat(): Promise<void> {
  await withTempCwd(async () => {
    const invalid = { ...sampleHeartbeat(), heartbeatId: "" };
    const result = await appendPassiveHeartbeatRecord(
      defaultPassiveHeartbeatPath(),
      invalid as PassiveHeartbeatRecord,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "record_validation_failed");
    }
  });
}

async function main(): Promise<void> {
  testDefaultPathIsIsolatedHeartbeatPath();
  testRejectsDecisionStorePath();
  testSerializesValidHeartbeat();
  await testAppendWritesJsonlToHeartbeatPathOnly();
  await testAppendRejectsInvalidHeartbeat();

  console.log(`${LABEL} PASS`);
}

void main();
