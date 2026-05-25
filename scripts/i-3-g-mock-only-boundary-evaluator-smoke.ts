export {};

type TerminalStatus = "NOT_TERMINAL" | "TERMINAL_FAIL_CLOSED";
type Status = "MOCK_VALIDATED" | "SECURITY_TERMINAL";
type FailureReason =
  | "NONE"
  | "RUNTIME_CAPABILITY_CREEP"
  | "LIVE_HANDLE_EXPOSURE"
  | "INTERFACE_CONTRACT_VIOLATION"
  | "CAPABILITY_GATE_BYPASS_DETECTED"
  | "UNREVIEWED_CAPABILITY_PATH"
  | "STAGE_I_SMOKE_NOT_GREEN"
  | "STAGE_H_SMOKE_NOT_GREEN"
  | "BOUNDARY_BEHAVIORAL_SMOKE_BYPASS"
  | "SECURITY_REQUIREMENT_WEAKENED"
  | "BOUNDARY_ASSERTION_WEAKENED"
  | "CAPABILITY_GATE_IDENTITY_MUTATION"
  | "CAPABILITY_GATE_DECISION_DRIFT"
  | "CAPABILITY_GATE_REJECTION_ESCAPE"
  | "CAPABILITY_GATE_CHAIN_STATE_REPAIR"
  | "CAPABILITY_GATE_METADATA_IDENTITY_COUPLING"
  | "CAPABILITY_GATE_REDACTION_FAILURE"
  | "CAPABILITY_GATE_EVIDENCE_MISSING"
  | "BOUNDARY_NON_DETERMINISM"
  | "UNKNOWN_BOUNDARY_FAILURE";

type MockViolation =
  | "NONE"
  | "RUNTIME_CAPABILITY_EXPOSURE"
  | "LIVE_HANDLE_INGRESS"
  | "DTO_CAPABILITY_SMUGGLING"
  | "EVIDENCE_CAPABILITY_SMUGGLING"
  | "HELPER_FACTORY_ROUTING_BYPASS"
  | "DYNAMIC_LOADING_BYPASS"
  | "STAGE_I_SMOKE_MISSING_OR_FAILED"
  | "STAGE_H_SMOKE_MISSING_OR_FAILED"
  | "I2_4_BEHAVIORAL_SMOKE_BYPASS"
  | "SR1_SR7_WEAKENING"
  | "BV1_BV12_WEAKENING"
  | "IDENTITY_MUTATION"
  | "DECISION_DRIFT"
  | "BOUNDARY_REJECTION_ESCAPE"
  | "SEQNO_CHAIN_STATE_REPAIR"
  | "METADATA_IDENTITY_COUPLING"
  | "REDACTION_FAILURE"
  | "STALE_OR_MISSING_SAME_SHA_CI"
  | "NON_DETERMINISTIC_CONTEXT";

type MockGateEvidence = "PRESENT_GREEN" | "MISSING" | "FAILED" | "STALE";

type Fixture = Readonly<{
  fixtureId: string;
  scenarioId: string;
  scenarioName: string;
  boundaryVersion: string;
  decisionId: string;
  candidateId: string;
  stateKey: string;
  recipientAddress: string;
  amountDecimal: string;
  batchId: string;
  operatorId: string;
  boundaryDecisionId: string;
  unsignedIntentFingerprint: string;
  mockGateEvidence: MockGateEvidence;
  mockViolation: MockViolation;
  dummySentinel: string;
  expectedFailureReason: FailureReason;
  expectedTerminalStatus: TerminalStatus;
  isBypassScenario: boolean;
}>;

type Result = Readonly<{
  fixtureId: string;
  scenarioId: string;
  status: Status;
  terminalStatus: TerminalStatus;
  failureReason: FailureReason;
  evidenceFingerprint: string;
  retryAllowed: boolean;
  reassignmentAllowed: boolean;
  signerReentryAllowed: boolean;
  newIntentExposureAllowed: boolean;
  redactionPassed: boolean;
  deterministicEvaluationPassed: boolean;
}>;

