import * as assert from "assert/strict";
import {
  planOperationalHealthProbeLane,
  type OperationalHealthProbeAllowlistRecord,
  type OperationalHealthProbeRequest,
} from "../lib/dispatcher/operationalHealthProbeLane";

const LABEL = "[f-7-operational-health-probe-lane-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const PROVIDER = "provider-a";
const ENDPOINT = "endpoint-a";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function makeRequest(
  overrides: Partial<OperationalHealthProbeRequest> | Record<string, unknown> = {},
): OperationalHealthProbeRequest {
  return {
    lane: "operational_health_probe",
    providerKey: PROVIDER,
    endpointKey: ENDPOINT,
    probeType: "provider_latency",
    workerIsolation: "worker_thread_required",
    faultScenario: "none",
    simulationSeed: "probe-seed-f7",
    nowIso: NOW_ISO,
    administrativeHalt: {
      active: false,
      source: "stage_e_orchestrator",
      reason: null,
    },
    ...overrides,
  } as unknown as OperationalHealthProbeRequest;
}

function makeAllowlistRecord(
  overrides: Partial<OperationalHealthProbeAllowlistRecord> | Record<string, unknown> = {},
): OperationalHealthProbeAllowlistRecord {
  return {
    lane: "operational_health_probe",
    providerKey: PROVIDER,
    endpointKey: ENDPOINT,
    allowedProbeTypes: [
      "provider_latency",
      "provider_status",
      "read_only_chain_tip",
      "read_only_config_probe",
    ],
    enabled: true,
    maxTimeoutMs: 5000,
    maxSamplesPerWindow: 100,
    workerIsolation: "worker_thread_required",
    ...overrides,
  } as unknown as OperationalHealthProbeAllowlistRecord;
}

function baseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    request: makeRequest(),
    allowlist: [makeAllowlistRecord()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: allows valid probe plan
// ---------------------------------------------------------------------------

function testAllowsValidProbePlan(): void {
  const result = planOperationalHealthProbeLane(baseInput());

  assert.equal(result.ok, true, `expected ok, got: ${stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "probe_plan_allowed");
  assert.equal(result.plan.lane, "operational_health_probe");
  assert.equal(result.plan.providerKey, PROVIDER);
  assert.equal(result.plan.endpointKey, ENDPOINT);
  assert.equal(result.plan.probeType, "provider_latency");
  assert.equal(result.plan.workerIsolation, "worker_thread_required");
  assert.equal(result.plan.faultScenario, "none");
  assert.equal(result.plan.simulatedOutcome, "success");
  assert.equal(result.plan.simulationSeed, "probe-seed-f7");
  assert.equal(result.plan.timeoutMs, 5000);
  assert.equal(result.plan.maxSamplesPerWindow, 100);
  assert.equal(result.plan.nowIso, NOW_ISO);
}

// ---------------------------------------------------------------------------
// Test 2: trims providerKey, endpointKey, and simulationSeed
// ---------------------------------------------------------------------------

function testTrimsKeys(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({
      request: makeRequest({
        providerKey: `  ${PROVIDER}  `,
        endpointKey: `  ${ENDPOINT}  `,
        simulationSeed: "  probe-seed-f7  ",
      }),
      allowlist: [
        makeAllowlistRecord({
          providerKey: `  ${PROVIDER}  `,
          endpointKey: `  ${ENDPOINT}  `,
        }),
      ],
    }),
  );

  assert.equal(result.ok, true, `expected ok after trim, got: ${stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.plan.providerKey, PROVIDER);
  assert.equal(result.plan.endpointKey, ENDPOINT);
  assert.equal(result.plan.simulationSeed, "probe-seed-f7");
}

// ---------------------------------------------------------------------------
// Test 3: does not lowercase providerKey or endpointKey
// ---------------------------------------------------------------------------

function testDoesNotLowercaseKeys(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({
      request: makeRequest({ providerKey: "provider-a" }),
      allowlist: [makeAllowlistRecord({ providerKey: "Provider-A" })],
    }),
  );

  assert.equal(result.ok, false, "expected rejection for case mismatch");
  if (!result.ok) {
    assert.equal(result.reason, "provider_endpoint_not_allowed");
  }
}

// ---------------------------------------------------------------------------
// Test 4: rejects invalid input
// ---------------------------------------------------------------------------

function testRejectsInvalidInput(): void {
  for (const input of [null, [], "x"]) {
    const result = planOperationalHealthProbeLane(input);
    assert.equal(result.ok, false, `expected rejection for ${stringify(input)}`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_input", `for ${stringify(input)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 5: rejects forbidden business fields
// ---------------------------------------------------------------------------

function testRejectsForbiddenBusinessFields(): void {
  // top-level includes recipientAddress
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ recipientAddress: "EQSomeRecipient" }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "forbidden_business_field");
  }

  // request includes amount
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        request: makeRequest({ amount: "100" } as any),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "forbidden_business_field");
  }

  // allowlist record includes batchId
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        allowlist: [makeAllowlistRecord({ batchId: "batch-001" } as any)],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "forbidden_business_field");
  }
}

