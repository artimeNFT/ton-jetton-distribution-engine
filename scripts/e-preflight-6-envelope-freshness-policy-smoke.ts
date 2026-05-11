import * as assert from "assert/strict";
import { validateBlacklistEnvelopeFreshness } from "../lib/watcher/blacklistEnvelopeFreshnessPolicy";

const LABEL = "[e-preflight-6-envelope-freshness-policy-smoke]";

const NOW = "2026-01-01T00:00:00.000Z";
const POLICY = {
  maxFutureValidityMs: 10 * 60 * 1000,
};

function testValidFreshnessPasses(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "2026-01-01T00:05:00.000Z",
      policy: POLICY,
    }),
    {
      ok: true,
      action: "accepted",
    },
  );
}

function testExpiredByOneMillisecondFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "2025-12-31T23:59:59.999Z",
      policy: POLICY,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "envelope_expired",
    },
  );
}

function testValidUntilTooFarInFutureFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "2026-01-01T00:10:00.001Z",
      policy: POLICY,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "envelope_valid_too_far_in_future",
    },
  );
}

function testInvalidNowFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: "not-a-date",
      validUntil: "2026-01-01T00:05:00.000Z",
      policy: POLICY,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_now",
    },
  );
}

function testInvalidValidUntilFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "not-a-date",
      policy: POLICY,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_valid_until",
    },
  );
}

function testInvalidPolicyFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "2026-01-01T00:05:00.000Z",
      policy: null as any,
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_policy",
    },
  );
}

function testInvalidMaxFutureValidityFailsClosed(): void {
  assert.deepEqual(
    validateBlacklistEnvelopeFreshness({
      nowIso: NOW,
      validUntil: "2026-01-01T00:05:00.000Z",
      policy: { maxFutureValidityMs: -1 },
    }),
    {
      ok: false,
      action: "rejected",
      reason: "invalid_max_future_validity_ms",
    },
  );
}

function main(): void {
  testValidFreshnessPasses();
  testExpiredByOneMillisecondFailsClosed();
  testValidUntilTooFarInFutureFailsClosed();
  testInvalidNowFailsClosed();
  testInvalidValidUntilFailsClosed();
  testInvalidPolicyFailsClosed();
  testInvalidMaxFutureValidityFailsClosed();
  testInvalidInputFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();

function testInvalidInputFailsClosed(): void {
  assert.deepEqual(validateBlacklistEnvelopeFreshness(null), {
    ok: false,
    action: "rejected",
    reason: "invalid_input",
  });

  assert.deepEqual(validateBlacklistEnvelopeFreshness([]), {
    ok: false,
    action: "rejected",
    reason: "invalid_input",
  });
}
