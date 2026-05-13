import type { DispatcherPlannedEntry } from "./dispatcherDryRunIntake";
import { makeStateKey, type RetryDisposition, type StateEntry, type StateKey } from "./stateStore";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface OperatorPlanCandidate {
  readonly operatorId: string;
  readonly operatorLabel: string;
  readonly status: "active" | "cooldown" | "failed" | "paused";
  readonly cooldownUntil: string | null;
  readonly failedUntil: string | null;
}

export interface ProviderPlanCandidate {
  readonly providerId: string;
  readonly endpointKey: string;
  readonly status: "active" | "disabled";
}

export interface DeterministicFeePlan {
  readonly policy: "deterministic_fee_tier";
  readonly baseFeeNano: string;
  readonly finalFeeNano: string;
  readonly maxFeeNano: string;
  readonly tierStepNano: string;
  readonly tierCount: number;
  readonly tierOffset: number;
  readonly selectionSeed: string;
}

export interface DispatcherDryRunTransition {
  readonly fromStatus: "planned";
  readonly toStatus: "submitted";
  readonly retryDisposition: RetryDisposition;
  readonly nextAttemptNumber: number;
  readonly operatorId: string;
  readonly operatorLabel: string;
  readonly providerId: string | null;
  readonly providerEndpointKey: string | null;
  readonly feePlan: DeterministicFeePlan | null;
}

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type DispatcherDryRunTransitionPlanReason =
  | "invalid_input"
  | "invalid_planned_entry"
  | "invalid_now_iso"
  | "administrative_halt_active"
  | "unsupported_retry_disposition"
  | "operator_policy_invalid"
  | "no_eligible_operator"
  | "previous_operator_required"
  | "previous_operator_not_eligible"
  | "provider_policy_invalid"
  | "no_eligible_provider"
  | "fee_policy_invalid"
  | "fee_cap_exceeded";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type DispatcherDryRunTransitionPlanResult =
  | {
      readonly ok: true;
      readonly action: "dry_run_transition_ready";
      readonly stateKey: StateKey;
      readonly submittedEntry: StateEntry;
      readonly transition: DispatcherDryRunTransition;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DispatcherDryRunTransitionPlanReason;
      readonly stateKey?: StateKey;
    };

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

interface OperatorPolicy {
  readonly eligibleOperators: readonly OperatorPlanCandidate[];
  readonly previousOperatorId: string | null;
  readonly selectionSeed: string;
}

interface ProviderPolicy {
  readonly eligibleProviders: readonly ProviderPlanCandidate[];
  readonly selectionSeed: string;
}

interface FeePolicy {
  readonly baseFeeNano: string;
  readonly maxFeeNano: string;
  readonly tierStepNano: string;
  readonly tierCount: number;
  readonly selectionSeed: string;
}

interface AdministrativeHalt {
  readonly active: boolean;
  readonly reason: string | null;
}

interface TransitionPlanInput {
  readonly plannedEntry: DispatcherPlannedEntry;
  readonly nowIso: unknown;
  readonly retryDisposition: RetryDisposition;
  readonly operatorPolicy: OperatorPolicy;
  readonly providerPolicy?: ProviderPolicy;
  readonly feePolicy?: FeePolicy;
  readonly administrativeHalt: AdministrativeHalt;
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

function isNonNegativeDecimalString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

function isValidIso(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return Number.isFinite(Date.parse(value as string));
}

function rejected(
  reason: DispatcherDryRunTransitionPlanReason,
  stateKey?: StateKey,
): DispatcherDryRunTransitionPlanResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: DispatcherDryRunTransitionPlanReason;
    stateKey?: StateKey;
  } = { ok: false, action: "rejected", reason };
  if (stateKey !== undefined) result.stateKey = stateKey;
  return result;
}

// ---------------------------------------------------------------------------
// Deterministic stable hash — FNV-1a 32-bit
// ---------------------------------------------------------------------------

export function stableHashToNumber(parts: readonly string[]): number {
  const FNV_OFFSET = 2166136261;
  const FNV_PRIME = 16777619;
  const MOD = 0x100000000; // 2^32

  let hash = FNV_OFFSET;
  const combined = parts.join("\x00");

  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
    hash = ((hash % MOD) + MOD) % MOD;
  }

  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Operator selection
// ---------------------------------------------------------------------------

