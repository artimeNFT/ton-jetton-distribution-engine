// scripts/stage-c4-tonapi-client-smoke.ts

import * as assert from "assert/strict";
import {
  TonapiClient,
  TonapiHttpError,
  type TonapiHttpAdapter,
  type TonapiClientConfig,
} from "../lib/watcher/tonapiClient";
import type { ClockProvider } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-c4-tonapi-client-smoke]";
const SMOKE_ENV_KEY = "TONAPI_C4_SMOKE_KEY";

// ─── Mock Adapter (local to smoke only) ──────────────────────────────────────

class MockAdapter implements TonapiHttpAdapter {
  getCallCount = 0;
  postCallCount = 0;
  lastGetPath = "";
  lastGetParams: Record<string, string> = {};
  lastPostBody: unknown = undefined;

  private getResponseFn: (
    path: string,
    params: Record<string, string>,
  ) => Promise<unknown> = async () => ({});

  private postResponseFn: (
    path: string,
    body: unknown,
  ) => Promise<unknown> = async () => ({});

  setGetResponse(v: unknown): void {
    this.getResponseFn = async () => v;
  }

  setGetResponseFn(
    fn: (path: string, params: Record<string, string>) => Promise<unknown>,
  ): void {
    this.getResponseFn = fn;
  }

  setGetError(e: Error): void {
    this.getResponseFn = async () => {
      throw e;
    };
  }

  setPostResponse(v: unknown): void {
    this.postResponseFn = async () => v;
  }

  async get(
    path: string,
    params: Record<string, string>,
    _signal: AbortSignal,
  ): Promise<unknown> {
    this.getCallCount++;
    this.lastGetPath = path;
    this.lastGetParams = { ...params };
    return this.getResponseFn(path, params);
  }

  async post(path: string, body: unknown, _signal: AbortSignal): Promise<unknown> {
    this.postCallCount++;
    this.lastPostBody = body;
    return this.postResponseFn(path, body);
  }

  reset(): void {
    this.getCallCount = 0;
    this.postCallCount = 0;
    this.lastGetPath = "";
    this.lastGetParams = {};
    this.lastPostBody = undefined;
    this.getResponseFn = async () => ({});
    this.postResponseFn = async () => ({});
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIXED_CLOCK_MS = 1_700_000_000_000;
const fixedClock: ClockProvider = () => FIXED_CLOCK_MS;
const noWait = async (_ms: number): Promise<void> => {};

function baseConfig(overrides: Partial<TonapiClientConfig> = {}): TonapiClientConfig {
  return {
    baseUrl: "https://tonapi.io",
    apiKeyEnvName: SMOKE_ENV_KEY,
    requestTimeoutMs: 5_000,
    maxRequestsPerMinute: 60,
    backoffMs: [10],
    maxAttempts: 3,
    pageLimit: 10,
    profileBatchSize: 10,
    profileCacheTtlMs: 60_000,
    profileCacheMaxEntries: 100,
    ...overrides,
  };
}

function makeProfileResponse(address: string): Record<string, unknown> {
  return {
    status: "active",
    code_hash: `codehash-${address}`,
    name: null,
  };
}

function makeHistoryResponse(): Record<string, unknown> {
  return {
    events: [
      {
        timestamp: 1_700_000_000,
        actions: [
          {
            type: "JettonTransfer",
            trace_id: "trace-smoke-001",
            action_index: 0,
            message_hash: null,
            JettonTransfer: {
              sender: { address: "source-addr-001" },
              recipient: { address: "dest-addr-001" },
              jetton: { address: "jetton-master-001" },
              amount: "1000000",
            },
            base_transactions: [
              {
                hash: "txhash-smoke-001",
                lt: "47000000000001",
                utime: 1_700_000_000,
              },
            ],
          },
        ],
      },
    ],
    next_from: 47_000_000_001,
  };
}

// ─── Test 1: missing credentials fail closed before adapter call ──────────────

async function test1_missingCredentials(): Promise<void> {
  delete process.env[SMOKE_ENV_KEY];

  const adapter = new MockAdapter();
  const client = new TonapiClient(baseConfig(), adapter, fixedClock, noWait);

  const result = await client.readAccountProfile("addr-t1");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.reason,
      "missing_credentials",
      "reason must be missing_credentials",
    );
  }
  assert.equal(
    adapter.getCallCount,
    0,
    "adapter must not be called when credentials are missing",
  );
}

