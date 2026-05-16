import * as assert from "assert/strict";

const LABEL = "[g-4-uncertain-submission-seqno-recovery-smoke]";

type RecoveryAction =
  | "resume_allowed"
  | "recovery_quarantined"
  | "rejected_fail_closed";

type RecoveryReason =
  | "ready_to_resume"
  | "uncertain_submission_active"
  | "simulated_seqno_mismatch"
  | "stale_local_seqno"
  | "duplicate_dispatch_intent"
  | "malformed_run_state"
  | "missing_run_state_entry";

interface SimulatedRecoveryInput {
  readonly stateKey: string;
  readonly simulatedNowIso: string;
  readonly runStateEntry: Record<string, unknown> | null;
  readonly localAccountSequence: number;
  readonly reportedAccountSequence: number;
  readonly latestObservedAccountSequence: number;
  readonly pendingUncertainSubmission: boolean;
  readonly uncertaintyExpiresAt: string | null;
  readonly replacementIntentExposed: boolean;
}

interface SimulatedRecoveryDecision {
  readonly ok: boolean;
  readonly action: RecoveryAction;
  readonly reason: RecoveryReason;
  readonly stateKey: string;
  readonly dispatchIntentExposureAllowed: boolean;
  readonly operatorMutationAllowed: boolean;
}

function isCanonicalIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isoLessThan(a: string, b: string): boolean {
  assert.equal(isCanonicalIso(a), true, "left ISO timestamp must be canonical");
  assert.equal(isCanonicalIso(b), true, "right ISO timestamp must be canonical");
  return a < b;
}

function rejected(input: SimulatedRecoveryInput, reason: RecoveryReason): SimulatedRecoveryDecision {
  return {
    ok: false,
    action: "rejected_fail_closed",
    reason,
    stateKey: input.stateKey,
    dispatchIntentExposureAllowed: false,
    operatorMutationAllowed: false,
  };
}

function quarantined(input: SimulatedRecoveryInput, reason: RecoveryReason): SimulatedRecoveryDecision {
  return {
    ok: false,
    action: "recovery_quarantined",
    reason,
    stateKey: input.stateKey,
    dispatchIntentExposureAllowed: false,
    operatorMutationAllowed: false,
  };
}

function resumeAllowed(input: SimulatedRecoveryInput): SimulatedRecoveryDecision {
  return {
    ok: true,
    action: "resume_allowed",
    reason: "ready_to_resume",
    stateKey: input.stateKey,
    dispatchIntentExposureAllowed: true,
    operatorMutationAllowed: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidRecoveryEntry(entry: unknown, expectedStateKey: string): entry is Record<string, unknown> {
  if (!isRecord(entry)) return false;
  if (entry["stateKey"] !== expectedStateKey) return false;
  if (entry["status"] !== "submitted") return false;
  if (!isCanonicalIso(entry["updatedAt"])) return false;
  if (!isCanonicalIso(entry["submittedAt"])) return false;
  if (entry["txHash"] !== null) return false;
  if (entry["networkRef"] !== null) return false;
  return true;
}

function assertBlocked(decision: SimulatedRecoveryDecision): void {
  assert.equal(decision.ok, false);
  assert.equal(decision.dispatchIntentExposureAllowed, false);
  assert.equal(decision.operatorMutationAllowed, false);
}

function evaluateSimulatedRecovery(input: SimulatedRecoveryInput): SimulatedRecoveryDecision {
  assert.equal(isCanonicalIso(input.simulatedNowIso), true, "simulatedNowIso must be canonical");

  if (input.runStateEntry === null) {
    return rejected(input, "missing_run_state_entry");
  }

  if (!isValidRecoveryEntry(input.runStateEntry, input.stateKey)) {
    return rejected(input, "malformed_run_state");
  }

  if (input.replacementIntentExposed) {
    return rejected(input, "duplicate_dispatch_intent");
  }

  if (input.localAccountSequence < input.latestObservedAccountSequence) {
    return rejected(input, "stale_local_seqno");
  }

  if (input.reportedAccountSequence !== input.latestObservedAccountSequence) {
    return rejected(input, "simulated_seqno_mismatch");
  }

  if (input.pendingUncertainSubmission) {
    if (input.uncertaintyExpiresAt === null) {
      return quarantined(input, "uncertain_submission_active");
    }
    assert.equal(isCanonicalIso(input.uncertaintyExpiresAt), true, "uncertaintyExpiresAt must be canonical");
    if (isoLessThan(input.simulatedNowIso, input.uncertaintyExpiresAt)) {
      return quarantined(input, "uncertain_submission_active");
    }
  }

  return resumeAllowed(input);
}

const STATE_KEY = "campaign-g4-batch-1::eqdestinationg4";
const NOW_ISO = "2026-01-01T00:00:00.000Z";
const FUTURE_ISO = "2026-01-01T00:00:30.000Z";
const PAST_ISO = "2025-12-31T23:59:30.000Z";

function makeSubmittedEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stateKey: STATE_KEY,
    batchId: "campaign-g4-batch-1",
    recipientAddress: "EQDestinationG4",
    amount: "777888999",
    status: "submitted",
    attemptNumber: 1,
    txHash: null,
    networkRef: null,
    updatedAt: NOW_ISO,
    submittedAt: NOW_ISO,
    metadata: { source: "g4-simulated-recovery" },
    ...overrides,
  };
}