type Summary = Readonly<{
  scenarios: number;
  negativeScenarios: number;
  bypassScenarios: number;
  redactionChecks: number;
  determinismChecks: number;
}>;

const DUMMY_SENTINEL = "DUMMY_SENTINEL_VALUE_FOR_REDACTION_CHECK";

const failureReasonByViolation: Record<MockViolation, FailureReason> = {
  NONE: "NONE",
  RUNTIME_CAPABILITY_EXPOSURE: "RUNTIME_CAPABILITY_CREEP",
  LIVE_HANDLE_INGRESS: "LIVE_HANDLE_EXPOSURE",
  DTO_CAPABILITY_SMUGGLING: "INTERFACE_CONTRACT_VIOLATION",
  EVIDENCE_CAPABILITY_SMUGGLING: "CAPABILITY_GATE_BYPASS_DETECTED",
  HELPER_FACTORY_ROUTING_BYPASS: "UNREVIEWED_CAPABILITY_PATH",
  DYNAMIC_LOADING_BYPASS: "UNREVIEWED_CAPABILITY_PATH",
  STAGE_I_SMOKE_MISSING_OR_FAILED: "STAGE_I_SMOKE_NOT_GREEN",
  STAGE_H_SMOKE_MISSING_OR_FAILED: "STAGE_H_SMOKE_NOT_GREEN",
  I2_4_BEHAVIORAL_SMOKE_BYPASS: "BOUNDARY_BEHAVIORAL_SMOKE_BYPASS",
  SR1_SR7_WEAKENING: "SECURITY_REQUIREMENT_WEAKENED",
  BV1_BV12_WEAKENING: "BOUNDARY_ASSERTION_WEAKENED",
  IDENTITY_MUTATION: "CAPABILITY_GATE_IDENTITY_MUTATION",
  DECISION_DRIFT: "CAPABILITY_GATE_DECISION_DRIFT",
  BOUNDARY_REJECTION_ESCAPE: "CAPABILITY_GATE_REJECTION_ESCAPE",
  SEQNO_CHAIN_STATE_REPAIR: "CAPABILITY_GATE_CHAIN_STATE_REPAIR",
  METADATA_IDENTITY_COUPLING: "CAPABILITY_GATE_METADATA_IDENTITY_COUPLING",
  REDACTION_FAILURE: "CAPABILITY_GATE_REDACTION_FAILURE",
  STALE_OR_MISSING_SAME_SHA_CI: "CAPABILITY_GATE_EVIDENCE_MISSING",
  NON_DETERMINISTIC_CONTEXT: "BOUNDARY_NON_DETERMINISM",
};