function selectOperatorDeterministic(
  activeOperators: readonly OperatorPlanCandidate[],
  stateKey: string,
  retryDisposition: string,
  attemptNumber: number,
  selectionSeed: string,
): OperatorPlanCandidate {
  const sorted = [...activeOperators].sort((a, b) =>
    a.operatorId.localeCompare(b.operatorId),
  );
  const hashParts = [
    stateKey,
    retryDisposition,
    String(attemptNumber),
    selectionSeed,
    ...sorted.map((o) => o.operatorId),
  ];
  const idx = stableHashToNumber(hashParts) % sorted.length;
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

function selectProviderDeterministic(
  activeProviders: readonly ProviderPlanCandidate[],
  stateKey: string,
  retryDisposition: string,
  nextAttemptNumber: number,
  selectionSeed: string,
): ProviderPlanCandidate {
  const sorted = [...activeProviders].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );
  const hashParts = [
    stateKey,
    retryDisposition,
    String(nextAttemptNumber),
    selectionSeed,
    ...sorted.map((p) => p.providerId),
  ];
  const idx = stableHashToNumber(hashParts) % sorted.length;
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidOperatorCandidate(value: unknown): value is OperatorPlanCandidate {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  const validStatuses = new Set(["active", "cooldown", "failed", "paused"]);
  return (
    isNonEmptyString(v["operatorId"]) &&
    isNonEmptyString(v["operatorLabel"]) &&
    typeof v["status"] === "string" &&
    validStatuses.has(v["status"]) &&
    (v["cooldownUntil"] === null || typeof v["cooldownUntil"] === "string") &&
    (v["failedUntil"] === null || typeof v["failedUntil"] === "string")
  );
}

function isValidProviderCandidate(value: unknown): value is ProviderPlanCandidate {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  const validStatuses = new Set(["active", "disabled"]);
  return (
    isNonEmptyString(v["providerId"]) &&
    isNonEmptyString(v["endpointKey"]) &&
    typeof v["status"] === "string" &&
    validStatuses.has(v["status"])
  );
}

const SUPPORTED_RETRY_DISPOSITIONS = new Set<string>([
  "none",
  "retry_same_identity",
  "rotate_identity",
  "fail_batch",
  "stop_campaign",
]);

const TERMINAL_RETRY_DISPOSITIONS = new Set<string>([
  "fail_batch",
  "stop_campaign",
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function planDispatcherDryRunTransition(
  input: unknown,
): DispatcherDryRunTransitionPlanResult {
  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as TransitionPlanInput;

  // Rule 2: validate plannedEntry
  if (!isNonArrayObject(candidate.plannedEntry)) {
    return rejected("invalid_planned_entry");
  }

  const pe = candidate.plannedEntry as unknown as Record<string, unknown>;

  if (!isNonEmptyString(pe["stateKey"])) {
    return rejected("invalid_planned_entry");
  }

  const stateKey = pe["stateKey"] as StateKey;

  if (!isNonArrayObject(pe["entry"])) {
    return rejected("invalid_planned_entry", stateKey);
  }

  const entry = pe["entry"] as unknown as Record<string, unknown>;

  if (
    entry["status"] !== "planned" ||
    !isSafeNonNegativeInteger(entry["attemptNumber"]) ||
    !isNonEmptyString(entry["batchId"]) ||
    !isNonEmptyString(entry["recipientAddress"]) ||
    makeStateKey(entry["batchId"], entry["recipientAddress"]) !== stateKey ||
    !isPositiveDecimalString(entry["amount"]) ||
    entry["operatorId"] !== null ||
    entry["operatorLabel"] !== null ||
    entry["txHash"] !== null ||
    entry["networkRef"] !== null ||
    entry["submittedAt"] !== null ||
    entry["finalizedAt"] !== null ||
    entry["cooldownUntil"] !== null ||
    entry["lastErrorCode"] !== null ||
    entry["lastError"] !== null ||
    entry["lastDecision"] !== null
  ) {
    return rejected("invalid_planned_entry", stateKey);
  }

  // Rule 10: nextAttemptNumber
  const nextAttemptNumber = (entry["attemptNumber"] as number) + 1;
  if (!Number.isSafeInteger(nextAttemptNumber) || nextAttemptNumber < 1) {
    return rejected("invalid_planned_entry", stateKey);
  }

  // Rule 3: nowIso
  if (!isValidIso(candidate.nowIso)) {
    return rejected("invalid_now_iso", stateKey);
  }
  const nowIso = candidate.nowIso as string;

  // Rule 4: administrativeHalt
  if (
    !isNonArrayObject(candidate.administrativeHalt) ||
    typeof candidate.administrativeHalt.active !== "boolean" ||
    !(
      candidate.administrativeHalt.reason === null ||
      typeof candidate.administrativeHalt.reason === "string"
    )
  ) {
    return rejected("invalid_input", stateKey);
  }
  if (candidate.administrativeHalt.active === true) {
    return rejected("administrative_halt_active", stateKey);
  }

  // Rule 5 & 6: retryDisposition
  const retryDisposition = candidate.retryDisposition;
  if (!SUPPORTED_RETRY_DISPOSITIONS.has(retryDisposition as string)) {
    return rejected("unsupported_retry_disposition", stateKey);
  }
  if (TERMINAL_RETRY_DISPOSITIONS.has(retryDisposition as string)) {
    return rejected("unsupported_retry_disposition", stateKey);
  }

  // Rule 7: operatorPolicy validation
  if (!isNonArrayObject(candidate.operatorPolicy)) {
    return rejected("operator_policy_invalid", stateKey);
  }
  const opPolicy = candidate.operatorPolicy;

  if (
    !Array.isArray(opPolicy.eligibleOperators) ||
    opPolicy.eligibleOperators.length === 0 ||
    !isNonEmptyString(opPolicy.selectionSeed) ||
    !(
      opPolicy.previousOperatorId === null ||
      isNonEmptyString(opPolicy.previousOperatorId)
    )
  ) {
    return rejected("operator_policy_invalid", stateKey);
  }

  for (const op of opPolicy.eligibleOperators) {
    if (!isValidOperatorCandidate(op)) {
      return rejected("operator_policy_invalid", stateKey);
    }
  }

  // Rule 8: active operators only
  const activeOperators = opPolicy.eligibleOperators.filter(
    (o) => o.status === "active",
  );
  if (activeOperators.length === 0) {
    return rejected("no_eligible_operator", stateKey);
  }

  // Rule 9: operator selection
  let selectedOperator: OperatorPlanCandidate;

  if (retryDisposition === "none") {
    selectedOperator = selectOperatorDeterministic(
      activeOperators,
      stateKey,
      retryDisposition,
      entry["attemptNumber"] as number,
      opPolicy.selectionSeed,
    );
  } else if (retryDisposition === "retry_same_identity") {
    if (opPolicy.previousOperatorId === null) {
      return rejected("previous_operator_required", stateKey);
    }
    const found = activeOperators.find(
      (o) => o.operatorId === opPolicy.previousOperatorId,
    );
    if (found === undefined) {
      return rejected("previous_operator_not_eligible", stateKey);
    }
    selectedOperator = found;
  } else {
    // rotate_identity
    if (opPolicy.previousOperatorId === null) {
      return rejected("previous_operator_required", stateKey);
    }
    const alternatives = activeOperators.filter(
      (o) => o.operatorId !== opPolicy.previousOperatorId,
    );
    if (alternatives.length === 0) {
      return rejected("no_eligible_operator", stateKey);
    }
    selectedOperator = selectOperatorDeterministic(
      alternatives,
      stateKey,
      retryDisposition,
      entry["attemptNumber"] as number,
      opPolicy.selectionSeed,
    );
  }

  // Rule 11: provider policy
  let providerId: string | null = null;
  let providerEndpointKey: string | null = null;

  if (candidate.providerPolicy !== undefined && candidate.providerPolicy !== null) {
    const pp = candidate.providerPolicy;
    if (
      !isNonArrayObject(pp) ||
      !Array.isArray((pp as unknown as Record<string, unknown>)["eligibleProviders"]) ||
      ((pp as unknown as Record<string, unknown>)["eligibleProviders"] as unknown[]).length === 0 ||
      !isNonEmptyString((pp as unknown as Record<string, unknown>)["selectionSeed"])
    ) {
      return rejected("provider_policy_invalid", stateKey);
    }

    const providers = (pp as unknown as Record<string, unknown>)["eligibleProviders"] as unknown[];
    for (const p of providers) {
      if (!isValidProviderCandidate(p)) {
        return rejected("provider_policy_invalid", stateKey);
      }
    }

    const activeProviders = (providers as ProviderPlanCandidate[]).filter(
      (p) => p.status === "active",
    );
    if (activeProviders.length === 0) {
      return rejected("no_eligible_provider", stateKey);
    }

    const selectedProvider = selectProviderDeterministic(
      activeProviders,
      stateKey,
      retryDisposition,
      nextAttemptNumber,
      (pp as unknown as Record<string, unknown>)["selectionSeed"] as string,
    );
    providerId = selectedProvider.providerId;
    providerEndpointKey = selectedProvider.endpointKey;
  }

  // Rule 12: fee policy
  let feePlan: DeterministicFeePlan | null = null;

  if (candidate.feePolicy !== undefined && candidate.feePolicy !== null) {
    const fp = candidate.feePolicy;
    const fpv = fp as unknown as Record<string, unknown>;

    if (!isNonArrayObject(fp)) {
      return rejected("fee_policy_invalid", stateKey);
    }

    if (
      !isPositiveDecimalString(fpv["baseFeeNano"]) ||
      !isPositiveDecimalString(fpv["maxFeeNano"]) ||
      !isNonNegativeDecimalString(fpv["tierStepNano"]) ||
      !isSafeNonNegativeInteger(fpv["tierCount"]) ||
      (fpv["tierCount"] as number) < 1 ||
      (fpv["tierCount"] as number) > 1024 ||
      !isNonEmptyString(fpv["selectionSeed"])
    ) {
      return rejected("fee_policy_invalid", stateKey);
    }

    const baseFeeNano = fpv["baseFeeNano"] as string;
    const maxFeeNano = fpv["maxFeeNano"] as string;
    const tierStepNano = fpv["tierStepNano"] as string;
    const tierCount = fpv["tierCount"] as number;
    const feeSelectionSeed = fpv["selectionSeed"] as string;

    const hashParts = [stateKey, String(nextAttemptNumber), feeSelectionSeed];
    const tierOffset = stableHashToNumber(hashParts) % tierCount;

    let finalFeeNano: bigint;
    try {
      finalFeeNano =
        BigInt(baseFeeNano) + BigInt(tierOffset) * BigInt(tierStepNano);
    } catch {
      return rejected("fee_policy_invalid", stateKey);
    }

    if (finalFeeNano > BigInt(maxFeeNano)) {
      return rejected("fee_cap_exceeded", stateKey);
    }

    feePlan = {
      policy: "deterministic_fee_tier",
      baseFeeNano,
      finalFeeNano: finalFeeNano.toString(),
      maxFeeNano,
      tierStepNano,
      tierCount,
      tierOffset,
      selectionSeed: feeSelectionSeed,
    };
  }

  // Rule 13: build submittedEntry
  const existingEntry = pe["entry"] as unknown as StateEntry;
  const existingMeta = isNonArrayObject(
    (existingEntry as unknown as Record<string, unknown>)["metadata"],
  )
    ? { ...(existingEntry as unknown as Record<string, unknown>)["metadata"] as Record<string, unknown> }
    : {};

  const submittedEntry: StateEntry = {
    ...(existingEntry as object),
    status: "submitted",
    attemptNumber: nextAttemptNumber,
    operatorId: selectedOperator.operatorId,
    operatorLabel: selectedOperator.operatorLabel,
    txHash: null,
    networkRef: null,
    updatedAt: nowIso,
    submittedAt: nowIso,
    finalizedAt: null,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: retryDisposition,
    metadata: {
      ...existingMeta,
      dryRunTransition: {
        source: "dispatcher_dry_run_transition_plan",
        retryDisposition,
        providerId,
        providerEndpointKey,
        feePlan,
      },
    },
  } as unknown as StateEntry;

  const transition: DispatcherDryRunTransition = {
    fromStatus: "planned",
    toStatus: "submitted",
    retryDisposition,
    nextAttemptNumber,
    operatorId: selectedOperator.operatorId,
    operatorLabel: selectedOperator.operatorLabel,
    providerId,
    providerEndpointKey,
    feePlan,
  };

  return {
    ok: true,
    action: "dry_run_transition_ready",
    stateKey,
    submittedEntry,
    transition,
  };
}