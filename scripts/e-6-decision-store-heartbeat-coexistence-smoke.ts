import * as assert from "assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { PassiveHeartbeatRecord } from "../lib/watcher/passiveHeartbeat";
import {
  appendPassiveHeartbeatRecord,
  defaultPassiveHeartbeatPath,
  preflightPassiveHeartbeatPath,
} from "../lib/watcher/passiveHeartbeatWriter";
import { recoverDecisionStoreFromFile } from "../lib/watcher/decisionStoreWriter";

const LABEL = "[e-6-decision-store-heartbeat-coexistence-smoke]";
const DECISION_STORE_PATH = "data/decision-store/decisions.jsonl";
const HEARTBEAT_PATH = "data/heartbeat/heartbeats.jsonl";

function heartbeat(overrides: Partial<PassiveHeartbeatRecord> = {}): PassiveHeartbeatRecord {
  return {
    schemaVersion: "passive-heartbeat-v1",
    heartbeatId: "heartbeat-e6-001",
    heartbeatRunId: "heartbeat-run-e6-001",
    campaignId: "campaign-e6-001",
    emittedAt: "2026-01-01T00:00:00.000Z",
    source: "manual_smoke",
    severity: "info",
    systemStatus: "degraded",
    decisionStoreStatus: {
      status: "blocked",
      path: DECISION_STORE_PATH,
      lastSuccessAt: null,
      lastFailureAt: "2026-01-01T00:00:00.000Z",
      reason: "decision_store_unavailable",
    },
    heartbeatStoreStatus: {
      status: "ok",
      path: HEARTBEAT_PATH,
      lastSuccessAt: "2026-01-01T00:00:00.000Z",
      lastFailureAt: null,
      reason: null,
    },
    lockStatus: {
      status: "blocked",
      lockPath: "data/decision-store/decisions.lock.json",
      ownerId: null,
      lockId: null,
      acquiredAt: null,
      checkedAt: "2026-01-01T00:00:00.000Z",
      reason: "decision_store_lock_unavailable",
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
      checksum: "sha256:e6",
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
      candidatesSeen: 1,
      decisionsWritten: 0,
      decisionsRejected: 1,
      duplicatesDetected: 0,
      recoveryAttempts: 1,
      heartbeatWriteFailures: 0,
    },
    lastKnownDecisionId: null,
    lastKnownCandidateId: "candidate-e6-001",
    lastKnownError: null,
    notes: "E-6 coexistence smoke: heartbeat remains isolated from DecisionStore failure.",
    ...overrides,
  };
}

async function withTempCwd(run: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "decision-store-heartbeat-e6-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(previousCwd);
    await rm(dir, { recursive: true, force: true });
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

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function testHeartbeatDefaultPathIsSeparateFromDecisionStore(): void {
  assert.equal(defaultPassiveHeartbeatPath(), HEARTBEAT_PATH);
  assert.notEqual(defaultPassiveHeartbeatPath(), DECISION_STORE_PATH);
}

function testHeartbeatWriterRejectsDecisionStorePath(): void {
  const result = preflightPassiveHeartbeatPath(DECISION_STORE_PATH);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "path_outside_heartbeat_dir");
  }
}

async function testHeartbeatWritesWhenDecisionStoreRecoveryFails(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    await writeFile(DECISION_STORE_PATH, "{not-json}\n", "utf8");

    const recovery = await recoverDecisionStoreFromFile(DECISION_STORE_PATH);
    assert.equal(recovery.ok, false);
    if (!recovery.ok) {
      assert.equal(recovery.reason, "parse_failed");
    }

    const heartbeatResult = await appendPassiveHeartbeatRecord(HEARTBEAT_PATH, heartbeat());
    assert.deepEqual(heartbeatResult, { ok: true, path: HEARTBEAT_PATH });

    const heartbeatContent = await readFile(HEARTBEAT_PATH, "utf8");
    const heartbeatRecord = JSON.parse(heartbeatContent.trim()) as PassiveHeartbeatRecord;
    assert.equal(heartbeatRecord.heartbeatId, "heartbeat-e6-001");
    assert.equal(heartbeatRecord.decisionStoreStatus.status, "blocked");
    assert.equal(heartbeatRecord.heartbeatStoreStatus.status, "ok");

    assert.equal(await readFile(DECISION_STORE_PATH, "utf8"), "{not-json}\n");
  });
}

async function testHeartbeatPathFailureDoesNotMutateDecisionStore(): Promise<void> {
  await withTempCwd(async () => {
    await mkdir("data/decision-store", { recursive: true });
    const decisionStoreBefore = "{not-json}\n";
    await writeFile(DECISION_STORE_PATH, decisionStoreBefore, "utf8");

    const result = await appendPassiveHeartbeatRecord(
      DECISION_STORE_PATH,
      heartbeat({ heartbeatId: "heartbeat-e6-invalid-path" }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "path_outside_heartbeat_dir");
    }

    assert.equal(await readFile(DECISION_STORE_PATH, "utf8"), decisionStoreBefore);
    assert.equal(await fileExists(HEARTBEAT_PATH), false);
  });
}

async function testHeartbeatAppendDoesNotCreateDecisionStore(): Promise<void> {
  await withTempCwd(async () => {
    const result = await appendPassiveHeartbeatRecord(
      HEARTBEAT_PATH,
      heartbeat({ heartbeatId: "heartbeat-e6-no-decision-store" }),
    );

    assert.deepEqual(result, { ok: true, path: HEARTBEAT_PATH });
    assert.equal(await fileExists(HEARTBEAT_PATH), true);
    assert.equal(await fileExists(DECISION_STORE_PATH), false);
  });
}

async function testMultipleHeartbeatsRemainJsonlAndIsolated(): Promise<void> {
  await withTempCwd(async () => {
    await appendPassiveHeartbeatRecord(HEARTBEAT_PATH, heartbeat({ heartbeatId: "heartbeat-e6-a" }));
    await appendPassiveHeartbeatRecord(HEARTBEAT_PATH, heartbeat({ heartbeatId: "heartbeat-e6-b" }));

    const content = await readFile(HEARTBEAT_PATH, "utf8");
    const lines = content.trim().split("\n");

    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).heartbeatId, "heartbeat-e6-a");
    assert.equal(JSON.parse(lines[1]!).heartbeatId, "heartbeat-e6-b");
    assert.equal(await readIfExists(DECISION_STORE_PATH), null);
  });
}

async function main(): Promise<void> {
  testHeartbeatDefaultPathIsSeparateFromDecisionStore();
  testHeartbeatWriterRejectsDecisionStorePath();
  await testHeartbeatWritesWhenDecisionStoreRecoveryFails();
  await testHeartbeatPathFailureDoesNotMutateDecisionStore();
  await testHeartbeatAppendDoesNotCreateDecisionStore();
  await testMultipleHeartbeatsRemainJsonlAndIsolated();

  console.log(`${LABEL} PASS`);
}

void main();