// ---------------------------------------------------------------------------
// Test 6: rejects invalid request
// ---------------------------------------------------------------------------

function testRejectsInvalidRequest(): void {
  // request missing
  {
    const { request: _r, ...inputWithout } = baseInput() as Record<string, unknown>;
    const result = planOperationalHealthProbeLane(inputWithout);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_request");
  }

  // request {}
  {
    const result = planOperationalHealthProbeLane(baseInput({ request: {} }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      // {} has no lane so wrong_lane or invalid_request
      assert.ok(
        result.reason === "wrong_lane" || result.reason === "invalid_request",
        `expected wrong_lane or invalid_request, got ${result.reason}`,
      );
    }
  }

  // providerKey ""
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ providerKey: "" }) }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_request");
  }

  // endpointKey ""
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ endpointKey: "" }) }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_request");
  }

  // probeType "unknown"
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ probeType: "unknown" as any }) }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_request");
  }

  // malformed administrativeHalt
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        request: makeRequest({
          administrativeHalt: { active: "yes", source: "stage_e_orchestrator", reason: null } as any,
        }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_request");
  }
}

// ---------------------------------------------------------------------------
// Test 7: rejects wrong lane
// ---------------------------------------------------------------------------

function testRejectsWrongLane(): void {
  // request lane wrong
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        request: makeRequest({ lane: "business_distribution" as any }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_lane");
  }

  // allowlist record lane wrong
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        allowlist: [makeAllowlistRecord({ lane: "business_distribution" as any })],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_lane");
  }
}

// ---------------------------------------------------------------------------
// Test 8: rejects missing worker isolation
// ---------------------------------------------------------------------------

function testRejectsMissingWorkerIsolation(): void {
  // request workerIsolation wrong
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        request: makeRequest({ workerIsolation: "main_event_loop" as any }),
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "worker_isolation_required");
  }

  // allowlist record workerIsolation wrong
  {
    const result = planOperationalHealthProbeLane(
      baseInput({
        allowlist: [makeAllowlistRecord({ workerIsolation: "main_event_loop" as any })],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "worker_isolation_required");
  }
}

// ---------------------------------------------------------------------------
// Test 9: rejects invalid fault scenario
// ---------------------------------------------------------------------------

function testRejectsInvalidFaultScenario(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({ request: makeRequest({ faultScenario: "random_failure" as any }) }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "fault_scenario_invalid");
}

// ---------------------------------------------------------------------------
// Test 10: rejects invalid simulationSeed
// ---------------------------------------------------------------------------

function testRejectsInvalidSimulationSeed(): void {
  for (const seed of ["", "   "]) {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ simulationSeed: seed }) }),
    );
    assert.equal(result.ok, false, `expected rejection for seed="${seed}"`);
    if (!result.ok) assert.equal(result.reason, "simulation_seed_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 11: rejects invalid nowIso
// ---------------------------------------------------------------------------

function testRejectsInvalidNowIso(): void {
  for (const nowIso of ["", "not-iso"]) {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ nowIso }) }),
    );
    assert.equal(result.ok, false, `expected rejection for nowIso="${nowIso}"`);
    if (!result.ok) assert.equal(result.reason, "invalid_now_iso");
  }
}

// ---------------------------------------------------------------------------
// Test 12: respects Stage E administrative halt
// ---------------------------------------------------------------------------

