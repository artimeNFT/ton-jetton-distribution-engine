import * as assert from "assert/strict";
import { planDispatcherDryRunIntake } from "../lib/dispatcher/dispatcherDryRunIntake";
import {
  createEmptyRunState,
  makeStateKey,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import type { PlannedBatch, BatchRecipient } from "../lib/dispatcher/batchPlanner";

const LABEL = "[f-4-dispatcher-dry-run-intake-boundary-smoke]";

// ---------------------------------------------------------------------------
// Fixed constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-f4";
const BATCH_ID = "campaign-f4-batch-1";
const RECIPIENT_A = "EQRecipientMixedCaseF4A";
const RECIPIENT_B = "EQRecipientMixedCaseF4B";
const AMOUNT_A = 111n;
const AMOUNT_B = 222n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipient(address: string, amount: bigint): BatchRecipient {
  return { address, amount } as unknown as BatchRecipient;
}

const recipientA = makeRecipient(RECIPIENT_A, AMOUNT_A);
const recipientB = makeRecipient(RECIPIENT_B, AMOUNT_B);

function makeBatch(overrides: Partial<PlannedBatch> = {}): PlannedBatch {
  return {
    batchId: BATCH_ID,
    index: 0,
    recipients: [recipientA, recipientB],
    totalAmount: AMOUNT_A + AMOUNT_B,
    size: 2,
    ...overrides,
  } as unknown as PlannedBatch;
}

function makePlannedEntry(
  recipient: BatchRecipient,
  index: number,
  overrides: Partial<StateEntry> = {},
): StateEntry {
  const rv = recipient as unknown as Record<string, unknown>;
  return {
    batchId: BATCH_ID,
    recipientAddress: rv["address"] as string,
    recipientIndex: index,
    amount: (rv["amount"] as bigint).toString(),
    status: "planned",
    attemptNumber: 0,
    operatorId: null,
    operatorLabel: null,
    txHash: null,
    networkRef: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    submittedAt: null,
    finalizedAt: null,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: null,
    metadata: { source: "f4-smoke" },
    ...overrides,
  } as unknown as StateEntry;
}

function makeStateWithEntries(batch: PlannedBatch): RunState {
  const bv = batch as unknown as Record<string, unknown>;
  const state = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  const recipients = bv["recipients"] as unknown[];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i] as BatchRecipient;
    const rv = r as unknown as Record<string, unknown>;
    const address = rv["address"] as string;
    const key = makeStateKey(bv["batchId"] as string, address);
    (state.entries as Record<string, unknown>)[key] = makePlannedEntry(r, i);
  }
  return state;
}

function cloneState(state: RunState): RunState {
  return JSON.parse(JSON.stringify(state)) as RunState;
}

function stringifyForError(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}

// ---------------------------------------------------------------------------
// Test 1: valid planned entries ready
// ---------------------------------------------------------------------------

