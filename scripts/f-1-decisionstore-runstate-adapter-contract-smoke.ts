import * as assert from "assert/strict";
import { buildDispatchIntentFromDecision } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import { makeStateKey } from "../lib/dispatcher/stateStore";
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";

const LABEL = "[f-1-decisionstore-runstate-adapter-contract-smoke]";

// ---------------------------------------------------------------------------
// Fixed constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const BATCH_ID = "campaign-f1-batch-1";
const RECIPIENT_INDEX = 0;
const CANDIDATE_ID = "candidate-f1-001";
const DECISION_ID = "decision-f1-001";
const DECISION_RUN_ID = "decision-run-f1-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseF1";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-f1";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-f1";
const AMOUNT = "123456789";

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
      txHash: "tx-hash-f1-001",
      lt: "12345678901",
      actionIndex: "0",
    },
    ...overrides,
  } as unknown as CandidateDecisionRecord;
}

function makeInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    decisionRecord: makeDecisionRecord(),
    candidateRecord: makeCandidateRecord(),
    batchId: BATCH_ID,
    recipientIndex: RECIPIENT_INDEX,
    nowIso: NOW_ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: valid accepted policy_accept builds dispatch intent
// ---------------------------------------------------------------------------

function testValidPolicyAcceptBuildsDispatchIntent(): void {
  const result = buildDispatchIntentFromDecision(makeInput());

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "dispatch_intent_ready");

  const { intent } = result;

  // stateKey
  assert.equal(intent.stateKey, makeStateKey(BATCH_ID, DESTINATION_ADDRESS));

  // entry fields
  assert.equal(intent.entry.batchId, BATCH_ID);
  assert.equal(intent.entry.recipientAddress, DESTINATION_ADDRESS);
  assert.equal(intent.entry.recipientIndex, RECIPIENT_INDEX);
  assert.equal(intent.entry.amount, AMOUNT);
  assert.equal(intent.entry.status, "planned");
  assert.equal(intent.entry.attemptNumber, 0);
  assert.equal(intent.entry.operatorId, null);
  assert.equal(intent.entry.operatorLabel, null);
  assert.equal(intent.entry.txHash, null);
  assert.equal(intent.entry.networkRef, null);
  assert.equal(intent.entry.createdAt, NOW_ISO);
  assert.equal(intent.entry.updatedAt, NOW_ISO);
  assert.equal(intent.entry.submittedAt, null);
  assert.equal(intent.entry.finalizedAt, null);
  assert.equal(intent.entry.cooldownUntil, null);
  assert.equal(intent.entry.lastErrorCode, null);
  assert.equal(intent.entry.lastError, null);
  assert.equal(intent.entry.lastDecision, null);

  // metadata
  const meta = intent.entry.metadata as Record<string, unknown>;
  assert.equal(meta["source"], "decision_store_adapter");
  assert.equal(meta["decisionId"], DECISION_ID);
  assert.equal(meta["candidateId"], CANDIDATE_ID);
  assert.equal(meta["decisionRunId"], DECISION_RUN_ID);
  assert.equal(meta["decisionReason"], "policy_accept");

  // evidence
  assert.equal(intent.evidence.decisionId, DECISION_ID);
  assert.equal(intent.evidence.candidateId, CANDIDATE_ID);
  assert.equal(intent.evidence.decisionRunId, DECISION_RUN_ID);
  assert.equal(intent.evidence.decisionReason, "policy_accept");
  assert.equal(intent.evidence.traceTxHash, "tx-hash-f1-001");
  assert.equal(intent.evidence.traceLt, "12345678901");
  assert.equal(intent.evidence.traceActionIndex, "0");
  assert.equal(intent.evidence.jettonMasterCanonicalKey, JETTON_MASTER_CANONICAL_KEY);
  assert.equal(intent.evidence.destinationCanonicalKey, DESTINATION_CANONICAL_KEY);
}

