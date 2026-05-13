import {
  makeStateKey,
  type RunState,
  type StateEntry,
  type StateKey,
  type StateStatus,
} from "./stateStore";
import {
  validatePassiveHeartbeatRecord,
  type PassiveHeartbeatRecord,
} from "../watcher/passiveHeartbeat";

// ---------------------------------------------------------------------------
// Exported evidence types
// ---------------------------------------------------------------------------

export interface CrossStoreAuditEvidence {
  readonly eventType: string;
  readonly campaignId: string;
  readonly batchId: string | null;
  readonly stateKey: string | null;
  readonly operatorId: string | null;
  readonly attemptNumber: number | null;
  readonly status: string | null;
  readonly emittedAt: string;
  readonly details?: Record<string, unknown>;
}

export interface CrossStoreStructuredLogEvidence {
  readonly level: "info" | "warn" | "error" | "fatal";
  readonly message: string;
  readonly campaignId: string;
  readonly batchId: string | null;
  readonly stateKey: string | null;
  readonly operatorId: string | null;
  readonly attemptNumber: number | null;
  readonly status: string | null;
  readonly emittedAt: string;
  readonly details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Issue reason union
// ---------------------------------------------------------------------------

export type CrossStoreConsistencyIssueReason =
  | "invalid_input"
  | "invalid_run_state"
  | "invalid_state_key"
  | "missing_state_entry"
  | "invalid_state_entry"
  | "state_key_mismatch"
  | "status_mismatch"
  | "audit_event_invalid"
  | "audit_campaign_mismatch"
  | "audit_batch_mismatch"
  | "audit_state_key_mismatch"
  | "audit_operator_mismatch"
  | "audit_attempt_mismatch"
  | "audit_status_mismatch"
  | "structured_log_invalid"
  | "structured_log_campaign_mismatch"
  | "structured_log_batch_mismatch"
  | "structured_log_state_key_mismatch"
  | "structured_log_operator_mismatch"
  | "structured_log_attempt_mismatch"
  | "structured_log_status_mismatch"
  | "heartbeat_invalid"
  | "heartbeat_campaign_mismatch"
  | "heartbeat_error_present";

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

export interface CrossStoreConsistencyIssue {
  readonly reason: CrossStoreConsistencyIssueReason;
  readonly path: string;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type CrossStoreConsistencyResult =
  | {
      readonly ok: true;
      readonly action: "consistent";
      readonly stateKey: StateKey;
      readonly entry: StateEntry;
    }
  | {
      readonly ok: false;
      readonly action: "divergent";
      readonly stateKey?: StateKey;
      readonly issues: readonly CrossStoreConsistencyIssue[];
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface ConsistencyInput {
  readonly runState: RunState;
  readonly stateKey: StateKey;
  readonly expectedStatus: StateStatus;
  readonly auditEvent: CrossStoreAuditEvidence | null;
  readonly structuredLogEvent: CrossStoreStructuredLogEvidence | null;
  readonly heartbeatRecord: PassiveHeartbeatRecord | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isPositiveDecimalString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isValidIsoLike(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return Number.isFinite(Date.parse(value as string));
}

const VALID_STATUSES = new Set<string>([
  "planned",
  "submitted",
  "success",
  "hard_failure",
  "cooldown",
  "skipped",
  "cancelled",
]);

const VALID_LOG_LEVELS = new Set<string>(["info", "warn", "error", "fatal"]);

function issue(
  reason: CrossStoreConsistencyIssueReason,
  path: string,
  detail: string,
): CrossStoreConsistencyIssue {
  return { reason, path, detail };
}

function divergent(
  issues: CrossStoreConsistencyIssue[],
  stateKey?: StateKey,
): CrossStoreConsistencyResult {
  const result: {
    ok: false;
    action: "divergent";
    stateKey?: StateKey;
    issues: readonly CrossStoreConsistencyIssue[];
  } = { ok: false, action: "divergent", issues };
  if (stateKey !== undefined) result.stateKey = stateKey;
  return result;
}

function isValidStateEntryShape(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value["batchId"]) &&
    isNonEmptyString(value["recipientAddress"]) &&
    isSafeNonNegativeInteger(value["recipientIndex"]) &&
    isPositiveDecimalString(value["amount"]) &&
    typeof value["status"] === "string" &&
    VALID_STATUSES.has(value["status"]) &&
    isSafeNonNegativeInteger(value["attemptNumber"]) &&
    (value["operatorId"] === null || typeof value["operatorId"] === "string") &&
    (value["operatorLabel"] === null || typeof value["operatorLabel"] === "string") &&
    isValidIsoLike(value["createdAt"]) &&
    isValidIsoLike(value["updatedAt"])
  );
}

function isValidAuditEventShape(value: unknown): value is CrossStoreAuditEvidence {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    isNonEmptyString(v["eventType"]) &&
    isNonEmptyString(v["campaignId"]) &&
    (v["batchId"] === null || typeof v["batchId"] === "string") &&
    (v["stateKey"] === null || typeof v["stateKey"] === "string") &&
    (v["operatorId"] === null || typeof v["operatorId"] === "string") &&
    (v["attemptNumber"] === null || isSafeNonNegativeInteger(v["attemptNumber"])) &&
    (v["status"] === null || typeof v["status"] === "string") &&
    isValidIsoLike(v["emittedAt"]) &&
    (v["details"] === undefined || isNonArrayObject(v["details"]))
  );
}

function isValidStructuredLogShape(value: unknown): value is CrossStoreStructuredLogEvidence {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["level"] === "string" &&
    VALID_LOG_LEVELS.has(v["level"]) &&
    isNonEmptyString(v["message"]) &&
    isNonEmptyString(v["campaignId"]) &&
    (v["batchId"] === null || typeof v["batchId"] === "string") &&
    (v["stateKey"] === null || typeof v["stateKey"] === "string") &&
    (v["operatorId"] === null || typeof v["operatorId"] === "string") &&
    (v["attemptNumber"] === null || isSafeNonNegativeInteger(v["attemptNumber"])) &&
    (v["status"] === null || typeof v["status"] === "string") &&
    isValidIsoLike(v["emittedAt"]) &&
    (v["details"] === undefined || isNonArrayObject(v["details"]))
  );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function checkCrossStoreConsistency(
  input: unknown,
): CrossStoreConsistencyResult {
  const issues: CrossStoreConsistencyIssue[] = [];

  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return divergent([issue("invalid_input", "input", "input must be a non-null, non-array object")]);
  }

