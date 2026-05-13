import * as assert from "assert/strict";
import {
  checkCrossStoreConsistency,
  type CrossStoreAuditEvidence,
  type CrossStoreStructuredLogEvidence,
} from "../lib/dispatcher/crossStoreConsistency";
import {
  createEmptyRunState,
  makeStateKey,
  type RunState,
  type StateEntry,
  type StateStatus,
} from "../lib/dispatcher/stateStore";
import type { PassiveHeartbeatRecord } from "../lib/watcher/passiveHeartbeat";

const LABEL = "[f-6-cross-store-consistency-contract-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-f6";
const BATCH_ID = "campaign-f6-batch-1";
const RECIPIENT = "EQRecipientMixedCaseF6";
const STATE_KEY = makeStateKey(BATCH_ID, RECIPIENT);
const OPERATOR_ID = "operator-f6";
const ATTEMPT_NUMBER = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeEntry(overrides: Partial<StateEntry> = {}): StateEntry {
  return {
    batchId: BATCH_ID,
    recipientAddress: RECIPIENT,
    recipientIndex: 0,
    amount: "123456789",
    status: "submitted",
    attemptNumber: ATTEMPT_NUMBER,
    operatorId: OPERATOR_ID,
    operatorLabel: "Operator F6",
    txHash: null,
    networkRef: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    submittedAt: NOW_ISO,
    finalizedAt: null,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: "none",
    metadata: { source: "f6-smoke" },
    ...overrides,
  } as unknown as StateEntry;
}

function makeRunStateWithEntry(entry?: StateEntry, key?: string): RunState {
  const state = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const rs = state as unknown as Record<string, unknown>;
  const meta = rs["meta"] as Record<string, unknown>;
  meta["campaignId"] = CAMPAIGN_ID;
  if (entry !== undefined) {
    const entries = rs["entries"] as Record<string, unknown>;
    entries[key ?? STATE_KEY] = entry;
  }
  return state;
}

function makeAuditEvent(
  overrides: Partial<CrossStoreAuditEvidence> = {},
): CrossStoreAuditEvidence {
  return {
    eventType: "state_transition",
    campaignId: CAMPAIGN_ID,
    batchId: BATCH_ID,
    stateKey: STATE_KEY,
    operatorId: OPERATOR_ID,
    attemptNumber: ATTEMPT_NUMBER,
    status: "submitted",
    emittedAt: NOW_ISO,
    details: { source: "f6-smoke" },
    ...overrides,
  };
}

function makeStructuredLogEvent(
  overrides: Partial<CrossStoreStructuredLogEvidence> = {},
): CrossStoreStructuredLogEvidence {
  return {
    level: "info",
    message: "state transition submitted",
    campaignId: CAMPAIGN_ID,
    batchId: BATCH_ID,
    stateKey: STATE_KEY,
    operatorId: OPERATOR_ID,
    attemptNumber: ATTEMPT_NUMBER,
    status: "submitted",
    emittedAt: NOW_ISO,
    details: { source: "f6-smoke" },
    ...overrides,
  };
}

