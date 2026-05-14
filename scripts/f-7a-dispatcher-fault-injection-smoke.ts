import * as assert from "assert/strict";
import { applyDispatchIntentToRunState } from "../lib/dispatcher/runStateApplyShell";
import { buildDispatchIntentFromDecision } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import {
  createEmptyRunState,
  makeStateKey,
  type AtomicStateStore,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import { planDispatcherDryRunIntake } from "../lib/dispatcher/dispatcherDryRunIntake";
import { planDispatcherDryRunTransition } from "../lib/dispatcher/dispatcherDryRunTransitionPlan";
import { checkCrossStoreConsistency } from "../lib/dispatcher/crossStoreConsistency";
import { planHeartbeatAppend } from "../lib/dispatcher/heartbeatAppendPolicy";
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[f-7a-dispatcher-fault-injection-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-f7a";
const BATCH_ID = "campaign-f7a-batch-1";
const CANDIDATE_ID = "candidate-f7a-001";
const DECISION_ID = "decision-f7a-001";
const DECISION_RUN_ID = "decision-run-f7a-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseF7A";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-f7a";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-f7a";
const AMOUNT = "111222333";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

function cloneState(state: RunState): RunState {
  return JSON.parse(JSON.stringify(state)) as RunState;
}

function cloneEntry(entry: StateEntry): StateEntry {
  return JSON.parse(JSON.stringify(entry)) as StateEntry;
}

function makeCandidateRecord(
  overrides: Partial<CandidateRecord> = {},
): CandidateRecord {
  return {
    candidateId: CANDIDATE_ID,
    destinationAddress: DESTINATION_ADDRESS,
    destinationCanonicalKey: DESTINATION_CANONICAL_KEY,
    jettonMasterCanonicalKey: JETTON_MASTER_CANONICAL_KEY,
    amount: AMOUNT,
    ...overrides,
  } as unknown as CandidateRecord;
}

function makeDecisionRecord(
  overrides: Partial<CandidateDecisionRecord> = {},
): CandidateDecisionRecord {
  return {
    decisionId: DECISION_ID,
    candidateId: CANDIDATE_ID,
    decisionRunId: DECISION_RUN_ID,
    decision: "accepted",
    decisionReason: "policy_accept",
    budgetSnapshot: { candidateAmount: AMOUNT },
    traceability: {
      txHash: "tx-hash-f7a-001",
      lt: "98765432101",
      actionIndex: "0",
    },
    ...overrides,
  } as unknown as CandidateDecisionRecord;
}

function getIntent() {
  const result = buildDispatchIntentFromDecision({
    decisionRecord: makeDecisionRecord(),
    candidateRecord: makeCandidateRecord(),
    batchId: BATCH_ID,
    recipientIndex: 0,
    nowIso: NOW_ISO,
  });
  if (!result.ok) throw new Error(`getIntent failed: ${result.reason}`);
  return result.intent;
}

function makeBatch() {
  const stateKey = makeStateKey(BATCH_ID, DESTINATION_ADDRESS);
  return {
    batchId: BATCH_ID,
    index: 0,
    recipients: [
      { address: DESTINATION_ADDRESS, amount: BigInt(AMOUNT) },
    ],
    totalAmount: BigInt(AMOUNT),
    size: 1,
  };
}

function makeRunStateWithCampaign(base?: RunState): RunState {
  const state = base ?? createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const rs = state as unknown as Record<string, unknown>;
  const meta = rs["meta"] as Record<string, unknown>;
  meta["campaignId"] = CAMPAIGN_ID;
  return state;
}

function makeAuditEvent(
  stateKey: string,
  entry: StateEntry,
  overrides: Record<string, unknown> = {},
) {
  return {
    eventType: "state_transition",
    campaignId: CAMPAIGN_ID,
    batchId: (entry as unknown as Record<string, unknown>)["batchId"],
    stateKey,
    operatorId: (entry as unknown as Record<string, unknown>)["operatorId"],
    attemptNumber: (entry as unknown as Record<string, unknown>)["attemptNumber"],
    status: (entry as unknown as Record<string, unknown>)["status"],
    emittedAt: NOW_ISO,
    details: { source: "f7a-smoke" },
    ...overrides,
  };
}

function makeStructuredLogEvent(
  stateKey: string,
  entry: StateEntry,
  overrides: Record<string, unknown> = {},
) {
  return {
    level: "info",
    message: "state transition",
    campaignId: CAMPAIGN_ID,
    batchId: (entry as unknown as Record<string, unknown>)["batchId"],
    stateKey,
    operatorId: (entry as unknown as Record<string, unknown>)["operatorId"],
    attemptNumber: (entry as unknown as Record<string, unknown>)["attemptNumber"],
    status: (entry as unknown as Record<string, unknown>)["status"],
    emittedAt: NOW_ISO,
    details: { source: "f7a-smoke" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FakeStore
// ---------------------------------------------------------------------------

interface FakeStoreOptions {
  readThrows?: boolean;
  updateThrows?: boolean;
  mutateDraftBeforeUpdate?: (draft: RunState) => void;
  throwAfterCommit?: boolean;
}

class FakeStore implements AtomicStateStore {
  public readCount = 0;
  public updateCount = 0;
  public state: RunState;
  private readonly options: FakeStoreOptions;

  constructor(initialState: RunState, options: FakeStoreOptions = {}) {
    this.state = cloneState(initialState);
    this.options = options;
  }

  async read(): Promise<RunState> {
    this.readCount += 1;
    if (this.options.readThrows) throw new Error("FakeStore: read forced failure");
    return cloneState(this.state);
  }

  async update(mutator: (draft: RunState) => RunState | void): Promise<RunState> {
    this.updateCount += 1;
    if (this.options.updateThrows) throw new Error("FakeStore: update forced failure");

    const draft = cloneState(this.state);

    if (this.options.mutateDraftBeforeUpdate) {
      this.options.mutateDraftBeforeUpdate(draft);
    }

    const returned = mutator(draft);

    if (returned !== undefined && returned !== null) {
      this.state = cloneState(returned);
    } else {
      this.state = cloneState(draft);
    }

    if (this.options.throwAfterCommit) {
      throw new Error("FakeStore: crash after commit");
    }

    return cloneState(this.state);
  }
}

// ---------------------------------------------------------------------------
// Test 1: crash after state write
// ---------------------------------------------------------------------------

async function testCrashAfterStateWrite(): Promise<void> {
  const intent = getIntent();
  const initialState = makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));
  const store = new FakeStore(initialState, { throwAfterCommit: true });

  // First apply — crashes after commit
  const result1 = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result1.ok, false, "expected write_failed due to post-commit throw");
  if (!result1.ok) assert.equal(result1.reason, "write_failed");

  // State must contain the planned entry despite the crash
  const storedEntry = (store.state.entries as Record<string, unknown>)[intent.stateKey];
  assert.ok(storedEntry !== undefined, "entry must be committed to store.state even after crash");

  // Retry with same intent against a non-crashing store wrapping existing state
  const recoveryStore = new FakeStore(store.state);
  const result2 = await applyDispatchIntentToRunState({ store: recoveryStore, intent });

  assert.equal(result2.ok, true, `expected ok on retry, got: ${stringify(result2)}`);
  if (!result2.ok) return;
  assert.equal(result2.action, "skipped_identical_existing", "retry must skip — no duplicate");
  assert.equal(recoveryStore.updateCount, 0, "recovery must not call update for skip");
}

// ---------------------------------------------------------------------------
// Test 2: crash after decision evidence write
// ---------------------------------------------------------------------------

async function testCrashAfterDecisionEvidenceWrite(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));

  // Successful apply
  const result = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(result.ok, true, `expected ok, got: ${stringify(result)}`);
  if (!result.ok) return;

  // Verify decision evidence in metadata
  const entry = (store.state.entries as Record<string, unknown>)[intent.stateKey] as Record<string, unknown>;
  assert.ok(entry !== undefined, "entry must exist");

  const meta = entry["metadata"] as Record<string, unknown>;
  assert.equal(meta["decisionId"], DECISION_ID);
  assert.equal(meta["candidateId"], CANDIDATE_ID);
  assert.equal(meta["decisionRunId"], DECISION_RUN_ID);
  assert.equal(meta["decisionReason"], "policy_accept");

  // Simulate crash — no downstream transition taken

  // Retry apply returns skipped_identical_existing
  const retryStore = new FakeStore(store.state);
  const retryResult = await applyDispatchIntentToRunState({ store: retryStore, intent });
  assert.equal(retryResult.ok, true);
  if (!retryResult.ok) return;
  assert.equal(retryResult.action, "skipped_identical_existing");

  // Evidence unchanged
  const retryEntry = (retryStore.state.entries as Record<string, unknown>)[intent.stateKey] as Record<string, unknown>;
  const retryMeta = retryEntry["metadata"] as Record<string, unknown>;
  assert.equal(retryMeta["decisionId"], DECISION_ID, "evidence must be unchanged after retry skip");
}

