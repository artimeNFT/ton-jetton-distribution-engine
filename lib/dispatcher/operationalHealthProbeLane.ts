// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type OperationalHealthProbeLane = "operational_health_probe";

export type OperationalHealthProbeType =
  | "provider_latency"
  | "provider_status"
  | "read_only_chain_tip"
  | "read_only_config_probe";

export type OperationalHealthProbeWorkerIsolation = "worker_thread_required";

export type OperationalHealthProbeFaultScenario =
  | "none"
  | "rpc_timeout"
  | "provider_unavailable"
  | "latency_spike"
  | "malformed_response"
  | "race_condition_simulated";

export type OperationalHealthProbeSimulatedOutcome =
  | "success"
  | "timeout"
  | "provider_error"
  | "latency_spike"
  | "malformed_response"
  | "race_condition_detected";

export interface StageEAdministrativeHaltSignal {
  readonly active: boolean;
  readonly source: "stage_e_orchestrator";
  readonly reason: string | null;
}

export interface OperationalHealthProbeAllowlistRecord {
  readonly lane: OperationalHealthProbeLane;
  readonly providerKey: string;
  readonly endpointKey: string;
  readonly allowedProbeTypes: readonly OperationalHealthProbeType[];
  readonly enabled: boolean;
  readonly maxTimeoutMs: number;
  readonly maxSamplesPerWindow: number;
  readonly workerIsolation: OperationalHealthProbeWorkerIsolation;
}

export interface OperationalHealthProbeRequest {
  readonly lane: OperationalHealthProbeLane;
  readonly providerKey: string;
  readonly endpointKey: string;
  readonly probeType: OperationalHealthProbeType;
  readonly workerIsolation: OperationalHealthProbeWorkerIsolation;
  readonly faultScenario: OperationalHealthProbeFaultScenario;
  readonly simulationSeed: string;
  readonly nowIso: string;
  readonly administrativeHalt: StageEAdministrativeHaltSignal;
}

export interface OperationalHealthProbePlan {
  readonly lane: OperationalHealthProbeLane;
  readonly providerKey: string;
  readonly endpointKey: string;
  readonly probeType: OperationalHealthProbeType;
  readonly workerIsolation: OperationalHealthProbeWorkerIsolation;
  readonly faultScenario: OperationalHealthProbeFaultScenario;
  readonly simulatedOutcome: OperationalHealthProbeSimulatedOutcome;
  readonly simulationSeed: string;
  readonly timeoutMs: number;
  readonly maxSamplesPerWindow: number;
  readonly nowIso: string;
}

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type OperationalHealthProbeLaneReason =
  | "invalid_input"
  | "invalid_request"
  | "invalid_allowlist"
  | "wrong_lane"
  | "administrative_halt_active"
  | "worker_isolation_required"
  | "duplicate_allowlist_entry"
  | "provider_endpoint_not_allowed"
  | "probe_type_not_allowed"
  | "allowlist_entry_disabled"
  | "timeout_policy_invalid"
  | "sample_policy_invalid"
  | "fault_scenario_invalid"
  | "simulation_seed_invalid"
  | "invalid_now_iso"
  | "forbidden_business_field";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type OperationalHealthProbeLaneResult =
  | {
      readonly ok: true;
      readonly action: "probe_plan_allowed";
      readonly plan: OperationalHealthProbePlan;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: OperationalHealthProbeLaneReason;
      readonly providerKey?: string;
      readonly endpointKey?: string;
      readonly probeType?: string;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface ProbeLaneInput {
  readonly request: OperationalHealthProbeRequest;
  readonly allowlist: readonly OperationalHealthProbeAllowlistRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_LANE = "operational_health_probe" as const;

const VALID_PROBE_TYPES = new Set<string>([
  "provider_latency",
  "provider_status",
  "read_only_chain_tip",
  "read_only_config_probe",
]);

const VALID_FAULT_SCENARIOS = new Set<string>([
  "none",
  "rpc_timeout",
  "provider_unavailable",
  "latency_spike",
  "malformed_response",
  "race_condition_simulated",
]);

const FORBIDDEN_BUSINESS_FIELDS = new Set<string>([
  "recipientAddress",
  "amount",
  "batchId",
  "stateKey",
  "runState",
  "businessAuditCsv",
  "targets",
]);

const FAULT_OUTCOME_MAP: Record<
  OperationalHealthProbeFaultScenario,
  OperationalHealthProbeSimulatedOutcome
> = {
  none: "success",
  rpc_timeout: "timeout",
  provider_unavailable: "provider_error",
  latency_spike: "latency_spike",
  malformed_response: "malformed_response",
  race_condition_simulated: "race_condition_detected",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}

function isValidIso(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return Number.isFinite(Date.parse(value as string));
}

function isValidProbeType(value: unknown): value is OperationalHealthProbeType {
  return typeof value === "string" && VALID_PROBE_TYPES.has(value);
}

function isValidFaultScenario(
  value: unknown,
): value is OperationalHealthProbeFaultScenario {
  return typeof value === "string" && VALID_FAULT_SCENARIOS.has(value);
}

function hasForbiddenField(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_BUSINESS_FIELDS.has(key)) return true;
  }
  return false;
}

