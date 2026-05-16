import * as assert from "assert/strict";
import { createHash } from "node:crypto";

const LABEL = "[g-5-terminal-audit-reconciliation-smoke]";
const EXPECTED_SCHEMA_VERSION = "stage-a-entry-centric-v1";

type TerminalStatus =
  | "success"
  | "hard_failure"
  | "failed"
  | "skipped"
  | "cancelled"
  | "retried";

type ReconciliationReason =
  | "aligned"
  | "missing_audit_evidence"
  | "orphan_audit_evidence"
  | "duplicate_state_key"
  | "missing_recipient_address"
  | "state_key_mismatch"
  | "invalid_schema_version"
  | "missing_terminal_reason"
  | "fingerprint_mismatch"
  | "batch_fingerprint_mismatch"
  | "malformed_artifact"
  | "heartbeat_unavailable";

interface TerminalRunStateEntry {
  readonly stateKey: string;
  readonly batchId: string;
  readonly recipientAddress: string;
  readonly amount: string;
  readonly status: TerminalStatus;
  readonly schemaVersion: string;
  readonly terminalReason: string | null;
  readonly updatedAt: string;
}

interface AuditEvidenceRow {
  readonly stateKey: string;
  readonly batchId: string;
  readonly recipientAddress: string;
  readonly amount: string;
  readonly status: TerminalStatus;
  readonly terminalReason: string | null;
  readonly entryFingerprint: string;
}

interface HeartbeatLaneReport {
  readonly status: "healthy" | "unavailable";
  readonly reason: string | null;
}

interface BatchSummaryArtifact {
  readonly batchId: string;
  readonly entryCount: number;
  readonly aggregateFingerprint: string;
}

interface ReconciliationInput {
  readonly runStateEntries: readonly TerminalRunStateEntry[];
  readonly auditRows: readonly AuditEvidenceRow[];
  readonly heartbeat: HeartbeatLaneReport;
  readonly batchSummary: BatchSummaryArtifact;
}

interface ReconciliationResult {
  readonly ok: boolean;
  readonly reason: ReconciliationReason;
  readonly entryFingerprints: readonly string[];
  readonly aggregateFingerprint: string;
  readonly heartbeatReported: boolean;
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalizeForCanonicalJson(item));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = normalizeForCanonicalJson(record[key]);
    }
    return out;
  }
  return value;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeExpectedStateKey(batchId: string, recipientAddress: string): string {
  return `${batchId}::${recipientAddress.toLowerCase()}`;
}

function fingerprintEntry(entry: TerminalRunStateEntry): string {
  return sha256Hex(canonicalStringify({
    stateKey: entry.stateKey,
    batchId: entry.batchId,
    recipientAddress: entry.recipientAddress,
    amount: entry.amount,
    status: entry.status,
    schemaVersion: entry.schemaVersion,
    terminalReason: entry.terminalReason,
  }));
}

function aggregateFingerprint(fingerprints: readonly string[]): string {
  return sha256Hex(canonicalStringify({
    entryFingerprints: [...fingerprints].sort(),
  }));
}

function fail(reason: ReconciliationReason): ReconciliationResult {
  return {
    ok: false,
    reason,
    entryFingerprints: [],
    aggregateFingerprint: "",
    heartbeatReported: false,
  };
}

function isStatusRequiringReason(status: TerminalStatus): boolean {
  return status === "hard_failure" || status === "failed" || status === "skipped" || status === "retried";
}

function assertFailed(result: ReconciliationResult, reason: ReconciliationReason): void {
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason);
}

function assertPassed(result: ReconciliationResult): void {
  assert.equal(result.ok, true);
  assert.equal(result.reason, "aligned");
  assert.equal(result.heartbeatReported, true);
  assert.match(result.aggregateFingerprint, /^[a-f0-9]{64}$/);
}

function pass(entryFingerprints: readonly string[], aggregate: string): ReconciliationResult {
  return {
    ok: true,
    reason: "aligned",
    entryFingerprints,
    aggregateFingerprint: aggregate,
    heartbeatReported: true,
  };
}

function failHeartbeatUnavailable(): ReconciliationResult {
  return {
    ok: false,
    reason: "heartbeat_unavailable",
    entryFingerprints: [],
    aggregateFingerprint: "",
    heartbeatReported: true,
  };
}

function validateRunStateEntry(entry: TerminalRunStateEntry): ReconciliationReason | null {
  if (entry.schemaVersion !== EXPECTED_SCHEMA_VERSION) return "invalid_schema_version";
  if (entry.recipientAddress.trim() === "") return "missing_recipient_address";
  if (entry.stateKey !== makeExpectedStateKey(entry.batchId, entry.recipientAddress)) return "state_key_mismatch";
  if (isStatusRequiringReason(entry.status) && (entry.terminalReason === null || entry.terminalReason.trim() === "")) {
    return "missing_terminal_reason";
  }
  return null;
}

