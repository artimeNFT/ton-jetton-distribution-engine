export type GasSafetyMarginMode = "fixed_nano" | "basis_points";

export interface GasSafetyMarginPolicyConfig {
  readonly policyVersion: string;
  readonly enabled: boolean;
  readonly marginMode: GasSafetyMarginMode;
  readonly safetyMarginNano?: string;
  readonly safetyMarginBps?: number;
  readonly gasCeilingNano: string;
  readonly auditTag: string;
}

export interface ResolvedGasSafetyMarginAudit {
  readonly policyVersion: string;
  readonly auditTag: string;
  readonly configuredGasEstimateNano: string;
  readonly safetyMarginNano: string;
  readonly finalGasBudgetNano: string;
  readonly gasCeilingNano: string;
  readonly deterministic: true;
}

export interface ResolvedGasSafetyMarginPolicy {
  readonly policyVersion: string;
  readonly marginMode: GasSafetyMarginMode;
  readonly configuredGasEstimateNano: string;
  readonly safetyMarginNano: string;
  readonly finalGasBudgetNano: string;
  readonly gasCeilingNano: string;
  readonly audit: ResolvedGasSafetyMarginAudit;
}

export type GasSafetyMarginPolicyReason =
  | "invalid_input"
  | "invalid_policy"
  | "policy_disabled"
  | "invalid_gas_estimate"
  | "invalid_margin"
  | "invalid_gas_ceiling"
  | "gas_cap_exceeded"
  | "forbidden_execution_context";

export type GasSafetyMarginPolicyResult =
  | {
      readonly ok: true;
      readonly action: "gas_safety_margin_resolved";
      readonly resolved: ResolvedGasSafetyMarginPolicy;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: GasSafetyMarginPolicyReason;
    };

interface GasSafetyMarginPolicyInput {
  readonly configuredGasEstimateNano: string;
  readonly policy: GasSafetyMarginPolicyConfig;
}

const FORBIDDEN_FIELDS = new Set<string>([
  "decisionId",
  "candidateId",
  "stateKey",
  "recipientAddress",
  "amount",
  "batchId",
  "txHash",
  "networkRef",
  "rpcEndpoint",
  "providerState",
  "liveGasEstimate",
  "signerState",
]);

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function isPositiveDecimalString(value: unknown): value is string {
  if (!isNonNegativeDecimalString(value)) return false;
  return BigInt(value) > 0n;
}

function hasForbiddenField(value: Record<string, unknown>): boolean {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELDS.has(key)) return true;
  }
  return false;
}

function rejected(reason: GasSafetyMarginPolicyReason): GasSafetyMarginPolicyResult {
  return { ok: false, action: "rejected", reason };
}

function isValidBps(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 10000
  );
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function resolveGasSafetyMarginPolicy(
  input: unknown,
): GasSafetyMarginPolicyResult {
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  if (hasForbiddenField(input)) {
    return rejected("forbidden_execution_context");
  }

  const candidate = input as unknown as GasSafetyMarginPolicyInput;

  if (!isPositiveDecimalString(candidate.configuredGasEstimateNano)) {
    return rejected("invalid_gas_estimate");
  }

  if (!isNonArrayObject(candidate.policy)) {
    return rejected("invalid_policy");
  }

  const policy = candidate.policy as unknown as Record<string, unknown>;

  if (hasForbiddenField(policy)) {
    return rejected("forbidden_execution_context");
  }

  if (
    !isNonEmptyString(policy["policyVersion"]) ||
    typeof policy["enabled"] !== "boolean" ||
    !isNonEmptyString(policy["auditTag"])
  ) {
    return rejected("invalid_policy");
  }

  if (policy["enabled"] !== true) {
    return rejected("policy_disabled");
  }

  if (policy["marginMode"] !== "fixed_nano" && policy["marginMode"] !== "basis_points") {
    return rejected("invalid_policy");
  }

  if (!isPositiveDecimalString(policy["gasCeilingNano"])) {
    return rejected("invalid_gas_ceiling");
  }

  const configuredGasEstimateNano = candidate.configuredGasEstimateNano.trim();
  const estimate = BigInt(configuredGasEstimateNano);
  const gasCeilingNano = (policy["gasCeilingNano"] as string).trim();
  const ceiling = BigInt(gasCeilingNano);

  if (estimate > ceiling) {
    return rejected("gas_cap_exceeded");
  }

  let safetyMarginNano: bigint;

  if (policy["marginMode"] === "fixed_nano") {
    if (!isNonNegativeDecimalString(policy["safetyMarginNano"])) {
      return rejected("invalid_margin");
    }
    if (policy["safetyMarginBps"] !== undefined) {
      return rejected("invalid_margin");
    }
    safetyMarginNano = BigInt((policy["safetyMarginNano"] as string).trim());
  } else {
    if (!isValidBps(policy["safetyMarginBps"])) {
      return rejected("invalid_margin");
    }
    if (policy["safetyMarginNano"] !== undefined) {
      return rejected("invalid_margin");
    }
    safetyMarginNano = ceilDiv(
      estimate * BigInt(policy["safetyMarginBps"] as number),
      10000n,
    );
  }

  const finalGasBudget = estimate + safetyMarginNano;

  if (finalGasBudget > ceiling) {
    return rejected("gas_cap_exceeded");
  }

  const policyVersion = (policy["policyVersion"] as string).trim();
  const auditTag = (policy["auditTag"] as string).trim();
  const safetyMarginNanoString = safetyMarginNano.toString();
  const finalGasBudgetNano = finalGasBudget.toString();

  const audit: ResolvedGasSafetyMarginAudit = {
    policyVersion,
    auditTag,
    configuredGasEstimateNano,
    safetyMarginNano: safetyMarginNanoString,
    finalGasBudgetNano,
    gasCeilingNano,
    deterministic: true,
  };

  return {
    ok: true,
    action: "gas_safety_margin_resolved",
    resolved: {
      policyVersion,
      marginMode: policy["marginMode"] as GasSafetyMarginMode,
      configuredGasEstimateNano,
      safetyMarginNano: safetyMarginNanoString,
      finalGasBudgetNano,
      gasCeilingNano,
      audit,
    },
  };
}
