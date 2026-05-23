const LABEL = "[h-6-2-metadata-rollback-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

type RollbackLabel =
  | "ROLLBACK_OK"
  | "ROLLBACK_INTENT_MISSING"
  | "ROLLBACK_HASH_MISMATCH"
  | "ROLLBACK_LINEAGE_MISMATCH"
  | "ADMIN_APPROVAL_MISSING"
  | "HIDDEN_FALLBACK_ROLLBACK";

type RollbackResult = {
  readonly label: RollbackLabel;
  readonly blocking: boolean;
  readonly reasonCode: string;
};

type RollbackIntent = {
  readonly rollbackIntentId?: string;
  readonly originalContentHash: string;
  readonly rollbackTargetHash: string;
  readonly lineageReferenceId: string;
  readonly administrativeApprovalId?: string;
  readonly rollbackReasonCode: string;
  readonly evidenceReferenceId: string;
  readonly fallbackRollbackUri?: string;
};

type RollbackPolicy = {
  readonly approvedOriginalHash: string;
  readonly approvedLineageIds: ReadonlySet<string>;
  readonly approvedAdministrativeApprovals: ReadonlySet<string>;
};

function makeResult(label: RollbackLabel, reasonCode: string): RollbackResult {
  return {
    label,
    blocking: label !== "ROLLBACK_OK",
    reasonCode,
  };
}

function validateRollback(intent: RollbackIntent | null, policy: RollbackPolicy): RollbackResult {
  if (intent === null || !intent.rollbackIntentId) {
    return makeResult("ROLLBACK_INTENT_MISSING", "rollback_intent_missing");
  }

  if (intent.rollbackTargetHash !== policy.approvedOriginalHash) {
    return makeResult("ROLLBACK_HASH_MISMATCH", "rollback_hash_mismatch");
  }

  if (intent.originalContentHash !== policy.approvedOriginalHash) {
    return makeResult("ROLLBACK_HASH_MISMATCH", "rollback_original_hash_mismatch");
  }

  if (!policy.approvedLineageIds.has(intent.lineageReferenceId)) {
    return makeResult("ROLLBACK_LINEAGE_MISMATCH", "rollback_lineage_mismatch");
  }

  if (
    !intent.administrativeApprovalId ||
    !policy.approvedAdministrativeApprovals.has(intent.administrativeApprovalId)
  ) {
    return makeResult("ADMIN_APPROVAL_MISSING", "admin_approval_missing");
  }

  if (
    intent.fallbackRollbackUri !== undefined &&
    intent.fallbackRollbackUri.trim() !== ""
  ) {
    return makeResult("HIDDEN_FALLBACK_ROLLBACK", "hidden_fallback_rollback");
  }

  return makeResult("ROLLBACK_OK", "rollback_ok");
}

const ORIGINAL_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LINEAGE_ID = "metadata-intent-approved-v1";
const ADMIN_APPROVAL_ID = "admin-approval-rollback-v1";

const POLICY: RollbackPolicy = {
  approvedOriginalHash: ORIGINAL_HASH,
  approvedLineageIds: new Set([LINEAGE_ID]),
  approvedAdministrativeApprovals: new Set([ADMIN_APPROVAL_ID]),
};

const VALID_INTENT: RollbackIntent = {
  rollbackIntentId: "rollback-intent-v1",
  originalContentHash: ORIGINAL_HASH,
  rollbackTargetHash: ORIGINAL_HASH,
  lineageReferenceId: LINEAGE_ID,
  administrativeApprovalId: ADMIN_APPROVAL_ID,
  rollbackReasonCode: "approved_metadata_recovery",
  evidenceReferenceId: "rollback-evidence-v1",
};

function runCase(
  name: string,
  intent: RollbackIntent | null,
  expected: RollbackLabel
): void {
  const result = validateRollback(intent, POLICY);
  assert(result.label === expected, `${name} expected ${expected} got ${result.label}`);
}

function main(): void {
  runCase("valid static rollback intent passes", VALID_INTENT, "ROLLBACK_OK");

  runCase("missing rollback intent fails closed", null, "ROLLBACK_INTENT_MISSING");

  runCase("rollback hash mismatch fails closed", {
    ...VALID_INTENT,
    rollbackTargetHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }, "ROLLBACK_HASH_MISMATCH");

  runCase("rollback lineage mismatch fails closed", {
    ...VALID_INTENT,
    lineageReferenceId: "missing-lineage",
  }, "ROLLBACK_LINEAGE_MISMATCH");

  runCase("missing administrative approval fails closed", {
    ...VALID_INTENT,
    administrativeApprovalId: "missing-approval",
  }, "ADMIN_APPROVAL_MISSING");

  runCase("hidden fallback rollback fails closed", {
    ...VALID_INTENT,
    fallbackRollbackUri: "mock://metadata/fallback-rollback.json",
  }, "HIDDEN_FALLBACK_ROLLBACK");

  console.log(`${LABEL} PASS`);
}

main();