// ─── Test 2: readTransferHistory success path ─────────────────────────────────

async function test2_transferHistorySuccess(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  adapter.setGetResponse(makeHistoryResponse());

  const client = new TonapiClient(baseConfig(), adapter, fixedClock, noWait);

  // Without cursor
  const r1 = await client.readTransferHistory("account-t2", null, "confirmed");
  assert.equal(r1.ok, true);
  if (!r1.ok) throw new Error("test2: expected ok for no-cursor call");

  assert.equal(r1.value.events.length, 1, "expected one event");
  assert.equal(
    adapter.lastGetPath,
    "/v2/accounts/account-t2/jettons/history",
    "history endpoint path must match the approved TonAPI route",
  );
  assert.equal(r1.value.events[0].provider, "tonapi");
  assert.equal(
    r1.value.events[0].receivedAt,
    new Date(FIXED_CLOCK_MS).toISOString(),
    "receivedAt must derive from injected clock",
  );
  assert.equal(
    r1.value.events[0].payload.amount,
    "1000000",
    "amount must remain a decimal string",
  );
  assert.equal(
    r1.value.events[0].payload.eventTimestamp,
    new Date(1_700_000_000 * 1000).toISOString(),
    "eventTimestamp must derive from provider utime/timestamp",
  );
  assert.equal(r1.value.events[0].payload.finality, "confirmed");
  assert.deepEqual(r1.value.nextCursor, { beforeLt: "47000000001" });

  // With cursor — verify before_lt forwarded to adapter params
  adapter.reset();
  adapter.setGetResponse(makeHistoryResponse());
  const r2 = await client.readTransferHistory(
    "account-t2",
    { beforeLt: "47000000000001" },
    "confirmed",
  );
  assert.equal(r2.ok, true);
  assert.equal(
    adapter.lastGetParams["before_lt"],
    "47000000000001",
    "cursor must be forwarded as before_lt query param",
  );
}

// ─── Test 3: malformed entries are skipped; skippedCount increments ───────────

async function test3_malformedSkip(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  adapter.setGetResponse({
    events: [
      {
        timestamp: 1_700_000_000,
        actions: [
          // Valid — must emit
          {
            type: "JettonTransfer",
            trace_id: "trace-valid",
            action_index: 0,
            message_hash: null,
            JettonTransfer: {
              sender: null,
              recipient: { address: "dest-valid" },
              jetton: { address: "jetton-master-valid" },
              amount: "500",
            },
            base_transactions: [
              { hash: "txhash-valid", lt: "1000", utime: 1_700_000_000 },
            ],
          },
          // Missing trace_id — must skip
          {
            type: "JettonTransfer",
            trace_id: null,
            action_index: 1,
            message_hash: null,
            JettonTransfer: {
              sender: null,
              recipient: { address: "dest-skip1" },
              jetton: { address: "jetton-master-skip1" },
              amount: "500",
            },
            base_transactions: [
              { hash: "txhash-skip1", lt: "1001", utime: 1_700_000_000 },
            ],
          },
          // Missing action_index (null) — must skip
          {
            type: "JettonTransfer",
            trace_id: "trace-skip2",
            action_index: null,
            message_hash: null,
            JettonTransfer: {
              sender: null,
              recipient: { address: "dest-skip2" },
              jetton: { address: "jetton-master-skip2" },
              amount: "500",
            },
            base_transactions: [
              { hash: "txhash-skip2", lt: "1002", utime: 1_700_000_000 },
            ],
          },
          // Empty txHash string — optionalString("") returns null — must skip
          {
            type: "JettonTransfer",
            trace_id: "trace-skip3",
            action_index: 2,
            message_hash: null,
            JettonTransfer: {
              sender: null,
              recipient: { address: "dest-skip3" },
              jetton: { address: "jetton-master-skip3" },
              amount: "500",
            },
            base_transactions: [
              { hash: "", lt: "1003", utime: 1_700_000_000 },
            ],
          },
        ],
      },
    ],
  });

  const client = new TonapiClient(baseConfig(), adapter, fixedClock, noWait);
  const result = await client.readTransferHistory("account-t3", null, "confirmed");

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("test3: expected ok");

  assert.equal(result.value.events.length, 1, "only the valid entry must emit");
  assert.equal(result.value.skippedCount, 3, "three malformed entries must be counted");

  // Confirm no empty required fields in the emitted event
  assert.equal(result.value.events[0].payload.txHash, "txhash-valid");
  assert.equal(result.value.events[0].payload.traceId, "trace-valid");
  assert.equal(result.value.events[0].payload.actionIndex, 0);
}