// ---------------------------------------------------------------------------
// Test 3: crash before audit write
// ---------------------------------------------------------------------------

async function testCrashBeforeAuditWrite(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));

  // Apply intent successfully
  const applyResult = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(applyResult.ok, true, `apply must succeed, got: ${stringify(applyResult)}`);

  const entry = (store.state.entries as Record<string, unknown>)[intent.stateKey] as StateEntry;

  // Cross-store consistency with no audit/log/heartbeat (crash before writes)
  const consistencyResult = checkCrossStoreConsistency({
    runState: store.state,
    stateKey: intent.stateKey,
    expectedStatus: "planned",
    auditEvent: null,
    structuredLogEvent: null,
    heartbeatRecord: null,
  });

  assert.equal(consistencyResult.ok, true, `consistency must pass with no audit, got: ${stringify(consistencyResult)}`);

  // Dry-run intake still sees planned entry, not submitted
  const batch = makeBatch();
  const intakeState = cloneState(store.state);
  const intakeResult = planDispatcherDryRunIntake({ runState: intakeState, batch });

  assert.equal(intakeResult.ok, true, `intake must succeed, got: ${stringify(intakeResult)}`);
  if (!intakeResult.ok) return;
  assert.equal(intakeResult.action, "planned_entries_ready");

  // Verify entry is still planned, not submitted
  const intakeEntry = intakeResult.entries[0].entry as unknown as Record<string, unknown>;
  assert.equal(intakeEntry["status"], "planned", "entry must remain planned — no execution transition");
}

