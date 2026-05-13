import * as assert from "assert/strict";
import { buildDispatchIntentFromDecision } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import { planRunStateDispatchIntentApply } from "../lib/dispatcher/runStatePlanApply";
import {
  createEmptyRunState,
  makeStateKey,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[f-2-runstate-plan-apply-contract-smoke]";

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-f2";
const BATCH_ID = "campaign-f2-batch-1";
const CANDIDATE_ID = "candidate-f2-001";
const DECISION_ID = "decision-f2-001";
const DECISION_RUN_ID = "decision-run-f2-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseF2";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-f2";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-f2";
const AMOUNT = "987654321";

type ReadyIntent = NonNullable<ReturnType<typeof getIntent>>;

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
      txHash: "tx-hash-f2-001",
      lt: "222222222",
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

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected valid dispatch intent");
  }

  return result.intent;
}

function emptyState(): RunState {
  return createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
}

function withEntry(entry: StateEntry): RunState {
  const state = emptyState();
  state.entries[makeStateKey(entry.batchId, entry.recipientAddress)] = entry;
  return state;
}

function cloneEntry(entry: StateEntry): StateEntry {
  return JSON.parse(JSON.stringify(entry)) as StateEntry;
}

function testInsertEntryWhenMissing(): void {
  const intent = getIntent();
  const result = planRunStateDispatchIntentApply({
    runState: emptyState(),
    intent,
  });

  assert.deepEqual(result, {
    ok: true,
    action: "insert_entry",
    stateKey: intent.stateKey,
    entry: intent.entry,
  });
}

function testSkipIdenticalExistingPlannedEntry(): void {
  const intent = getIntent();
  const state = withEntry(cloneEntry(intent.entry));

  const result = planRunStateDispatchIntentApply({ runState: state, intent });

  assert.deepEqual(result, {
    ok: true,
    action: "skip_identical_existing",
    stateKey: intent.stateKey,
    existingEntry: state.entries[intent.stateKey],
  });
}

function testRejectPlannedConflictSameStateKeyDifferentAmount(): void {
  const intent = getIntent();
  const existing = { ...cloneEntry(intent.entry), amount: "1" };
  const state = withEntry(existing);

  const result = planRunStateDispatchIntentApply({ runState: state, intent });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "existing_entry_conflict");
    assert.equal(result.stateKey, intent.stateKey);
    assert.deepEqual(result.existingEntry, existing);
  }
}

function testRejectTerminalExistingEntries(): void {
  const intent = getIntent();

  for (const status of ["success", "hard_failure", "skipped", "cancelled"] as const) {
    const existing: StateEntry = {
      ...cloneEntry(intent.entry),
      status,
      attemptNumber: 1,
      finalizedAt: NOW_ISO,
      txHash: status === "success" ? "dry-run-tx" : null,
      lastDecision: "none",
    };
    const state = withEntry(existing);

    const result = planRunStateDispatchIntentApply({ runState: state, intent });

    assert.equal(result.ok, false, `expected terminal rejection for ${status}`);
    if (!result.ok) {
      assert.equal(result.reason, "terminal_existing_entry");
      assert.equal(result.stateKey, intent.stateKey);
      assert.deepEqual(result.existingEntry, existing);
    }
  }
}

function testRejectActiveExistingEntries(): void {
  const intent = getIntent();

  for (const status of ["submitted", "cooldown"] as const) {
    const existing: StateEntry = {
      ...cloneEntry(intent.entry),
      status,
      attemptNumber: 1,
      submittedAt: NOW_ISO,
      cooldownUntil: status === "cooldown" ? "2026-01-01T00:01:00.000Z" : null,
      lastDecision: "none",
    };
    const state = withEntry(existing);

    const result = planRunStateDispatchIntentApply({ runState: state, intent });

    assert.equal(result.ok, false, `expected active rejection for ${status}`);
    if (!result.ok) {
      assert.equal(result.reason, "active_existing_entry");
      assert.equal(result.stateKey, intent.stateKey);
      assert.deepEqual(result.existingEntry, existing);
    }
  }
}

function testRejectStateKeyMismatch(): void {
  const intent = getIntent();
  const badIntent: ReadyIntent = { ...intent, stateKey: "wrong::state-key" };

  const result = planRunStateDispatchIntentApply({
    runState: emptyState(),
    intent: badIntent,
  });

  assert.deepEqual(result, {
    ok: false,
    action: "rejected",
    reason: "state_key_mismatch",
    stateKey: "wrong::state-key",
  });
}

function testRejectIntentEntryMismatch(): void {
  const intent = getIntent();

  const badStatus: ReadyIntent = {
    ...intent,
    entry: { ...intent.entry, status: "submitted" },
  };
  const badAttempt: ReadyIntent = {
    ...intent,
    entry: { ...intent.entry, attemptNumber: 1 },
  };

  for (const badIntent of [badStatus, badAttempt]) {
    const result = planRunStateDispatchIntentApply({
      runState: emptyState(),
      intent: badIntent,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "intent_entry_mismatch");
      assert.equal(result.stateKey, intent.stateKey);
    }
  }
}

function testRejectInvalidRunStateAndIntent(): void {
  assert.deepEqual(planRunStateDispatchIntentApply(null), {
    ok: false,
    action: "rejected",
    reason: "invalid_input",
  });

  assert.deepEqual(
    planRunStateDispatchIntentApply({ runState: {}, intent: getIntent() }),
    { ok: false, action: "rejected", reason: "invalid_run_state" },
  );

  assert.deepEqual(
    planRunStateDispatchIntentApply({ runState: emptyState(), intent: {} }),
    { ok: false, action: "rejected", reason: "invalid_intent" },
  );
}

function testDoesNotMutateInputs(): void {
  const intent = getIntent();
  const state = emptyState();

  const beforeState = JSON.stringify(state);
  const beforeIntent = JSON.stringify(intent);

  planRunStateDispatchIntentApply({ runState: state, intent });

  assert.equal(JSON.stringify(state), beforeState);
  assert.equal(JSON.stringify(intent), beforeIntent);
}

function testPlannedAttemptZeroIsAcceptedForIntentAndDuplicate(): void {
  const intent = getIntent();
  assert.equal(intent.entry.status, "planned");
  assert.equal(intent.entry.attemptNumber, 0);

  const state = withEntry(cloneEntry(intent.entry));
  const result = planRunStateDispatchIntentApply({ runState: state, intent });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.action, "skip_identical_existing");
  }
}

function main(): void {
  testInsertEntryWhenMissing();
  testSkipIdenticalExistingPlannedEntry();
  testRejectPlannedConflictSameStateKeyDifferentAmount();
  testRejectTerminalExistingEntries();
  testRejectActiveExistingEntries();
  testRejectStateKeyMismatch();
  testRejectIntentEntryMismatch();
  testRejectInvalidRunStateAndIntent();
  testDoesNotMutateInputs();
  testPlannedAttemptZeroIsAcceptedForIntentAndDuplicate();

  console.log(`${LABEL} PASS`);
}

main();
