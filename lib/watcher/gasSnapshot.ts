/**
 * gasSnapshot.ts
 *
 * Pure gasEstimateSnapshot validation contract.
 *
 * No CandidateDecisionRecord integration.
 * No Decision Store mutation.
 * No gas estimator implementation.
 * No blockchain calls.
 * No Dispatcher / RunState / targets / execution coupling.
 */

export type GasEstimateSource =
  | "offline_fixed"
  | "sandbox"
  | "rpc_config"
  | "external_provider";

export type GasFreshnessDecision =
  | "fresh"
  | "stale"
  | "not_applicable_offline_fixed";

export type GasFeeDecision =
  | "within_fee_allowance"
  | "exceeds_fee_allowance"
  | "fee_context_unavailable";

export type GasEstimateSnapshot = {
  readonly gasEstimateSource: GasEstimateSource;
  readonly gasEstimateMethod: string;
  readonly gasEstimatorVersion: string;
  readonly gasObservedAt: string;
  readonly gasMaxFreshnessMs: number;
  readonly gasFreshnessDecision: GasFreshnessDecision;

  readonly gasChain: string | null;
  readonly gasWorkchain: number | null;
  readonly gasChainSeqno: string | null;
  readonly gasChainConfigHash: string | null;
  readonly gasChainConfigParamVersion: string | null;

  readonly estimatedStorageFeeNanoTon: string;
  readonly estimatedComputeFeeNanoTon: string;
  readonly estimatedForwardFeeNanoTon: string;
  readonly estimatedActionFeeNanoTon: string;
  readonly estimatedTotalFeeNanoTon: string;
  readonly feeAllowanceNanoTon: string;

  readonly feePolicyVersion: string;
  readonly feeDecision: GasFeeDecision;
};

export type GasEstimateSnapshotValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function parseDecimalString(value: unknown): bigint | null {
  if (!isDecimalString(value)) {
    return null;
  }

  return BigInt(value);
}

