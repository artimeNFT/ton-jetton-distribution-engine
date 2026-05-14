import * as assert from "assert/strict";
import {
  planHeartbeatAppend,
  type HeartbeatAppendTrigger,
} from "../lib/dispatcher/heartbeatAppendPolicy";

const LABEL = "[f-6-heartbeat-append-policy-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = "2026-01-01T00:01:00.000Z";
const LAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2026-01-01T00:02:00.000Z";
const MIN_INTERVAL_MS = 60000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function plan(overrides: Record<string, unknown> = {}): unknown {
  return {
    trigger: "periodic" as HeartbeatAppendTrigger,
    nowIso: NOW,
    lastHeartbeatAt: LAST,
    minIntervalMs: MIN_INTERVAL_MS,
    ...overrides,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Test 1: periodic with lastHeartbeatAt null allows append
// ---------------------------------------------------------------------------

function testPeriodicNullLastHeartbeatAllows(): void {
  const result = planHeartbeatAppend(plan({ lastHeartbeatAt: null }));

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "append_allowed");
  assert.equal(result.trigger, "periodic");
  assert.equal(result.reason, "periodic_interval_elapsed");
}

// ---------------------------------------------------------------------------
// Test 2: periodic interval elapsed allows append
// ---------------------------------------------------------------------------

function testPeriodicIntervalElapsedAllows(): void {
  const result = planHeartbeatAppend(
    plan({ trigger: "periodic", nowIso: NOW, lastHeartbeatAt: LAST, minIntervalMs: 60000 }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "append_allowed");
  assert.equal(result.reason, "periodic_interval_elapsed");
}

// ---------------------------------------------------------------------------
// Test 3: periodic throttled skips append with nextEligibleAt
// ---------------------------------------------------------------------------

function testPeriodicThrottledSkips(): void {
  const result = planHeartbeatAppend(
    plan({ trigger: "periodic", nowIso: NOW, lastHeartbeatAt: LAST, minIntervalMs: 120000 }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "append_skipped");
  assert.equal(result.reason, "skipped_throttled");
  assert.equal(
    (result as Record<string, unknown>)["nextEligibleAt"],
    "2026-01-01T00:02:00.000Z",
    "nextEligibleAt must be LAST + minIntervalMs",
  );
}

// ---------------------------------------------------------------------------
// Test 4: minIntervalMs zero always allows periodic append
// ---------------------------------------------------------------------------

function testMinIntervalZeroAllows(): void {
  const result = planHeartbeatAppend(
    plan({ trigger: "periodic", nowIso: NOW, lastHeartbeatAt: LAST, minIntervalMs: 0 }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${JSON.stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.action, "append_allowed");
  assert.equal(result.reason, "periodic_interval_elapsed");
}

// ---------------------------------------------------------------------------
// Test 5: hot path triggers always skip
// ---------------------------------------------------------------------------

function testHotPathTriggersAlwaysSkip(): void {
  const hotTriggers: HeartbeatAppendTrigger[] = [
    "recipient_planned",
    "recipient_submitted",
    "recipient_success",
    "recipient_retry_scheduled",
  ];

  for (const trigger of hotTriggers) {
    const result = planHeartbeatAppend(plan({ trigger }));

    assert.equal(result.ok, true, `expected ok for ${trigger}, got: ${JSON.stringify(result)}`);
    if (!result.ok) continue;
    assert.equal(result.action, "append_skipped", `expected append_skipped for ${trigger}`);
    assert.equal(
      result.reason,
      "skipped_hot_path_trigger",
      `expected skipped_hot_path_trigger for ${trigger}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 6: forced boundary triggers always allow despite heavy throttle
// ---------------------------------------------------------------------------

function testForcedBoundaryTriggersAlwaysAllow(): void {
  const forcedTriggers: HeartbeatAppendTrigger[] = [
    "administrative_halt",
    "fatal_error",
    "recovery_event",
    "cross_store_divergence",
    "heartbeat_write_failure",
  ];

  for (const trigger of forcedTriggers) {
    const result = planHeartbeatAppend(
      plan({ trigger, nowIso: NOW, lastHeartbeatAt: LAST, minIntervalMs: 999999999 }),
    );

    assert.equal(result.ok, true, `expected ok for ${trigger}, got: ${JSON.stringify(result)}`);
    if (!result.ok) continue;
    assert.equal(result.action, "append_allowed", `expected append_allowed for ${trigger}`);
    assert.equal(
      result.reason,
      "forced_boundary_event",
      `expected forced_boundary_event for ${trigger}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 7: batch boundary triggers allow
// ---------------------------------------------------------------------------

function testBatchBoundaryTriggersAllow(): void {
  const batchTriggers: HeartbeatAppendTrigger[] = [
    "batch_started",
    "batch_completed",
  ];

  for (const trigger of batchTriggers) {
    const result = planHeartbeatAppend(plan({ trigger }));

    assert.equal(result.ok, true, `expected ok for ${trigger}, got: ${JSON.stringify(result)}`);
    if (!result.ok) continue;
    assert.equal(result.action, "append_allowed", `expected append_allowed for ${trigger}`);
    assert.equal(result.reason, "append_allowed", `expected reason append_allowed for ${trigger}`);
  }
}

// ---------------------------------------------------------------------------
// Test 8: invalid input rejects
// ---------------------------------------------------------------------------

function testInvalidInputRejects(): void {
  const cases: unknown[] = [null, [], {}, plan({ trigger: "weird" })];

  for (const input of cases) {
    const result = planHeartbeatAppend(input);
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(input)}`);
    if (!result.ok) {
      assert.equal(
        result.reason,
        "invalid_input",
        `expected invalid_input for ${JSON.stringify(input)}, got ${result.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 9: invalid nowIso rejects
// ---------------------------------------------------------------------------

function testInvalidNowIsoRejects(): void {
  const cases = ["", "not-iso"];

  for (const nowIso of cases) {
    const result = planHeartbeatAppend(plan({ nowIso }));
    assert.equal(result.ok, false, `expected rejection for nowIso="${nowIso}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_now_iso", `expected invalid_now_iso for "${nowIso}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 10: invalid lastHeartbeatAt rejects
// ---------------------------------------------------------------------------

function testInvalidLastHeartbeatAtRejects(): void {
  const cases = ["", "not-iso", FUTURE];

  for (const lastHeartbeatAt of cases) {
    const result = planHeartbeatAppend(plan({ lastHeartbeatAt }));
    assert.equal(result.ok, false, `expected rejection for lastHeartbeatAt="${lastHeartbeatAt}"`);
    if (!result.ok) {
      assert.equal(
        result.reason,
        "invalid_last_heartbeat_at",
        `expected invalid_last_heartbeat_at for "${lastHeartbeatAt}", got ${result.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 11: invalid minIntervalMs rejects
// ---------------------------------------------------------------------------

function testInvalidMinIntervalMsRejects(): void {
  const cases: unknown[] = [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "1000",
  ];

  for (const minIntervalMs of cases) {
    const result = planHeartbeatAppend(plan({ minIntervalMs }));
    assert.equal(result.ok, false, `expected rejection for minIntervalMs=${JSON.stringify(minIntervalMs)}`);
    if (!result.ok) {
      assert.equal(
        result.reason,
        "invalid_min_interval_ms",
        `expected invalid_min_interval_ms for ${JSON.stringify(minIntervalMs)}, got ${result.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 12: deterministic — same input twice returns deepEqual results
// ---------------------------------------------------------------------------

function testDeterministic(): void {
  const input = plan();
  const r1 = planHeartbeatAppend(input);
  const r2 = planHeartbeatAppend(input);
  assert.deepEqual(r1, r2, "same input must produce identical results across calls");

  const throttledInput = plan({ minIntervalMs: 120000 });
  const t1 = planHeartbeatAppend(throttledInput);
  const t2 = planHeartbeatAppend(throttledInput);
  assert.deepEqual(t1, t2, "throttled result must be identical across calls");
}

// ---------------------------------------------------------------------------
// Test 13: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const input = plan() as Record<string, unknown>;
  const before = JSON.stringify(input);

  planHeartbeatAppend(input);

  const after = JSON.stringify(input);
  assert.equal(after, before, "input must not be mutated by planHeartbeatAppend");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testPeriodicNullLastHeartbeatAllows();
  testPeriodicIntervalElapsedAllows();
  testPeriodicThrottledSkips();
  testMinIntervalZeroAllows();
  testHotPathTriggersAlwaysSkip();
  testForcedBoundaryTriggersAlwaysAllow();
  testBatchBoundaryTriggersAllow();
  testInvalidInputRejects();
  testInvalidNowIsoRejects();
  testInvalidLastHeartbeatAtRejects();
  testInvalidMinIntervalMsRejects();
  testDeterministic();
  testDoesNotMutateInputs();

  console.log(`${LABEL} PASS`);
}

main();
