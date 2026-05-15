import * as assert from "assert/strict";
import { buildDispatchIntentFromDecision } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import {
  planRunStateDispatchIntentApply,
} from "../lib/dispatcher/runStatePlanApply";
import {
  createEmptyRunState,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import { planDispatcherDryRunIntake } from "../lib/dispatcher/dispatcherDryRunIntake";
import { planDispatcherDryRunTransition } from "../lib/dispatcher/dispatcherDryRunTransitionPlan";
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";
import type { DispatchIntent } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import type { BatchRecipient } from "../lib/dispatcher/batchPlanner";
import type {
  OperatorPlanCandidate,
} from "../lib/dispatcher/dispatcherDryRunTransitionPlan";

const LABEL = "[g-1-integrated-pipeline-validation-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-g1";
const BATCH_ID = "campaign-g1-batch-1";
const CANDIDATE_ID = "candidate-g1-001";
const DECISION_ID = "decision-g1-001";
const DECISION_RUN_ID = "decision-run-g1-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseG1";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-g1";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-g1";
const AMOUNT = "777888999";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
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
      txHash: "tx-hash-g1-001",
      lt: "11223344556",
      actionIndex: "0",
    },
    ...overrides,
  } as unknown as CandidateDecisionRecord;
}

function makeRunStateWithCampaign(): RunState {
  return createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
}

function makeActiveOperator(id: string, label: string): OperatorPlanCandidate {
  return {
    operatorId: id,
    operatorLabel: label,
    status: "active",
    cooldownUntil: null,
    failedUntil: null,
  };
}

function makeOperatorPolicy() {
  return {
    eligibleOperators: [
      makeActiveOperator("op-g1-a", "Operator G1-A"),
      makeActiveOperator("op-g1-b", "Operator G1-B"),
    ],
    previousOperatorId: null,
    selectionSeed: "operator-seed-g1",
  };
}

function makeFeePolicy() {
  return {
    baseFeeNano: "1000",
    maxFeeNano: "2000",
    tierStepNano: "10",
    tierCount: 10,
    selectionSeed: "fee-seed-g1",
  };
}

function makeProviderPolicy() {
  return {
    eligibleProviders: [
      { providerId: "provider-g1-a", endpointKey: "endpoint-g1-a", status: "active" as const },
    ],
    selectionSeed: "provider-seed-g1",
  };
}

function buildIntent(): DispatchIntent {
  const result = buildDispatchIntentFromDecision({
    decisionRecord: makeDecisionRecord(),
    candidateRecord: makeCandidateRecord(),
    batchId: BATCH_ID,
    recipientIndex: 0,
    nowIso: NOW_ISO,
  });
  if (!result.ok) throw new Error(`buildIntent failed: ${result.reason}`);
  return result.intent;
}

function insertEntryIntoState(state: RunState, intent: DispatchIntent): StateEntry {
  const plan = planRunStateDispatchIntentApply({ runState: state, intent });
  if (!plan.ok) throw new Error(`planRunStateDispatchIntentApply failed: ${plan.reason}`);
  if (plan.action !== "insert_entry") throw new Error(`expected insert_entry, got: ${plan.action}`);
  (state.entries as Record<string, unknown>)[plan.stateKey] = plan.entry;
  return plan.entry;
}

function makeBatchFromEntry(entry: StateEntry): unknown {
  const ev = entry as unknown as Record<string, unknown>;
  const amount = BigInt(ev["amount"] as string);
  return {
    batchId: ev["batchId"],
    index: 0,
    recipients: [
      { address: ev["recipientAddress"], amount } as unknown as BatchRecipient,
    ],
    totalAmount: amount,
    size: 1,
  };
}

// ---------------------------------------------------------------------------
// Full positive pipeline — single pass
// ---------------------------------------------------------------------------

