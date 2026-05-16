import * as assert from "assert/strict";
import { createHash } from "node:crypto";

const LABEL = "[g-6-metadata-intent-lineage-smoke]";

type MetadataIntentStatus =
  | "approved"
  | "rejected_fail_closed";

type MetadataIntentValidationReason =
  | "metadata_intent_valid"
  | "premature_effective_time"
  | "hash_drift"
  | "mock_content_unavailable"
  | "missing_approval_evidence"
  | "broken_rollback_lineage";

interface MetadataIntent {
  readonly intentId: string;
  readonly status: MetadataIntentStatus;
  readonly metadataIntentApprovedAt: string;
  readonly metadataEffectiveAfter: string;
  readonly minimumPropagationDelayMs: number;
  readonly contentUri: string;
  readonly contentHash: string;
  readonly rollbackIntentId: string | null;
  readonly approvalEvidenceRef: string;
}

interface MockGatewayRecord {
  readonly contentUri: string;
  readonly payload: string | null;
  readonly unavailable: boolean;
}

interface MetadataIntentValidationResult {
  readonly ok: boolean;
  readonly reason: MetadataIntentValidationReason;
  readonly intentId: string;
  readonly computedContentHash: string | null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isCanonicalIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isoMs(value: string): number {
  assert.equal(isCanonicalIso(value), true, "timestamp must be canonical ISO");
  return Date.parse(value);
}

function fail(intent: MetadataIntent, reason: MetadataIntentValidationReason): MetadataIntentValidationResult {
  return {
    ok: false,
    reason,
    intentId: intent.intentId,
    computedContentHash: null,
  };
}

function pass(intent: MetadataIntent, computedContentHash: string): MetadataIntentValidationResult {
  return {
    ok: true,
    reason: "metadata_intent_valid",
    intentId: intent.intentId,
    computedContentHash,
  };
}

type MockGatewayRegistry = ReadonlyMap<string, MockGatewayRecord>;
type MetadataLineageRegistry = ReadonlySet<string>;
type ApprovalEvidenceRegistry = ReadonlySet<string>;

interface ValidateMetadataIntentInput {
  readonly intent: MetadataIntent;
  readonly simulatedNowIso: string;
  readonly gatewayRegistry: MockGatewayRegistry;
  readonly lineageRegistry: MetadataLineageRegistry;
  readonly approvalEvidenceRegistry: ApprovalEvidenceRegistry;
}

function validateMetadataIntent(input: ValidateMetadataIntentInput): MetadataIntentValidationResult {
  const { intent } = input;

  assert.equal(isCanonicalIso(input.simulatedNowIso), true, "simulatedNowIso must be canonical");
  assert.equal(isCanonicalIso(intent.metadataIntentApprovedAt), true, "metadataIntentApprovedAt must be canonical");
  assert.equal(isCanonicalIso(intent.metadataEffectiveAfter), true, "metadataEffectiveAfter must be canonical");

  if (intent.approvalEvidenceRef.trim() === "" || !input.approvalEvidenceRegistry.has(intent.approvalEvidenceRef)) {
    return fail(intent, "missing_approval_evidence");
  }

  if (intent.rollbackIntentId !== null && !input.lineageRegistry.has(intent.rollbackIntentId)) {
    return fail(intent, "broken_rollback_lineage");
  }

  const requiredEffectiveAfterMs = isoMs(intent.metadataIntentApprovedAt) + intent.minimumPropagationDelayMs;
  if (isoMs(intent.metadataEffectiveAfter) < requiredEffectiveAfterMs) {
    return fail(intent, "premature_effective_time");
  }

  if (isoMs(input.simulatedNowIso) < isoMs(intent.metadataEffectiveAfter)) {
    return fail(intent, "premature_effective_time");
  }

  const gatewayRecord = input.gatewayRegistry.get(intent.contentUri);
  if (gatewayRecord === undefined || gatewayRecord.unavailable || gatewayRecord.payload === null) {
    return fail(intent, "mock_content_unavailable");
  }

  const computedHash = sha256Hex(gatewayRecord.payload);
  if (computedHash !== intent.contentHash) {
    return {
      ok: false,
      reason: "hash_drift",
      intentId: intent.intentId,
      computedContentHash: computedHash,
    };
  }

  return pass(intent, computedHash);
}

const APPROVED_AT = "2026-01-01T00:00:00.000Z";
const EFFECTIVE_AFTER = "2026-01-01T00:05:00.000Z";
const SIMULATED_NOW = "2026-01-01T00:05:01.000Z";
const EARLY_NOW = "2026-01-01T00:04:59.000Z";
const MIN_DELAY_MS = 5 * 60 * 1000;
const CONTENT_URI = "mock://metadata/token-v1.json";
const CONTENT_PAYLOAD = "{\"name\":\"Stage G6 Token\",\"symbol\":\"G6\",\"decimals\":9}";
const CONTENT_HASH = sha256Hex(CONTENT_PAYLOAD);
const INTENT_ID = "metadata-intent-g6-v1";
const APPROVAL_REF = "approval-evidence-g6-v1";
const ROLLBACK_INTENT_ID = "metadata-intent-g6-rollback-base";

function makeGatewayRegistry(overrides: MockGatewayRecord[] = []): MockGatewayRegistry {
  return new Map<string, MockGatewayRecord>([
    [CONTENT_URI, { contentUri: CONTENT_URI, payload: CONTENT_PAYLOAD, unavailable: false }],
    ...overrides.map((record) => [record.contentUri, record] as const),
  ]);
}

function makeLineageRegistry(values: readonly string[] = [ROLLBACK_INTENT_ID, INTENT_ID]): MetadataLineageRegistry {
  return new Set(values);
}

function makeApprovalEvidenceRegistry(values: readonly string[] = [APPROVAL_REF]): ApprovalEvidenceRegistry {
  return new Set(values);
}

function makeMetadataIntent(overrides: Partial<MetadataIntent> = {}): MetadataIntent {
  return {
    intentId: INTENT_ID,
    status: "approved",
    metadataIntentApprovedAt: APPROVED_AT,
    metadataEffectiveAfter: EFFECTIVE_AFTER,
    minimumPropagationDelayMs: MIN_DELAY_MS,
    contentUri: CONTENT_URI,
    contentHash: CONTENT_HASH,
    rollbackIntentId: ROLLBACK_INTENT_ID,
    approvalEvidenceRef: APPROVAL_REF,
    ...overrides,
  };
}

function makeValidationInput(overrides: Partial<ValidateMetadataIntentInput> = {}): ValidateMetadataIntentInput {
  return {
    intent: makeMetadataIntent(),
    simulatedNowIso: SIMULATED_NOW,
    gatewayRegistry: makeGatewayRegistry(),
    lineageRegistry: makeLineageRegistry(),
    approvalEvidenceRegistry: makeApprovalEvidenceRegistry(),
    ...overrides,
  };
}

function assertFailed(result: MetadataIntentValidationResult, reason: MetadataIntentValidationReason): void {
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason);
}

