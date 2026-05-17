import * as assert from "assert/strict";

const LABEL = "[g-7-final-target-eligibility-recheck-smoke]";
const EXPECTED_SCHEMA_VERSION = "stage-a-entry-centric-v1";

type TargetDeltaStatus = "active" | "inactive" | "drained";

type EligibilityAction =
  | "dispatch_intent_allowed"
  | "planned_skipped"
  | "planned_hard_failure"
  | "rejected_fail_closed";

type EligibilityReason =
  | "target_eligible"
  | "target_inactive"
  | "target_drained"
  | "cooldown_active"
  | "missing_recipient_address"
  | "duplicate_evaluation_key"
  | "schema_version_mismatch"
  | "invalid_attempt_number"
  | "orphan_lock_detected";

interface SimulatedStateEntry {
  readonly stateKey: string;
  readonly batchId: string;
  readonly recipientAddress: string;
  readonly amountDecimal: string;
  readonly schemaVersion: string;
  readonly attemptNumber: number;
  readonly cooldownUntil: string | null;
}

interface SimulatedTargetDelta {
  readonly stateKey: string;
  readonly status: TargetDeltaStatus;
}

interface SimulatedLockState {
  readonly stateKey: string;
  readonly lockExists: boolean;
  readonly activeOwner: boolean;
}

interface EligibilityDecision {
  readonly ok: boolean;
  readonly action: EligibilityAction;
  readonly reason: EligibilityReason;
  readonly stateKey: string;
  readonly dispatchIntentExposureAllowed: boolean;
  readonly plannedTerminalReason: string | null;
}

interface EligibilityInput {
  readonly entry: SimulatedStateEntry;
  readonly delta: SimulatedTargetDelta;
  readonly locks: readonly SimulatedLockState[];
  readonly existingEvaluationKeys: readonly string[];
  readonly simulatedNowIso: string;
}

function isCanonicalIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isoLessThan(a: string, b: string): boolean {
  assert.equal(isCanonicalIso(a), true, "left ISO timestamp must be canonical");
  assert.equal(isCanonicalIso(b), true, "right ISO timestamp must be canonical");
  return a < b;
}

function reject(input: EligibilityInput, reason: EligibilityReason): EligibilityDecision {
  return {
    ok: false,
    action: "rejected_fail_closed",
    reason,
    stateKey: input.entry.stateKey,
    dispatchIntentExposureAllowed: false,
    plannedTerminalReason: null,
  };
}

function planTerminal(input: EligibilityInput, action: "planned_skipped" | "planned_hard_failure", reason: EligibilityReason): EligibilityDecision {
  return {
    ok: false,
    action,
    reason,
    stateKey: input.entry.stateKey,
    dispatchIntentExposureAllowed: false,
    plannedTerminalReason: reason,
  };
}

function allowDispatch(input: EligibilityInput): EligibilityDecision {
  return {
    ok: true,
    action: "dispatch_intent_allowed",
    reason: "target_eligible",
    stateKey: input.entry.stateKey,
    dispatchIntentExposureAllowed: true,
    plannedTerminalReason: null,
  };
}

function evaluateFinalEligibility(input: EligibilityInput): EligibilityDecision {
  assert.equal(isCanonicalIso(input.simulatedNowIso), true, "simulatedNowIso must be canonical");

  if (input.entry.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    return reject(input, "schema_version_mismatch");
  }

  if (input.entry.recipientAddress.trim() === "") {
    return reject(input, "missing_recipient_address");
  }

  if (!Number.isInteger(input.entry.attemptNumber) || input.entry.attemptNumber < 1) {
    return reject(input, "invalid_attempt_number");
  }

  const matchingLocks = input.locks.filter((lock) => lock.stateKey === input.entry.stateKey && lock.lockExists);
  if (matchingLocks.some((lock) => !lock.activeOwner)) {
    return reject(input, "orphan_lock_detected");
  }

  const duplicateCount = input.existingEvaluationKeys.filter((key) => key === input.entry.stateKey).length;
  if (duplicateCount > 1) {
    return reject(input, "duplicate_evaluation_key");
  }

  if (input.entry.cooldownUntil !== null && isoLessThan(input.simulatedNowIso, input.entry.cooldownUntil)) {
    return reject(input, "cooldown_active");
  }

  if (input.delta.stateKey !== input.entry.stateKey) {
    return reject(input, "duplicate_evaluation_key");
  }

  if (input.delta.status === "inactive") {
    return planTerminal(input, "planned_skipped", "target_inactive");
  }

  if (input.delta.status === "drained") {
    return planTerminal(input, "planned_hard_failure", "target_drained");
  }

  return allowDispatch(input);
}

const BATCH_ID = "campaign-g7-batch-1";
const RECIPIENT = "EQDestinationG7";
const STATE_KEY = "campaign-g7-batch-1::eqdestinationg7";
const NOW_ISO = "2026-01-01T00:00:00.000Z";
const FUTURE_COOLDOWN = "2026-01-01T00:05:00.000Z";
const EXPIRED_COOLDOWN = "2025-12-31T23:55:00.000Z";

function makeStateEntry(overrides: Partial<SimulatedStateEntry> = {}): SimulatedStateEntry {
  return {
    stateKey: STATE_KEY,
    batchId: BATCH_ID,
    recipientAddress: RECIPIENT,
    amountDecimal: "777888999",
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    attemptNumber: 1,
    cooldownUntil: null,
    ...overrides,
  };
}