// ---------------------------------------------------------------------------
// Test 4: audit file permission denied
// ---------------------------------------------------------------------------

async function testAuditFilePermissionDenied(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));
  await applyDispatchIntentToRunState({ store, intent });

  const entry = (store.state.entries as Record<string, unknown>)[intent.stateKey] as StateEntry;

  // Simulate malformed audit event (permission denied result — bad shape)
  const malformedAudit = {
    eventType: "state_transition",
    campaignId: CAMPAIGN_ID,
    batchId: BATCH_ID,
    stateKey: intent.stateKey,
    operatorId: null,
    attemptNumber: 0,
    status: "planned",
    emittedAt: "not-a-valid-iso", // malformed
    details: {},
  };

  const consistencyResult = checkCrossStoreConsistency({
    runState: store.state,
    stateKey: intent.stateKey,
    expectedStatus: "planned",
    auditEvent: malformedAudit as any,
    structuredLogEvent: null,
    heartbeatRecord: null,
  });

  assert.equal(consistencyResult.ok, false, "consistency must fail with malformed audit");

  const reasons = consistencyResult.ok
    ? []
    : (consistencyResult as Record<string, unknown>)["issues"] as Array<Record<string, unknown>>;
  const reasonStrings = reasons.map((i) => i["reason"] as string);
  assert.ok(
    reasonStrings.some((r) => r.includes("audit")),
    `expected audit issue reason in ${stringify(reasonStrings)}`,
  );

  // RunState entry must remain planned
  const storedEntry = (store.state.entries as Record<string, unknown>)[intent.stateKey] as Record<string, unknown>;
  assert.equal(storedEntry["status"], "planned", "entry must remain planned after audit fault");

  // Dry-run intake sees only planned entry
  const intakeResult = planDispatcherDryRunIntake({ runState: store.state, batch: makeBatch() });
  assert.equal(intakeResult.ok, true, `intake must still succeed, got: ${stringify(intakeResult)}`);
  if (!intakeResult.ok) return;
  const intakeEntry = intakeResult.entries[0].entry as unknown as Record<string, unknown>;
  assert.equal(intakeEntry["status"], "planned", "intake entry must be planned, not submitted");
}

