const LABEL = "[h-4b-2-budget-reserve-policy-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`${LABEL} ${message}`);
  }
}

type BudgetLabel =
  | "BUDGET_OK"
  | "GLOBAL_CAP_BREACH"
  | "BATCH_CAP_BREACH"
  | "RECIPIENT_CAP_BREACH"
  | "GAS_CEILING_BREACH"
  | "FEE_POLICY_VERSION_MISSING"
  | "BUDGET_UNKNOWN"
  | "PLANNED_PAUSED"
  | "OPERATOR_RESERVE_BREACH";

type BudgetDecision = {
  readonly label: BudgetLabel;
  readonly blocking: boolean;
  readonly reasonCode: string;
  readonly budgetPolicyVersion?: string;
  readonly feePolicyVersion?: string;
  readonly globalCap?: string;
  readonly batchCap?: string;
  readonly recipientCap?: string;
  readonly gasCeiling?: string;
  readonly simulatedOperatorBalance?: string;
  readonly minTonReserve?: string;
  readonly dispatchIntentLike?: unknown;
  readonly unsignedIntentLike?: unknown;
  readonly executionCandidateLike?: unknown;
  readonly signerBoundaryInputLike?: unknown;
  readonly retryPlanLike?: unknown;
};

type BudgetInput = {
  readonly globalAmount: bigint;
  readonly batchAmount: bigint;
  readonly recipientAmount: bigint;
  readonly estimatedGas: bigint;
  readonly globalCap: bigint;
  readonly batchCap: bigint;
  readonly recipientCap: bigint;
  readonly gasCeiling: bigint;
  readonly simulatedOperatorBalance: bigint;
  readonly minTonReserve: bigint;
  readonly plannedPause?: boolean;
  readonly feePolicyVersion?: string;
  readonly budgetPolicyVersion?: string;
  readonly unknownBudgetState?: boolean;
};

function toDecimal(value: bigint): string {
  return value.toString(10);
}

function evaluateBudget(input: BudgetInput): BudgetDecision {
  const base = {
    budgetPolicyVersion: input.budgetPolicyVersion,
    feePolicyVersion: input.feePolicyVersion,
    globalCap: toDecimal(input.globalCap),
    batchCap: toDecimal(input.batchCap),
    recipientCap: toDecimal(input.recipientCap),
    gasCeiling: toDecimal(input.gasCeiling),
    simulatedOperatorBalance: toDecimal(input.simulatedOperatorBalance),
    minTonReserve: toDecimal(input.minTonReserve),
  };

  if (!input.feePolicyVersion) {
    return { ...base, label: "FEE_POLICY_VERSION_MISSING", blocking: true, reasonCode: "fee_policy_version_missing" };
  }

  if (input.unknownBudgetState === true) {
    return { ...base, label: "BUDGET_UNKNOWN", blocking: true, reasonCode: "budget_unknown" };
  }

  if (input.plannedPause === true) {
    return { ...base, label: "PLANNED_PAUSED", blocking: true, reasonCode: "planned_paused" };
  }

  if (input.globalAmount > input.globalCap) {
    return { ...base, label: "GLOBAL_CAP_BREACH", blocking: true, reasonCode: "global_cap_breach" };
  }

  if (input.batchAmount > input.batchCap) {
    return { ...base, label: "BATCH_CAP_BREACH", blocking: true, reasonCode: "batch_cap_breach" };
  }

  if (input.recipientAmount > input.recipientCap) {
    return { ...base, label: "RECIPIENT_CAP_BREACH", blocking: true, reasonCode: "recipient_cap_breach" };
  }

  if (input.estimatedGas > input.gasCeiling) {
    return { ...base, label: "GAS_CEILING_BREACH", blocking: true, reasonCode: "gas_ceiling_breach" };
  }

  if (input.simulatedOperatorBalance < input.minTonReserve) {
    return { ...base, label: "OPERATOR_RESERVE_BREACH", blocking: true, reasonCode: "operator_reserve_breach" };
  }

  return { ...base, label: "BUDGET_OK", blocking: false, reasonCode: "budget_ok" };
}