function parseIsoTimestampMs(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

const SUPPORTED_GAS_ESTIMATE_SOURCES = new Set<GasEstimateSource>([
  "offline_fixed",
  "sandbox",
  "rpc_config",
  "external_provider",
]);

const SUPPORTED_GAS_FRESHNESS_DECISIONS = new Set<GasFreshnessDecision>([
  "fresh",
  "stale",
  "not_applicable_offline_fixed",
]);

const SUPPORTED_GAS_FEE_DECISIONS = new Set<GasFeeDecision>([
  "within_fee_allowance",
  "exceeds_fee_allowance",
  "fee_context_unavailable",
]);

function validateRequiredStrings(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  if (!isNonEmptyString(snapshot.gasEstimateMethod)) {
    return { ok: false, reason: "empty_gas_estimate_method" };
  }

  if (!isNonEmptyString(snapshot.gasEstimatorVersion)) {
    return { ok: false, reason: "empty_gas_estimator_version" };
  }

  if (!isNonEmptyString(snapshot.feePolicyVersion)) {
    return { ok: false, reason: "empty_fee_policy_version" };
  }

  return { ok: true };
}

function validateSupportedEnums(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  if (!SUPPORTED_GAS_ESTIMATE_SOURCES.has(snapshot.gasEstimateSource)) {
    return { ok: false, reason: "unsupported_gas_estimate_source" };
  }

  if (!SUPPORTED_GAS_FRESHNESS_DECISIONS.has(snapshot.gasFreshnessDecision)) {
    return { ok: false, reason: "unsupported_gas_freshness_decision" };
  }

  if (!SUPPORTED_GAS_FEE_DECISIONS.has(snapshot.feeDecision)) {
    return { ok: false, reason: "unsupported_fee_decision" };
  }

  return { ok: true };
}

function validateDecimalFeeFields(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  const fields: Array<readonly [string, string]> = [
    ["estimatedStorageFeeNanoTon", snapshot.estimatedStorageFeeNanoTon],
    ["estimatedComputeFeeNanoTon", snapshot.estimatedComputeFeeNanoTon],
    ["estimatedForwardFeeNanoTon", snapshot.estimatedForwardFeeNanoTon],
    ["estimatedActionFeeNanoTon", snapshot.estimatedActionFeeNanoTon],
    ["estimatedTotalFeeNanoTon", snapshot.estimatedTotalFeeNanoTon],
    ["feeAllowanceNanoTon", snapshot.feeAllowanceNanoTon],
  ];

  for (const [field, value] of fields) {
    if (!isDecimalString(value)) {
      return { ok: false, reason: `invalid_decimal_string_${field}` };
    }
  }

  return { ok: true };
}

function validateFeeArithmetic(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  const storage = parseDecimalString(snapshot.estimatedStorageFeeNanoTon);
  const compute = parseDecimalString(snapshot.estimatedComputeFeeNanoTon);
  const forward = parseDecimalString(snapshot.estimatedForwardFeeNanoTon);
  const action = parseDecimalString(snapshot.estimatedActionFeeNanoTon);
  const total = parseDecimalString(snapshot.estimatedTotalFeeNanoTon);

  if (storage === null || compute === null || forward === null || action === null || total === null) {
    return { ok: false, reason: "invalid_fee_arithmetic_decimal" };
  }

  if (storage + compute + forward + action !== total) {
    return { ok: false, reason: "fee_arithmetic_mismatch" };
  }

  return { ok: true };
}

function validateFeeDecision(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  const total = parseDecimalString(snapshot.estimatedTotalFeeNanoTon);
  const allowance = parseDecimalString(snapshot.feeAllowanceNanoTon);

  if (total === null || allowance === null) {
    return { ok: false, reason: "invalid_fee_decision_decimal" };
  }

  if (snapshot.feeDecision === "within_fee_allowance" && total > allowance) {
    return { ok: false, reason: "fee_decision_mismatch" };
  }

  if (snapshot.feeDecision === "exceeds_fee_allowance" && total <= allowance) {
    return { ok: false, reason: "fee_decision_mismatch" };
  }

  if (snapshot.feeDecision === "fee_context_unavailable") {
    return { ok: false, reason: "fee_context_unavailable" };
  }

  return { ok: true };
}

function validateFreshness(
  snapshot: GasEstimateSnapshot,
  decisionAt: string,
): GasEstimateSnapshotValidationResult {
  const observedAtMs = parseIsoTimestampMs(snapshot.gasObservedAt);
  if (observedAtMs === null) {
    return { ok: false, reason: "invalid_gas_observed_at" };
  }

  const decisionAtMs = parseIsoTimestampMs(decisionAt);
  if (decisionAtMs === null) {
    return { ok: false, reason: "invalid_decision_at" };
  }

  if (!Number.isInteger(snapshot.gasMaxFreshnessMs) || snapshot.gasMaxFreshnessMs < 0) {
    return { ok: false, reason: "invalid_gas_max_freshness_ms" };
  }

  if (observedAtMs > decisionAtMs) {
    return { ok: false, reason: "gas_observed_after_decision" };
  }

  const ageMs = decisionAtMs - observedAtMs;

  if (snapshot.gasEstimateSource === "offline_fixed") {
    if (snapshot.gasFreshnessDecision !== "not_applicable_offline_fixed") {
      return { ok: false, reason: "invalid_offline_fixed_freshness_decision" };
    }

    return { ok: true };
  }

  if (snapshot.gasFreshnessDecision !== "fresh") {
    return { ok: false, reason: "gas_estimate_not_fresh" };
  }

  if (ageMs > snapshot.gasMaxFreshnessMs) {
    return { ok: false, reason: "gas_estimate_stale" };
  }

  return { ok: true };
}

function validateChainContext(snapshot: GasEstimateSnapshot): GasEstimateSnapshotValidationResult {
  if (snapshot.gasEstimateSource === "offline_fixed") {
    return { ok: true };
  }

  if (!isNonEmptyString(snapshot.gasChain ?? "")) {
    return { ok: false, reason: "missing_gas_chain" };
  }

  if (snapshot.gasWorkchain === null || !Number.isInteger(snapshot.gasWorkchain)) {
    return { ok: false, reason: "invalid_gas_workchain" };
  }

  if (!isNonEmptyString(snapshot.gasChainSeqno ?? "")) {
    return { ok: false, reason: "missing_gas_chain_seqno" };
  }

  if (!isNonEmptyString(snapshot.gasChainConfigHash ?? "")) {
    return { ok: false, reason: "missing_gas_chain_config_hash" };
  }

  if (!isNonEmptyString(snapshot.gasChainConfigParamVersion ?? "")) {
    return { ok: false, reason: "missing_gas_chain_config_param_version" };
  }

  return { ok: true };
}

export function validateGasEstimateSnapshot(
  snapshot: unknown,
  decisionAt: string,
): GasEstimateSnapshotValidationResult {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, reason: "gas_snapshot_not_object" };
  }

  const candidate = snapshot as GasEstimateSnapshot;

  const enumValidation = validateSupportedEnums(candidate);
  if (!enumValidation.ok) {
    return enumValidation;
  }

  const stringValidation = validateRequiredStrings(candidate);
  if (!stringValidation.ok) {
    return stringValidation;
  }

  const decimalValidation = validateDecimalFeeFields(candidate);
  if (!decimalValidation.ok) {
    return decimalValidation;
  }

  const arithmeticValidation = validateFeeArithmetic(candidate);
  if (!arithmeticValidation.ok) {
    return arithmeticValidation;
  }

  const feeDecisionValidation = validateFeeDecision(candidate);
  if (!feeDecisionValidation.ok) {
    return feeDecisionValidation;
  }

  const freshnessValidation = validateFreshness(candidate, decisionAt);
  if (!freshnessValidation.ok) {
    return freshnessValidation;
  }

  const chainContextValidation = validateChainContext(candidate);
  if (!chainContextValidation.ok) {
    return chainContextValidation;
  }

  return { ok: true };
}
