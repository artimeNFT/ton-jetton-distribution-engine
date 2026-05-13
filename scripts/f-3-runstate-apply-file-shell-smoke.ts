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
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[f-3-runstate-apply-file-shell-smoke]";

// ---------------------------------------------------------------------------
// Fixed constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-f3";
const BATCH_ID = "campaign-f3-batch-1";
const CANDIDATE_ID = "candidate-f3-001";
const DECISION_ID = "decision-f3-001";
const DECISION_RUN_ID = "decision-run-f3-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseF3";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-f3";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-f3";
const AMOUNT = "111222333";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

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
  } as CandidateRecord;
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
    budgetSnapshot: {
      candidateAmount: AMOUNT,
    },
    traceability: {
      txHash: "tx-hash-f3-001",
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
  if (!result.ok) {
    throw new Error(`getIntent: adapter rejected: ${result.reason}`);
  }
  return result.intent;
}

function cloneState(state: RunState): RunState {
  return JSON.parse(JSON.stringify(state)) as RunState;
}

function cloneEntry(entry: StateEntry): StateEntry {
  return JSON.parse(JSON.stringify(entry)) as StateEntry;
}

// ---------------------------------------------------------------------------
// FakeStore
// ---------------------------------------------------------------------------

interface FakeStoreOptions {
  readThrows?: boolean;
  updateThrows?: boolean;
  mutateDraftBeforeUpdate?: (draft: RunState) => void;
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
    if (this.options.readThrows) {
      throw new Error("FakeStore: read forced failure");
    }
    return cloneState(this.state);
  }

  async update(mutator: (draft: RunState) => RunState | void): Promise<RunState> {
    this.updateCount += 1;
    if (this.options.updateThrows) {
      throw new Error("FakeStore: update forced failure");
    }
    const draft = cloneState(this.state);
    // Simulate a race by mutating draft before the mutator sees it
    if (this.options.mutateDraftBeforeUpdate) {
      this.options.mutateDraftBeforeUpdate(draft);
    }
    const returned = mutator(draft);
    if (returned !== undefined && returned !== null) {
      this.state = cloneState(returned);
    } else {
      this.state = cloneState(draft);
    }
    return cloneState(this.state);
  }
}

// ---------------------------------------------------------------------------
// Test 1: insert path on empty state
// ---------------------------------------------------------------------------

async function testInsertOnEmptyState(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "inserted_entry");
  assert.equal(result.stateKey, intent.stateKey);
  assert.equal(store.readCount, 1);
  assert.equal(store.updateCount, 1);
  assert.deepEqual(
    store.state.entries[intent.stateKey],
    intent.entry,
    "persisted entry must deep equal intent.entry",
  );
}

// ---------------------------------------------------------------------------
// Test 2: skip identical existing is a true no-op
// ---------------------------------------------------------------------------

async function testSkipIdenticalExistingIsNoOp(): Promise<void> {
  const intent = getIntent();
  const initialState = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  initialState.entries[intent.stateKey] = cloneEntry(intent.entry);
  const stateBefore = JSON.stringify(initialState);

  const store = new FakeStore(initialState);

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "skipped_identical_existing");
  assert.equal(result.stateKey, intent.stateKey);
  assert.equal(store.readCount, 1);
  assert.equal(store.updateCount, 0, "store.update must NOT be called for skip");
  assert.equal(
    JSON.stringify(store.state),
    stateBefore,
    "state JSON must be identical after skip",
  );
}

// ---------------------------------------------------------------------------
// Test 3: conflict planned existing rejects, no update
// ---------------------------------------------------------------------------

async function testConflictPlannedExistingRejectsNoUpdate(): Promise<void> {
  const intent = getIntent();
  const initialState = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const conflictEntry: StateEntry = cloneEntry(intent.entry);
  conflictEntry.amount = "999999999";
  initialState.entries[intent.stateKey] = conflictEntry;

  const store = new FakeStore(initialState);
  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_existing_entry_conflict");
  }
  assert.equal(store.updateCount, 0);
}

// ---------------------------------------------------------------------------
// Test 4: terminal existing rejects, no update
// ---------------------------------------------------------------------------

async function testTerminalExistingRejectsNoUpdate(): Promise<void> {
  const intent = getIntent();
  const initialState = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const terminalEntry: StateEntry = {
    ...cloneEntry(intent.entry),
    status: "success",
    attemptNumber: 1,
  };
  initialState.entries[intent.stateKey] = terminalEntry;

  const store = new FakeStore(initialState);
  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_terminal_existing_entry");
  }
  assert.equal(store.updateCount, 0);
}

// ---------------------------------------------------------------------------
// Test 5: active existing rejects, no update
// ---------------------------------------------------------------------------

