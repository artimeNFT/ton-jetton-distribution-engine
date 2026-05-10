import * as assert from "assert/strict";
import {
  validatePassiveHeartbeatRecord,
  type PassiveHeartbeatRecord,
} from "../lib/watcher/passiveHeartbeat";

const LABEL = "[stage-d9-5-passive-heartbeat-schema-smoke]";

function sampleHeartbeat(): PassiveHeartbeatRecord {
  return {
    schemaVersion: "passive-heartbeat-v1",
    heartbeatId: "heartbeat-001",
    heartbeatRunId: "heartbeat-run-001",
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
      reason: "permission_denied",
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

function assertIssue(record: unknown, reason: string): void {
  const result = validatePassiveHeartbeatRecord(record);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.reason === reason),
      `expected issue reason ${reason}`,
    );
  }
}

function testValidHeartbeatPasses(): void {
  const result = validatePassiveHeartbeatRecord(sampleHeartbeat());
  assert.equal(result.ok, true);
}

function testRejectsMissingHeartbeatId(): void {
  const record = { ...sampleHeartbeat(), heartbeatId: "" };
  assertIssue(record, "missing_required_string");
}

function testRejectsInvalidEnum(): void {
  const record = { ...sampleHeartbeat(), severity: "critical" };
  assertIssue(record, "invalid_enum");
}

function testRejectsInvalidTimestamp(): void {
  const record = { ...sampleHeartbeat(), emittedAt: "not-a-date" };
  assertIssue(record, "invalid_iso_timestamp");
}

function testRejectsNegativeCounter(): void {
  const record = {
    ...sampleHeartbeat(),
    counters: { ...sampleHeartbeat().counters, heartbeatWriteFailures: -1 },
  };
  assertIssue(record, "invalid_counter");
}

function testAllowsHeartbeatWhenDecisionStoreBlocked(): void {
  const record: PassiveHeartbeatRecord = {
    ...sampleHeartbeat(),
    systemStatus: "blocked",
    decisionStoreStatus: {
      ...sampleHeartbeat().decisionStoreStatus,
      status: "blocked",
      reason: "decision_store_locked",
    },
    heartbeatStoreStatus: {
      ...sampleHeartbeat().heartbeatStoreStatus,
      status: "ok",
      path: "data/heartbeat/heartbeats.jsonl",
      reason: null,
    },
  };

  const result = validatePassiveHeartbeatRecord(record);
  assert.equal(result.ok, true);
}

function main(): void {
  testValidHeartbeatPasses();
  testRejectsMissingHeartbeatId();
  testRejectsInvalidEnum();
  testRejectsInvalidTimestamp();
  testRejectsNegativeCounter();
  testAllowsHeartbeatWhenDecisionStoreBlocked();

  console.log(`${LABEL} PASS`);
}

main();
