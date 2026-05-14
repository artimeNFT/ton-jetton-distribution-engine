// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ResolvedDispatcherFeePolicy {
  readonly baseFeeNano: string;
  readonly maxFeeNano: string;
  readonly tierStepNano: string;
  readonly tierCount: number;
  readonly selectionSeed: string;
}

export interface AssetFeePolicyRecord {
  readonly assetId: string;
  readonly jettonMasterCanonicalKey: string;
  readonly feePolicyVersion: string;
  readonly baseFeeNano: string;
  readonly maxFeeNano: string;
  readonly tierStepNano: string;
  readonly tierCount: number;
  readonly selectionSeed: string;
  readonly enabled: boolean;
}

export interface ResolvedAssetFeePolicy {
  readonly assetId: string;
  readonly jettonMasterCanonicalKey: string;
  readonly feePolicyVersion: string;
  readonly feePolicy: ResolvedDispatcherFeePolicy;
}

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type AssetFeePolicyResolverReason =
  | "invalid_input"
  | "invalid_campaign_id"
  | "invalid_jetton_master_canonical_key"
  | "invalid_policy_registry"
  | "duplicate_policy_for_jetton_master"
  | "policy_not_found"
  | "policy_disabled"
  | "fee_policy_invalid"
  | "fee_cap_invalid";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type AssetFeePolicyResolverResult =
  | {
      readonly ok: true;
      readonly action: "asset_fee_policy_resolved";
      readonly resolved: ResolvedAssetFeePolicy;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: AssetFeePolicyResolverReason;
      readonly jettonMasterCanonicalKey?: string;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface AssetFeePolicyResolverInput {
  readonly campaignId: string;
  readonly jettonMasterCanonicalKey: string;
  readonly policies: readonly AssetFeePolicyRecord[];
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

function rejected(
  reason: AssetFeePolicyResolverReason,
  jettonMasterCanonicalKey?: string,
): AssetFeePolicyResolverResult {
  const result: {
    ok: false;
    action: "rejected";
    reason: AssetFeePolicyResolverReason;
    jettonMasterCanonicalKey?: string;
  } = { ok: false, action: "rejected", reason };
  if (jettonMasterCanonicalKey !== undefined) {
    result.jettonMasterCanonicalKey = jettonMasterCanonicalKey;
  }
  return result;
}

function isValidPolicyRecord(value: unknown): value is AssetFeePolicyRecord {
  if (!isNonArrayObject(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    isNonEmptyString(v["assetId"]) &&
    isNonEmptyString(v["jettonMasterCanonicalKey"]) &&
    isNonEmptyString(v["feePolicyVersion"]) &&
    isPositiveDecimalString(v["baseFeeNano"]) &&
    isPositiveDecimalString(v["maxFeeNano"]) &&
    isNonNegativeDecimalString(v["tierStepNano"]) &&
    isSafeNonNegativeInteger(v["tierCount"]) &&
    (v["tierCount"] as number) >= 1 &&
    (v["tierCount"] as number) <= 1024 &&
    isNonEmptyString(v["selectionSeed"]) &&
    typeof v["enabled"] === "boolean"
  );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function resolveAssetFeePolicy(
  input: unknown,
): AssetFeePolicyResolverResult {
  // Rule 1: input must be non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as AssetFeePolicyResolverInput;

  // Rule 2: campaignId must be non-empty string after trim
  if (!isNonEmptyString(candidate.campaignId)) {
    return rejected("invalid_campaign_id");
  }

  // Rule 3: jettonMasterCanonicalKey must be non-empty string after trim
  if (!isNonEmptyString(candidate.jettonMasterCanonicalKey)) {
    return rejected("invalid_jetton_master_canonical_key");
  }

  const requestedKey = candidate.jettonMasterCanonicalKey.trim();

  // Rule 4: policies must be a non-empty array
  if (!Array.isArray(candidate.policies) || candidate.policies.length === 0) {
    return rejected("invalid_policy_registry");
  }

  // Rule 5: each policy record must be valid
  for (const policy of candidate.policies) {
    if (!isValidPolicyRecord(policy)) {
      return rejected("fee_policy_invalid");
    }
  }

  // Rule 6: no duplicate jettonMasterCanonicalKey (trimmed) — even if disabled
  const seenKeys = new Map<string, number>();
  for (let i = 0; i < candidate.policies.length; i++) {
    const p = candidate.policies[i] as AssetFeePolicyRecord;
    const trimmedKey = p.jettonMasterCanonicalKey.trim();
    if (seenKeys.has(trimmedKey)) {
      return rejected("duplicate_policy_for_jetton_master", trimmedKey);
    }
    seenKeys.set(trimmedKey, i);
  }

  // Rule 7: find exactly one matching policy by trimmed canonical key
  let matchedPolicy: AssetFeePolicyRecord | undefined;
  for (const policy of candidate.policies) {
    const p = policy as AssetFeePolicyRecord;
    if (p.jettonMasterCanonicalKey.trim() === requestedKey) {
      matchedPolicy = p;
      break;
    }
  }

  if (matchedPolicy === undefined) {
    return rejected("policy_not_found", requestedKey);
  }

  // Rule 8: policy must be enabled
  if (matchedPolicy.enabled !== true) {
    return rejected("policy_disabled", requestedKey);
  }

  // Rule 9: fee cap validation — every tier must fit under maxFeeNano
  let baseFeeNanoBig: bigint;
  let maxFeeNanoBig: bigint;
  let tierStepNanoBig: bigint;

  try {
    baseFeeNanoBig = BigInt(matchedPolicy.baseFeeNano);
    maxFeeNanoBig = BigInt(matchedPolicy.maxFeeNano);
    tierStepNanoBig = BigInt(matchedPolicy.tierStepNano);
  } catch {
    return rejected("fee_cap_invalid", requestedKey);
  }

  if (baseFeeNanoBig > maxFeeNanoBig) {
    return rejected("fee_cap_invalid", requestedKey);
  }

  const maxPossibleFee =
    baseFeeNanoBig + BigInt(matchedPolicy.tierCount - 1) * tierStepNanoBig;

  if (maxPossibleFee > maxFeeNanoBig) {
    return rejected("fee_cap_invalid", requestedKey);
  }

  // Rules 10–12: build resolved result
  const feePolicy: ResolvedDispatcherFeePolicy = {
    baseFeeNano: matchedPolicy.baseFeeNano,
    maxFeeNano: matchedPolicy.maxFeeNano,
    tierStepNano: matchedPolicy.tierStepNano,
    tierCount: matchedPolicy.tierCount,
    selectionSeed: matchedPolicy.selectionSeed,
  };

  const resolved: ResolvedAssetFeePolicy = {
    assetId: matchedPolicy.assetId,
    jettonMasterCanonicalKey: requestedKey,
    feePolicyVersion: matchedPolicy.feePolicyVersion,
    feePolicy,
  };

  return {
    ok: true,
    action: "asset_fee_policy_resolved",
    resolved,
  };
}