function hasDuplicateStateKey(entries: readonly TerminalRunStateEntry[]): boolean {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.stateKey)) return true;
    seen.add(entry.stateKey);
  }
  return false;
}

function isMalformedArtifact(input: ReconciliationInput): boolean {
  return (
    !Array.isArray(input.runStateEntries) ||
    !Array.isArray(input.auditRows) ||
    input.heartbeat === null ||
    input.heartbeat === undefined ||
    typeof input.heartbeat !== "object" ||
    input.batchSummary === null ||
    input.batchSummary === undefined ||
    typeof input.batchSummary !== "object"
  );
}

function indexAuditRows(rows: readonly AuditEvidenceRow[]): Map<string, AuditEvidenceRow> | null {
  const out = new Map<string, AuditEvidenceRow>();
  for (const row of rows) {
    if (out.has(row.stateKey)) return null;
    out.set(row.stateKey, row);
  }
  return out;
}

function reconcileTerminalAudit(input: ReconciliationInput): ReconciliationResult {
  if (isMalformedArtifact(input)) return fail("malformed_artifact");

  if (input.heartbeat.status === "unavailable") {
    return failHeartbeatUnavailable();
  }

  if (hasDuplicateStateKey(input.runStateEntries)) {
    return fail("duplicate_state_key");
  }

  const auditByStateKey = indexAuditRows(input.auditRows);
  if (auditByStateKey === null) return fail("duplicate_state_key");

  const runStateKeys = new Set<string>();
  const entryFingerprints: string[] = [];

  for (const entry of input.runStateEntries) {
    const validationError = validateRunStateEntry(entry);
    if (validationError !== null) return fail(validationError);

    runStateKeys.add(entry.stateKey);
    const auditRow = auditByStateKey.get(entry.stateKey);
    if (auditRow === undefined) return fail("missing_audit_evidence");

    if (auditRow.batchId !== entry.batchId) return fail("fingerprint_mismatch");
    if (auditRow.recipientAddress !== entry.recipientAddress) return fail("fingerprint_mismatch");
    if (auditRow.amount !== entry.amount) return fail("fingerprint_mismatch");
    if (auditRow.status !== entry.status) return fail("fingerprint_mismatch");
    if (auditRow.terminalReason !== entry.terminalReason) return fail("fingerprint_mismatch");

    const computedFingerprint = fingerprintEntry(entry);
    if (auditRow.entryFingerprint !== computedFingerprint) return fail("fingerprint_mismatch");
    entryFingerprints.push(computedFingerprint);
  }

  for (const row of input.auditRows) {
    if (!runStateKeys.has(row.stateKey)) return fail("orphan_audit_evidence");
  }

  const aggregate = aggregateFingerprint(entryFingerprints);
  const batchIds = new Set(input.runStateEntries.map((entry) => entry.batchId));

  if (batchIds.size !== 1 || !batchIds.has(input.batchSummary.batchId)) {
    return fail("batch_fingerprint_mismatch");
  }

  if (input.batchSummary.entryCount !== input.runStateEntries.length) {
    return fail("batch_fingerprint_mismatch");
  }
  if (input.batchSummary.aggregateFingerprint !== aggregate) {
    return fail("batch_fingerprint_mismatch");
  }

  return pass(entryFingerprints, aggregate);
}

const BATCH_ID = "campaign-g5-batch-1";
const RECIPIENT = "EQDestinationG5";
const STATE_KEY = "campaign-g5-batch-1::eqdestinationg5";
const NOW_ISO = "2026-01-01T00:00:00.000Z";

function makeTerminalEntry(overrides: Partial<TerminalRunStateEntry> = {}): TerminalRunStateEntry {
  return {
    stateKey: STATE_KEY,
    batchId: BATCH_ID,
    recipientAddress: RECIPIENT,
    amount: "777888999",
    status: "success",
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    terminalReason: "confirmed_dry_run_terminal",
    updatedAt: NOW_ISO,
    ...overrides,
  };
}

function makeAuditRow(entry: TerminalRunStateEntry, overrides: Partial<AuditEvidenceRow> = {}): AuditEvidenceRow {
  return {
    stateKey: entry.stateKey,
    batchId: entry.batchId,
    recipientAddress: entry.recipientAddress,
    amount: entry.amount,
    status: entry.status,
    terminalReason: entry.terminalReason,
    entryFingerprint: fingerprintEntry(entry),
    ...overrides,
  };
}

function makeAlignedInput(entry = makeTerminalEntry()): ReconciliationInput {
  const row = makeAuditRow(entry);
  const aggregate = aggregateFingerprint([row.entryFingerprint]);
  return {
    runStateEntries: [entry],
    auditRows: [row],
    heartbeat: { status: "healthy", reason: null },
    batchSummary: { batchId: BATCH_ID, entryCount: 1, aggregateFingerprint: aggregate },
  };
}

function testFullAlignmentPasses(): void {
  const result = reconcileTerminalAudit(makeAlignedInput());
  assertPassed(result);
}

