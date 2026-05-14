import * as assert from "assert/strict";
import {
  evaluateAdministrativeHaltInterception,
  type AdministrativeHaltBoundary,
  type StageEAdministrativeHaltSignal,
} from "../lib/dispatcher/administrativeHaltInterception";

const LABEL = "[f-8-administrative-halt-interception-smoke]";

const BOUNDARIES: AdministrativeHaltBoundary[] = [
  "before_intake",
  "after_runstate_plan",
  "before_dry_run_transition",
  "before_dispatch_intent_exposure",
];

function activeHalt(reason: string | null = "manual_halt"): StageEAdministrativeHaltSignal {
  return { active: true, source: "stage_e_orchestrator", reason };
}

function inactiveHalt(): StageEAdministrativeHaltSignal {
  return { active: false, source: "stage_e_orchestrator", reason: null };
}

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function assertRejected(
  result: ReturnType<typeof evaluateAdministrativeHaltInterception>,
  reason: string,
): void {
  assert.equal(result.ok, false, `expected rejection, got ${stringify(result)}`);
  if (!result.ok) assert.equal(result.reason, reason);
}

// ---------------------------------------------------------------------------
// Test 1: all boundaries allow inactive Stage E halt
// ---------------------------------------------------------------------------

function testInactiveHaltAllowsAllBoundaries(): void {
  for (const boundary of BOUNDARIES) {
    const result = evaluateAdministrativeHaltInterception({
      boundary,
      administrativeHalt: inactiveHalt(),
    });

    assert.equal(result.ok, true, `expected allowed for ${boundary}`);
    if (!result.ok) return;
    assert.equal(result.action, "boundary_allowed");
    assert.equal(result.boundary, boundary);
  }
}

// ---------------------------------------------------------------------------
// Test 2: active halt rejects all boundaries
// ---------------------------------------------------------------------------

function testActiveHaltRejectsAllBoundaries(): void {
  for (const boundary of BOUNDARIES) {
    const result = evaluateAdministrativeHaltInterception({
      boundary,
      administrativeHalt: activeHalt("maintenance"),
    });

    assertRejected(result, "administrative_halt_active");
    if (!result.ok) {
      assert.equal(result.boundary, boundary);
      assert.equal(result.haltReason, "maintenance");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 3: invalid input and boundary
// ---------------------------------------------------------------------------

function testInvalidInputAndBoundary(): void {
  for (const input of [null, [], "x"]) {
    const result = evaluateAdministrativeHaltInterception(input);
    assertRejected(result, "invalid_input");
  }

  const badBoundary = evaluateAdministrativeHaltInterception({
    boundary: "after_broadcast",
    administrativeHalt: inactiveHalt(),
  });

  assertRejected(badBoundary, "invalid_boundary");
}

// ---------------------------------------------------------------------------
// Test 4: invalid Stage E halt signal
// ---------------------------------------------------------------------------

function testInvalidHaltSignal(): void {
  const missing = evaluateAdministrativeHaltInterception({
    boundary: "before_intake",
    administrativeHalt: {},
  });

  assertRejected(missing, "invalid_halt_signal");

  const wrongSource = evaluateAdministrativeHaltInterception({
    boundary: "before_intake",
    administrativeHalt: { active: true, source: "local_dispatcher", reason: null },
  });

  assertRejected(wrongSource, "invalid_halt_signal");
}

// ---------------------------------------------------------------------------
// Test 5: forbidden execution context fields
// ---------------------------------------------------------------------------

function testForbiddenExecutionContext(): void {
  const topLevel = evaluateAdministrativeHaltInterception({
    boundary: "before_dispatch_intent_exposure",
    administrativeHalt: inactiveHalt(),
    rpcEndpoint: "https://forbidden.example",
  });

  assertRejected(topLevel, "forbidden_execution_context");

  const nested = evaluateAdministrativeHaltInterception({
    boundary: "before_dispatch_intent_exposure",
    administrativeHalt: {
      ...inactiveHalt(),
      signedMessage: "forbidden",
    },
  });

  assertRejected(nested, "forbidden_execution_context");
}

// ---------------------------------------------------------------------------
// Test 6: interception prevents transition callback
// ---------------------------------------------------------------------------

function testInterceptionPreventsTransitionCallback(): void {
  let transitionReached = false;

  const result = evaluateAdministrativeHaltInterception({
    boundary: "before_dry_run_transition",
    administrativeHalt: activeHalt("operator_stop"),
  });

  if (result.ok) {
    transitionReached = true;
  }

  assertRejected(result, "administrative_halt_active");
  assert.equal(transitionReached, false, "transition must not be reached under active halt");
}

// ---------------------------------------------------------------------------
// Test 7: deterministic and no mutation
// ---------------------------------------------------------------------------

function testDeterministicAndNoMutation(): void {
  const input = {
    boundary: "before_intake" as const,
    administrativeHalt: inactiveHalt(),
  };

  const before = stringify(input);
  const r1 = evaluateAdministrativeHaltInterception(input);
  const r2 = evaluateAdministrativeHaltInterception(input);

  assert.deepEqual(r1, r2, "same input must produce identical result");
  assert.equal(stringify(input), before, "input must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testInactiveHaltAllowsAllBoundaries();
  testActiveHaltRejectsAllBoundaries();
  testInvalidInputAndBoundary();
  testInvalidHaltSignal();
  testForbiddenExecutionContext();
  testInterceptionPreventsTransitionCallback();
  testDeterministicAndNoMutation();

  console.log(`${LABEL} PASS`);
}

main();