// ---------------------------------------------------------------------------
// Test 5: heartbeat unavailable
// ---------------------------------------------------------------------------

async function testHeartbeatUnavailable(): Promise<void> {
  // Heartbeat write failure forces a boundary event append
  const policy = planHeartbeatAppend({
    trigger: "heartbeat_write_failure",
    nowIso: NOW_ISO,
    lastHeartbeatAt: "2025-12-31T23:59:00.000Z",
    minIntervalMs: 999999999,
  });

  assert.equal(policy.ok, true, `heartbeat policy must allow, got: ${stringify(policy)}`);
  if (!policy.ok) return;
  assert.equal(policy.action, "append_allowed");
  assert.equal((policy as Record<string, unknown>)["reason"], "forced_boundary_event");

  // Apply intent to RunState
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));
  await applyDispatchIntentToRunState({ store, intent });

  // Consistency with heartbeatRecord null — no heartbeat dependency on RunState
  const consistencyResult = checkCrossStoreConsistency({
    runState: store.state,
    stateKey: intent.stateKey,
    expectedStatus: "planned",
    auditEvent: null,
    structuredLogEvent: null,
    heartbeatRecord: null,
  });

  assert.equal(consistencyResult.ok, true, `consistency must pass without heartbeat, got: ${stringify(consistencyResult)}`);

  // Entry must remain planned and uncorrupted
  const entry = (store.state.entries as Record<string, unknown>)[intent.stateKey] as Record<string, unknown>;
  assert.equal(entry["status"], "planned", "entry must remain planned — heartbeat unavailability must not corrupt RunState");
}

// ---------------------------------------------------------------------------
// Test 6: duplicate dispatch attempt
// ---------------------------------------------------------------------------

async function testDuplicateDispatchAttempt(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));

  const r1 = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.equal(r1.action, "inserted_entry");

  const r2 = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.equal(r2.action, "skipped_identical_existing");

  const entries = store.state.entries as Record<string, unknown>;
  assert.equal(Object.keys(entries).length, 1, "entries count must remain 1 after duplicate attempt");
}

// ---------------------------------------------------------------------------
// Test 7: retry conflict
// ---------------------------------------------------------------------------

async function testRetryConflict(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)));

  // First apply succeeds
  const r1 = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(r1.ok, true);

  // Mutate the stored entry to create a conflict (different amount)
  const entries = store.state.entries as Record<string, unknown>;
  const existing = entries[intent.stateKey] as Record<string, unknown>;
  entries[intent.stateKey] = { ...existing, amount: "999999999" };

  // Second apply with same intent — must reject conflict
  const r2 = await applyDispatchIntentToRunState({ store, intent });
  assert.equal(r2.ok, false, `expected conflict rejection, got: ${stringify(r2)}`);
  if (!r2.ok) {
    assert.ok(
      r2.reason === "plan_existing_entry_conflict" ||
        r2.reason === "plan_active_existing_entry",
      `expected conflict reason, got ${r2.reason}`,
    );
  }

  // No duplicate created — still 1 entry
  assert.equal(Object.keys(entries).length, 1, "no duplicate entry must be created");
}

// ---------------------------------------------------------------------------
// Test 8: corrupted RunState fragment
// ---------------------------------------------------------------------------

async function testCorruptedRunStateFragment(): Promise<void> {
  const intent = getIntent();
  const state = makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));

  // Insert malformed entry (missing amount and status)
  (state.entries as Record<string, unknown>)[intent.stateKey] = {
    batchId: BATCH_ID,
    recipientAddress: DESTINATION_ADDRESS,
    recipientIndex: 0,
    // amount missing
    // status missing
    attemptNumber: 0,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };

  const batch = makeBatch();
  const intakeResult = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(intakeResult.ok, false, `expected intake rejection, got: ${stringify(intakeResult)}`);
  if (!intakeResult.ok) {
    assert.ok(
      intakeResult.reason === "invalid_entry" || intakeResult.reason === "entry_not_planned",
      `expected invalid_entry or entry_not_planned, got ${intakeResult.reason}`,
    );
  }

  // No transition plan attempted
  // (Transition plan would only be called after successful intake)
}

