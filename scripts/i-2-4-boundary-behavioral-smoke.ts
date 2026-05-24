const LABEL = "[i-2-4-boundary-behavioral-smoke]";

type BoundaryState = "CREATED" | "VALIDATED" | "APPROVED" | "READY_FOR_SIGNER";
type BoundaryStatus = "VALIDATED" | "SECURITY_TERMINAL";
type TerminalStatus = "TERMINAL_FAIL_CLOSED";

type FailureReason =
  | "RUNTIME_CAPABILITY_CREEP"
  | "NON_PRIMITIVE_BOUNDARY_INGRESS"
  | "IDENTITY_MUTATION_DETECTED"
  | "DECISION_DRIFT_DETECTED"
  | "BOUNDARY_DECISION_DERIVATION_DRIFT"
  | "BOUNDARY_STATE_TRANSITION_VIOLATION"
  | "BOUNDARY_REJECTION_SECURITY_TERMINAL"
  | "CHAIN_STATE_BOUNDARY_MISMATCH"
  | "BOUNDARY_REDACTION_FAILURE"
  | "METADATA_IDENTITY_COUPLING"
  | "BOUNDARY_EVIDENCE_MISMATCH"
  | "BOUNDARY_NON_DETERMINISM";

interface IdentitySnapshot {
  readonly decisionId: string;
  readonly candidateId: string;
  readonly stateKey: string;
  readonly recipientAddress: string;
  readonly amount: string;
  readonly batchId: string;
  readonly operator: string;
  readonly boundaryDecisionId: string;
  readonly boundaryVersion: string;
}

interface BoundaryTransition {
  readonly from: BoundaryState;
  readonly to: string;
  readonly exposesExecutionMaterial?: boolean;
  readonly skipsValidationEvidence?: boolean;
}

interface BoundaryInput extends IdentitySnapshot {
  readonly expectedIdentity: IdentitySnapshot;
  readonly boundaryState: BoundaryState;
  readonly transition?: BoundaryTransition;
  readonly capabilityExposure?: readonly string[];
  readonly nonPrimitiveIngress?: readonly string[];
  readonly decisionStoreMismatch?: boolean;
  readonly runStateMismatch?: boolean;
  readonly evidenceFingerprintMismatch?: boolean;
  readonly forbiddenDerivationContext?: readonly string[];
  readonly boundaryRejected?: boolean;
  readonly retryRequested?: boolean;
  readonly reassignmentRequested?: boolean;
  readonly signerReentryRequested?: boolean;
  readonly newIntentExposureRequested?: boolean;
  readonly intentRegenerationRequested?: boolean;
  readonly fallbackExecutionRequested?: boolean;
  readonly recoveryMutationRequested?: boolean;
  readonly alternateDispatchRequested?: boolean;
  readonly chainStateMismatch?: boolean;
  readonly chainStateMutatesDecision?: boolean;
  readonly chainStateTriggersSignerAccess?: boolean;
  readonly redactionSentinel?: string;
  readonly failureSurface?: readonly string[];
  readonly metadataIdentityMutation?: boolean;
  readonly evidenceMismatch?: boolean;
  readonly evidenceDerivedFromRuntimeContext?: boolean;
  readonly evidenceAuthorizesRuntimeCapability?: boolean;
  readonly nonDeterministicContext?: readonly string[];
}

interface BoundaryResult {
  readonly status: BoundaryStatus;
  readonly terminalStatus?: TerminalStatus;
  readonly failureReason?: FailureReason;
  readonly retryAllowed: false;
  readonly reassignmentAllowed: false;
  readonly signerReentryAllowed: false;
  readonly newIntentExposureAllowed: false;
}