  const candidate = input as unknown as ConsistencyInput;

  if (
    !("auditEvent" in candidate) ||
    !("structuredLogEvent" in candidate) ||
    !("heartbeatRecord" in candidate)
  ) {
    issues.push(issue("invalid_input", "input", "auditEvent, structuredLogEvent, and heartbeatRecord fields are required; use null when absent"));
  }

  // Rule 2: runState validation
  let campaignId: string | undefined;
  let entriesObj: Record<string, unknown> | undefined;

  if (!isNonArrayObject(candidate.runState)) {
    issues.push(issue("invalid_run_state", "runState", "runState must be a non-null object"));
  } else {
    const rs = candidate.runState as unknown as Record<string, unknown>;
    if (rs["schemaVersion"] !== "stage-a-entry-centric-v1") {
      issues.push(issue("invalid_run_state", "runState.schemaVersion", `expected "stage-a-entry-centric-v1", got ${String(rs["schemaVersion"])}`));
    }
    if (!isNonArrayObject(rs["meta"])) {
      issues.push(issue("invalid_run_state", "runState.meta", "meta must be a non-null object"));
    } else {
      const meta = rs["meta"] as Record<string, unknown>;
      if (!isNonEmptyString(meta["campaignId"])) {
        issues.push(issue("invalid_run_state", "runState.meta.campaignId", "campaignId must be non-empty string"));
      } else {
        campaignId = meta["campaignId"] as string;
      }
    }
    if (!isNonArrayObject(rs["entries"])) {
      issues.push(issue("invalid_run_state", "runState.entries", "entries must be a non-null object"));
    } else {
      entriesObj = rs["entries"] as Record<string, unknown>;
    }
  }