function makeHeartbeat(
  overrides: Partial<PassiveHeartbeatRecord> = {},
): PassiveHeartbeatRecord {
  return {
    schemaVersion: "passive-heartbeat-v1",
    heartbeatId: "heartbeat-f6-001",
    heartbeatRunId: "heartbeat-run-f6-001",
    campaignId: CAMPAIGN_ID,
    emittedAt: NOW_ISO,
    source: "dispatcher",
    severity: "info",
    systemStatus: "alive",
    decisionStoreStatus: {
      status: "ok",
      path: "data/decision-store/decisions.jsonl",
      lastSuccessAt: NOW_ISO,
      lastFailureAt: null,
      reason: null,
    },
    heartbeatStoreStatus: {
      status: "ok",
      path: "reports/campaign-f6/heartbeats.jsonl",
      lastSuccessAt: NOW_ISO,
      lastFailureAt: null,
      reason: null,
    },
    lockStatus: {
      status: "owned",
      lockPath: "run_state.lock",
      ownerId: "dispatcher-f6",
      lockId: "lock-f6",
      acquiredAt: NOW_ISO,
      checkedAt: NOW_ISO,
      reason: null,
    },
    gasStatus: {
      status: "ok",
      lastGasObservedAt: NOW_ISO,
      gasEstimateSource: "fixture",
      feeDecision: "within_fee_allowance",
      reason: null,
    },
    blacklistStatus: {
      status: "ok",
      blacklistVersion: "v1",
      checksum: "checksum-f6",
      checkedAt: NOW_ISO,
      reason: null,
    },
    rpcStatus: {
      status: "ok",
      provider: "fixture-provider",
      endpoint: "fixture-endpoint",
      observedLatencyMs: 1,
      checkedAt: NOW_ISO,
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

function issueReasons(result: unknown): string[] {
  const r = result as Record<string, unknown>;
  if (!Array.isArray(r["issues"])) return [];
  return (r["issues"] as Array<Record<string, unknown>>).map(
    (i) => i["reason"] as string,
  );
}

function baseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    runState: makeRunStateWithEntry(makeEntry()),
    stateKey: STATE_KEY,
    expectedStatus: "submitted" as StateStatus,
    auditEvent: makeAuditEvent(),
    structuredLogEvent: makeStructuredLogEvent(),
    heartbeatRecord: makeHeartbeat(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: consistent with all evidence
// ---------------------------------------------------------------------------

function testConsistentWithAllEvidence(): void {
  const entry = makeEntry();
  const result = checkCrossStoreConsistency({
    runState: makeRunStateWithEntry(entry),
    stateKey: STATE_KEY,
    expectedStatus: "submitted" as StateStatus,
    auditEvent: makeAuditEvent(),
    structuredLogEvent: makeStructuredLogEvent(),
    heartbeatRecord: makeHeartbeat(),
  });

  assert.equal(result.ok, true, `expected consistent, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "consistent");
  assert.equal(result.stateKey, STATE_KEY);
  assert.deepEqual(result.entry, entry);
}

// ---------------------------------------------------------------------------
// Test 2: consistent with all evidence null
// ---------------------------------------------------------------------------

function testConsistentWithNullEvidence(): void {
  const result = checkCrossStoreConsistency({
    runState: makeRunStateWithEntry(makeEntry()),
    stateKey: STATE_KEY,
    expectedStatus: "submitted" as StateStatus,
    auditEvent: null,
    structuredLogEvent: null,
    heartbeatRecord: null,
  });

  assert.equal(result.ok, true, `expected consistent with nulls, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "consistent");
}

// ---------------------------------------------------------------------------
// Test 3: missing auditEvent field
// ---------------------------------------------------------------------------

function testMissingAuditEventField(): void {
  const input = baseInput() as Record<string, unknown>;
  delete input["auditEvent"];
  const result = checkCrossStoreConsistency(input);
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_input"),
    `expected invalid_input in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 4: missing structuredLogEvent field
// ---------------------------------------------------------------------------

function testMissingStructuredLogEventField(): void {
  const input = baseInput() as Record<string, unknown>;
  delete input["structuredLogEvent"];
  const result = checkCrossStoreConsistency(input);
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_input"),
    `expected invalid_input in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 5: missing heartbeatRecord field
// ---------------------------------------------------------------------------

function testMissingHeartbeatRecordField(): void {
  const input = baseInput() as Record<string, unknown>;
  delete input["heartbeatRecord"];
  const result = checkCrossStoreConsistency(input);
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_input"),
    `expected invalid_input in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 6: invalid runState
// ---------------------------------------------------------------------------

function testInvalidRunState(): void {
  const result = checkCrossStoreConsistency(baseInput({ runState: {} }));
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_run_state"),
    `expected invalid_run_state in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 7: invalid stateKey
// ---------------------------------------------------------------------------

function testInvalidStateKey(): void {
  const result = checkCrossStoreConsistency(baseInput({ stateKey: "" }));
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_state_key"),
    `expected invalid_state_key in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 8: missing state entry
// ---------------------------------------------------------------------------

function testMissingStateEntry(): void {
  const result = checkCrossStoreConsistency(
    baseInput({ runState: makeRunStateWithEntry(undefined) }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("missing_state_entry"),
    `expected missing_state_entry in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 9: invalid state entry (amount "0")
// ---------------------------------------------------------------------------

function testInvalidStateEntry(): void {
  const result = checkCrossStoreConsistency(
    baseInput({ runState: makeRunStateWithEntry(makeEntry({ amount: "0" } as any)) }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("invalid_state_entry"),
    `expected invalid_state_entry in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 10: state key mismatch
// ---------------------------------------------------------------------------

function testStateKeyMismatch(): void {
  // Entry stored under STATE_KEY but recipientAddress doesn't match
  const badEntry = makeEntry({ recipientAddress: "EQOtherRecipientF6" } as any);
  const runState = makeRunStateWithEntry(undefined);
  const rs = runState as unknown as Record<string, unknown>;
  const meta = rs["meta"] as Record<string, unknown>;
  meta["campaignId"] = CAMPAIGN_ID;
  (rs["entries"] as Record<string, unknown>)[STATE_KEY] = badEntry;

  const result = checkCrossStoreConsistency(
    baseInput({ runState }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("state_key_mismatch"),
    `expected state_key_mismatch in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 11: status mismatch
// ---------------------------------------------------------------------------

function testStatusMismatch(): void {
  const result = checkCrossStoreConsistency({
    runState: makeRunStateWithEntry(makeEntry({ status: "planned" } as any)),
    stateKey: STATE_KEY,
    expectedStatus: "submitted" as StateStatus,
    auditEvent: null,
    structuredLogEvent: null,
    heartbeatRecord: null,
  });
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("status_mismatch"),
    `expected status_mismatch in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 12: invalid audit emittedAt
// ---------------------------------------------------------------------------

function testAuditInvalidEmittedAt(): void {
  const result = checkCrossStoreConsistency(
    baseInput({ auditEvent: makeAuditEvent({ emittedAt: "not-iso" }) }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("audit_event_invalid"),
    `expected audit_event_invalid in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 13: audit field mismatches
// ---------------------------------------------------------------------------

function testAuditFieldMismatches(): void {
  const cases: [Partial<CrossStoreAuditEvidence>, string][] = [
    [{ campaignId: "wrong-campaign" }, "audit_campaign_mismatch"],
    [{ batchId: "wrong-batch" }, "audit_batch_mismatch"],
    [{ stateKey: "wrong::statekey" }, "audit_state_key_mismatch"],
    [{ operatorId: "wrong-operator" }, "audit_operator_mismatch"],
    [{ attemptNumber: 99 }, "audit_attempt_mismatch"],
    [{ status: "planned" }, "audit_status_mismatch"],
  ];

  for (const [override, expectedReason] of cases) {
    const result = checkCrossStoreConsistency(
      baseInput({ auditEvent: makeAuditEvent(override) }),
    );
    assert.equal(result.ok, false, `expected failure for ${expectedReason}`);
    assert.ok(
      issueReasons(result).includes(expectedReason),
      `expected ${expectedReason} in ${JSON.stringify(issueReasons(result))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 14: invalid structured log level
// ---------------------------------------------------------------------------

function testStructuredLogInvalidLevel(): void {
  const result = checkCrossStoreConsistency(
    baseInput({
      structuredLogEvent: makeStructuredLogEvent({ level: "debug" as any }),
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("structured_log_invalid"),
    `expected structured_log_invalid in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 15: structured log field mismatches
// ---------------------------------------------------------------------------

function testStructuredLogFieldMismatches(): void {
  const cases: [Partial<CrossStoreStructuredLogEvidence>, string][] = [
    [{ campaignId: "wrong-campaign" }, "structured_log_campaign_mismatch"],
    [{ batchId: "wrong-batch" }, "structured_log_batch_mismatch"],
    [{ stateKey: "wrong::statekey" }, "structured_log_state_key_mismatch"],
    [{ operatorId: "wrong-operator" }, "structured_log_operator_mismatch"],
    [{ attemptNumber: 99 }, "structured_log_attempt_mismatch"],
    [{ status: "planned" }, "structured_log_status_mismatch"],
  ];

  for (const [override, expectedReason] of cases) {
    const result = checkCrossStoreConsistency(
      baseInput({ structuredLogEvent: makeStructuredLogEvent(override) }),
    );
    assert.equal(result.ok, false, `expected failure for ${expectedReason}`);
    assert.ok(
      issueReasons(result).includes(expectedReason),
      `expected ${expectedReason} in ${JSON.stringify(issueReasons(result))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 16: invalid heartbeat schemaVersion
// ---------------------------------------------------------------------------

function testHeartbeatInvalidSchemaVersion(): void {
  const result = checkCrossStoreConsistency(
    baseInput({
      heartbeatRecord: makeHeartbeat({ schemaVersion: "bad-version" as any }),
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("heartbeat_invalid"),
    `expected heartbeat_invalid in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 17: heartbeat campaign mismatch
// ---------------------------------------------------------------------------

function testHeartbeatCampaignMismatch(): void {
  const result = checkCrossStoreConsistency(
    baseInput({
      heartbeatRecord: makeHeartbeat({ campaignId: "other-campaign" }),
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("heartbeat_campaign_mismatch"),
    `expected heartbeat_campaign_mismatch in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 18: heartbeat lastKnownError present
// ---------------------------------------------------------------------------

function testHeartbeatErrorPresent(): void {
  const result = checkCrossStoreConsistency(
    baseInput({
      heartbeatRecord: makeHeartbeat({
        lastKnownError: {
          code: "rpc_timeout",
          message: "RPC call timed out",
          subsystem: "rpc",
          occurredAt: NOW_ISO,
        } as any,
      }),
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(
    issueReasons(result).includes("heartbeat_error_present"),
    `expected heartbeat_error_present in ${JSON.stringify(issueReasons(result))}`,
  );
}

// ---------------------------------------------------------------------------
// Test 19: multiple issues collected together
// ---------------------------------------------------------------------------

function testMultipleIssuesCollected(): void {
  const result = checkCrossStoreConsistency(
    baseInput({
      auditEvent: makeAuditEvent({ status: "planned" }),
      structuredLogEvent: makeStructuredLogEvent({ status: "planned" }),
      heartbeatRecord: makeHeartbeat({ campaignId: "other-campaign" }),
    }),
  );
  assert.equal(result.ok, false);
  const reasons = issueReasons(result);
  assert.ok(
    reasons.includes("audit_status_mismatch"),
    `expected audit_status_mismatch in ${JSON.stringify(reasons)}`,
  );
  assert.ok(
    reasons.includes("structured_log_status_mismatch"),
    `expected structured_log_status_mismatch in ${JSON.stringify(reasons)}`,
  );
  assert.ok(
    reasons.includes("heartbeat_campaign_mismatch"),
    `expected heartbeat_campaign_mismatch in ${JSON.stringify(reasons)}`,
  );
}

// ---------------------------------------------------------------------------
// Test 20: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const runState = makeRunStateWithEntry(makeEntry());
  const auditEvent = makeAuditEvent();
  const structuredLogEvent = makeStructuredLogEvent();
  const heartbeatRecord = makeHeartbeat();

  const rsBefore = JSON.stringify(runState);
  const aeBefore = JSON.stringify(auditEvent);
  const slBefore = JSON.stringify(structuredLogEvent);
  const hbBefore = JSON.stringify(heartbeatRecord);

  checkCrossStoreConsistency({
    runState,
    stateKey: STATE_KEY,
    expectedStatus: "submitted" as StateStatus,
    auditEvent,
    structuredLogEvent,
    heartbeatRecord,
  });

  assert.equal(JSON.stringify(runState), rsBefore, "runState must not be mutated");
  assert.equal(JSON.stringify(auditEvent), aeBefore, "auditEvent must not be mutated");
  assert.equal(JSON.stringify(structuredLogEvent), slBefore, "structuredLogEvent must not be mutated");
  assert.equal(JSON.stringify(heartbeatRecord), hbBefore, "heartbeatRecord must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testConsistentWithAllEvidence();
  testConsistentWithNullEvidence();
  testMissingAuditEventField();
  testMissingStructuredLogEventField();
  testMissingHeartbeatRecordField();
  testInvalidRunState();
  testInvalidStateKey();
  testMissingStateEntry();
  testInvalidStateEntry();
  testStateKeyMismatch();
  testStatusMismatch();
  testAuditInvalidEmittedAt();
  testAuditFieldMismatches();
  testStructuredLogInvalidLevel();
  testStructuredLogFieldMismatches();
  testHeartbeatInvalidSchemaVersion();
  testHeartbeatCampaignMismatch();
  testHeartbeatErrorPresent();
  testMultipleIssuesCollected();
  testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();