// ─── Test 4: ProfileCache hit avoids provider request ─────────────────────────

async function test4_profileCacheHit(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  adapter.setGetResponse(makeProfileResponse("addr-t4"));

  const client = new TonapiClient(baseConfig(), adapter, fixedClock, noWait);

  const r1 = await client.readAccountProfile("addr-t4");
  assert.equal(r1.ok, true);
  assert.equal(adapter.getCallCount, 1, "first call must reach adapter");

  const r2 = await client.readAccountProfile("addr-t4");
  assert.equal(r2.ok, true);
  assert.equal(
    adapter.getCallCount,
    1,
    "second call must be a cache hit; adapter count must not increase",
  );

  if (r1.ok && r2.ok) {
    assert.equal(r1.value.accountAddress, r2.value.accountAddress);
    assert.equal(r1.value.codeHash, r2.value.codeHash);
  }
}

// ─── Test 5: in-flight request collapsing ─────────────────────────────────────

async function test5_inFlightCollapsing(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  let resolveInflight!: (value: unknown) => void;
  const inflightHeld = new Promise<unknown>((resolve) => {
    resolveInflight = resolve;
  });

  let inflightGetCallCount = 0;
  const inflightAdapter: TonapiHttpAdapter = {
    async get(_path, _params, _signal): Promise<unknown> {
      inflightGetCallCount++;
      return inflightHeld;
    },
    async post(_path, _body, _signal): Promise<unknown> {
      return {};
    },
  };

  const client = new TonapiClient(
    baseConfig(),
    inflightAdapter,
    fixedClock,
    noWait,
  );

  // Start both reads concurrently without awaiting either.
  // p1 runs synchronously until it suspends at the adapter call, at which
  // point inFlightProfileRequests is already populated.
  // p2 detects the in-flight entry and collapses onto the same Promise.
  const p1 = client.readAccountProfile("addr-inflight");
  const p2 = client.readAccountProfile("addr-inflight");

  // Synchronous check: before any microtask runs, adapter must have been
  // called exactly once (p2 collapsed — it did not issue a second request).
  assert.equal(
    inflightGetCallCount,
    1,
    "adapter must be called exactly once before resolve",
  );

  // Resolve the held mock response.
  resolveInflight(makeProfileResponse("addr-inflight"));

  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(
    inflightGetCallCount,
    1,
    "adapter must be called exactly once total",
  );

  if (r1.ok && r2.ok) {
    assert.equal(
      r1.value.accountAddress,
      "addr-inflight",
      "p1 must receive correct profile",
    );
    assert.equal(
      r2.value.accountAddress,
      "addr-inflight",
      "p2 must receive correct profile",
    );
    assert.equal(
      r1.value.codeHash,
      r2.value.codeHash,
      "both callers must receive identical profile data",
    );
  }
}

// ─── Test 6: ProfileCache LRU eviction via public methods only ────────────────

