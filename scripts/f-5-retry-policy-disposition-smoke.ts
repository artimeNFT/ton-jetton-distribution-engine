import * as assert from "assert/strict";

import {
  classifyRetry,
  classify,
  DefaultRetryPolicy,
  exponentialBackoffMs,
  type RetryContext,
} from "../lib/dispatcher/retryPolicy";

const LABEL = "[f-5-retry-policy-disposition-smoke]";
const FIXED_NOW_MS = Date.parse("2026-01-01T00:00:00.000Z");

function withFixedDateNow(fn: () => void): void {
  const originalDateNow = Date.now;
  Date.now = () => FIXED_NOW_MS;

  try {
    fn();
  } finally {
    Date.now = originalDateNow;
  }
}

function baseContext(overrides: Partial<RetryContext> = {}): RetryContext {
  return {
    attempt: 1,
    maxAttempts: 3,
    campaignId: "campaign-f5",
    ...overrides,
  };
}

function assertIso(value: string | null, label: string): void {
  assert.ok(value !== null, `${label} must be a string`);
  const iso = value;
  assert.ok(iso.length > 0, `${label} must not be empty`);
  assert.ok(!Number.isNaN(Date.parse(iso)), `${label} must be valid ISO`);
  assert.equal(new Date(iso).toISOString(), iso, `${label} must be canonical ISO`);
}

function assertDecisionShape(decision: ReturnType<typeof classifyRetry>): void {
  assert.equal(typeof decision.category, "string");
  assert.equal(typeof decision.retry, "boolean");
  assert.equal(typeof decision.disposition, "string");
  assert.equal(typeof decision.reasonCode, "string");
  assert.equal(typeof decision.delayMs, "number");
  assert.ok(Number.isInteger(decision.delayMs));
  assert.ok(decision.delayMs >= 0);
  assert.equal(typeof decision.shouldPauseWallet, "boolean");
  assert.equal(typeof decision.shouldFailoverWallet, "boolean");
  assert.ok(typeof decision.cooldownUntil === "string" || decision.cooldownUntil === null);
  assert.ok(typeof decision.failedUntil === "string" || decision.failedUntil === null);
}

function assertThrowsInvalid(label: string, fn: () => unknown): void {
  assert.throws(fn, Error, label);
}

