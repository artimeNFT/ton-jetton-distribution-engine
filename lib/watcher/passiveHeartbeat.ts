export type PassiveHeartbeatSchemaVersion = "passive-heartbeat-v1";

export type PassiveHeartbeatSource =
  | "orchestrator"
  | "watcher"
  | "dispatcher"
  | "recovery"
  | "manual_smoke";

export type PassiveHeartbeatSeverity = "info" | "warn" | "error" | "fatal";

export type PassiveHeartbeatSystemStatus =
  | "starting"
  | "alive"
  | "degraded"
  | "blocked"
  | "recovering"
  | "stopping"
  | "stopped";

export type HeartbeatSubsystemStatusValue =
  | "unknown"
  | "ok"
  | "degraded"
  | "blocked"
  | "failed";

export type HeartbeatLockStatusValue =
  | "unknown"
  | "not_required"
  | "acquired"
  | "owned"
  | "ownership_lost"
  | "stale"
  | "blocked";

export type HeartbeatGasStatusValue =
  | "unknown"
  | "ok"
  | "stale"
  | "over_limit"
  | "unavailable";

export type HeartbeatBlacklistStatusValue =
  | "unknown"
  | "ok"
  | "missing"
  | "checksum_mismatch"
  | "signature_invalid";

export type HeartbeatRpcStatusValue =
  | "unknown"
  | "ok"
  | "degraded"
  | "unavailable";

export type HeartbeatOperatorStatusValue =
  | "unknown"
  | "ok"
  | "degraded"
  | "blocked";

export type HeartbeatErrorSubsystem =
  | "decision_store"
  | "heartbeat_store"
  | "lock"
  | "gas"
  | "blacklist"
  | "rpc"
  | "operator"
  | "orchestrator"
  | "unknown";

export interface HeartbeatSubsystemStatus {
  readonly status: HeartbeatSubsystemStatusValue;
  readonly path: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly reason: string | null;
}

export interface HeartbeatLockStatus {
  readonly status: HeartbeatLockStatusValue;
  readonly lockPath: string | null;
  readonly ownerId: string | null;
  readonly lockId: string | null;
  readonly acquiredAt: string | null;
  readonly checkedAt: string | null;
  readonly reason: string | null;
}

export interface HeartbeatGasStatus {
  readonly status: HeartbeatGasStatusValue;
  readonly lastGasObservedAt: string | null;
  readonly gasEstimateSource: string | null;
  readonly feeDecision: string | null;
  readonly reason: string | null;
}

export interface HeartbeatBlacklistStatus {
  readonly status: HeartbeatBlacklistStatusValue;
  readonly blacklistVersion: string | null;
  readonly checksum: string | null;
  readonly checkedAt: string | null;
  readonly reason: string | null;
}

export interface HeartbeatRpcStatus {
  readonly status: HeartbeatRpcStatusValue;
  readonly provider: string | null;
  readonly endpoint: string | null;
  readonly observedLatencyMs: number | null;
  readonly checkedAt: string | null;
  readonly reason: string | null;
}

export interface HeartbeatOperatorStatus {
  readonly status: HeartbeatOperatorStatusValue;
  readonly activeOperatorCount: number | null;
  readonly pausedOperatorCount: number | null;
  readonly failedOperatorCount: number | null;
  readonly reason: string | null;
}

export interface HeartbeatCounters {
  readonly candidatesSeen: number;
  readonly decisionsWritten: number;
  readonly decisionsRejected: number;
  readonly duplicatesDetected: number;
  readonly recoveryAttempts: number;
  readonly heartbeatWriteFailures: number;
}

export interface HeartbeatError {
  readonly code: string;
  readonly message: string;
  readonly subsystem: HeartbeatErrorSubsystem;
  readonly occurredAt: string;
}

export interface PassiveHeartbeatRecord {
  readonly schemaVersion: PassiveHeartbeatSchemaVersion;
  readonly heartbeatId: string;
  readonly heartbeatRunId: string;
  readonly campaignId: string | null;
  readonly emittedAt: string;
  readonly source: PassiveHeartbeatSource;
  readonly severity: PassiveHeartbeatSeverity;
  readonly systemStatus: PassiveHeartbeatSystemStatus;
  readonly decisionStoreStatus: HeartbeatSubsystemStatus;
  readonly heartbeatStoreStatus: HeartbeatSubsystemStatus;
  readonly lockStatus: HeartbeatLockStatus;
  readonly gasStatus: HeartbeatGasStatus;
  readonly blacklistStatus: HeartbeatBlacklistStatus;
  readonly rpcStatus: HeartbeatRpcStatus;
  readonly operatorStatus: HeartbeatOperatorStatus;
  readonly counters: HeartbeatCounters;
  readonly lastKnownDecisionId: string | null;
  readonly lastKnownCandidateId: string | null;
  readonly lastKnownError: HeartbeatError | null;
  readonly notes: string | null;
}