function assertPassed(result: MetadataIntentValidationResult): void {
  assert.equal(result.ok, true);
  assert.equal(result.reason, "metadata_intent_valid");
  assert.equal(result.computedContentHash, CONTENT_HASH);
}

function testPositiveAlignmentPasses(): void {
  const result = validateMetadataIntent(makeValidationInput());
  assertPassed(result);
}

function testPrematureEffectiveTimeFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    simulatedNowIso: EARLY_NOW,
  }));
  assertFailed(result, "premature_effective_time");
}

function testHashDriftFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    gatewayRegistry: makeGatewayRegistry([
      { contentUri: CONTENT_URI, payload: "{\"name\":\"Drifted\"}", unavailable: false },
    ]),
  }));
  assertFailed(result, "hash_drift");
  assert.match(result.computedContentHash ?? "", /^[a-f0-9]{64}$/);
}

function testMockContentUnavailableFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    gatewayRegistry: makeGatewayRegistry([
      { contentUri: CONTENT_URI, payload: null, unavailable: true },
    ]),
  }));
  assertFailed(result, "mock_content_unavailable");
}

function testMissingApprovalEvidenceFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    intent: makeMetadataIntent({
      approvalEvidenceRef: "",
    }),
  }));
  assertFailed(result, "missing_approval_evidence");
}

function testUnknownApprovalEvidenceFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    intent: makeMetadataIntent({
      approvalEvidenceRef: "missing-approval-evidence",
    }),
  }));
  assertFailed(result, "missing_approval_evidence");
}

function testBrokenRollbackLineageFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    intent: makeMetadataIntent({
      rollbackIntentId: "missing-rollback-intent",
    }),
  }));
  assertFailed(result, "broken_rollback_lineage");
}

function testConfiguredEffectiveAfterBeforeMinimumDelayFailsClosed(): void {
  const result = validateMetadataIntent(makeValidationInput({
    intent: makeMetadataIntent({
      metadataEffectiveAfter: "2026-01-01T00:04:59.000Z",
    }),
  }));
  assertFailed(result, "premature_effective_time");
}

function testDeterministicValidationReproducibility(): void {
  const input = makeValidationInput();
  const result1 = validateMetadataIntent(input);
  const result2 = validateMetadataIntent(input);
  assert.deepEqual(result1, result2, "same metadata intent input must produce identical validation result");
  assertPassed(result1);
}

function main(): void {
  testPositiveAlignmentPasses();
  testPrematureEffectiveTimeFailsClosed();
  testHashDriftFailsClosed();
  testMockContentUnavailableFailsClosed();
  testMissingApprovalEvidenceFailsClosed();
  testUnknownApprovalEvidenceFailsClosed();
  testBrokenRollbackLineageFailsClosed();
  testConfiguredEffectiveAfterBeforeMinimumDelayFailsClosed();
  testDeterministicValidationReproducibility();

  console.log(`${LABEL} PASS`);
}

main();