function testTerminalRunStateWithoutAuditEvidenceFailsClosed(): void {
  const input = makeAlignedInput();
  const result = reconcileTerminalAudit({
    ...input,
    auditRows: [],
  });
  assertFailed(result, "missing_audit_evidence");
}

function testAuditEvidenceWithoutRunStateEntryFailsClosed(): void {
  const entry = makeTerminalEntry();
  const orphanEntry = makeTerminalEntry({
    stateKey: "campaign-g5-batch-1::orphan",
    recipientAddress: "EQOrphanG5",
  });
  const orphan = makeAuditRow(orphanEntry);
  const input = makeAlignedInput(entry);
  const result = reconcileTerminalAudit({
    ...input,
    auditRows: [...input.auditRows, orphan],
  });
  assertFailed(result, "orphan_audit_evidence");
}

function testDuplicateStateKeyFailsClosed(): void {
  const entry = makeTerminalEntry();
  const duplicate = makeTerminalEntry({ recipientAddress: "EQDuplicateG5" });
  const input = makeAlignedInput(entry);
  const result = reconcileTerminalAudit({
    ...input,
    runStateEntries: [entry, duplicate],
  });
  assertFailed(result, "duplicate_state_key");
}

function testMissingRecipientAddressFailsClosed(): void {
  const entry = makeTerminalEntry({ recipientAddress: "" });
  const input = makeAlignedInput(entry);
  const result = reconcileTerminalAudit(input);
  assertFailed(result, "missing_recipient_address");
}

function testStateKeyMismatchFailsClosed(): void {
  const entry = makeTerminalEntry({ stateKey: "campaign-g5-batch-1::wrong" });
  const input = makeAlignedInput(entry);
  const result = reconcileTerminalAudit(input);
  assertFailed(result, "state_key_mismatch");
}

function testSchemaVersionMismatchFailsClosed(): void {
  const entry = makeTerminalEntry({ schemaVersion: "bad-schema-version" });
  const input = makeAlignedInput(entry);
  const result = reconcileTerminalAudit(input);
  assertFailed(result, "invalid_schema_version");
}

function testTerminalStatusWithoutReasonFailsClosed(): void {
  for (const status of ["failed", "skipped", "retried"] as const) {
    const entry = makeTerminalEntry({
      status,
      terminalReason: "",
    });
    const input = makeAlignedInput(entry);
    const result = reconcileTerminalAudit(input);
    assertFailed(result, "missing_terminal_reason");
  }
}

function testCrossStoreFingerprintMismatchFailsClosed(): void {
  const input = makeAlignedInput();
  const result = reconcileTerminalAudit({
    ...input,
    auditRows: [{
      ...input.auditRows[0],
      entryFingerprint: "0".repeat(64),
    }],
  });
  assertFailed(result, "fingerprint_mismatch");
}

function testBatchAggregateMismatchFailsClosed(): void {
  const input = makeAlignedInput();
  const result = reconcileTerminalAudit({
    ...input,
    batchSummary: {
      ...input.batchSummary,
      aggregateFingerprint: "f".repeat(64),
    },
  });
  assertFailed(result, "batch_fingerprint_mismatch");
}

function testMalformedArtifactFailsClosed(): void {
  const input = makeAlignedInput() as unknown as Record<string, unknown>;
  delete input["batchSummary"];
  const result = reconcileTerminalAudit(input as unknown as ReconciliationInput);
  assertFailed(result, "malformed_artifact");
}

function testHeartbeatUnavailableIsExplicitlyReported(): void {
  const input = makeAlignedInput();
  const result = reconcileTerminalAudit({
    ...input,
    heartbeat: { status: "unavailable", reason: "heartbeat_writer_unavailable" },
  });
  assertFailed(result, "heartbeat_unavailable");
  assert.equal(result.heartbeatReported, true);
}

function testDeterministicFingerprintReproducibility(): void {
  const input = makeAlignedInput();
  const result1 = reconcileTerminalAudit(input);
  const result2 = reconcileTerminalAudit(input);

  assert.deepEqual(result1, result2, "same input must produce identical reconciliation result");
  assertPassed(result1);
}

function main(): void {
  testFullAlignmentPasses();
  testTerminalRunStateWithoutAuditEvidenceFailsClosed();
  testAuditEvidenceWithoutRunStateEntryFailsClosed();
  testDuplicateStateKeyFailsClosed();
  testMissingRecipientAddressFailsClosed();
  testStateKeyMismatchFailsClosed();
  testSchemaVersionMismatchFailsClosed();
  testTerminalStatusWithoutReasonFailsClosed();
  testCrossStoreFingerprintMismatchFailsClosed();
  testBatchAggregateMismatchFailsClosed();
  testMalformedArtifactFailsClosed();
  testHeartbeatUnavailableIsExplicitlyReported();
  testDeterministicFingerprintReproducibility();

  console.log(`${LABEL} PASS`);
}

main();