export type PassiveHeartbeatValidationReason =
  | "heartbeat_not_object"
  | "invalid_schema_version"
  | "missing_required_string"
  | "invalid_iso_timestamp"
  | "invalid_enum"
  | "invalid_status_object"
  | "invalid_counter"
  | "invalid_error_object";

export interface PassiveHeartbeatValidationIssue {
  readonly reason: PassiveHeartbeatValidationReason;
  readonly path: string;
  readonly detail: string;
}

export type PassiveHeartbeatValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly PassiveHeartbeatValidationIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function pushIssue(
  issues: PassiveHeartbeatValidationIssue[],
  reason: PassiveHeartbeatValidationReason,
  path: string,
  detail: string,
): void {
  issues.push({ reason, path, detail });
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

const heartbeatSources: readonly PassiveHeartbeatSource[] = [
  "orchestrator",
  "watcher",
  "dispatcher",
  "recovery",
  "manual_smoke",
];

const heartbeatSeverities: readonly PassiveHeartbeatSeverity[] = [
  "info",
  "warn",
  "error",
  "fatal",
];

const systemStatuses: readonly PassiveHeartbeatSystemStatus[] = [
  "starting",
  "alive",
  "degraded",
  "blocked",
  "recovering",
  "stopping",
  "stopped",
];

const subsystemStatuses: readonly HeartbeatSubsystemStatusValue[] = [
  "unknown",
  "ok",
  "degraded",
  "blocked",
  "failed",
];

const lockStatuses: readonly HeartbeatLockStatusValue[] = [
  "unknown",
  "not_required",
  "acquired",
  "owned",
  "ownership_lost",
  "stale",
  "blocked",
];

const gasStatuses: readonly HeartbeatGasStatusValue[] = [
  "unknown",
  "ok",
  "stale",
  "over_limit",
  "unavailable",
];

const blacklistStatuses: readonly HeartbeatBlacklistStatusValue[] = [
  "unknown",
  "ok",
  "missing",
  "checksum_mismatch",
  "signature_invalid",
];

const rpcStatuses: readonly HeartbeatRpcStatusValue[] = [
  "unknown",
  "ok",
  "degraded",
  "unavailable",
];

const operatorStatuses: readonly HeartbeatOperatorStatusValue[] = [
  "unknown",
  "ok",
  "degraded",
  "blocked",
];

const errorSubsystems: readonly HeartbeatErrorSubsystem[] = [
  "decision_store",
  "heartbeat_store",
  "lock",
  "gas",
  "blacklist",
  "rpc",
  "operator",
  "orchestrator",
  "unknown",
];

function validateSubsystemStatus(
  value: unknown,
  path: string,
  issues: PassiveHeartbeatValidationIssue[],
): void {
  if (!isObject(value)) {
    pushIssue(issues, "invalid_status_object", path, "must be object");
    return;
  }

  if (!isOneOf(value["status"], subsystemStatuses)) {
    pushIssue(issues, "invalid_enum", `${path}.status`, "invalid subsystem status");
  }

  for (const key of ["path", "lastSuccessAt", "lastFailureAt", "reason"]) {
    const v = value[key];
    if (v !== null && v !== undefined && typeof v !== "string") {
      pushIssue(issues, "invalid_status_object", `${path}.${key}`, "must be string or null");
    }
  }
}

function validateLockStatus(
  value: unknown,
  path: string,
  issues: PassiveHeartbeatValidationIssue[],
): void {
  if (!isObject(value)) {
    pushIssue(issues, "invalid_status_object", path, "must be object");
    return;
  }

  if (!isOneOf(value["status"], lockStatuses)) {
    pushIssue(issues, "invalid_enum", `${path}.status`, "invalid lock status");
  }

  for (const key of ["lockPath", "ownerId", "lockId", "acquiredAt", "checkedAt", "reason"]) {
    const v = value[key];
    if (v !== null && v !== undefined && typeof v !== "string") {
      pushIssue(issues, "invalid_status_object", `${path}.${key}`, "must be string or null");
    }
  }
}

function validateEnumStatusObject<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  issues: PassiveHeartbeatValidationIssue[],
): void {
  if (!isObject(value)) {
    pushIssue(issues, "invalid_status_object", path, "must be object");
    return;
  }

  if (!isOneOf(value["status"], allowed)) {
    pushIssue(issues, "invalid_enum", `${path}.status`, "invalid status");
  }
}