async function test6_lruEviction(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  let clockMs = 1_000;
  const advancingClock: ClockProvider = () => clockMs;

  const adapter = new MockAdapter();

  let callIndex = 0;
  const responses: Record<string, unknown>[] = [
    makeProfileResponse("addr-A"), // adapter call 1: fetch A
    makeProfileResponse("addr-B"), // adapter call 2: fetch B
    makeProfileResponse("addr-C"), // adapter call 3: fetch C (evicts B)
    makeProfileResponse("addr-B"), // adapter call 4: re-fetch B after eviction
  ];
  adapter.setGetResponseFn(async () => responses[callIndex++] ?? {});

  const client = new TonapiClient(
    baseConfig({ profileCacheMaxEntries: 2, profileCacheTtlMs: 3_600_000 }),
    adapter,
    advancingClock,
    noWait,
  );

  // Step 1: fetch A — A.lastAccessedAt = 1000
  clockMs = 1_000;
  assert.equal((await client.readAccountProfile("addr-A")).ok, true);
  assert.equal(adapter.getCallCount, 1);

  // Step 2: fetch B — B.lastAccessedAt = 2000; cache is now full
  clockMs = 2_000;
  assert.equal((await client.readAccountProfile("addr-B")).ok, true);
  assert.equal(adapter.getCallCount, 2);

  // Step 3: re-read A — cache hit; A.lastAccessedAt refreshed to 3000
  clockMs = 3_000;
  const rA2 = await client.readAccountProfile("addr-A");
  assert.equal(rA2.ok, true);
  assert.equal(
    adapter.getCallCount,
    2,
    "re-read A must be a cache hit; adapter must not be called",
  );

  // Step 4: fetch C — cache full (A: 3000, B: 2000); LRU is B → B evicted; C added
  clockMs = 4_000;
  assert.equal((await client.readAccountProfile("addr-C")).ok, true);
  assert.equal(adapter.getCallCount, 3);

  // Step 5: re-read B — B was evicted; must cause a new adapter call
  clockMs = 5_000;
  const rB2 = await client.readAccountProfile("addr-B");
  assert.equal(rB2.ok, true);
  assert.equal(
    adapter.getCallCount,
    4,
    "B must trigger a new adapter call after LRU eviction",
  );
}

// ─── Test 7: profileCacheTtlMs expiry via public methods only ─────────────────

async function test7_ttlExpiry(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  let clockMs = 1_000_000;
  const mutableClock: ClockProvider = () => clockMs;

  const adapter = new MockAdapter();
  adapter.setGetResponse(makeProfileResponse("addr-ttl"));

  const TTL_MS = 5_000;
  const client = new TonapiClient(
    baseConfig({ profileCacheTtlMs: TTL_MS, profileCacheMaxEntries: 10 }),
    adapter,
    mutableClock,
    noWait,
  );

  const t0 = clockMs;

  // Fetch at t0 — entry cached at t0
  assert.equal((await client.readAccountProfile("addr-ttl")).ok, true);
  assert.equal(adapter.getCallCount, 1, "initial fetch must call adapter");

  // Re-read just before TTL expires (age = TTL - 1)
  clockMs = t0 + TTL_MS - 1;
  assert.equal((await client.readAccountProfile("addr-ttl")).ok, true);
  assert.equal(
    adapter.getCallCount,
    1,
    "must be cache hit before TTL expires",
  );

  // Re-read just after TTL expires (age = TTL + 1) — entry stale; must refetch
  clockMs = t0 + TTL_MS + 1;
  assert.equal((await client.readAccountProfile("addr-ttl")).ok, true);
  assert.equal(
    adapter.getCallCount,
    2,
    "expired cache entry must trigger new adapter call",
  );
}

// ─── Test 8: rate limit exhaustion ───────────────────────────────────────────

async function test8_rateLimitExhaustion(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const clockMs = 1_000_000;
  const frozenClock: ClockProvider = () => clockMs;

  const adapter = new MockAdapter();
  adapter.setGetResponse(makeProfileResponse("addr-rl-A"));

  const client = new TonapiClient(
    baseConfig({ maxRequestsPerMinute: 1 }),
    adapter,
    frozenClock,
    noWait,
  );

  // First request for A — allowed; consumes the single rate-limit slot
  const r1 = await client.readAccountProfile("addr-rl-A");
  assert.equal(r1.ok, true);
  assert.equal(adapter.getCallCount, 1);

  // Second request for uncached B in the same frozen window — must be denied
  const r2 = await client.readAccountProfile("addr-rl-B");
  assert.equal(r2.ok, false);
  if (!r2.ok) {
    assert.equal(r2.reason, "rate_limit_exceeded");
  }
  assert.equal(
    adapter.getCallCount,
    1,
    "denied request must not call adapter",
  );
}