const fixtures: readonly Fixture[] = [
  fixture("M1", "Valid primitive DTO baseline", "NONE", "PRESENT_GREEN", "NONE", "NOT_TERMINAL", false),
  fixture("M2", "Runtime capability exposure attempt", "RUNTIME_CAPABILITY_EXPOSURE", "PRESENT_GREEN", "RUNTIME_CAPABILITY_CREEP", "TERMINAL_FAIL_CLOSED", false),
  fixture("M3", "Live handle ingress attempt", "LIVE_HANDLE_INGRESS", "PRESENT_GREEN", "LIVE_HANDLE_EXPOSURE", "TERMINAL_FAIL_CLOSED", false),
  fixture("M4", "DTO capability smuggling", "DTO_CAPABILITY_SMUGGLING", "PRESENT_GREEN", "INTERFACE_CONTRACT_VIOLATION", "TERMINAL_FAIL_CLOSED", false),
  fixture("M5", "Evidence capability smuggling", "EVIDENCE_CAPABILITY_SMUGGLING", "PRESENT_GREEN", "CAPABILITY_GATE_BYPASS_DETECTED", "TERMINAL_FAIL_CLOSED", true),
  fixture("M6", "Helper/factory routing bypass", "HELPER_FACTORY_ROUTING_BYPASS", "PRESENT_GREEN", "UNREVIEWED_CAPABILITY_PATH", "TERMINAL_FAIL_CLOSED", true),
  fixture("M7", "Dynamic loading bypass", "DYNAMIC_LOADING_BYPASS", "PRESENT_GREEN", "UNREVIEWED_CAPABILITY_PATH", "TERMINAL_FAIL_CLOSED", true),
  fixture("M8", "Stage I smoke missing or failed", "STAGE_I_SMOKE_MISSING_OR_FAILED", "FAILED", "STAGE_I_SMOKE_NOT_GREEN", "TERMINAL_FAIL_CLOSED", false),
  fixture("M9", "Stage H smoke missing or failed", "STAGE_H_SMOKE_MISSING_OR_FAILED", "FAILED", "STAGE_H_SMOKE_NOT_GREEN", "TERMINAL_FAIL_CLOSED", false),
  fixture("M10", "I-2.4 behavioral smoke bypass", "I2_4_BEHAVIORAL_SMOKE_BYPASS", "MISSING", "BOUNDARY_BEHAVIORAL_SMOKE_BYPASS", "TERMINAL_FAIL_CLOSED", true),
  fixture("M11", "SR1-SR7 weakening", "SR1_SR7_WEAKENING", "PRESENT_GREEN", "SECURITY_REQUIREMENT_WEAKENED", "TERMINAL_FAIL_CLOSED", false),
  fixture("M12", "BV1-BV12 weakening", "BV1_BV12_WEAKENING", "PRESENT_GREEN", "BOUNDARY_ASSERTION_WEAKENED", "TERMINAL_FAIL_CLOSED", false),
  fixture("M13", "Identity mutation", "IDENTITY_MUTATION", "PRESENT_GREEN", "CAPABILITY_GATE_IDENTITY_MUTATION", "TERMINAL_FAIL_CLOSED", false),
  fixture("M14", "Decision drift", "DECISION_DRIFT", "PRESENT_GREEN", "CAPABILITY_GATE_DECISION_DRIFT", "TERMINAL_FAIL_CLOSED", false),
  fixture("M15", "Boundary rejection escape", "BOUNDARY_REJECTION_ESCAPE", "PRESENT_GREEN", "CAPABILITY_GATE_REJECTION_ESCAPE", "TERMINAL_FAIL_CLOSED", true),
  fixture("M16", "Seqno / chain-state repair attempt", "SEQNO_CHAIN_STATE_REPAIR", "PRESENT_GREEN", "CAPABILITY_GATE_CHAIN_STATE_REPAIR", "TERMINAL_FAIL_CLOSED", false),
  fixture("M17", "Metadata / identity coupling", "METADATA_IDENTITY_COUPLING", "PRESENT_GREEN", "CAPABILITY_GATE_METADATA_IDENTITY_COUPLING", "TERMINAL_FAIL_CLOSED", false),
  fixture("M18", "Redaction failure", "REDACTION_FAILURE", "PRESENT_GREEN", "CAPABILITY_GATE_REDACTION_FAILURE", "TERMINAL_FAIL_CLOSED", false),
  fixture("M19", "Stale or missing same-SHA CI evidence", "STALE_OR_MISSING_SAME_SHA_CI", "STALE", "CAPABILITY_GATE_EVIDENCE_MISSING", "TERMINAL_FAIL_CLOSED", true),
  fixture("M20", "Non-deterministic mock context", "NON_DETERMINISTIC_CONTEXT", "PRESENT_GREEN", "BOUNDARY_NON_DETERMINISM", "TERMINAL_FAIL_CLOSED", false),
];