withFixedDateNow(() => {
  {
    const decision = classifyRetry("rate limit 429", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "rate_limited");
    assert.equal(decision.retry, true);
    assert.equal(decision.disposition, "retry_same_identity");
    assert.equal(decision.reasonCode, "rate_limited");
    assert.ok(decision.delayMs > 0);
    assertIso(decision.cooldownUntil, "cooldownUntil");
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classifyRetry("gateway timeout 504", baseContext());

    assertDecisionShape(decision);
    assert.ok(
      decision.category === "transient_rpc" || decision.category === "timeout",
      `expected transient_rpc or timeout, got ${decision.category}`,
    );
    assert.equal(decision.retry, true);
    assert.equal(decision.disposition, "retry_same_identity");
    assert.equal(decision.reasonCode, decision.category);
    assert.ok(decision.delayMs > 0);
    assertIso(decision.cooldownUntil, "cooldownUntil");
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classifyRetry("seqno out of sync", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "seqno_desync");
    assert.equal(decision.retry, true);
    assert.equal(decision.disposition, "retry_same_identity");
    assert.equal(decision.reasonCode, "seqno_desync");
    assert.ok(decision.delayMs > 0);
    assertIso(decision.cooldownUntil, "cooldownUntil");
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classifyRetry("unknown confirmation state", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "uncertain_submission");
    assert.equal(decision.retry, true);
    assert.equal(decision.disposition, "retry_same_identity");
    assert.equal(decision.reasonCode, "uncertain_submission");
    assert.ok(decision.delayMs > 0);
    assertIso(decision.cooldownUntil, "cooldownUntil");
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classifyRetry("rate limit 429", baseContext({ attempt: 3, maxAttempts: 3 }));

    assertDecisionShape(decision);
    assert.equal(decision.category, "rate_limited");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "fail_batch");
    assert.equal(decision.reasonCode, "rate_limited");
    assert.equal(decision.delayMs, 0);
    assert.equal(decision.cooldownUntil, null);
  }

  {
    const decision = classifyRetry("insufficient TON balance", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "insufficient_ton");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "rotate_identity");
    assert.equal(decision.reasonCode, "insufficient_ton");
    assert.equal(decision.shouldPauseWallet, true);
    assert.equal(decision.shouldFailoverWallet, true);
    assertIso(decision.failedUntil, "failedUntil");
    assert.equal(decision.cooldownUntil, null);
  }

  {
    const decision = classifyRetry("invalid address", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "invalid_input");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "fail_batch");
    assert.equal(decision.reasonCode, "invalid_input");
  }

  {
    const decision = classifyRetry("contract rejected with exit code", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "contract_rejection");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "fail_batch");
    assert.equal(decision.reasonCode, "contract_rejection");
  }

  {
    const decision = classifyRetry("TypeError: cannot read property", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "fatal");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "stop_campaign");
    assert.equal(decision.reasonCode, "fatal");
    assert.equal(decision.cooldownUntil, null);
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classifyRetry("some totally unclassified error text", baseContext());

    assertDecisionShape(decision);
    assert.equal(decision.category, "unknown");
    assert.equal(decision.retry, false);
    assert.equal(decision.disposition, "fail_batch");
    assert.equal(decision.reasonCode, "unknown");
    assert.equal(decision.cooldownUntil, null);
    assert.equal(decision.failedUntil, null);
  }

  {
    const decision = classify({
      error: "invalid address",
      attemptNumber: 1,
      batchId: "batch-f5",
      campaignId: "campaign-f5",
      operatorId: "operator-f5",
    });

    assertDecisionShape(decision);
    assert.equal(decision.disposition, "fail_batch");
    assert.equal(decision.category, "invalid_input");
  }

  {
    const decision = DefaultRetryPolicy.classify({
      error: "missing environment variable",
      attemptNumber: 1,
      batchId: "batch-f5",
      campaignId: "campaign-f5",
      operatorId: "operator-f5",
    });

    assertDecisionShape(decision);
    assert.equal(decision.disposition, "stop_campaign");
    assert.equal(decision.category, "fatal");
  }

  assertThrowsInvalid("attemptNumber 0 throws", () =>
    classify({
      error: "invalid address",
      attemptNumber: 0,
      batchId: "batch-f5",
      campaignId: "campaign-f5",
      operatorId: "operator-f5",
    }),
  );

  assertThrowsInvalid("empty batchId throws", () =>
    classify({
      error: "invalid address",
      attemptNumber: 1,
      batchId: "",
      campaignId: "campaign-f5",
      operatorId: "operator-f5",
    }),
  );

  assertThrowsInvalid("empty campaignId throws", () =>
    classify({
      error: "invalid address",
      attemptNumber: 1,
      batchId: "batch-f5",
      campaignId: "",
      operatorId: "operator-f5",
    }),
  );

  assertThrowsInvalid("empty operatorId throws", () =>
    classify({
      error: "invalid address",
      attemptNumber: 1,
      batchId: "batch-f5",
      campaignId: "campaign-f5",
      operatorId: "",
    }),
  );

  assertThrowsInvalid("attempt 0 throws", () =>
    classifyRetry("rate limit 429", baseContext({ attempt: 0 })),
  );

  assertThrowsInvalid("maxAttempts 0 throws", () =>
    classifyRetry("rate limit 429", baseContext({ maxAttempts: 0 })),
  );

  assertThrowsInvalid("attempt > maxAttempts throws", () =>
    classifyRetry("rate limit 429", baseContext({ attempt: 4, maxAttempts: 3 })),
  );

  assertThrowsInvalid("empty campaignId throws", () =>
    classifyRetry("rate limit 429", baseContext({ campaignId: "" })),
  );

  assert.equal(exponentialBackoffMs(1, 1000, 10000), 1000);
  assert.equal(exponentialBackoffMs(2, 1000, 10000), 2000);
  assert.equal(exponentialBackoffMs(5, 1000, 10000), 10000);

  assertThrowsInvalid("invalid attempt throws", () => exponentialBackoffMs(0, 1000, 10000));
  assertThrowsInvalid("invalid base throws", () => exponentialBackoffMs(1, -1, 10000));
  assertThrowsInvalid("invalid max throws", () => exponentialBackoffMs(1, 1000, -1));

  {
    const first = classifyRetry("rate limit 429", baseContext());
    const second = classifyRetry("rate limit 429", baseContext());

    assert.deepEqual(first, second);
  }

  console.log(`${LABEL} PASS`);
});
