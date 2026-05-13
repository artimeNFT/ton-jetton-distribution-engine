import * as assert from "assert/strict";
import {
  planDispatcherDryRunTransition,
  stableHashToNumber,
  type OperatorPlanCandidate,
  type ProviderPlanCandidate,
} from "../lib/dispatcher/dispatcherDryRunTransitionPlan";
import type { DispatcherPlannedEntry } from "../lib/dispatcher/dispatcherDryRunIntake";
import {
  makeStateKey,
  type StateEntry,
  type RetryDisposition,
} from "../lib/dispatcher/stateStore";
import type { BatchRecipient } from "../lib/dispatcher/batchPlanner";

const LABEL = "[f-5-dispatcher-dry-run-transition-plan-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const BATCH_ID = "campaign-f5-batch-1";
const RECIPIENT = "EQRecipientMixedCaseF5";
const AMOUNT = "555666777";
const STATE_KEY = makeStateKey(BATCH_ID, RECIPIENT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? v.toString() + "n" : v,
  );
}

function makeRecipient(overrides: Partial<BatchRecipient> = {}): BatchRecipient {
  return {
    address: RECIPIENT,
    amount: BigInt(AMOUNT),
    ...overrides,
  } as unknown as BatchRecipient;
}

function makePlannedStateEntry(overrides: Partial<StateEntry> = {}): StateEntry {
  return {
    batchId: BATCH_ID,
    recipientAddress: RECIPIENT,
    recipientIndex: 0,
    amount: AMOUNT,
    status: "planned",
    attemptNumber: 0,
    operatorId: null,
    operatorLabel: null,
    txHash: null,
    networkRef: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    submittedAt: null,
    finalizedAt: null,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: null,
    metadata: { source: "f5-smoke", preserved: true },
    ...overrides,
  } as unknown as StateEntry;
}

function makePlannedEntry(overrides: Partial<DispatcherPlannedEntry> = {}): DispatcherPlannedEntry {
  return {
    stateKey: STATE_KEY,
    entry: makePlannedStateEntry(),
    recipient: makeRecipient(),
    originalIndex: 0,
    ...overrides,
  } as unknown as DispatcherPlannedEntry;
}

function activeOperator(id: string, label = `Operator ${id}`): OperatorPlanCandidate {
  return {
    operatorId: id,
    operatorLabel: label,
    status: "active",
    cooldownUntil: null,
    failedUntil: null,
  };
}

function inactiveOperator(
  id: string,
  status: "cooldown" | "failed" | "paused",
): OperatorPlanCandidate {
  return {
    operatorId: id,
    operatorLabel: `Operator ${id}`,
    status,
    cooldownUntil: status === "cooldown" ? NOW_ISO : null,
    failedUntil: status === "failed" ? NOW_ISO : null,
  };
}

function activeProvider(id: string, endpointKey = `endpoint-${id}`): ProviderPlanCandidate {
  return { providerId: id, endpointKey, status: "active" };
}

function disabledProvider(id: string, endpointKey = `endpoint-${id}`): ProviderPlanCandidate {
  return { providerId: id, endpointKey, status: "disabled" };
}

function baseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    plannedEntry: makePlannedEntry(),
    nowIso: NOW_ISO,
    retryDisposition: "none" as RetryDisposition,
    operatorPolicy: {
      eligibleOperators: [
        activeOperator("op-b", "Operator B"),
        activeOperator("op-a", "Operator A"),
        inactiveOperator("op-paused", "paused"),
      ],
      previousOperatorId: null,
      selectionSeed: "operator-seed-f5",
    },
    administrativeHalt: { active: false, reason: null },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: valid initial none transition
// ---------------------------------------------------------------------------

function testValidInitialNoneTransition(): void {
  const result = planDispatcherDryRunTransition(baseInput());

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "dry_run_transition_ready");
  assert.equal(result.stateKey, STATE_KEY);

  const e = result.submittedEntry as unknown as Record<string, unknown>;
  assert.equal(e["status"], "submitted");
  assert.equal(e["attemptNumber"], 1);
  assert.ok(typeof e["operatorId"] === "string" && (e["operatorId"] as string).length > 0);
  assert.ok(typeof e["operatorLabel"] === "string");
  assert.equal(e["txHash"], null);
  assert.equal(e["networkRef"], null);
  assert.equal(e["updatedAt"], NOW_ISO);
  assert.equal(e["submittedAt"], NOW_ISO);
  assert.equal(e["finalizedAt"], null);
  assert.equal(e["cooldownUntil"], null);
  assert.equal(e["lastErrorCode"], null);
  assert.equal(e["lastError"], null);
  assert.equal(e["lastDecision"], "none");
  assert.equal(e["amount"], AMOUNT);

  const meta = e["metadata"] as Record<string, unknown>;
  assert.equal(meta["source"], "f5-smoke");
  assert.equal(meta["preserved"], true);
  const drt = meta["dryRunTransition"] as Record<string, unknown>;
  assert.equal(drt["source"], "dispatcher_dry_run_transition_plan");

  // operator must be active
  const activeIds = new Set(["op-a", "op-b"]);
  assert.ok(activeIds.has(e["operatorId"] as string), `operatorId must be active, got ${e["operatorId"]}`);
}

