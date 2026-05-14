// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type HeartbeatAppendTrigger =
  | "periodic"
  | "batch_started"
  | "batch_completed"
  | "administrative_halt"
  | "fatal_error"
  | "recovery_event"
  | "cross_store_divergence"
  | "heartbeat_write_failure"
  | "recipient_planned"
  | "recipient_submitted"
  | "recipient_success"
  | "recipient_retry_scheduled";

export type HeartbeatAppendPolicyReason =
  | "invalid_input"
  | "invalid_now_iso"
  | "invalid_last_heartbeat_at"
  | "invalid_min_interval_ms"
  | "append_allowed"
  | "forced_boundary_event"
  | "periodic_interval_elapsed"
  | "skipped_throttled"
  | "skipped_hot_path_trigger";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type HeartbeatAppendPolicyResult =
  | {
      readonly ok: true;
      readonly action: "append_allowed";
      readonly trigger: HeartbeatAppendTrigger;
      readonly reason:
        | "append_allowed"
        | "forced_boundary_event"
        | "periodic_interval_elapsed";
    }
  | {
      readonly ok: true;
      readonly action: "append_skipped";
      readonly trigger: HeartbeatAppendTrigger;
      readonly reason: "skipped_throttled" | "skipped_hot_path_trigger";
      readonly nextEligibleAt?: string;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason:
        | "invalid_input"
        | "invalid_now_iso"
        | "invalid_last_heartbeat_at"
        | "invalid_min_interval_ms";
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface HeartbeatAppendPolicyInput {
  readonly trigger: HeartbeatAppendTrigger;
  readonly nowIso: string;
  readonly lastHeartbeatAt: string | null;
  readonly minIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Trigger sets
// ---------------------------------------------------------------------------

const VALID_TRIGGERS = new Set<string>([
  "periodic",
  "batch_started",
  "batch_completed",
  "administrative_halt",
  "fatal_error",
  "recovery_event",
  "cross_store_divergence",
  "heartbeat_write_failure",
  "recipient_planned",
  "recipient_submitted",
  "recipient_success",
  "recipient_retry_scheduled",
]);

const HOT_PATH_TRIGGERS = new Set<string>([
  "recipient_planned",
  "recipient_submitted",
  "recipient_success",
  "recipient_retry_scheduled",
]);

const FORCED_BOUNDARY_TRIGGERS = new Set<string>([
  "administrative_halt",
  "fatal_error",
  "recovery_event",
  "cross_store_divergence",
  "heartbeat_write_failure",
]);

const BATCH_BOUNDARY_TRIGGERS = new Set<string>([
  "batch_started",
  "batch_completed",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIso(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return Number.isFinite(Date.parse(value as string));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function planHeartbeatAppend(
  input: unknown,
): HeartbeatAppendPolicyResult {
  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return { ok: false, action: "rejected", reason: "invalid_input" };
  }

  const candidate = input as unknown as HeartbeatAppendPolicyInput;

  // Rule 2: trigger must be valid
  if (!VALID_TRIGGERS.has(candidate.trigger as string)) {
    return { ok: false, action: "rejected", reason: "invalid_input" };
  }

  const trigger = candidate.trigger as HeartbeatAppendTrigger;

  // Rule 3: nowIso must be valid ISO string
  if (!isValidIso(candidate.nowIso)) {
    return { ok: false, action: "rejected", reason: "invalid_now_iso" };
  }

  const nowMs = Date.parse(candidate.nowIso);

  // Rule 4: lastHeartbeatAt must be valid ISO or null
  if (candidate.lastHeartbeatAt !== null) {
    if (!isValidIso(candidate.lastHeartbeatAt)) {
      return { ok: false, action: "rejected", reason: "invalid_last_heartbeat_at" };
    }
  }

  // Rule 5: minIntervalMs must be safe integer >= 0
  if (!isSafeNonNegativeInteger(candidate.minIntervalMs)) {
    return { ok: false, action: "rejected", reason: "invalid_min_interval_ms" };
  }

  // Rule 10: lastHeartbeatAt must not be later than nowIso
  if (candidate.lastHeartbeatAt !== null) {
    const lastMs = Date.parse(candidate.lastHeartbeatAt);
    if (lastMs > nowMs) {
      return { ok: false, action: "rejected", reason: "invalid_last_heartbeat_at" };
    }
  }

  // Rule 6: hot path triggers always skip
  if (HOT_PATH_TRIGGERS.has(trigger)) {
    return {
      ok: true,
      action: "append_skipped",
      trigger,
      reason: "skipped_hot_path_trigger",
    };
  }

  // Rule 7: forced boundary triggers always allow
  if (FORCED_BOUNDARY_TRIGGERS.has(trigger)) {
    return {
      ok: true,
      action: "append_allowed",
      trigger,
      reason: "forced_boundary_event",
    };
  }

  // Rule 8: batch boundary triggers allow
  if (BATCH_BOUNDARY_TRIGGERS.has(trigger)) {
    return {
      ok: true,
      action: "append_allowed",
      trigger,
      reason: "append_allowed",
    };
  }

  // Rule 9: periodic trigger
  if (trigger === "periodic") {
    // No prior heartbeat — always allow
    if (candidate.lastHeartbeatAt === null) {
      return {
        ok: true,
        action: "append_allowed",
        trigger,
        reason: "periodic_interval_elapsed",
      };
    }

    const lastMs = Date.parse(candidate.lastHeartbeatAt);
    const elapsedMs = nowMs - lastMs;

    if (elapsedMs >= candidate.minIntervalMs) {
      return {
        ok: true,
        action: "append_allowed",
        trigger,
        reason: "periodic_interval_elapsed",
      };
    }

    // Throttled — compute nextEligibleAt
    const nextEligibleMs = lastMs + candidate.minIntervalMs;
    return {
      ok: true,
      action: "append_skipped",
      trigger,
      reason: "skipped_throttled",
      nextEligibleAt: msToIso(nextEligibleMs),
    };
  }

  // Exhaustiveness guard — should never reach
  return { ok: false, action: "rejected", reason: "invalid_input" };
}