async function testActiveExistingRejectsNoUpdate(): Promise<void> {
  const intent = getIntent();
  const initialState = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const activeEntry: StateEntry = {
    ...cloneEntry(intent.entry),
    status: "submitted",
    attemptNumber: 1,
  };
  initialState.entries[intent.stateKey] = activeEntry;

  const store = new FakeStore(initialState);
  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_active_existing_entry");
  }
  assert.equal(store.updateCount, 0);
}

// ---------------------------------------------------------------------------
// Test 6: read failure
// ---------------------------------------------------------------------------

async function testReadFailureMapsToReadFailed(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO), { readThrows: true });

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "read_failed");
  }
  assert.equal(store.updateCount, 0);
}

// ---------------------------------------------------------------------------
// Test 7: update failure maps to write_failed
// ---------------------------------------------------------------------------

async function testUpdateFailureMapsToWriteFailed(): Promise<void> {
  const intent = getIntent();
  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO), { updateThrows: true });

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "write_failed");
  }
  assert.equal(store.updateCount, 1);
}

// ---------------------------------------------------------------------------
// Test 8: changed during update (race: identical entry inserted before mutator)
// ---------------------------------------------------------------------------

async function testChangedDuringUpdateRace(): Promise<void> {
  const intent = getIntent();

  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO), {
    mutateDraftBeforeUpdate: (draft: RunState) => {
      // Simulate another writer inserting the identical entry before our mutator
      draft.entries[intent.stateKey] = cloneEntry(intent.entry);
    },
  });

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_changed_during_update");
  }
  assert.equal(store.updateCount, 1);
}

// ---------------------------------------------------------------------------
// Test 9: re-plan conflict during update
// ---------------------------------------------------------------------------

async function testReplanConflictDuringUpdate(): Promise<void> {
  const intent = getIntent();

  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO), {
    mutateDraftBeforeUpdate: (draft: RunState) => {
      // Insert same stateKey with a different amount — triggers conflict on re-plan
      const conflictEntry: StateEntry = {
        ...cloneEntry(intent.entry),
        amount: "888777666",
      };
      draft.entries[intent.stateKey] = conflictEntry;
    },
  });

  const result = await applyDispatchIntentToRunState({ store, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_existing_entry_conflict");
  }
  assert.equal(store.updateCount, 1);
}

// ---------------------------------------------------------------------------
// Test 10: invalid input and invalid store
// ---------------------------------------------------------------------------

async function testInvalidInputAndStore(): Promise<void> {
  // null input
  {
    const result = await applyDispatchIntentToRunState(null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
  }

  // store missing update function
  {
    const intent = getIntent();
    const badStore = { read: async () => createEmptyRunState(CAMPAIGN_ID, NOW_ISO) };
    const result = await applyDispatchIntentToRunState({ store: badStore, intent });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_store");
  }
}

// ---------------------------------------------------------------------------
// Test 11: invalid intent is mapped to plan reason
// ---------------------------------------------------------------------------

async function testInvalidIntentIsMapped(): Promise<void> {
  const intent = getIntent();
  // Tamper the stateKey to cause a mismatch
  const badIntent = {
    ...intent,
    stateKey: makeStateKey("wrong-batch", DESTINATION_ADDRESS),
  };

  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));
  const result = await applyDispatchIntentToRunState({ store, intent: badIntent as any });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "plan_state_key_mismatch");
  }
  assert.equal(store.updateCount, 0);
}

// ---------------------------------------------------------------------------
// Test 12: shell does not mutate intent
// ---------------------------------------------------------------------------

async function testShellDoesNotMutateIntent(): Promise<void> {
  const intent = getIntent();
  const intentBefore = JSON.stringify(intent);

  const store = new FakeStore(createEmptyRunState(CAMPAIGN_ID, NOW_ISO));
  await applyDispatchIntentToRunState({ store, intent });

  assert.equal(
    JSON.stringify(intent),
    intentBefore,
    "intent must not be mutated by the shell",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await testInsertOnEmptyState();
  await testSkipIdenticalExistingIsNoOp();
  await testConflictPlannedExistingRejectsNoUpdate();
  await testTerminalExistingRejectsNoUpdate();
  await testActiveExistingRejectsNoUpdate();
  await testReadFailureMapsToReadFailed();
  await testUpdateFailureMapsToWriteFailed();
  await testChangedDuringUpdateRace();
  await testReplanConflictDuringUpdate();
  await testInvalidInputAndStore();
  await testInvalidIntentIsMapped();
  await testShellDoesNotMutateIntent();

  console.log(`${LABEL} PASS`);
}

main().catch((err) => {
  console.error(`${LABEL} FAIL`, err);
  process.exit(1);
});