function makeRecoveryInput(overrides: Partial<SimulatedRecoveryInput> = {}): SimulatedRecoveryInput {
  return {
    stateKey: STATE_KEY,
    simulatedNowIso: NOW_ISO,
    runStateEntry: makeSubmittedEntry(),
    localAccountSequence: 7,
    reportedAccountSequence: 7,
    latestObservedAccountSequence: 7,
    pendingUncertainSubmission: false,
    uncertaintyExpiresAt: null,
    replacementIntentExposed: false,
    ...overrides,
  };
}

function testResumeAllowedAfterUncertaintyExpired(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: PAST_ISO,
  }));

  assert.equal(decision.ok, true);
  assert.equal(decision.action, "resume_allowed");
  assert.equal(decision.reason, "ready_to_resume");
  assert.equal(decision.dispatchIntentExposureAllowed, true);
  assert.equal(decision.operatorMutationAllowed, true);
}

function testUncertainSubmissionBeforeExpiryQuarantines(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: FUTURE_ISO,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "recovery_quarantined");
  assert.equal(decision.reason, "uncertain_submission_active");
}

function testUncertainSubmissionWithoutExpiryQuarantines(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: null,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "recovery_quarantined");
  assert.equal(decision.reason, "uncertain_submission_active");
}

function testSimulatedSeqnoMismatchFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    reportedAccountSequence: 8,
    latestObservedAccountSequence: 7,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, "simulated_seqno_mismatch");
}

function testStaleLocalSeqnoFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    localAccountSequence: 6,
    latestObservedAccountSequence: 7,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, "stale_local_seqno");
}

function testDuplicateDispatchIntentFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    replacementIntentExposed: true,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, "duplicate_dispatch_intent");
}

function testMissingRunStateEntryFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    runStateEntry: null,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, "missing_run_state_entry");
}


function testMalformedRunStateFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    runStateEntry: makeSubmittedEntry({
      status: "planned",
    }),
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "rejected_fail_closed");
  assert.equal(decision.reason, "malformed_run_state");
}

function testCrashBeforeRunStateCommitFailsClosed(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    runStateEntry: null,
  }));

  assertBlocked(decision);
  assert.equal(decision.reason, "missing_run_state_entry");
}

function testCrashAfterRunStateCommitQuarantinesUncertainSubmission(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    runStateEntry: makeSubmittedEntry(),
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: FUTURE_ISO,
  }));

  assertBlocked(decision);
  assert.equal(decision.action, "recovery_quarantined");
  assert.equal(decision.reason, "uncertain_submission_active");
}

function testCrashAfterEvidenceWriteDoesNotExposeReplacementIntent(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    runStateEntry: makeSubmittedEntry({
      metadata: { source: "g4-simulated-recovery", evidenceWritten: true },
    }),
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: FUTURE_ISO,
  }));

  assertBlocked(decision);
  assert.equal(decision.dispatchIntentExposureAllowed, false);
  assert.equal(decision.operatorMutationAllowed, false);
  assert.equal(decision.reason, "uncertain_submission_active");
}

function testCrashBeforeDispatchIntentExposureBlocksExposure(): void {
  const decision = evaluateSimulatedRecovery(makeRecoveryInput({
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: null,
  }));

  assertBlocked(decision);
  assert.equal(decision.dispatchIntentExposureAllowed, false);
  assert.equal(decision.operatorMutationAllowed, false);
  assert.equal(decision.action, "recovery_quarantined");
}

function testRecoveryDecisionIsDeterministic(): void {
  const input = makeRecoveryInput({
    pendingUncertainSubmission: true,
    uncertaintyExpiresAt: FUTURE_ISO,
  });

  const d1 = evaluateSimulatedRecovery(input);
  const d2 = evaluateSimulatedRecovery(input);

  assert.deepEqual(d1, d2, "same simulated input must produce same recovery decision");
}

function main(): void {
  testResumeAllowedAfterUncertaintyExpired();
  testUncertainSubmissionBeforeExpiryQuarantines();
  testUncertainSubmissionWithoutExpiryQuarantines();
  testSimulatedSeqnoMismatchFailsClosed();
  testStaleLocalSeqnoFailsClosed();
  testDuplicateDispatchIntentFailsClosed();
  testMissingRunStateEntryFailsClosed();
  testMalformedRunStateFailsClosed();
  testCrashBeforeRunStateCommitFailsClosed();
  testCrashAfterRunStateCommitQuarantinesUncertainSubmission();
  testCrashAfterEvidenceWriteDoesNotExposeReplacementIntent();
  testCrashBeforeDispatchIntentExposureBlocksExposure();
  testRecoveryDecisionIsDeterministic();

  console.log(`${LABEL} PASS`);
}

main();