// ─── Test 9: retry up to maxAttempts then max_attempts_exceeded ───────────────

async function test9_retryMaxAttempts(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  adapter.setGetError(new TonapiHttpError(429, "rate limited"));

  let waitCallCount = 0;
  const countingWait = async (_ms: number): Promise<void> => {
    waitCallCount++;
  };

  const client = new TonapiClient(
    baseConfig({ maxAttempts: 2, backoffMs: [1] }),
    adapter,
    fixedClock,
    countingWait,
  );

  const result = await client.readAccountProfile("addr-retry");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "max_attempts_exceeded");
  }
  assert.equal(
    adapter.getCallCount,
    2,
    "adapter must be called exactly maxAttempts (2) times",
  );
  assert.equal(
    waitCallCount,
    1,
    "one backoff wait must occur between the two attempts",
  );
}

// ─── Test 10: bulk profile guard — fail closed before adapter call ────────────

async function test10_bulkProfileSizeGuard(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  const client = new TonapiClient(
    baseConfig({ profileBatchSize: 1 }),
    adapter,
    fixedClock,
    noWait,
  );

  // Two uncached accounts; missIds.length (2) > profileBatchSize (1) → fail closed
  const result = await client.readAccountProfilesBulk([
    "addr-bulk-guard-A",
    "addr-bulk-guard-B",
  ]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_request");
    assert.ok(
      result.detail.includes("2"),
      "detail must mention the uncached count",
    );
  }
  assert.equal(adapter.postCallCount, 0, "adapter post must not be called when guard fires");
  assert.equal(adapter.getCallCount, 0);
}

// ─── Test 11: bulk profile cache-first dispatch ───────────────────────────────

async function test11_bulkCacheFirst(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const adapter = new MockAdapter();
  adapter.setGetResponse(makeProfileResponse("addr-bulk-A"));

  const client = new TonapiClient(
    baseConfig({ profileBatchSize: 5 }),
    adapter,
    fixedClock,
    noWait,
  );

  // Warm up A via readAccountProfile so it is in the ProfileCache
  const warmup = await client.readAccountProfile("addr-bulk-A");
  assert.equal(warmup.ok, true);
  assert.equal(adapter.getCallCount, 1, "warmup must call adapter once for A");

  // Configure bulk post response returning only B
  adapter.setPostResponse({
    accounts: [
      {
        address: "addr-bulk-B",
        status: "active",
        code_hash: "codehash-addr-bulk-B",
        name: null,
      },
    ],
  });

  const result = await client.readAccountProfilesBulk([
    "addr-bulk-A",
    "addr-bulk-B",
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("test11: expected ok");

  // Post must have been called exactly once with only the uncached address (B)
  assert.equal(adapter.postCallCount, 1, "one bulk post call expected");
  const body = adapter.lastPostBody as { account_ids: string[] };
  assert.deepEqual(
    body.account_ids,
    ["addr-bulk-B"],
    "post body must contain only the uncached address B",
  );

  // Result must include both A (from cache) and B (from bulk response)
  assert.equal(result.value.profiles.length, 2, "result must contain 2 profiles");
  const addresses = result.value.profiles
    .map((p) => p.accountAddress)
    .sort();
  assert.deepEqual(addresses, ["addr-bulk-A", "addr-bulk-B"]);
  assert.equal(result.value.failedAddresses.length, 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await test1_missingCredentials();
  await test2_transferHistorySuccess();
  await test3_malformedSkip();
  await test4_profileCacheHit();
  await test5_inFlightCollapsing();
  await test6_lruEviction();
  await test7_ttlExpiry();
  await test8_rateLimitExhaustion();
  await test9_retryMaxAttempts();
  await test10_bulkProfileSizeGuard();
  await test11_bulkCacheFirst();
  console.log(`${LABEL} PASS`);
}

main().catch((err: unknown) => {
  console.error(`${LABEL} FAIL`);
  console.error(err);
  process.exit(1);
});