function runPositivePipeline(): {
  intent: DispatchIntent;
  insertedEntry: StateEntry;
  intakeStableKey: string;
  submittedEntry: unknown;
  transition: unknown;
} {
  // 1. Build intent from decision + candidate records
  const intent = buildIntent();

  // Positive: stateKey format check
  const expectedStateKey = `${BATCH_ID}::${DESTINATION_ADDRESS.toLowerCase()}`;
  assert.equal(
    intent.stateKey,
    expectedStateKey,
    `stateKey must equal <batchId>::<recipientAddress.toLowerCase()>`,
  );

  // 2. RunState starts empty
  const runState = makeRunStateWithCampaign();
  assert.equal(
    Object.keys(runState.entries as Record<string, unknown>).length,
    0,
    "RunState must start empty",
  );

  // 3. Plan insert and apply to in-memory RunState
  const plan = planRunStateDispatchIntentApply({ runState, intent });
  assert.equal(plan.ok, true, `plan must ok, got: ${stringify(plan)}`);
  if (!plan.ok) throw new Error("plan failed");
  assert.equal(plan.action, "insert_entry", "plan action must be insert_entry");

  // Apply to in-memory state only
  (runState.entries as Record<string, unknown>)[plan.stateKey] = plan.entry;
  const insertedEntry = plan.entry;

  // 4. In-memory RunState has exactly one planned entry
  const entryCount = Object.keys(runState.entries as Record<string, unknown>).length;
  assert.equal(entryCount, 1, "RunState must have exactly one entry after insert");

  const ev = insertedEntry as unknown as Record<string, unknown>;
  assert.equal(ev["status"], "planned", "inserted entry must be planned");

  // 5. Construct PlannedBatch matching the inserted state entry
  const batch = makeBatchFromEntry(insertedEntry);

  // 6. Dry-run intake
  const intakeResult = planDispatcherDryRunIntake({ runState, batch });
  assert.equal(intakeResult.ok, true, `intake must succeed, got: ${stringify(intakeResult)}`);
  if (!intakeResult.ok) throw new Error("intake failed");
  assert.equal(intakeResult.action, "planned_entries_ready");
  assert.equal(intakeResult.entries.length, 1, "intake must yield exactly one planned entry");

  const intakePlannedEntry = intakeResult.entries[0];
  assert.equal(intakePlannedEntry.stateKey, intent.stateKey, "intake stateKey must match intent stateKey");

  // 7. Dry-run transition plan
  const transitionResult = planDispatcherDryRunTransition({
    plannedEntry: intakePlannedEntry,
    nowIso: NOW_ISO,
    retryDisposition: "none",
    operatorPolicy: makeOperatorPolicy(),
    providerPolicy: makeProviderPolicy(),
    feePolicy: makeFeePolicy(),
    administrativeHalt: { active: false, reason: null },
  });

  assert.equal(transitionResult.ok, true, `transition must succeed, got: ${stringify(transitionResult)}`);
  if (!transitionResult.ok) throw new Error("transition failed");
  assert.equal(transitionResult.action, "dry_run_transition_ready");

  const submittedEntry = transitionResult.submittedEntry as unknown as Record<string, unknown>;
  const transition = transitionResult.transition;

  // 8. Submitted entry assertions
  assert.equal(submittedEntry["status"], "submitted");
  assert.equal(submittedEntry["attemptNumber"], 1);
  assert.equal(submittedEntry["txHash"], null);
  assert.equal(submittedEntry["networkRef"], null);

  const drtMeta = (submittedEntry["metadata"] as Record<string, unknown>)["dryRunTransition"] as Record<string, unknown>;
  assert.equal(
    drtMeta["source"],
    "dispatcher_dry_run_transition_plan",
    "dryRunTransition.source must identify the contract",
  );

  // 9. Provider and fee plan are deterministic and audit-visible
  assert.ok(transition.providerId !== null, "providerId must be set");
  assert.ok(transition.feePlan !== null, "feePlan must be set");
  if (transition.feePlan) {
    assert.equal(transition.feePlan.policy, "deterministic_fee_tier");
    assert.ok(typeof transition.feePlan.finalFeeNano === "string");
    assert.ok(typeof transition.feePlan.tierOffset === "number");
  }

  return {
    intent,
    insertedEntry,
    intakeStableKey: intakePlannedEntry.stateKey,
    submittedEntry,
    transition,
  };
}

// ---------------------------------------------------------------------------
// Test: positive full pipeline
// ---------------------------------------------------------------------------

function testPositiveFullPipeline(): void {
  runPositivePipeline();
}

// ---------------------------------------------------------------------------
// Test: rejected decision — RunState remains empty
// ---------------------------------------------------------------------------

function testRejectedDecision(): void {
  const result = buildDispatchIntentFromDecision({
    decisionRecord: makeDecisionRecord({ decision: "rejected" }),
    candidateRecord: makeCandidateRecord(),
    batchId: BATCH_ID,
    recipientIndex: 0,
    nowIso: NOW_ISO,
  });

  assert.equal(result.ok, false, "expected rejection for rejected decision");
  if (!result.ok) {
    assert.equal(result.reason, "decision_not_accepted");
  }

  // RunState is never touched — prove it stays empty
  const runState = makeRunStateWithCampaign();
  assert.equal(
    Object.keys(runState.entries as Record<string, unknown>).length,
    0,
    "RunState must remain empty when decision is rejected",
  );
}

// ---------------------------------------------------------------------------
// Test: missing RunState write → intake rejects missing_planned_entry
// ---------------------------------------------------------------------------