function rejected(
  reason: OperationalHealthProbeLaneReason,
  extras?: {
    providerKey?: string;
    endpointKey?: string;
    probeType?: string;
  },
): OperationalHealthProbeLaneResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: OperationalHealthProbeLaneReason;
    providerKey?: string;
    endpointKey?: string;
    probeType?: string;
  } = { ok: false, action: "rejected", reason };
  if (extras?.providerKey !== undefined) result.providerKey = extras.providerKey;
  if (extras?.endpointKey !== undefined) result.endpointKey = extras.endpointKey;
  if (extras?.probeType !== undefined) result.probeType = extras.probeType;
  return result;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function planOperationalHealthProbeLane(
  input: unknown,
): OperationalHealthProbeLaneResult {
  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  // Rule 2: strict business-lane contamination rejection at top-level input
  if (hasForbiddenField(input)) {
    return rejected("forbidden_business_field");
  }

  const candidate = input as unknown as ProbeLaneInput;

  // Rule 3: request must be an object
  if (!isNonArrayObject(candidate.request)) {
    return rejected("invalid_request");
  }

  const req = candidate.request as unknown as Record<string, unknown>;

  // Rule 2 continued: check request object for forbidden fields
  if (hasForbiddenField(req)) {
    return rejected("forbidden_business_field");
  }

  // Rule 4: request.lane must equal the probe lane
  if (req["lane"] !== VALID_LANE) {
    return rejected("wrong_lane");
  }

  // Rule 5: providerKey and endpointKey must be non-empty after trim
  if (!isNonEmptyString(req["providerKey"]) || !isNonEmptyString(req["endpointKey"])) {
    return rejected("invalid_request");
  }

  // Rule 6: probeType must be supported
  if (!isValidProbeType(req["probeType"])) {
    return rejected("invalid_request");
  }

  // Rule 7: workerIsolation must be "worker_thread_required"
  if (req["workerIsolation"] !== "worker_thread_required") {
    return rejected("worker_isolation_required");
  }

  // Rule 8: faultScenario must be supported
  if (!isValidFaultScenario(req["faultScenario"])) {
    return rejected("fault_scenario_invalid");
  }

  // Rule 9: simulationSeed must be non-empty after trim
  if (!isNonEmptyString(req["simulationSeed"])) {
    return rejected("simulation_seed_invalid");
  }

  // Rule 10: nowIso must be valid ISO timestamp
  if (!isValidIso(req["nowIso"])) {
    return rejected("invalid_now_iso");
  }

  // Rule 11: administrativeHalt validation
  if (!isNonArrayObject(req["administrativeHalt"])) {
    return rejected("invalid_request");
  }

  const halt = req["administrativeHalt"] as Record<string, unknown>;

  if (
    typeof halt["active"] !== "boolean" ||
    halt["source"] !== "stage_e_orchestrator" ||
    !(halt["reason"] === null || typeof halt["reason"] === "string")
  ) {
    return rejected("invalid_request");
  }

  if (halt["active"] === true) {
    return rejected("administrative_halt_active");
  }

  // Typed request fields after validation
  const requestProviderKey = (req["providerKey"] as string).trim();
  const requestEndpointKey = (req["endpointKey"] as string).trim();
  const requestProbeType = req["probeType"] as OperationalHealthProbeType;
  const requestFaultScenario = req["faultScenario"] as OperationalHealthProbeFaultScenario;
  const requestSimulationSeed = (req["simulationSeed"] as string).trim();
  const requestNowIso = req["nowIso"] as string;

  // Rule 12: allowlist must be a non-empty array
  if (!Array.isArray(candidate.allowlist) || candidate.allowlist.length === 0) {
    return rejected("invalid_allowlist");
  }

  // Rule 13: validate each allowlist record
  for (const record of candidate.allowlist) {
    if (!isNonArrayObject(record)) {
      return rejected("invalid_allowlist");
    }

    const rv = record as unknown as Record<string, unknown>;

    // Rule 2: check allowlist records for forbidden fields
    if (hasForbiddenField(rv)) {
      return rejected("forbidden_business_field");
    }

    // Lane check
    if (rv["lane"] !== VALID_LANE) {
      return rejected("wrong_lane");
    }

    // Basic string fields
    if (!isNonEmptyString(rv["providerKey"]) || !isNonEmptyString(rv["endpointKey"])) {
      return rejected("invalid_allowlist");
    }

    // allowedProbeTypes
    if (!Array.isArray(rv["allowedProbeTypes"]) || (rv["allowedProbeTypes"] as unknown[]).length === 0) {
      return rejected("invalid_allowlist");
    }
    for (const pt of rv["allowedProbeTypes"] as unknown[]) {
      if (!isValidProbeType(pt)) {
        return rejected("invalid_allowlist");
      }
    }

    // enabled
    if (typeof rv["enabled"] !== "boolean") {
      return rejected("invalid_allowlist");
    }

    // maxTimeoutMs — specific reason
    if (
      !isSafePositiveInteger(rv["maxTimeoutMs"]) ||
      (rv["maxTimeoutMs"] as number) > 120000
    ) {
      return rejected("timeout_policy_invalid");
    }

    // maxSamplesPerWindow — specific reason
    if (
      !isSafePositiveInteger(rv["maxSamplesPerWindow"]) ||
      (rv["maxSamplesPerWindow"] as number) > 10000
    ) {
      return rejected("sample_policy_invalid");
    }

    // workerIsolation — specific reason
    if (rv["workerIsolation"] !== "worker_thread_required") {
      return rejected("worker_isolation_required");
    }
  }

  // Rule 14: detect duplicates by trimmed providerKey + "::" + trimmed endpointKey
  const seenCompositeKeys = new Map<string, number>();
  for (let i = 0; i < candidate.allowlist.length; i++) {
    const entry = candidate.allowlist[i] as OperationalHealthProbeAllowlistRecord;
    const compositeKey = `${entry.providerKey.trim()}::${entry.endpointKey.trim()}`;
    if (seenCompositeKeys.has(compositeKey)) {
      return rejected("duplicate_allowlist_entry", {
        providerKey: entry.providerKey.trim(),
        endpointKey: entry.endpointKey.trim(),
      });
    }
    seenCompositeKeys.set(compositeKey, i);
  }

  // Rule 15: find matching allowlist entry by exact trimmed equality (no lowercasing)
  let matchedEntry: OperationalHealthProbeAllowlistRecord | undefined;
  for (const entry of candidate.allowlist) {
    const e = entry as OperationalHealthProbeAllowlistRecord;
    if (
      e.providerKey.trim() === requestProviderKey &&
      e.endpointKey.trim() === requestEndpointKey
    ) {
      matchedEntry = e;
      break;
    }
  }

  if (matchedEntry === undefined) {
    return rejected("provider_endpoint_not_allowed", {
      providerKey: requestProviderKey,
      endpointKey: requestEndpointKey,
    });
  }

  // Rule 16: entry must be enabled
  if (matchedEntry.enabled !== true) {
    return rejected("allowlist_entry_disabled", {
      providerKey: requestProviderKey,
      endpointKey: requestEndpointKey,
    });
  }

  // Rule 17: probeType must be in allowedProbeTypes
  if (!matchedEntry.allowedProbeTypes.includes(requestProbeType)) {
    return rejected("probe_type_not_allowed", {
      providerKey: requestProviderKey,
      endpointKey: requestEndpointKey,
      probeType: requestProbeType,
    });
  }

  // Rule 18: deterministic fault simulation — no randomness
  const simulatedOutcome: OperationalHealthProbeSimulatedOutcome =
    FAULT_OUTCOME_MAP[requestFaultScenario];

  // Rule 19: build plan with normalized values
  const plan: OperationalHealthProbePlan = {
    lane: VALID_LANE,
    providerKey: requestProviderKey,
    endpointKey: requestEndpointKey,
    probeType: requestProbeType,
    workerIsolation: "worker_thread_required",
    faultScenario: requestFaultScenario,
    simulatedOutcome,
    simulationSeed: requestSimulationSeed,
    timeoutMs: matchedEntry.maxTimeoutMs,
    maxSamplesPerWindow: matchedEntry.maxSamplesPerWindow,
    nowIso: requestNowIso,
  };

  return {
    ok: true,
    action: "probe_plan_allowed",
    plan,
  };
}