// ---------------------------------------------------------------------------
// Test 9: transition blocked after corrupted/non-planned entry
// ---------------------------------------------------------------------------

async function testTransitionBlockedAfterNonPlannedEntry(): Promise<void> {
  const intent = getIntent();
  const state = makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));

  for (const status of ["submitted", "hard_failure"] as const) {
    const staleEntry: StateEntry = {
      batchId: BATCH_ID,
      recipientAddress: DESTINATION_ADDRESS,
      recipientIndex: 0,
      amount: AMOUNT,
      status,
      attemptNumber: 1,
      operatorId: "operator-f7a",
      operatorLabel: "Operator F7A",
      txHash: null,
      networkRef: null,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
      submittedAt: NOW_ISO,
      finalizedAt: null,
      cooldownUntil: null,
      lastErrorCode: null,
      lastError: null,
      lastDecision: null,
      metadata: { source: "f7a-smoke" },
    } as unknown as StateEntry;

    const stateWithEntry = cloneState(state);
    (stateWithEntry.entries as Record<string, unknown>)[intent.stateKey] = staleEntry;

    const batch = makeBatch();
    const intakeResult = planDispatcherDryRunIntake({ runState: stateWithEntry, batch });

    assert.equal(intakeResult.ok, false, `expected intake rejection for status=${status}, got: ${stringify(intakeResult)}`);
    if (!intakeResult.ok) {
      assert.equal(
        intakeResult.reason,
        "entry_not_planned",
        `expected entry_not_planned for status=${status}, got ${intakeResult.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 10: deterministic / no mutation
// ---------------------------------------------------------------------------

async function testDeterministicNoMutation(): Promise<void> {
  const intent = getIntent();
  const intentBefore = stringify(intent);

  const state1 = makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));
  const state1Before = stringify(state1);

  // Apply and capture result
  const store1 = new FakeStore(state1);
  const r1 = await applyDispatchIntentToRunState({ store: store1, intent });

  // Apply same setup independently and confirm same result
  const state2 = makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));
  const store2 = new FakeStore(state2);
  const r2 = await applyDispatchIntentToRunState({ store: store2, intent });

  assert.equal(r1.ok, r2.ok, "results must have same ok value");
  if (r1.ok && r2.ok) {
    assert.equal(r1.action, r2.action, "actions must be identical");
    assert.equal(r1.stateKey, r2.stateKey, "state keys must be identical");
  }

  // Intent must not be mutated
  assert.equal(stringify(intent), intentBefore, "intent must not be mutated");

  // Original state object must not be mutated
  assert.equal(stringify(state1), state1Before, "original state must not be mutated");

  // Fault injection: same failed-read result is deterministic
  const storeThrows1 = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)), { readThrows: true });
  const storeThrows2 = new FakeStore(makeRunStateWithCampaign(createEmptyRunState(CAMPAIGN_ID, NOW_ISO)), { readThrows: true });
  const rf1 = await applyDispatchIntentToRunState({ store: storeThrows1, intent });
  const rf2 = await applyDispatchIntentToRunState({ store: storeThrows2, intent });

  assert.equal(rf1.ok, false);
  assert.equal(rf2.ok, false);
  if (!rf1.ok && !rf2.ok) {
    assert.equal(rf1.reason, rf2.reason, "fault reasons must be deterministic");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await testCrashAfterStateWrite();
  await testCrashAfterDecisionEvidenceWrite();
  await testCrashBeforeAuditWrite();
  await testAuditFilePermissionDenied();
  await testHeartbeatUnavailable();
  await testDuplicateDispatchAttempt();
  await testRetryConflict();
  await testCorruptedRunStateFragment();
  await testTransitionBlockedAfterNonPlannedEntry();
  await testDeterministicNoMutation();

  console.log(`${LABEL} PASS`);
}

main().catch((err) => {
  console.error(`${LABEL} FAIL`, err);
  process.exit(1);
});