function assertNoIntentLikeArtifacts(result: BudgetDecision): void {
  assert(result.dispatchIntentLike === undefined, "dispatchIntentLike must not exist");
  assert(result.unsignedIntentLike === undefined, "unsignedIntentLike must not exist");
  assert(result.executionCandidateLike === undefined, "executionCandidateLike must not exist");
  assert(result.signerBoundaryInputLike === undefined, "signerBoundaryInputLike must not exist");
  assert(result.retryPlanLike === undefined, "retryPlanLike must not exist");
}

const BASE_INPUT: BudgetInput = {
  globalAmount: 1000n,
  batchAmount: 500n,
  recipientAmount: 100n,
  estimatedGas: 10n,
  globalCap: 5000n,
  batchCap: 1000n,
  recipientCap: 250n,
  gasCeiling: 50n,
  simulatedOperatorBalance: 10000n,
  minTonReserve: 1000n,
  feePolicyVersion: "fee-policy-v1",
    budgetPolicyVersion: "budget-policy-v1",
};

function runCase(name: string, patch: Partial<BudgetInput>, expected: Partial<BudgetDecision>): BudgetDecision {
  const result = evaluateBudget({ ...BASE_INPUT, ...patch });

  for (const [key, value] of Object.entries(expected)) {
    assert(
      result[key as keyof BudgetDecision] === value,
      `${name} expected ${key}=${String(value)} got ${String(result[key as keyof BudgetDecision])}`
    );
  }

  return result;
}

function main(): void {
  runCase("global cap breach fails closed", { globalAmount: 6000n }, {
    label: "GLOBAL_CAP_BREACH", blocking: true, reasonCode: "global_cap_breach",
  });

  runCase("batch cap breach fails closed", { batchAmount: 2000n }, {
    label: "BATCH_CAP_BREACH", blocking: true, reasonCode: "batch_cap_breach",
  });

  runCase("recipient cap breach fails closed", { recipientAmount: 500n }, {
    label: "RECIPIENT_CAP_BREACH", blocking: true, reasonCode: "recipient_cap_breach",
  });

  runCase("gas ceiling breach fails closed", { estimatedGas: 999n }, {
    label: "GAS_CEILING_BREACH", blocking: true, reasonCode: "gas_ceiling_breach",
  });

  runCase("missing fee policy version fails closed", { feePolicyVersion: undefined }, {
    label: "FEE_POLICY_VERSION_MISSING", blocking: true, reasonCode: "fee_policy_version_missing",
  });

  runCase("unknown budget state fails closed", { unknownBudgetState: true }, {
    label: "BUDGET_UNKNOWN", blocking: true, reasonCode: "budget_unknown",
  });

  runCase("planned pause emits deterministic blocking state", { plannedPause: true }, {
    label: "PLANNED_PAUSED", blocking: true, reasonCode: "planned_paused",
  });

  const reserveBreach = runCase("reserve breach fails closed", {
    simulatedOperatorBalance: 10n,
    minTonReserve: 1000n,
  }, {
    label: "OPERATOR_RESERVE_BREACH",
    blocking: true,
    reasonCode: "operator_reserve_breach",
  });

  assertNoIntentLikeArtifacts(reserveBreach);

  const success = runCase("valid deterministic budget passes", {}, {
    label: "BUDGET_OK",
    blocking: false,
    reasonCode: "budget_ok",
    feePolicyVersion: "fee-policy-v1",
    budgetPolicyVersion: "budget-policy-v1",
  });

  assert(success.globalCap === "5000", "globalCap must remain decimal string");
  assert(success.simulatedOperatorBalance === "10000", "simulatedOperatorBalance must remain decimal string");

  console.log(`${LABEL} PASS`);
}

main();