function fixture(
  scenarioId: string,
  scenarioName: string,
  mockViolation: MockViolation,
  mockGateEvidence: MockGateEvidence,
  expectedFailureReason: FailureReason,
  expectedTerminalStatus: TerminalStatus,
  isBypassScenario: boolean,
): Fixture {
  const suffix = scenarioId.toLowerCase();

  return {
    fixtureId: `fixture-${suffix}`,
    scenarioId,
    scenarioName,
    boundaryVersion: "I-3.G.mock-only.v1",
    decisionId: `decision-${suffix}`,
    candidateId: `candidate-${suffix}`,
    stateKey: `batch-${suffix}::recipient-${suffix}`,
    recipientAddress: `EQC${suffix.padEnd(45, "0")}`,
    amountDecimal: "1000000000",
    batchId: `batch-${suffix}`,
    operatorId: `operator-${suffix}`,
    boundaryDecisionId: `boundary-decision-${suffix}`,
    unsignedIntentFingerprint: `unsigned-intent-fingerprint-${suffix}`,
    mockGateEvidence,
    mockViolation,
    dummySentinel: `${DUMMY_SENTINEL}_${scenarioId}`,
    expectedFailureReason,
    expectedTerminalStatus,
    isBypassScenario,
  };
}

function evaluateBoundary(fixtureValue: Fixture): Result {
  const failureReason = failureReasonByViolation[fixtureValue.mockViolation] ?? "UNKNOWN_BOUNDARY_FAILURE";
  const isUnsafe = failureReason !== "NONE";
  const status: Status = isUnsafe ? "SECURITY_TERMINAL" : "MOCK_VALIDATED";
  const terminalStatus: TerminalStatus = isUnsafe ? "TERMINAL_FAIL_CLOSED" : "NOT_TERMINAL";

  const resultSeed = {
    fixtureId: fixtureValue.fixtureId,
    scenarioId: fixtureValue.scenarioId,
    boundaryVersion: fixtureValue.boundaryVersion,
    decisionId: fixtureValue.decisionId,
    candidateId: fixtureValue.candidateId,
    stateKey: fixtureValue.stateKey,
    recipientAddress: fixtureValue.recipientAddress,
    amountDecimal: fixtureValue.amountDecimal,
    batchId: fixtureValue.batchId,
    operatorId: fixtureValue.operatorId,
    boundaryDecisionId: fixtureValue.boundaryDecisionId,
    unsignedIntentFingerprint: fixtureValue.unsignedIntentFingerprint,
    mockGateEvidence: fixtureValue.mockGateEvidence,
    mockViolation: fixtureValue.mockViolation,
    status,
    terminalStatus,
    failureReason,
  };

  const evidenceFingerprint = stableFingerprint(resultSeed);

  const resultWithoutRedaction: Omit<Result, "redactionPassed" | "deterministicEvaluationPassed"> = {
    fixtureId: fixtureValue.fixtureId,
    scenarioId: fixtureValue.scenarioId,
    status,
    terminalStatus,
    failureReason,
    evidenceFingerprint,
    retryAllowed: false,
    reassignmentAllowed: false,
    signerReentryAllowed: false,
    newIntentExposureAllowed: false,
  };

  const redactionPassed = !stableStringify(resultWithoutRedaction).includes(fixtureValue.dummySentinel);

  return {
    ...resultWithoutRedaction,
    redactionPassed,
    deterministicEvaluationPassed: true,
  };
}