// ---------------------------------------------------------------------------
// Test 2: deterministic operator selection
// ---------------------------------------------------------------------------

function testDeterministicOperatorSelection(): void {
  const input = baseInput();
  const r1 = planDispatcherDryRunTransition(input);
  const r2 = planDispatcherDryRunTransition(input);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  if (!r1.ok || !r2.ok) return;

  const id1 = (r1.submittedEntry as unknown as Record<string, unknown>)["operatorId"];
  const id2 = (r2.submittedEntry as unknown as Record<string, unknown>)["operatorId"];
  assert.equal(id1, id2, "selection must be deterministic across calls");

  // Verify expected index computation
  const sortedActive = ["op-a", "op-b"].sort((a, b) => a.localeCompare(b));
  const hashParts = [STATE_KEY, "none", "0", "operator-seed-f5", ...sortedActive];
  const expectedIdx = stableHashToNumber(hashParts) % sortedActive.length;
  const expectedId = sortedActive[expectedIdx];
  assert.equal(id1, expectedId, `expected ${expectedId}, got ${String(id1)}`);
}

// ---------------------------------------------------------------------------
// Test 3: retry_same_identity
// ---------------------------------------------------------------------------

function testRetrySameIdentity(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "retry_same_identity",
      operatorPolicy: {
        eligibleOperators: [
          activeOperator("op-b", "Operator B"),
          activeOperator("op-a", "Operator A"),
          inactiveOperator("op-paused", "paused"),
        ],
        previousOperatorId: "op-a",
        selectionSeed: "operator-seed-f5",
      },
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  const e = result.submittedEntry as unknown as Record<string, unknown>;
  assert.equal(e["operatorId"], "op-a");
  assert.equal(e["attemptNumber"], 1);
  assert.equal(e["lastDecision"], "retry_same_identity");
  assert.equal(result.transition.nextAttemptNumber, 1);
}

// ---------------------------------------------------------------------------
// Test 4: retry_same_identity requires previousOperatorId
// ---------------------------------------------------------------------------

function testRetrySameIdentityRequiresPreviousOperator(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "retry_same_identity",
      operatorPolicy: {
        eligibleOperators: [activeOperator("op-a", "Operator A")],
        previousOperatorId: null,
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "previous_operator_required");
}

// ---------------------------------------------------------------------------
// Test 5: retry_same_identity previous not active
// ---------------------------------------------------------------------------

function testRetrySameIdentityPreviousNotActive(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "retry_same_identity",
      operatorPolicy: {
        eligibleOperators: [
          activeOperator("op-a", "Operator A"),
          inactiveOperator("op-paused", "paused"),
        ],
        previousOperatorId: "op-paused",
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "previous_operator_not_eligible");
}

// ---------------------------------------------------------------------------
// Test 6: rotate_identity
// ---------------------------------------------------------------------------

function testRotateIdentity(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "rotate_identity",
      operatorPolicy: {
        eligibleOperators: [
          activeOperator("op-a", "Operator A"),
          activeOperator("op-b", "Operator B"),
          inactiveOperator("op-paused", "paused"),
        ],
        previousOperatorId: "op-a",
        selectionSeed: "operator-seed-f5",
      },
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  const e = result.submittedEntry as unknown as Record<string, unknown>;
  assert.notEqual(e["operatorId"], "op-a", "rotated operator must not be previous");
  const activeIds = new Set(["op-a", "op-b"]);
  assert.ok(activeIds.has(e["operatorId"] as string), "selected operator must be active");
  assert.equal(e["lastDecision"], "rotate_identity");
}

// ---------------------------------------------------------------------------
// Test 7: rotate_identity requires previousOperatorId
// ---------------------------------------------------------------------------

function testRotateIdentityRequiresPreviousOperator(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "rotate_identity",
      operatorPolicy: {
        eligibleOperators: [activeOperator("op-a", "Operator A")],
        previousOperatorId: null,
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "previous_operator_required");
}

// ---------------------------------------------------------------------------
// Test 8: rotate_identity no alternative
// ---------------------------------------------------------------------------