// ---------------------------------------------------------------------------
// Test 2: stateKey normalizes recipient address case
// ---------------------------------------------------------------------------

function testStateKeyNormalizesAddressCase(): void {
  const result = buildDispatchIntentFromDecision(makeInput());

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const expectedStateKey = `${BATCH_ID}::${DESTINATION_ADDRESS.toLowerCase()}`;
  assert.equal(result.intent.stateKey, expectedStateKey);
}

// ---------------------------------------------------------------------------
// Test 3: manual_override_accept is supported
// ---------------------------------------------------------------------------

function testManualOverrideAcceptSupported(): void {
  const result = buildDispatchIntentFromDecision(
    makeInput({
      decisionRecord: makeDecisionRecord({ decisionReason: "manual_override_accept" } as any),
    }),
  );

  assert.equal(result.ok, true, `expected ok for manual_override_accept, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(
    (result.intent.entry.metadata as Record<string, unknown>)["decisionReason"],
    "manual_override_accept",
  );
}

// ---------------------------------------------------------------------------
// Test 4: candidate_id_mismatch rejects
// ---------------------------------------------------------------------------

function testCandidateIdMismatchRejects(): void {
  const result = buildDispatchIntentFromDecision(
    makeInput({
      candidateRecord: makeCandidateRecord({ candidateId: "wrong-candidate-id" } as any),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "candidate_id_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Test 5: decision_not_accepted rejects when decision is "rejected"
// ---------------------------------------------------------------------------

function testDecisionNotAcceptedRejects(): void {
  const result = buildDispatchIntentFromDecision(
    makeInput({
      decisionRecord: makeDecisionRecord({ decision: "rejected" } as any),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "decision_not_accepted");
  }
}

// ---------------------------------------------------------------------------
// Test 6: unsupported_accept_reason rejects for "budget_exceeded"
// ---------------------------------------------------------------------------

function testUnsupportedAcceptReasonRejects(): void {
  const result = buildDispatchIntentFromDecision(
    makeInput({
      decisionRecord: makeDecisionRecord({ decisionReason: "budget_exceeded" } as any),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "unsupported_accept_reason");
  }
}

// ---------------------------------------------------------------------------
// Test 7: amount_mismatch rejects
// ---------------------------------------------------------------------------

function testAmountMismatchRejects(): void {
  const result = buildDispatchIntentFromDecision(
    makeInput({
      candidateRecord: makeCandidateRecord({ amount: "999999999" } as any),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "amount_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Test 8: invalid_amount rejects
// ---------------------------------------------------------------------------

function testInvalidAmountRejects(): void {
  for (const badAmount of ["0", "01", "abc"]) {
    const result = buildDispatchIntentFromDecision(
      makeInput({
        candidateRecord: makeCandidateRecord({ amount: badAmount } as any),
        decisionRecord: makeDecisionRecord({
          budgetSnapshot: { candidateAmount: badAmount },
        } as any),
      }),
    );
    assert.equal(result.ok, false, `expected rejection for amount="${badAmount}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_amount", `expected invalid_amount for amount="${badAmount}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 9: invalid_batch_id rejects
// ---------------------------------------------------------------------------

function testInvalidBatchIdRejects(): void {
  for (const badBatchId of ["", "   "]) {
    const result = buildDispatchIntentFromDecision(makeInput({ batchId: badBatchId }));
    assert.equal(result.ok, false, `expected rejection for batchId="${badBatchId}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_batch_id");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 10: invalid_recipient_index rejects
// ---------------------------------------------------------------------------

function testInvalidRecipientIndexRejects(): void {
  for (const badIndex of [-1, 1.5, "0"]) {
    const result = buildDispatchIntentFromDecision(
      makeInput({ recipientIndex: badIndex }),
    );
    assert.equal(result.ok, false, `expected rejection for recipientIndex=${JSON.stringify(badIndex)}`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_recipient_index");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 11: invalid_now_iso rejects
// ---------------------------------------------------------------------------

function testInvalidNowIsoRejects(): void {
  for (const badIso of ["", "not-iso"]) {
    const result = buildDispatchIntentFromDecision(makeInput({ nowIso: badIso }));
    assert.equal(result.ok, false, `expected rejection for nowIso="${badIso}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_now_iso");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 12: invalid_recipient_address rejects
// ---------------------------------------------------------------------------

function testInvalidRecipientAddressRejects(): void {
  for (const badAddr of ["", "   "]) {
    const result = buildDispatchIntentFromDecision(
      makeInput({
        candidateRecord: makeCandidateRecord({ destinationAddress: badAddr } as any),
      }),
    );
    assert.equal(result.ok, false, `expected rejection for destinationAddress="${badAddr}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_recipient_address");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 13: invalid_decision_record rejects missing budgetSnapshot or traceability
// ---------------------------------------------------------------------------

function testInvalidDecisionRecordRejects(): void {
  // missing budgetSnapshot
  {
    const dr = makeDecisionRecord() as unknown as Record<string, unknown>;
    const { budgetSnapshot: _bs, ...drWithout } = dr;
    const result = buildDispatchIntentFromDecision(
      makeInput({ decisionRecord: drWithout }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_decision_record");
    }
  }

  // missing traceability
  {
    const dr = makeDecisionRecord() as unknown as Record<string, unknown>;
    const { traceability: _tr, ...drWithout } = dr;
    const result = buildDispatchIntentFromDecision(
      makeInput({ decisionRecord: drWithout }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_decision_record");
    }
  }

  // traceability missing txHash
  {
    const result = buildDispatchIntentFromDecision(
      makeInput({
        decisionRecord: makeDecisionRecord({
          traceability: { lt: "123", actionIndex: "0" },
        } as any),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_decision_record");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 14: invalid_candidate_record rejects missing destinationCanonicalKey
// ---------------------------------------------------------------------------

function testInvalidCandidateRecordRejects(): void {
  const cr = makeCandidateRecord() as unknown as Record<string, unknown>;
  const { destinationCanonicalKey: _dck, ...crWithout } = cr;
  const result = buildDispatchIntentFromDecision(
    makeInput({ candidateRecord: crWithout }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_candidate_record");
  }
}

// ---------------------------------------------------------------------------
// Test 15: adapter does not mutate inputs
// ---------------------------------------------------------------------------

function testAdapterDoesNotMutateInputs(): void {
  const candidateRecord = makeCandidateRecord();
  const decisionRecord = makeDecisionRecord();

  const candidateBefore = JSON.stringify(candidateRecord);
  const decisionBefore = JSON.stringify(decisionRecord);

  buildDispatchIntentFromDecision({
    decisionRecord,
    candidateRecord,
    batchId: BATCH_ID,
    recipientIndex: RECIPIENT_INDEX,
    nowIso: NOW_ISO,
  });

  assert.equal(
    JSON.stringify(candidateRecord),
    candidateBefore,
    "candidateRecord must not be mutated",
  );
  assert.equal(
    JSON.stringify(decisionRecord),
    decisionBefore,
    "decisionRecord must not be mutated",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testValidPolicyAcceptBuildsDispatchIntent();
  testStateKeyNormalizesAddressCase();
  testManualOverrideAcceptSupported();
  testCandidateIdMismatchRejects();
  testDecisionNotAcceptedRejects();
  testUnsupportedAcceptReasonRejects();
  testAmountMismatchRejects();
  testInvalidAmountRejects();
  testInvalidBatchIdRejects();
  testInvalidRecipientIndexRejects();
  testInvalidNowIsoRejects();
  testInvalidRecipientAddressRejects();
  testInvalidDecisionRecordRejects();
  testInvalidCandidateRecordRejects();
  testAdapterDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();