function testValidPlannedEntriesReady(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, true, `expected ok, got: ${stringifyForError(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "planned_entries_ready");
  assert.equal(result.batchId, BATCH_ID);
  assert.equal(result.entries.length, 2);

  assert.equal(result.entries[0].originalIndex, 0);
  assert.equal(result.entries[1].originalIndex, 1);

  assert.equal(
    result.entries[0].stateKey,
    makeStateKey(BATCH_ID, RECIPIENT_A),
  );
  assert.equal(
    result.entries[1].stateKey,
    makeStateKey(BATCH_ID, RECIPIENT_B),
  );
}

// ---------------------------------------------------------------------------
// Test 2: missing entry rejects fail-closed
// ---------------------------------------------------------------------------

function testMissingEntryRejectsFailClosed(): void {
  const batch = makeBatch();
  const state = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  // Only insert entry for A, not B
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(recipientA, 0);

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "missing_planned_entry");
    assert.equal(result.stateKey, makeStateKey(BATCH_ID, RECIPIENT_B));
  }
}

// ---------------------------------------------------------------------------
// Test 3: entry_not_planned rejects (status submitted)
// ---------------------------------------------------------------------------

function testEntryNotPlannedRejectsSubmitted(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recipientA, 0, { status: "submitted" } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "entry_not_planned");
  }
}

// ---------------------------------------------------------------------------
// Test 4: terminal entry rejects (status success)
// ---------------------------------------------------------------------------

function testTerminalEntryRejects(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recipientA, 0, { status: "success" } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "entry_not_planned");
  }
}

// ---------------------------------------------------------------------------
// Test 5: batch_id_mismatch rejects
// ---------------------------------------------------------------------------

function testBatchIdMismatchRejects(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recipientA, 0, { batchId: "wrong-batch-id" } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "batch_id_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Test 6: state_key_mismatch rejects
// ---------------------------------------------------------------------------

function testStateKeyMismatchRejects(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  // Entry is stored under A's key but has a different recipientAddress
  // so makeStateKey(entry.batchId, entry.recipientAddress) != keyA
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recipientA, 0, { recipientAddress: RECIPIENT_B } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "state_key_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Test 7: case-insensitive recipient address match succeeds
// ---------------------------------------------------------------------------

function testCaseInsensitiveRecipientAddressMatchSucceeds(): void {
  // batch recipient address uses lower-case version
  const lowerA = RECIPIENT_A.toLowerCase();
  const lowerB = RECIPIENT_B.toLowerCase();
  const recA = makeRecipient(lowerA, AMOUNT_A);
  const recB = makeRecipient(lowerB, AMOUNT_B);

  const batch = makeBatch({
    recipients: [recA, recB],
  } as any);

  const state = createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
  // existing entries use mixed-case address but stored under lower-case key
  const keyA = makeStateKey(BATCH_ID, lowerA);
  const keyB = makeStateKey(BATCH_ID, lowerB);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recA, 0, { recipientAddress: RECIPIENT_A } as any,
  );
  (state.entries as Record<string, unknown>)[keyB] = makePlannedEntry(
    recB, 1, { recipientAddress: RECIPIENT_B } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, true, `expected ok for case-insensitive match, got: ${stringifyForError(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "planned_entries_ready");
  assert.equal(result.entries.length, 2);
}

// ---------------------------------------------------------------------------
// Test 8: amount_mismatch rejects
// ---------------------------------------------------------------------------

function testAmountMismatchRejects(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);
  const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
  (state.entries as Record<string, unknown>)[keyA] = makePlannedEntry(
    recipientA, 0, { amount: "999999" } as any,
  );

  const result = planDispatcherDryRunIntake({ runState: state, batch });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "amount_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Test 9: invalid_entry rejects
// ---------------------------------------------------------------------------

function testInvalidEntryRejects(): void {
  const batch = makeBatch();

  // status is "weird"
  {
    const state = makeStateWithEntries(batch);
    const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
    (state.entries as Record<string, unknown>)[keyA] = {
      ...makePlannedEntry(recipientA, 0),
      status: "weird",
    };
    const result = planDispatcherDryRunIntake({ runState: state, batch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_entry");
  }

  // missing createdAt
  {
    const state = makeStateWithEntries(batch);
    const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
    const entry = makePlannedEntry(recipientA, 0) as unknown as Record<string, unknown>;
    const { createdAt: _c, ...entryWithout } = entry;
    (state.entries as Record<string, unknown>)[keyA] = entryWithout;
    const result = planDispatcherDryRunIntake({ runState: state, batch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_entry");
  }

  // empty createdAt
  {
    const state = makeStateWithEntries(batch);
    const keyA = makeStateKey(BATCH_ID, RECIPIENT_A);
    (state.entries as Record<string, unknown>)[keyA] = {
      ...makePlannedEntry(recipientA, 0),
      createdAt: "",
    };
    const result = planDispatcherDryRunIntake({ runState: state, batch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_entry");
  }
}

// ---------------------------------------------------------------------------
// Test 10: invalid batch rejects
// ---------------------------------------------------------------------------

function testInvalidBatchRejects(): void {
  const state = makeStateWithEntries(makeBatch());

  // size != recipients.length
  {
    const result = planDispatcherDryRunIntake({
      runState: state,
      batch: makeBatch({ size: 5 } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_batch");
  }

  // totalAmount sum mismatch
  {
    const result = planDispatcherDryRunIntake({
      runState: state,
      batch: makeBatch({ totalAmount: 1n } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_batch");
  }

  // empty recipients
  {
    const result = planDispatcherDryRunIntake({
      runState: state,
      batch: makeBatch({ recipients: [], size: 0, totalAmount: 0n } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_batch");
  }

  // invalid totalAmount 0n
  {
    const singleRec = [makeRecipient(RECIPIENT_A, AMOUNT_A)];
    const result = planDispatcherDryRunIntake({
      runState: state,
      batch: makeBatch({
        recipients: singleRec,
        size: 1,
        totalAmount: 0n,
      } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_batch");
  }
}

// ---------------------------------------------------------------------------
// Test 11: invalid recipient rejects
// ---------------------------------------------------------------------------

function testInvalidRecipientRejects(): void {
  // empty address
  {
    const badRecipients = [
      makeRecipient("", AMOUNT_A),
      makeRecipient(RECIPIENT_B, AMOUNT_B),
    ];
    const result = planDispatcherDryRunIntake({
      runState: createEmptyRunState(CAMPAIGN_ID, NOW_ISO),
      batch: makeBatch({
        recipients: badRecipients,
        totalAmount: AMOUNT_A + AMOUNT_B,
        size: 2,
      } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_recipient");
  }

  // amount 0n
  {
    const badRecipients = [
      makeRecipient(RECIPIENT_A, 0n),
      makeRecipient(RECIPIENT_B, AMOUNT_B),
    ];
    const result = planDispatcherDryRunIntake({
      runState: createEmptyRunState(CAMPAIGN_ID, NOW_ISO),
      batch: makeBatch({
        recipients: badRecipients,
        totalAmount: AMOUNT_B,
        size: 2,
      } as any),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_recipient");
  }
}

// ---------------------------------------------------------------------------
// Test 12: invalid runState/input rejects
// ---------------------------------------------------------------------------

function testInvalidRunStateAndInputRejects(): void {
  // null input
  {
    const result = planDispatcherDryRunIntake(null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
  }

  // runState = {}
  {
    const result = planDispatcherDryRunIntake({
      runState: {},
      batch: makeBatch(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_run_state");
  }
}

// ---------------------------------------------------------------------------
// Test 13: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const batch = makeBatch();
  const state = makeStateWithEntries(batch);

  const stateBefore = JSON.stringify(state);
  const batchBefore = JSON.stringify(batch, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );

  planDispatcherDryRunIntake({ runState: state, batch });

  const stateAfter = JSON.stringify(state);
  const batchAfter = JSON.stringify(batch, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );

  assert.equal(stateAfter, stateBefore, "state must not be mutated");
  assert.equal(batchAfter, batchBefore, "batch must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testValidPlannedEntriesReady();
  testMissingEntryRejectsFailClosed();
  testEntryNotPlannedRejectsSubmitted();
  testTerminalEntryRejects();
  testBatchIdMismatchRejects();
  testStateKeyMismatchRejects();
  testCaseInsensitiveRecipientAddressMatchSucceeds();
  testAmountMismatchRejects();
  testInvalidEntryRejects();
  testInvalidBatchRejects();
  testInvalidRecipientRejects();
  testInvalidRunStateAndInputRejects();
  testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();