  // Rule 3: stateKey validation
  if (!isNonEmptyString(candidate.stateKey)) {
    issues.push(issue("invalid_state_key", "stateKey", "stateKey must be a non-empty string"));
  }

  // Rule 4: expectedStatus validation
  if (!VALID_STATUSES.has(candidate.expectedStatus as string)) {
    issues.push(issue("invalid_input", "expectedStatus", `expectedStatus "${String(candidate.expectedStatus)}" is not a valid StateStatus`));
  }

  // Early return if we cannot proceed with entry lookup
  if (issues.length > 0 && (entriesObj === undefined || !isNonEmptyString(candidate.stateKey))) {
    return divergent(issues);
  }

  const stateKey = candidate.stateKey as StateKey;

  // Rule 5: entry must exist
  let entry: StateEntry | undefined;
  if (entriesObj !== undefined && isNonEmptyString(stateKey)) {
    const raw = entriesObj[stateKey];
    if (raw === undefined || raw === null) {
      issues.push(issue("missing_state_entry", `runState.entries[${stateKey}]`, "no entry found for stateKey"));
    } else if (!isNonArrayObject(raw)) {
      issues.push(issue("invalid_state_entry", `runState.entries[${stateKey}]`, "entry must be a non-null object"));
    } else {
      // Rule 6: validate state entry shape
      if (!isValidStateEntryShape(raw)) {
        issues.push(issue("invalid_state_entry", `runState.entries[${stateKey}]`, "entry has invalid shape or field values"));
      } else {
        entry = raw as unknown as StateEntry;

        // Rule 7: state key derivation check
        const derivedKey = makeStateKey(entry.batchId, entry.recipientAddress);
        if (derivedKey !== stateKey) {
          issues.push(issue("state_key_mismatch", `runState.entries[${stateKey}]`, `derived stateKey "${derivedKey}" does not match provided stateKey "${stateKey}"`));
        }

        // Rule 8: status check
        if (entry.status !== (candidate.expectedStatus as string)) {
          issues.push(issue("status_mismatch", `runState.entries[${stateKey}].status`, `expected "${String(candidate.expectedStatus)}", found "${entry.status}"`));
        }
      }
    }
  }

  // Rule 9: audit event checks
  if (candidate.auditEvent !== null && candidate.auditEvent !== undefined) {
    if (!isValidAuditEventShape(candidate.auditEvent)) {
      issues.push(issue("audit_event_invalid", "auditEvent", "auditEvent has invalid shape or missing required fields"));
    } else {
      const ae = candidate.auditEvent;

      if (campaignId !== undefined && ae.campaignId !== campaignId) {
        issues.push(issue("audit_campaign_mismatch", "auditEvent.campaignId", `auditEvent.campaignId "${ae.campaignId}" does not match runState campaignId "${campaignId}"`));
      }

      if (entry !== undefined) {
        if (ae.batchId !== null && ae.batchId !== entry.batchId) {
          issues.push(issue("audit_batch_mismatch", "auditEvent.batchId", `auditEvent.batchId "${ae.batchId}" does not match entry.batchId "${entry.batchId}"`));
        }
        if (ae.stateKey !== null && ae.stateKey !== stateKey) {
          issues.push(issue("audit_state_key_mismatch", "auditEvent.stateKey", `auditEvent.stateKey "${ae.stateKey}" does not match stateKey "${stateKey}"`));
        }
        if (ae.operatorId !== null && ae.operatorId !== entry.operatorId) {
          issues.push(issue("audit_operator_mismatch", "auditEvent.operatorId", `auditEvent.operatorId "${ae.operatorId}" does not match entry.operatorId "${String(entry.operatorId)}"`));
        }
        if (ae.attemptNumber !== null && ae.attemptNumber !== entry.attemptNumber) {
          issues.push(issue("audit_attempt_mismatch", "auditEvent.attemptNumber", `auditEvent.attemptNumber ${ae.attemptNumber} does not match entry.attemptNumber ${entry.attemptNumber}`));
        }
        if (ae.status !== null && ae.status !== entry.status) {
          issues.push(issue("audit_status_mismatch", "auditEvent.status", `auditEvent.status "${ae.status}" does not match entry.status "${entry.status}"`));
        }
      }
    }
  }