function testRespectsStageEAdministrativeHalt(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({
      request: makeRequest({
        administrativeHalt: {
          active: true,
          source: "stage_e_orchestrator",
          reason: "manual_halt",
        },
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "administrative_halt_active");
}

// ---------------------------------------------------------------------------
// Test 13: rejects invalid allowlist
// ---------------------------------------------------------------------------

function testRejectsInvalidAllowlist(): void {
  // missing
  {
    const { allowlist: _a, ...inputWithout } = baseInput() as Record<string, unknown>;
    const result = planOperationalHealthProbeLane(inputWithout);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }

  // []
  {
    const result = planOperationalHealthProbeLane(baseInput({ allowlist: [] }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }

  // not array
  {
    const result = planOperationalHealthProbeLane(baseInput({ allowlist: "not-array" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }

  // record {}
  {
    const result = planOperationalHealthProbeLane(baseInput({ allowlist: [{}] }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.reason === "invalid_allowlist" || result.reason === "wrong_lane",
        `expected invalid_allowlist or wrong_lane, got ${result.reason}`,
      );
    }
  }

  // allowedProbeTypes []
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ allowlist: [makeAllowlistRecord({ allowedProbeTypes: [] })] }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }

  // allowedProbeTypes includes "unknown"
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ allowlist: [makeAllowlistRecord({ allowedProbeTypes: ["unknown"] as any })] }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }

  // enabled "true" as any
  {
    const result = planOperationalHealthProbeLane(
      baseInput({ allowlist: [makeAllowlistRecord({ enabled: "true" as any })] }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_allowlist");
  }
}

// ---------------------------------------------------------------------------
// Test 14: rejects invalid timeout policy
// ---------------------------------------------------------------------------

function testRejectsInvalidTimeoutPolicy(): void {
  for (const maxTimeoutMs of [0, 120001, 1.5]) {
    const result = planOperationalHealthProbeLane(
      baseInput({ allowlist: [makeAllowlistRecord({ maxTimeoutMs })] }),
    );
    assert.equal(result.ok, false, `expected rejection for maxTimeoutMs=${maxTimeoutMs}`);
    if (!result.ok) assert.equal(result.reason, "timeout_policy_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 15: rejects invalid sample policy
// ---------------------------------------------------------------------------

function testRejectsInvalidSamplePolicy(): void {
  for (const maxSamplesPerWindow of [0, 10001, 1.5]) {
    const result = planOperationalHealthProbeLane(
      baseInput({ allowlist: [makeAllowlistRecord({ maxSamplesPerWindow })] }),
    );
    assert.equal(result.ok, false, `expected rejection for maxSamplesPerWindow=${maxSamplesPerWindow}`);
    if (!result.ok) assert.equal(result.reason, "sample_policy_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 16: rejects duplicate provider endpoint
// ---------------------------------------------------------------------------

function testRejectsDuplicateProviderEndpoint(): void {
  const entryA = makeAllowlistRecord({ enabled: true });
  const entryB = makeAllowlistRecord({ enabled: false });

  const result = planOperationalHealthProbeLane(
    baseInput({ allowlist: [entryA, entryB] }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "duplicate_allowlist_entry");
}

// ---------------------------------------------------------------------------
// Test 17: rejects provider endpoint not allowed
// ---------------------------------------------------------------------------

function testRejectsProviderEndpointNotAllowed(): void {
  const unknownEndpoint = "unknown-endpoint";
  const result = planOperationalHealthProbeLane(
    baseInput({ request: makeRequest({ endpointKey: unknownEndpoint }) }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "provider_endpoint_not_allowed");
    assert.equal(result.endpointKey, unknownEndpoint);
  }
}

// ---------------------------------------------------------------------------
// Test 18: rejects disabled allowlist entry
// ---------------------------------------------------------------------------

function testRejectsDisabledAllowlistEntry(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({ allowlist: [makeAllowlistRecord({ enabled: false })] }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "allowlist_entry_disabled");
}

// ---------------------------------------------------------------------------
// Test 19: rejects probeType not allowed
// ---------------------------------------------------------------------------

function testRejectsProbeTypeNotAllowed(): void {
  const result = planOperationalHealthProbeLane(
    baseInput({
      request: makeRequest({ probeType: "provider_latency" }),
      allowlist: [makeAllowlistRecord({ allowedProbeTypes: ["provider_status"] })],
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "probe_type_not_allowed");
    assert.equal(result.probeType, "provider_latency");
  }
}

// ---------------------------------------------------------------------------
// Test 20: deterministic fault scenarios
// ---------------------------------------------------------------------------

function testDeterministicFaultScenarios(): void {
  const cases: Array<[string, string]> = [
    ["none", "success"],
    ["rpc_timeout", "timeout"],
    ["provider_unavailable", "provider_error"],
    ["latency_spike", "latency_spike"],
    ["malformed_response", "malformed_response"],
    ["race_condition_simulated", "race_condition_detected"],
  ];

  for (const [faultScenario, expectedOutcome] of cases) {
    const result = planOperationalHealthProbeLane(
      baseInput({ request: makeRequest({ faultScenario: faultScenario as any }) }),
    );
    assert.equal(result.ok, true, `expected ok for faultScenario=${faultScenario}, got: ${stringify(result)}`);
    if (!result.ok) continue;
    assert.equal(
      result.plan.simulatedOutcome,
      expectedOutcome,
      `expected ${expectedOutcome} for faultScenario=${faultScenario}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 21: deterministic same input
// ---------------------------------------------------------------------------

function testDeterministicSameInput(): void {
  const input = baseInput();
  const r1 = planOperationalHealthProbeLane(input);
  const r2 = planOperationalHealthProbeLane(input);
  assert.deepEqual(r1, r2, "same input must produce identical results");
}

// ---------------------------------------------------------------------------
// Test 22: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const input = baseInput() as Record<string, unknown>;
  const before = stringify(input);

  planOperationalHealthProbeLane(input);

  assert.equal(stringify(input), before, "input must not be mutated");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testAllowsValidProbePlan();
  testTrimsKeys();
  testDoesNotLowercaseKeys();
  testRejectsInvalidInput();
  testRejectsForbiddenBusinessFields();
  testRejectsInvalidRequest();
  testRejectsWrongLane();
  testRejectsMissingWorkerIsolation();
  testRejectsInvalidFaultScenario();
  testRejectsInvalidSimulationSeed();
  testRejectsInvalidNowIso();
  testRespectsStageEAdministrativeHalt();
  testRejectsInvalidAllowlist();
  testRejectsInvalidTimeoutPolicy();
  testRejectsInvalidSamplePolicy();
  testRejectsDuplicateProviderEndpoint();
  testRejectsProviderEndpointNotAllowed();
  testRejectsDisabledAllowlistEntry();
  testRejectsProbeTypeNotAllowed();
  testDeterministicFaultScenarios();
  testDeterministicSameInput();
  testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();