interface NegativeCase {
  readonly name: string;
  readonly input: BoundaryInput;
  readonly expectedReason: FailureReason;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

function deriveBoundaryDecisionId(input: Pick<IdentitySnapshot, "decisionId" | "candidateId" | "stateKey" | "boundaryVersion">): string {
  return `boundary::${input.boundaryVersion}::${input.decisionId}::${input.candidateId}::${input.stateKey}`;
}

function fail(failureReason: FailureReason): BoundaryResult {
  return {
    status: "SECURITY_TERMINAL",
    terminalStatus: "TERMINAL_FAIL_CLOSED",
    failureReason,
    retryAllowed: false,
    reassignmentAllowed: false,
    signerReentryAllowed: false,
    newIntentExposureAllowed: false,
  };
}

function pass(): BoundaryResult {
  return {
    status: "VALIDATED",
    retryAllowed: false,
    reassignmentAllowed: false,
    signerReentryAllowed: false,
    newIntentExposureAllowed: false,
  };
}

function hasEntries(value: readonly string[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function identitiesMatch(input: BoundaryInput): boolean {
  const expected = input.expectedIdentity;

  return (
    input.decisionId === expected.decisionId &&
    input.candidateId === expected.candidateId &&
    input.stateKey === expected.stateKey &&
    input.recipientAddress === expected.recipientAddress &&
    input.amount === expected.amount &&
    input.batchId === expected.batchId &&
    input.operator === expected.operator &&
    input.boundaryDecisionId === expected.boundaryDecisionId &&
    input.boundaryVersion === expected.boundaryVersion
  );
}

function isAllowedTransition(transition: BoundaryTransition | undefined): boolean {
  if (!transition) return true;

  const allowed = [
    "CREATED->VALIDATED",
    "VALIDATED->APPROVED",
    "APPROVED->READY_FOR_SIGNER",
  ];

  return allowed.includes(`${transition.from}->${transition.to}`);
}

function hasBoundaryRejectionEscape(input: BoundaryInput): boolean {
  if (!input.boundaryRejected) return false;

  return Boolean(
    input.retryRequested ||
      input.reassignmentRequested ||
      input.signerReentryRequested ||
      input.newIntentExposureRequested ||
      input.intentRegenerationRequested ||
      input.fallbackExecutionRequested ||
      input.recoveryMutationRequested ||
      input.alternateDispatchRequested
  );
}

function failureSurfaceLeaksSentinel(input: BoundaryInput): boolean {
  if (!input.redactionSentinel) return false;
  if (!input.failureSurface) return false;

  return input.failureSurface.some((entry) => entry.includes(input.redactionSentinel as string));
}

function validateBoundary(input: BoundaryInput): BoundaryResult {
  if (hasEntries(input.capabilityExposure)) {
    return fail("RUNTIME_CAPABILITY_CREEP");
  }

  if (hasEntries(input.nonPrimitiveIngress)) {
    return fail("NON_PRIMITIVE_BOUNDARY_INGRESS");
  }

  if (!identitiesMatch(input)) {
    return fail("IDENTITY_MUTATION_DETECTED");
  }

  if (input.decisionStoreMismatch || input.runStateMismatch || input.evidenceFingerprintMismatch) {
    return fail("DECISION_DRIFT_DETECTED");
  }

  const expectedBoundaryDecisionId = deriveBoundaryDecisionId(input.expectedIdentity);
  if (input.boundaryDecisionId !== expectedBoundaryDecisionId || hasEntries(input.forbiddenDerivationContext)) {
    return fail("BOUNDARY_DECISION_DERIVATION_DRIFT");
  }

  if (
    !isAllowedTransition(input.transition) ||
    input.transition?.exposesExecutionMaterial ||
    input.transition?.skipsValidationEvidence
  ) {
    return fail("BOUNDARY_STATE_TRANSITION_VIOLATION");
  }

  if (hasBoundaryRejectionEscape(input)) {
    return fail("BOUNDARY_REJECTION_SECURITY_TERMINAL");
  }

  if (input.chainStateMismatch || input.chainStateMutatesDecision || input.chainStateTriggersSignerAccess) {
    return fail("CHAIN_STATE_BOUNDARY_MISMATCH");
  }

  if (failureSurfaceLeaksSentinel(input)) {
    return fail("BOUNDARY_REDACTION_FAILURE");
  }

  if (input.metadataIdentityMutation) {
    return fail("METADATA_IDENTITY_COUPLING");
  }

  if (input.evidenceMismatch || input.evidenceDerivedFromRuntimeContext || input.evidenceAuthorizesRuntimeCapability) {
    return fail("BOUNDARY_EVIDENCE_MISMATCH");
  }

  if (hasEntries(input.nonDeterministicContext)) {
    return fail("BOUNDARY_NON_DETERMINISM");
  }

  return pass();
}

const BASE_IDENTITY: IdentitySnapshot = {
  decisionId: "decision-i2-4-001",
  candidateId: "candidate-i2-4-001",
  stateKey: "batch-i2-4::eqrecipient000000000000000000000000000000000000000000000",
  recipientAddress: "EQRecipient000000000000000000000000000000000000000000000",
  amount: "1000000000",
  batchId: "batch-i2-4",
  operator: "operator-i2-4-a",
  boundaryVersion: "I-2.4-smoke-v1",
  boundaryDecisionId: "",
};

const CANONICAL_IDENTITY: IdentitySnapshot = {
  ...BASE_IDENTITY,
  boundaryDecisionId: deriveBoundaryDecisionId(BASE_IDENTITY),
};

function baseInput(overrides: Partial<BoundaryInput> = {}): BoundaryInput {
  return {
    ...CANONICAL_IDENTITY,
    expectedIdentity: CANONICAL_IDENTITY,
    boundaryState: "CREATED",
    ...overrides,
  };
}

function expectValidated(name: string, input: BoundaryInput): void {
  const result = validateBoundary(input);

  assert(result.status === "VALIDATED", `${name}: expected VALIDATED, got ${result.status}`);
  assert(result.failureReason === undefined, `${name}: unexpected failure ${String(result.failureReason)}`);
  assert(result.retryAllowed === false, `${name}: retry must never be allowed`);
  assert(result.reassignmentAllowed === false, `${name}: reassignment must never be allowed`);
  assert(result.signerReentryAllowed === false, `${name}: signer re-entry must never be allowed`);
  assert(result.newIntentExposureAllowed === false, `${name}: new intent exposure must never be allowed`);
}

function expectSecurityTerminal(testCase: NegativeCase): void {
  const result = validateBoundary(testCase.input);

  assert(
    result.status === "SECURITY_TERMINAL",
    `${testCase.name}: expected SECURITY_TERMINAL, got ${result.status}`
  );
  assert(
    result.terminalStatus === "TERMINAL_FAIL_CLOSED",
    `${testCase.name}: expected TERMINAL_FAIL_CLOSED`
  );
  assert(
    result.failureReason === testCase.expectedReason,
    `${testCase.name}: expected ${testCase.expectedReason}, got ${String(result.failureReason)}`
  );
  assert(result.retryAllowed === false, `${testCase.name}: retry must be blocked`);
  assert(result.reassignmentAllowed === false, `${testCase.name}: reassignment must be blocked`);
  assert(result.signerReentryAllowed === false, `${testCase.name}: signer re-entry must be blocked`);
  assert(result.newIntentExposureAllowed === false, `${testCase.name}: new intent exposure must be blocked`);
}

const DUMMY_SENTINEL = "DUMMY_I2_4_SENTINEL_DO_NOT_LOG_12345";

const negativeCases: readonly NegativeCase[] = [
  {
    name: "BV1 capability exposure rejected",
    input: baseInput({ capabilityExposure: ["signer-adapter-capability"] }),
    expectedReason: "RUNTIME_CAPABILITY_CREEP",
  },
  {
    name: "BV2 non-primitive ingress rejected",
    input: baseInput({ nonPrimitiveIngress: ["runtime-object-reference"] }),
    expectedReason: "NON_PRIMITIVE_BOUNDARY_INGRESS",
  },
  {
    name: "BV3 identity mutation rejected",
    input: baseInput({ amount: "2000000000" }),
    expectedReason: "IDENTITY_MUTATION_DETECTED",
  },
  {
    name: "BV4 decision drift rejected",
    input: baseInput({ decisionStoreMismatch: true }),
    expectedReason: "DECISION_DRIFT_DETECTED",
  },
  {
    name: "BV5 forbidden derivation context rejected",
    input: baseInput({ forbiddenDerivationContext: ["fee-volatility-context"] }),
    expectedReason: "BOUNDARY_DECISION_DERIVATION_DRIFT",
  },
  {
    name: "BV6 illegal state transition rejected",
    input: baseInput({ transition: { from: "READY_FOR_SIGNER", to: "CREATED" } }),
    expectedReason: "BOUNDARY_STATE_TRANSITION_VIOLATION",
  },
  {
    name: "BV7 boundary rejection retry path rejected",
    input: baseInput({ boundaryRejected: true, retryRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV8 chain-state mismatch rejected",
    input: baseInput({ chainStateMismatch: true }),
    expectedReason: "CHAIN_STATE_BOUNDARY_MISMATCH",
  },
  {
    name: "BV9 failure path sentinel leak rejected",
    input: baseInput({
      redactionSentinel: DUMMY_SENTINEL,
      failureSurface: [`controlled failure leaked ${DUMMY_SENTINEL}`],
    }),
    expectedReason: "BOUNDARY_REDACTION_FAILURE",
  },
  {
    name: "BV10 metadata identity coupling rejected",
    input: baseInput({ metadataIdentityMutation: true }),
    expectedReason: "METADATA_IDENTITY_COUPLING",
  },
  {
    name: "BV11 evidence mismatch rejected",
    input: baseInput({ evidenceMismatch: true }),
    expectedReason: "BOUNDARY_EVIDENCE_MISMATCH",
  },
  {
    name: "BV12 non-deterministic context rejected",
    input: baseInput({ nonDeterministicContext: ["process-timing-context"] }),
    expectedReason: "BOUNDARY_NON_DETERMINISM",
  },
];

function assertDeterministic(testCase: NegativeCase): void {
  const first = validateBoundary(testCase.input);
  const second = validateBoundary(testCase.input);

  assert(
    JSON.stringify(first) === JSON.stringify(second),
    `${testCase.name}: repeated validation must be deterministic`
  );
}

const boundaryRejectionEscapeCases: readonly NegativeCase[] = [
  {
    name: "BV7 reassignment after rejection rejected",
    input: baseInput({ boundaryRejected: true, reassignmentRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 signer re-entry after rejection rejected",
    input: baseInput({ boundaryRejected: true, signerReentryRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 new intent exposure after rejection rejected",
    input: baseInput({ boundaryRejected: true, newIntentExposureRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 intent regeneration after rejection rejected",
    input: baseInput({ boundaryRejected: true, intentRegenerationRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 fallback execution after rejection rejected",
    input: baseInput({ boundaryRejected: true, fallbackExecutionRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 recovery mutation after rejection rejected",
    input: baseInput({ boundaryRejected: true, recoveryMutationRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
  {
    name: "BV7 alternate dispatch after rejection rejected",
    input: baseInput({ boundaryRejected: true, alternateDispatchRequested: true }),
    expectedReason: "BOUNDARY_REJECTION_SECURITY_TERMINAL",
  },
];

function main(): void {
  expectValidated("canonical boundary snapshot", baseInput());

  for (const testCase of negativeCases) {
    expectSecurityTerminal(testCase);
    assertDeterministic(testCase);
  }

  for (const testCase of boundaryRejectionEscapeCases) {
    expectSecurityTerminal(testCase);
    assertDeterministic(testCase);
  }

  assert(
    negativeCases.length === 12,
    `expected 12 BV negative cases, got ${negativeCases.length}`
  );

  assert(
    boundaryRejectionEscapeCases.length === 7,
    `expected 7 BV7 escape cases, got ${boundaryRejectionEscapeCases.length}`
  );

  console.log(`${LABEL} negativeCases=${negativeCases.length}`);
  console.log(`${LABEL} boundaryRejectionEscapeCases=${boundaryRejectionEscapeCases.length}`);
  console.log(`${LABEL} PASS`);
}

main();