function testRotateIdentityNoAlternative(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      retryDisposition: "rotate_identity",
      operatorPolicy: {
        eligibleOperators: [activeOperator("op-a", "Operator A")],
        previousOperatorId: "op-a",
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_eligible_operator");
}

// ---------------------------------------------------------------------------
// Test 9: no active operators
// ---------------------------------------------------------------------------

function testNoActiveOperators(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      operatorPolicy: {
        eligibleOperators: [
          inactiveOperator("op-paused", "paused"),
          inactiveOperator("op-failed", "failed"),
          inactiveOperator("op-cooldown", "cooldown"),
        ],
        previousOperatorId: null,
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_eligible_operator");
}

// ---------------------------------------------------------------------------
// Test 10: terminal dispositions unsupported
// ---------------------------------------------------------------------------

function testTerminalDispositionsUnsupported(): void {
  for (const disp of ["fail_batch", "stop_campaign"]) {
    const result = planDispatcherDryRunTransition(
      baseInput({ retryDisposition: disp as RetryDisposition }),
    );
    assert.equal(result.ok, false, `expected rejection for ${disp}`);
    if (!result.ok) {
      assert.equal(result.reason, "unsupported_retry_disposition", `for ${disp}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 11: administrative halt
// ---------------------------------------------------------------------------

function testAdministrativeHalt(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({ administrativeHalt: { active: true, reason: "maintenance" } }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "administrative_halt_active");
}

// ---------------------------------------------------------------------------
// Test 12: invalid administrative halt shape
// ---------------------------------------------------------------------------

function testInvalidAdministrativeHaltShape(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({ administrativeHalt: { active: "true", reason: null } }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_input");
}

// ---------------------------------------------------------------------------
// Test 13: provider policy omitted
// ---------------------------------------------------------------------------

function testProviderPolicyOmitted(): void {
  const result = planDispatcherDryRunTransition(baseInput());

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.transition.providerId, null);
  assert.equal(result.transition.providerEndpointKey, null);

  const meta = (result.submittedEntry as unknown as Record<string, unknown>)["metadata"] as Record<string, unknown>;
  const drt = meta["dryRunTransition"] as Record<string, unknown>;
  assert.equal(drt["providerId"], null);
  assert.equal(drt["providerEndpointKey"], null);
}

// ---------------------------------------------------------------------------
// Test 14: provider deterministic selection
// ---------------------------------------------------------------------------

function testProviderDeterministicSelection(): void {
  const providerSeed = "provider-seed-f5";
  const result = planDispatcherDryRunTransition(
    baseInput({
      providerPolicy: {
        eligibleProviders: [
          activeProvider("p-b", "endpoint-p-b"),
          activeProvider("p-a", "endpoint-p-a"),
          disabledProvider("p-disabled", "endpoint-p-disabled"),
        ],
        selectionSeed: providerSeed,
      },
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  assert.ok(result.transition.providerId !== null, "providerId must be set");
  assert.ok(result.transition.providerEndpointKey !== null, "providerEndpointKey must be set");

  // Verify expected computation
  const sortedActive = ["p-a", "p-b"].sort((a, b) => a.localeCompare(b));
  const hashParts = [STATE_KEY, "none", "1", providerSeed, ...sortedActive];
  const expectedIdx = stableHashToNumber(hashParts) % sortedActive.length;
  const expectedId = sortedActive[expectedIdx];
  assert.equal(result.transition.providerId, expectedId, `expected provider ${expectedId}`);
  assert.equal(result.transition.providerEndpointKey, `endpoint-${expectedId}`);

  // Must be active
  assert.ok(["p-a", "p-b"].includes(result.transition.providerId));
}

// ---------------------------------------------------------------------------
// Test 15: provider no active
// ---------------------------------------------------------------------------

function testProviderNoActive(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      providerPolicy: {
        eligibleProviders: [disabledProvider("p-disabled")],
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_eligible_provider");
}

// ---------------------------------------------------------------------------
// Test 16: provider invalid
// ---------------------------------------------------------------------------

function testProviderInvalid(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      providerPolicy: {
        eligibleProviders: [],
        selectionSeed: "seed",
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "provider_policy_invalid");
}

// ---------------------------------------------------------------------------
// Test 17: fee policy valid
// ---------------------------------------------------------------------------

function testFeePolicyValid(): void {
  const feeSelectionSeed = "fee-seed-f5";
  const result = planDispatcherDryRunTransition(
    baseInput({
      feePolicy: {
        baseFeeNano: "1000",
        maxFeeNano: "2000",
        tierStepNano: "10",
        tierCount: 10,
        selectionSeed: feeSelectionSeed,
      },
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  const expectedTierOffset = stableHashToNumber([STATE_KEY, "1", feeSelectionSeed]) % 10;
  const expectedFinalFee = (1000n + BigInt(expectedTierOffset) * 10n).toString();

  const fp = result.transition.feePlan;
  assert.ok(fp !== null, "feePlan must be set");
  if (!fp) return;
  assert.equal(fp.policy, "deterministic_fee_tier");
  assert.equal(fp.baseFeeNano, "1000");
  assert.equal(fp.maxFeeNano, "2000");
  assert.equal(fp.tierStepNano, "10");
  assert.equal(fp.tierCount, 10);
  assert.equal(fp.tierOffset, expectedTierOffset);
  assert.equal(fp.finalFeeNano, expectedFinalFee);
  assert.equal(fp.selectionSeed, feeSelectionSeed);
}

// ---------------------------------------------------------------------------
// Test 18: fee policy with tierStepNano "0"
// ---------------------------------------------------------------------------

function testFeePolicyTierStepZero(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({
      feePolicy: {
        baseFeeNano: "1000",
        maxFeeNano: "2000",
        tierStepNano: "0",
        tierCount: 5,
        selectionSeed: "fee-zero-seed",
      },
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;

  const fp = result.transition.feePlan;
  assert.ok(fp !== null);
  if (!fp) return;
  assert.equal(fp.finalFeeNano, "1000", "finalFeeNano must equal baseFeeNano when tierStep is 0");
}

// ---------------------------------------------------------------------------
// Test 19: fee cap exceeded
// ---------------------------------------------------------------------------

function testFeeCapExceeded(): void {
  // base=1000, max=1000, step=100 — any tierOffset > 0 exceeds cap.
  // Find a seed that produces tierOffset > 0 deterministically.
  let foundSeed: string | null = null;
  for (let i = 0; i < 100; i++) {
    const seed = `fee-cap-${i}`;
    const offset = stableHashToNumber([STATE_KEY, "1", seed]) % 10;
    if (offset > 0) {
      foundSeed = seed;
      break;
    }
  }
  assert.ok(foundSeed !== null, "must find a seed with tierOffset > 0 within 100 attempts");

  const result = planDispatcherDryRunTransition(
    baseInput({
      feePolicy: {
        baseFeeNano: "1000",
        maxFeeNano: "1000",
        tierStepNano: "100",
        tierCount: 10,
        selectionSeed: foundSeed,
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "fee_cap_exceeded");
}

// ---------------------------------------------------------------------------
// Test 20: invalid fee policy
// ---------------------------------------------------------------------------

function testInvalidFeePolicy(): void {
  // baseFeeNano "0"
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        feePolicy: {
          baseFeeNano: "0",
          maxFeeNano: "2000",
          tierStepNano: "10",
          tierCount: 10,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "fee_policy_invalid");
  }

  // tierCount 0
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        feePolicy: {
          baseFeeNano: "1000",
          maxFeeNano: "2000",
          tierStepNano: "10",
          tierCount: 0,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "fee_policy_invalid");
  }

  // tierCount 1025
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        feePolicy: {
          baseFeeNano: "1000",
          maxFeeNano: "2000",
          tierStepNano: "10",
          tierCount: 1025,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "fee_policy_invalid");
  }

  // tierStepNano "-1"
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        feePolicy: {
          baseFeeNano: "1000",
          maxFeeNano: "2000",
          tierStepNano: "-1",
          tierCount: 10,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "fee_policy_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 21: invalid planned entry
// ---------------------------------------------------------------------------

function testInvalidPlannedEntry(): void {
  // wrong stateKey
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        plannedEntry: makePlannedEntry({
          stateKey: makeStateKey("wrong-batch", RECIPIENT),
        }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_planned_entry");
  }

  // status submitted
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        plannedEntry: makePlannedEntry({
          entry: makePlannedStateEntry({ status: "submitted" } as any),
        }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_planned_entry");
  }

  // operatorId not null
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        plannedEntry: makePlannedEntry({
          entry: makePlannedStateEntry({ operatorId: "some-op" } as any),
        }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_planned_entry");
  }

  // amount "0"
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        plannedEntry: makePlannedEntry({
          entry: makePlannedStateEntry({ amount: "0" } as any),
        }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_planned_entry");
  }
}

// ---------------------------------------------------------------------------
// Test 22: invalid nowIso
// ---------------------------------------------------------------------------

function testInvalidNowIso(): void {
  for (const badIso of ["", "not-iso"]) {
    const result = planDispatcherDryRunTransition(baseInput({ nowIso: badIso }));
    assert.equal(result.ok, false, `expected rejection for nowIso="${badIso}"`);
    if (!result.ok) assert.equal(result.reason, "invalid_now_iso");
  }
}

// ---------------------------------------------------------------------------
// Test 23: unsupported retryDisposition
// ---------------------------------------------------------------------------

function testUnsupportedRetryDisposition(): void {
  const result = planDispatcherDryRunTransition(
    baseInput({ retryDisposition: "weird" as RetryDisposition }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unsupported_retry_disposition");
}

// ---------------------------------------------------------------------------
// Test 24: invalid operator policy
// ---------------------------------------------------------------------------

function testInvalidOperatorPolicy(): void {
  // empty eligibleOperators
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        operatorPolicy: {
          eligibleOperators: [],
          previousOperatorId: null,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "operator_policy_invalid");
  }

  // empty selectionSeed
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        operatorPolicy: {
          eligibleOperators: [activeOperator("op-a")],
          previousOperatorId: null,
          selectionSeed: "",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "operator_policy_invalid");
  }

  // empty previousOperatorId
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        operatorPolicy: {
          eligibleOperators: [activeOperator("op-a")],
          previousOperatorId: "",
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "operator_policy_invalid");
  }

  // operator with empty operatorId
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        operatorPolicy: {
          eligibleOperators: [{ operatorId: "", operatorLabel: "A", status: "active", cooldownUntil: null, failedUntil: null }],
          previousOperatorId: null,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "operator_policy_invalid");
  }

  // invalid status "weird"
  {
    const result = planDispatcherDryRunTransition(
      baseInput({
        operatorPolicy: {
          eligibleOperators: [{ operatorId: "op-x", operatorLabel: "X", status: "weird", cooldownUntil: null, failedUntil: null }],
          previousOperatorId: null,
          selectionSeed: "seed",
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "operator_policy_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 25: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const plannedEntry = makePlannedEntry();
  const operatorPolicy = {
    eligibleOperators: [
      activeOperator("op-b", "Operator B"),
      activeOperator("op-a", "Operator A"),
      inactiveOperator("op-paused", "paused"),
    ],
    previousOperatorId: null,
    selectionSeed: "operator-seed-f5",
  };
  const providerPolicy = {
    eligibleProviders: [
      activeProvider("p-a", "endpoint-p-a"),
      disabledProvider("p-d", "endpoint-p-d"),
    ],
    selectionSeed: "provider-seed-f5",
  };
  const feePolicy = {
    baseFeeNano: "1000",
    maxFeeNano: "2000",
    tierStepNano: "10",
    tierCount: 10,
    selectionSeed: "fee-seed-f5",
  };

  const peBefore = stringifyWithBigInt(plannedEntry);
  const opBefore = stringifyWithBigInt(operatorPolicy);
  const ppBefore = stringifyWithBigInt(providerPolicy);
  const fpBefore = stringifyWithBigInt(feePolicy);

  planDispatcherDryRunTransition({
    plannedEntry,
    nowIso: NOW_ISO,
    retryDisposition: "none" as RetryDisposition,
    operatorPolicy,
    providerPolicy,
    feePolicy,
    administrativeHalt: { active: false, reason: null },
  });

  assert.equal(stringifyWithBigInt(plannedEntry), peBefore, "plannedEntry must not be mutated");
  assert.equal(stringifyWithBigInt(operatorPolicy), opBefore, "operatorPolicy must not be mutated");
  assert.equal(stringifyWithBigInt(providerPolicy), ppBefore, "providerPolicy must not be mutated");
  assert.equal(stringifyWithBigInt(feePolicy), fpBefore, "feePolicy must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testValidInitialNoneTransition();
  testDeterministicOperatorSelection();
  testRetrySameIdentity();
  testRetrySameIdentityRequiresPreviousOperator();
  testRetrySameIdentityPreviousNotActive();
  testRotateIdentity();
  testRotateIdentityRequiresPreviousOperator();
  testRotateIdentityNoAlternative();
  testNoActiveOperators();
  testTerminalDispositionsUnsupported();
  testAdministrativeHalt();
  testInvalidAdministrativeHaltShape();
  testProviderPolicyOmitted();
  testProviderDeterministicSelection();
  testProviderNoActive();
  testProviderInvalid();
  testFeePolicyValid();
  testFeePolicyTierStepZero();
  testFeeCapExceeded();
  testInvalidFeePolicy();
  testInvalidPlannedEntry();
  testInvalidNowIso();
  testUnsupportedRetryDisposition();
  testInvalidOperatorPolicy();
  testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();