function makeTargetDelta(overrides: Partial<SimulatedTargetDelta> = {}): SimulatedTargetDelta {
  return {
    stateKey: STATE_KEY,
    status: "active",
    ...overrides,
  };
}

function makeEligibilityInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    entry: makeStateEntry(),
    delta: makeTargetDelta(),
    locks: [],
    existingEvaluationKeys: [STATE_KEY],
    simulatedNowIso: NOW_ISO,
    ...overrides,
  };
}

function assertRejected(decision: EligibilityDecision, reason: EligibilityReason): void {
  assert.equal(decision.ok, false);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, reason);
  assert.equal(decision.dispatchIntentExposureAllowed, false);
}

function assertTerminalPlan(decision: EligibilityDecision, action: "planned_skipped" | "planned_hard_failure", reason: EligibilityReason): void {
  assert.equal(decision.ok, false);
  assert.equal(decision.action, action);
  assert.equal(decision.reason, reason);
  assert.equal(decision.plannedTerminalReason, reason);
  assert.equal(decision.dispatchIntentExposureAllowed, false);
}

function assertDispatchAllowed(decision: EligibilityDecision): void {
  assert.equal(decision.ok, true);
  assert.equal(decision.action, "dispatch_intent_allowed");
  assert.equal(decision.reason, "target_eligible");
  assert.equal(decision.dispatchIntentExposureAllowed, true);
  assert.equal(decision.plannedTerminalReason, null);
}

function testActiveTargetPlansDispatchIntentAllowed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput());
  assertDispatchAllowed(decision);
}

function testInactiveTargetPlansSkippedWithReason(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    delta: makeTargetDelta({ status: "inactive" }),
  }));
  assertTerminalPlan(decision, "planned_skipped", "target_inactive");
}

function testDrainedTargetPlansHardFailureWithReason(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    delta: makeTargetDelta({ status: "drained" }),
  }));
  assertTerminalPlan(decision, "planned_hard_failure", "target_drained");
}

function testFutureCooldownBlocksEvaluation(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    entry: makeStateEntry({
      cooldownUntil: FUTURE_COOLDOWN,
    }),
  }));
  assertRejected(decision, "cooldown_active");
}

function testExpiredCooldownAllowsEvaluation(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    entry: makeStateEntry({
      cooldownUntil: EXPIRED_COOLDOWN,
    }),
  }));
  assertDispatchAllowed(decision);
}

function testRawBigIntSerializationIsRejected(): void {
  const unsafePayload = {
    stateKey: STATE_KEY,
    amount: 777888999n,
  };

  assert.throws(
    () => JSON.stringify(unsafePayload),
    TypeError,
    "raw bigint JSON serialization must throw",
  );
}

function testAmountDecimalStringSerializesDeterministically(): void {
  const safePayload = {
    stateKey: STATE_KEY,
    amountDecimal: "777888999",
  };

  assert.equal(
    JSON.stringify(safePayload),
    "{\"stateKey\":\"campaign-g7-batch-1::eqdestinationg7\",\"amountDecimal\":\"777888999\"}",
    "amountDecimal string must serialize deterministically",
  );
}

function testSimulatedOrphanLockFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    locks: [{
      stateKey: STATE_KEY,
      lockExists: true,
      activeOwner: false,
    }],
  }));

  assertRejected(decision, "orphan_lock_detected");
}

function testMissingRecipientAddressFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    entry: makeStateEntry({
      recipientAddress: "",
    }),
  }));

  assertRejected(decision, "missing_recipient_address");
}

function testDuplicateEvaluationKeyFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    existingEvaluationKeys: [STATE_KEY, STATE_KEY],
  }));

  assertRejected(decision, "duplicate_evaluation_key");
}

function testSchemaVersionMismatchFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    entry: makeStateEntry({
      schemaVersion: "bad-schema-version",
    }),
  }));

  assertRejected(decision, "schema_version_mismatch");
}


function testInvalidAttemptNumberFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    entry: makeStateEntry({
      attemptNumber: 0,
    }),
  }));

  assertRejected(decision, "invalid_attempt_number");
}

function testDeltaStateKeyMismatchFailsClosed(): void {
  const decision = evaluateFinalEligibility(makeEligibilityInput({
    delta: makeTargetDelta({
      stateKey: "campaign-g7-batch-1::other-target",
    }),
  }));

  assertRejected(decision, "duplicate_evaluation_key");
}

function main(): void {
  testActiveTargetPlansDispatchIntentAllowed();
  testInactiveTargetPlansSkippedWithReason();
  testDrainedTargetPlansHardFailureWithReason();
  testFutureCooldownBlocksEvaluation();
  testExpiredCooldownAllowsEvaluation();
  testRawBigIntSerializationIsRejected();
  testAmountDecimalStringSerializesDeterministically();
  testSimulatedOrphanLockFailsClosed();
  testMissingRecipientAddressFailsClosed();
  testDuplicateEvaluationKeyFailsClosed();
  testSchemaVersionMismatchFailsClosed();
  testInvalidAttemptNumberFailsClosed();
  testDeltaStateKeyMismatchFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();