function validateCounters(
  value: unknown,
  issues: PassiveHeartbeatValidationIssue[],
): void {
  if (!isObject(value)) {
    pushIssue(issues, "invalid_counter", "counters", "must be object");
    return;
  }

  for (const key of [
    "candidatesSeen",
    "decisionsWritten",
    "decisionsRejected",
    "duplicatesDetected",
    "recoveryAttempts",
    "heartbeatWriteFailures",
  ]) {
    const v = value[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      pushIssue(issues, "invalid_counter", `counters.${key}`, "must be integer >= 0");
    }
  }
}

function validateHeartbeatError(
  value: unknown,
  issues: PassiveHeartbeatValidationIssue[],
): void {
  if (value === null) return;

  if (!isObject(value)) {
    pushIssue(issues, "invalid_error_object", "lastKnownError", "must be object or null");
    return;
  }

  if (!isNonEmptyString(value["code"])) {
    pushIssue(issues, "missing_required_string", "lastKnownError.code", "required");
  }
  if (!isNonEmptyString(value["message"])) {
    pushIssue(issues, "missing_required_string", "lastKnownError.message", "required");
  }
  if (!isOneOf(value["subsystem"], errorSubsystems)) {
    pushIssue(issues, "invalid_enum", "lastKnownError.subsystem", "invalid subsystem");
  }
  if (!isIsoTimestamp(value["occurredAt"])) {
    pushIssue(issues, "invalid_iso_timestamp", "lastKnownError.occurredAt", "invalid ISO timestamp");
  }
}

export function validatePassiveHeartbeatRecord(
  record: unknown,
): PassiveHeartbeatValidationResult {
  const issues: PassiveHeartbeatValidationIssue[] = [];

  if (!isObject(record)) {
    return { ok: false, issues: [{ reason: "heartbeat_not_object", path: "$", detail: "must be object" }] };
  }

  if (record["schemaVersion"] !== "passive-heartbeat-v1") {
    pushIssue(issues, "invalid_schema_version", "schemaVersion", "must be passive-heartbeat-v1");
  }

  for (const key of ["heartbeatId", "heartbeatRunId", "emittedAt"]) {
    if (!isNonEmptyString(record[key])) {
      pushIssue(issues, "missing_required_string", key, "required");
    }
  }

  if (!isIsoTimestamp(record["emittedAt"])) {
    pushIssue(issues, "invalid_iso_timestamp", "emittedAt", "invalid ISO timestamp");
  }

  if (!isOneOf(record["source"], heartbeatSources)) {
    pushIssue(issues, "invalid_enum", "source", "invalid heartbeat source");
  }
  if (!isOneOf(record["severity"], heartbeatSeverities)) {
    pushIssue(issues, "invalid_enum", "severity", "invalid severity");
  }
  if (!isOneOf(record["systemStatus"], systemStatuses)) {
    pushIssue(issues, "invalid_enum", "systemStatus", "invalid system status");
  }

  validateSubsystemStatus(record["decisionStoreStatus"], "decisionStoreStatus", issues);
  validateSubsystemStatus(record["heartbeatStoreStatus"], "heartbeatStoreStatus", issues);
  validateLockStatus(record["lockStatus"], "lockStatus", issues);

  validateEnumStatusObject(record["gasStatus"], "gasStatus", gasStatuses, issues);
  validateEnumStatusObject(record["blacklistStatus"], "blacklistStatus", blacklistStatuses, issues);
  validateEnumStatusObject(record["rpcStatus"], "rpcStatus", rpcStatuses, issues);
  validateEnumStatusObject(record["operatorStatus"], "operatorStatus", operatorStatuses, issues);

  validateCounters(record["counters"], issues);
  validateHeartbeatError(record["lastKnownError"], issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