  // Rule 10: structured log event checks
  if (candidate.structuredLogEvent !== null && candidate.structuredLogEvent !== undefined) {
    if (!isValidStructuredLogShape(candidate.structuredLogEvent)) {
      issues.push(issue("structured_log_invalid", "structuredLogEvent", "structuredLogEvent has invalid shape or missing required fields"));
    } else {
      const sl = candidate.structuredLogEvent;

      if (campaignId !== undefined && sl.campaignId !== campaignId) {
        issues.push(issue("structured_log_campaign_mismatch", "structuredLogEvent.campaignId", `structuredLogEvent.campaignId "${sl.campaignId}" does not match runState campaignId "${campaignId}"`));
      }

      if (entry !== undefined) {
        if (sl.batchId !== null && sl.batchId !== entry.batchId) {
          issues.push(issue("structured_log_batch_mismatch", "structuredLogEvent.batchId", `structuredLogEvent.batchId "${sl.batchId}" does not match entry.batchId "${entry.batchId}"`));
        }
        if (sl.stateKey !== null && sl.stateKey !== stateKey) {
          issues.push(issue("structured_log_state_key_mismatch", "structuredLogEvent.stateKey", `structuredLogEvent.stateKey "${sl.stateKey}" does not match stateKey "${stateKey}"`));
        }
        if (sl.operatorId !== null && sl.operatorId !== entry.operatorId) {
          issues.push(issue("structured_log_operator_mismatch", "structuredLogEvent.operatorId", `structuredLogEvent.operatorId "${sl.operatorId}" does not match entry.operatorId "${String(entry.operatorId)}"`));
        }
        if (sl.attemptNumber !== null && sl.attemptNumber !== entry.attemptNumber) {
          issues.push(issue("structured_log_attempt_mismatch", "structuredLogEvent.attemptNumber", `structuredLogEvent.attemptNumber ${sl.attemptNumber} does not match entry.attemptNumber ${entry.attemptNumber}`));
        }
        if (sl.status !== null && sl.status !== entry.status) {
          issues.push(issue("structured_log_status_mismatch", "structuredLogEvent.status", `structuredLogEvent.status "${sl.status}" does not match entry.status "${entry.status}"`));
        }
      }
    }
  }

  // Rule 11: heartbeat record checks
  if (candidate.heartbeatRecord !== null && candidate.heartbeatRecord !== undefined) {
    const heartbeatValidation = validatePassiveHeartbeatRecord(candidate.heartbeatRecord);
    if (!heartbeatValidation.ok) {
      const details = heartbeatValidation.issues
        .map((i) => `${i.path}:${i.reason}`)
        .join(",");
      issues.push(issue("heartbeat_invalid", "heartbeatRecord", `heartbeatRecord failed validation: ${details}`));
    } else {
      const hb = candidate.heartbeatRecord as unknown as Record<string, unknown>;
      if (hb["campaignId"] !== null && campaignId !== undefined && hb["campaignId"] !== campaignId) {
        issues.push(issue("heartbeat_campaign_mismatch", "heartbeatRecord.campaignId", `heartbeatRecord.campaignId "${String(hb["campaignId"])}" does not match runState campaignId "${campaignId}"`));
      }
      if (hb["lastKnownError"] !== null && hb["lastKnownError"] !== undefined) {
        issues.push(issue("heartbeat_error_present", "heartbeatRecord.lastKnownError", `heartbeatRecord reports a last known error: ${String(hb["lastKnownError"])}`));
      }
    }
  }

  // Rules 12-15: collect and return
  if (issues.length === 0 && entry !== undefined) {
    return {
      ok: true,
      action: "consistent",
      stateKey,
      entry,
    };
  }

  return divergent(issues, isNonEmptyString(candidate.stateKey) ? candidate.stateKey as StateKey : undefined);
}