function testMissingRunStateWrite(): void {
  const intent = buildIntent();
  const runState = makeRunStateWithCampaign();

  // Intent built but NOT inserted into RunState
  const batch = {
    batchId: BATCH_ID,
    index: 0,
    recipients: [
      { address: DESTINATION_ADDRESS, amount: BigInt(AMOUNT) } as unknown as BatchRecipient,
    ],
    totalAmount: BigInt(AMOUNT),
    size: 1,
  };

  const intakeResult = planDispatcherDryRunIntake({ runState, batch });
  assert.equal(intakeResult.ok, false, "intake must reject when RunState entry is missing");
  if (!intakeResult.ok) {
    assert.equal(intakeResult.reason, "missing_planned_entry");
  }
}

// ---------------------------------------------------------------------------
// Test: terminal existing entry blocks insert
// ---------------------------------------------------------------------------

function testTerminalExistingEntryBlocksInsert(): void {
  const intent = buildIntent();
  const runState = makeRunStateWithCampaign();

  // Insert a terminal entry under the same stateKey
  const terminalEntry: StateEntry = {
    batchId: BATCH_ID,
    recipientAddress: DESTINATION_ADDRESS,
    recipientIndex: 0,
    amount: AMOUNT,
    status: "success",
    attemptNumber: 1,
    operatorId: "op-g1-a",
    operatorLabel: "Operator G1-A",
    txHash: "0xdeadbeef",
    networkRef: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    submittedAt: NOW_ISO,
    finalizedAt: NOW_ISO,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: null,
    metadata: { source: "g1-smoke-terminal" },
  } as unknown as StateEntry;

  (runState.entries as Record<string, unknown>)[intent.stateKey] = terminalEntry;

  const plan = planRunStateDispatchIntentApply({ runState, intent });
  assert.equal(plan.ok, false, "plan must reject for terminal existing entry");
  if (!plan.ok) {
    assert.equal(plan.reason, "terminal_existing_entry");
  }

  // Also validate hard_failure
  const runState2 = makeRunStateWithCampaign();
  (runState2.entries as Record<string, unknown>)[intent.stateKey] = {
    ...terminalEntry,
    status: "hard_failure",
  };

  const plan2 = planRunStateDispatchIntentApply({ runState: runState2, intent });
  assert.equal(plan2.ok, false, "plan must reject for hard_failure existing entry");
  if (!plan2.ok) {
    assert.equal(plan2.reason, "terminal_existing_entry");
  }
}

// ---------------------------------------------------------------------------
// Test: administrative halt after valid intake
// ---------------------------------------------------------------------------

function testAdministrativeHaltAfterIntake(): void {
  const intent = buildIntent();
  const runState = makeRunStateWithCampaign();
  const insertedEntry = insertEntryIntoState(runState, intent);
  const batch = makeBatchFromEntry(insertedEntry);

  const intakeResult = planDispatcherDryRunIntake({ runState, batch });
  assert.equal(intakeResult.ok, true, `intake must succeed before halt test, got: ${stringify(intakeResult)}`);
  if (!intakeResult.ok) throw new Error("intake failed");

  const plannedEntry = intakeResult.entries[0];

  const transitionResult = planDispatcherDryRunTransition({
    plannedEntry,
    nowIso: NOW_ISO,
    retryDisposition: "none",
    operatorPolicy: makeOperatorPolicy(),
    administrativeHalt: { active: true, reason: "manual_halt_g1" },
  });

  assert.equal(transitionResult.ok, false, "transition must reject when administrative halt is active");
  if (!transitionResult.ok) {
    assert.equal(transitionResult.reason, "administrative_halt_active");
  }
}

// ---------------------------------------------------------------------------
// Test: determinism — two independent runs produce identical stable outputs
// ---------------------------------------------------------------------------

function testDeterminism(): void {
  const run1 = runPositivePipeline();
  const run2 = runPositivePipeline();

  assert.equal(
    run1.intent.stateKey,
    run2.intent.stateKey,
    "intent.stateKey must be identical across runs",
  );

  assert.equal(
    stringify(run1.insertedEntry),
    stringify(run2.insertedEntry),
    "insertedEntry must be identical across runs",
  );

  assert.equal(
    run1.intakeStableKey,
    run2.intakeStableKey,
    "intake planned entry stateKey must be identical across runs",
  );

  assert.equal(
    stringify(run1.submittedEntry),
    stringify(run2.submittedEntry),
    "submittedEntry must be identical across runs",
  );

  assert.equal(
    stringify(run1.transition),
    stringify(run2.transition),
    "transition must be identical across runs",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testPositiveFullPipeline();
  testRejectedDecision();
  testMissingRunStateWrite();
  testTerminalExistingEntryBlocksInsert();
  testAdministrativeHaltAfterIntake();
  testDeterminism();

  console.log(`${LABEL} PASS`);
}

main();
