import * as assert from "assert/strict";
import {
  resolveGasSafetyMarginPolicy,
  type GasSafetyMarginPolicyConfig,
} from "../lib/dispatcher/gasSafetyMarginPolicy";

const LABEL = "[f-5-2-gas-safety-margin-policy-smoke]";

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function makePolicy(
  overrides: Partial<GasSafetyMarginPolicyConfig> = {},
): GasSafetyMarginPolicyConfig {
  return {
    policyVersion: "gas-margin-policy-v1",
    enabled: true,
    marginMode: "fixed_nano",
    safetyMarginNano: "100",
    gasCeilingNano: "1200",
    auditTag: "f5-2-gas-margin",
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    configuredGasEstimateNano: "1000",
    policy: makePolicy(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: fixed nano margin
// ---------------------------------------------------------------------------

function testFixedNanoMargin(): void {
  const result = resolveGasSafetyMarginPolicy(baseInput());

  assert.equal(result.ok, true, `expected ok, got ${stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "gas_safety_margin_resolved");
  assert.equal(result.resolved.configuredGasEstimateNano, "1000");
  assert.equal(result.resolved.safetyMarginNano, "100");
  assert.equal(result.resolved.finalGasBudgetNano, "1100");
  assert.equal(result.resolved.gasCeilingNano, "1200");
  assert.equal(result.resolved.audit.deterministic, true);
  assert.equal(result.resolved.audit.auditTag, "f5-2-gas-margin");
}

// ---------------------------------------------------------------------------
// Test 2: basis points margin with ceiling
// ---------------------------------------------------------------------------

function testBasisPointsMargin(): void {
  const result = resolveGasSafetyMarginPolicy(
    baseInput({
      policy: makePolicy({
        marginMode: "basis_points",
        safetyMarginNano: undefined,
        safetyMarginBps: 1250,
        gasCeilingNano: "1200",
      }),
    }),
  );

  assert.equal(result.ok, true, `expected ok, got ${stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.resolved.marginMode, "basis_points");
  assert.equal(result.resolved.configuredGasEstimateNano, "1000");
  assert.equal(result.resolved.safetyMarginNano, "125");
  assert.equal(result.resolved.finalGasBudgetNano, "1125");
  assert.equal(result.resolved.gasCeilingNano, "1200");
}

// ---------------------------------------------------------------------------
// Test 3: cap exceeded
// ---------------------------------------------------------------------------

function testGasCapExceeded(): void {
  const result = resolveGasSafetyMarginPolicy(
    baseInput({
      policy: makePolicy({
        safetyMarginNano: "300",
        gasCeilingNano: "1200",
      }),
    }),
  );

  assert.equal(result.ok, false, `expected rejection, got ${stringify(result)}`);
  if (!result.ok) assert.equal(result.reason, "gas_cap_exceeded");
}

// ---------------------------------------------------------------------------
// Test 4: disabled policy
// ---------------------------------------------------------------------------

function testPolicyDisabled(): void {
  const result = resolveGasSafetyMarginPolicy(
    baseInput({ policy: makePolicy({ enabled: false }) }),
  );

  assert.equal(result.ok, false, `expected rejection, got ${stringify(result)}`);
  if (!result.ok) assert.equal(result.reason, "policy_disabled");
}

// ---------------------------------------------------------------------------
// Test 5: invalid inputs and policy
// ---------------------------------------------------------------------------

function testInvalidInputs(): void {
  for (const input of [null, [], "x"]) {
    const result = resolveGasSafetyMarginPolicy(input);
    assert.equal(result.ok, false, `expected invalid_input for ${stringify(input)}`);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
  }

  const badEstimate = resolveGasSafetyMarginPolicy(
    baseInput({ configuredGasEstimateNano: "0" }),
  );
  assert.equal(badEstimate.ok, false);
  if (!badEstimate.ok) assert.equal(badEstimate.reason, "invalid_gas_estimate");

  const badPolicy = resolveGasSafetyMarginPolicy(baseInput({ policy: {} }));
  assert.equal(badPolicy.ok, false);
  if (!badPolicy.ok) assert.equal(badPolicy.reason, "invalid_policy");
}

// ---------------------------------------------------------------------------
// Test 6: invalid margin modes and values
// ---------------------------------------------------------------------------

function testInvalidMargins(): void {
  const bothMarginTypes = resolveGasSafetyMarginPolicy(
    baseInput({
      policy: makePolicy({
        marginMode: "fixed_nano",
        safetyMarginNano: "100",
        safetyMarginBps: 100,
      }),
    }),
  );
  assert.equal(bothMarginTypes.ok, false);
  if (!bothMarginTypes.ok) assert.equal(bothMarginTypes.reason, "invalid_margin");

  const missingBps = resolveGasSafetyMarginPolicy(
    baseInput({
      policy: makePolicy({
        marginMode: "basis_points",
        safetyMarginNano: undefined,
        safetyMarginBps: undefined,
      }),
    }),
  );
  assert.equal(missingBps.ok, false);
  if (!missingBps.ok) assert.equal(missingBps.reason, "invalid_margin");
}

// ---------------------------------------------------------------------------
// Test 7: forbidden execution context
// ---------------------------------------------------------------------------

function testForbiddenExecutionContext(): void {
  const topLevel = resolveGasSafetyMarginPolicy(
    baseInput({ decisionId: "decision-should-not-be-here" }),
  );
  assert.equal(topLevel.ok, false);
  if (!topLevel.ok) assert.equal(topLevel.reason, "forbidden_execution_context");

  const nested = resolveGasSafetyMarginPolicy(
    baseInput({
      policy: {
        ...makePolicy(),
        recipientAddress: "EQForbidden",
      },
    }),
  );
  assert.equal(nested.ok, false);
  if (!nested.ok) assert.equal(nested.reason, "forbidden_execution_context");
}

// ---------------------------------------------------------------------------
// Test 8: deterministic and no mutation
// ---------------------------------------------------------------------------

function testDeterministicAndNoMutation(): void {
  const input = baseInput() as Record<string, unknown>;
  const before = stringify(input);

  const r1 = resolveGasSafetyMarginPolicy(input);
  const r2 = resolveGasSafetyMarginPolicy(input);

  assert.deepEqual(r1, r2, "same input must produce identical result");
  assert.equal(stringify(input), before, "input must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testFixedNanoMargin();
  testBasisPointsMargin();
  testGasCapExceeded();
  testPolicyDisabled();
  testInvalidInputs();
  testInvalidMargins();
  testForbiddenExecutionContext();
  testDeterministicAndNoMutation();

  console.log(`${LABEL} PASS`);
}

main();