function stableFingerprint(value: unknown): string {
  const canonical = stableStringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `mock-fp-${hash.toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }

  throw new Error(`Unsupported non-primitive value in stableStringify: ${typeof value}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFixtureIsPrimitive(fixtureValue: Fixture): void {
  const serialized = stableStringify(fixtureValue);
  assert(serialized.includes(fixtureValue.scenarioId), `fixture ${fixtureValue.scenarioId} did not serialize deterministically`);
}

function assertResultMatchesFixture(fixtureValue: Fixture, result: Result): void {
  const isUnsafe = fixtureValue.expectedFailureReason !== "NONE";

  assert(result.fixtureId === fixtureValue.fixtureId, `${fixtureValue.scenarioId} fixtureId drift`);
  assert(result.scenarioId === fixtureValue.scenarioId, `${fixtureValue.scenarioId} scenarioId drift`);
  assert(result.failureReason === fixtureValue.expectedFailureReason, `${fixtureValue.scenarioId} failure reason mismatch`);
  assert(result.terminalStatus === fixtureValue.expectedTerminalStatus, `${fixtureValue.scenarioId} terminal status mismatch`);
  assert(result.retryAllowed === false, `${fixtureValue.scenarioId} retry escape`);
  assert(result.reassignmentAllowed === false, `${fixtureValue.scenarioId} reassignment escape`);
  assert(result.signerReentryAllowed === false, `${fixtureValue.scenarioId} signer re-entry escape`);
  assert(result.newIntentExposureAllowed === false, `${fixtureValue.scenarioId} new intent exposure escape`);
  assert(result.redactionPassed === true, `${fixtureValue.scenarioId} dummy sentinel leaked`);

  if (isUnsafe) {
    assert(result.status === "SECURITY_TERMINAL", `${fixtureValue.scenarioId} unsafe status did not fail security-terminal`);
    assert(result.terminalStatus === "TERMINAL_FAIL_CLOSED", `${fixtureValue.scenarioId} unsafe status did not fail closed`);
  } else {
    assert(result.status === "MOCK_VALIDATED", `${fixtureValue.scenarioId} baseline did not validate as mock-only`);
    assert(result.terminalStatus === "NOT_TERMINAL", `${fixtureValue.scenarioId} baseline unexpectedly terminal`);
  }
}

function assertDeterministicEvaluation(fixtureValue: Fixture): void {
  const first = evaluateBoundary(fixtureValue);
  const second = evaluateBoundary(fixtureValue);

  assert(stableStringify(first) === stableStringify(second), `${fixtureValue.scenarioId} repeated evaluation drift`);
  assert(first.evidenceFingerprint === second.evidenceFingerprint, `${fixtureValue.scenarioId} fingerprint drift`);
}

function assertCompleteCoverage(results: readonly Result[]): void {
  const expectedScenarioIds = new Set<string>(Array.from({ length: 20 }, (_, index) => `M${index + 1}`));
  const actualScenarioIds = new Set<string>(results.map((result) => result.scenarioId));

  for (const expectedScenarioId of expectedScenarioIds) {
    assert(actualScenarioIds.has(expectedScenarioId), `missing scenario ${expectedScenarioId}`);
  }

  assert(actualScenarioIds.size === expectedScenarioIds.size, "unexpected scenario count");
}

function run(): Summary {
  const results: Result[] = [];

  for (const fixtureValue of fixtures) {
    assertFixtureIsPrimitive(fixtureValue);
    const result = evaluateBoundary(fixtureValue);
    assertResultMatchesFixture(fixtureValue, result);
    assertDeterministicEvaluation(fixtureValue);
    results.push(result);
  }

  assertCompleteCoverage(results);

  const negativeScenarios = fixtures.filter((fixtureValue) => fixtureValue.mockViolation !== "NONE").length;
  const bypassScenarios = fixtures.filter((fixtureValue) => fixtureValue.isBypassScenario).length;

  return {
    scenarios: fixtures.length,
    negativeScenarios,
    bypassScenarios,
    redactionChecks: fixtures.length,
    determinismChecks: fixtures.length,
  };
}

try {
  const summary = run();

  console.log(`[i-3-g-mock-only-boundary-evaluator-smoke] scenarios=${summary.scenarios}`);
  console.log(`[i-3-g-mock-only-boundary-evaluator-smoke] negativeScenarios=${summary.negativeScenarios}`);
  console.log(`[i-3-g-mock-only-boundary-evaluator-smoke] bypassScenarios=${summary.bypassScenarios}`);
  console.log(`[i-3-g-mock-only-boundary-evaluator-smoke] redactionChecks=${summary.redactionChecks}`);
  console.log(`[i-3-g-mock-only-boundary-evaluator-smoke] determinismChecks=${summary.determinismChecks}`);
  console.log("[i-3-g-mock-only-boundary-evaluator-smoke] PASS");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  console.error(`[i-3-g-mock-only-boundary-evaluator-smoke] FAIL ${message}`);
  process.exit(1);
}
