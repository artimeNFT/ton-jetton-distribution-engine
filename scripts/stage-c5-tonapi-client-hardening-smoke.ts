import * as assert from "assert/strict";
import {
  TonapiClient,
  TonapiHttpError,
  type TonapiClientConfig,
  type TonapiHttpAdapter,
} from "../lib/watcher/tonapiClient";
import type { ClockProvider } from "../lib/watcher/ingestionTypes";

const LABEL = "[stage-c5-tonapi-client-hardening-smoke]";
const SMOKE_ENV_KEY = "TONAPI_C5_SMOKE_KEY";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (err: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class HardeningMockAdapter implements TonapiHttpAdapter {
  getCallCount = 0;
  postCallCount = 0;

  private getHandler: (
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ) => Promise<unknown> = async () => ({});

  setGetHandler(
    handler: (
      path: string,
      params: Record<string, string>,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ): void {
    this.getHandler = handler;
  }

  async get(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.getCallCount += 1;
    return this.getHandler(path, params, signal);
  }

  async post(
    _path: string,
    _body: unknown,
    _signal: AbortSignal,
  ): Promise<unknown> {
    this.postCallCount += 1;
    return {};
  }
}

function baseConfig(overrides: Partial<TonapiClientConfig> = {}): TonapiClientConfig {
  return {
    baseUrl: "https://tonapi.io",
    apiKeyEnvName: SMOKE_ENV_KEY,
    requestTimeoutMs: 5_000,
    maxRequestsPerMinute: 60,
    backoffMs: [1],
    maxAttempts: 1,
    pageLimit: 10,
    profileBatchSize: 10,
    profileCacheTtlMs: 60_000,
    profileCacheMaxEntries: 100,
    ...overrides,
  };
}

function profileResponse(address: string): Record<string, unknown> {
  return {
    status: "active",
    code_hash: `codehash-${address}`,
    name: null,
  };
}


async function testInFlightCleanupAfterFailure(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const clock: ClockProvider = () => 1_700_000_000_000;
  const adapter = new HardeningMockAdapter();
  let attempt = 0;

  adapter.setGetHandler(async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new TonapiHttpError(500, "first failure");
    }
    return profileResponse("addr-cleanup");
  });

  const client = new TonapiClient(
    baseConfig({ maxAttempts: 1 }),
    adapter,
    clock,
    async () => {},
  );

  const first = await client.readAccountProfile("addr-cleanup");
  assert.equal(first.ok, false);
  if (!first.ok) {
    assert.equal(first.reason, "max_attempts_exceeded");
  }
  assert.equal(adapter.getCallCount, 1);

  const second = await client.readAccountProfile("addr-cleanup");
  assert.equal(second.ok, true);
  assert.equal(
    adapter.getCallCount,
    2,
    "failed in-flight request must be removed so a later call can retry",
  );
}

async function testParallelSameAccountCollapse(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const clock: ClockProvider = () => 1_700_000_000_000;
  const adapter = new HardeningMockAdapter();
  const hold = deferred<unknown>();

  adapter.setGetHandler(async () => hold.promise);

  const client = new TonapiClient(
    baseConfig({ maxRequestsPerMinute: 1 }),
    adapter,
    clock,
    async () => {},
  );

  const calls = Array.from({ length: 25 }, () =>
    client.readAccountProfile("addr-parallel"),
  );

  assert.equal(
    adapter.getCallCount,
    1,
    "parallel same-account reads must collapse into one provider request",
  );

  hold.resolve(profileResponse("addr-parallel"));

  const results = await Promise.all(calls);
  assert.equal(results.every((r) => r.ok), true);
  assert.equal(adapter.getCallCount, 1);
}

async function testParallelFailureCleanup(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  const clock: ClockProvider = () => 1_700_000_000_000;
  const adapter = new HardeningMockAdapter();
  const hold = deferred<unknown>();
  let attempt = 0;

  adapter.setGetHandler(async () => {
    attempt += 1;
    if (attempt === 1) {
      return hold.promise;
    }
    return profileResponse("addr-parallel-failure");
  });

  const client = new TonapiClient(
    baseConfig({ maxAttempts: 1 }),
    adapter,
    clock,
    async () => {},
  );

  const p1 = client.readAccountProfile("addr-parallel-failure");
  const p2 = client.readAccountProfile("addr-parallel-failure");

  assert.equal(adapter.getCallCount, 1);

  hold.reject(new TonapiHttpError(500, "parallel failure"));

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.ok, false);
  assert.equal(r2.ok, false);

  const retry = await client.readAccountProfile("addr-parallel-failure");
  assert.equal(retry.ok, true);
  assert.equal(
    adapter.getCallCount,
    2,
    "failed collapsed request must be cleaned up before later retry",
  );
}

async function testSuccessfulInFlightCleanupAfterTtlExpiry(): Promise<void> {
  process.env[SMOKE_ENV_KEY] = "smoke";

  let clockMs = 1_000;
  const clock: ClockProvider = () => clockMs;
  const adapter = new HardeningMockAdapter();
  const hold = deferred<unknown>();
  let requestNumber = 0;

  adapter.setGetHandler(async () => {
    requestNumber += 1;
    if (requestNumber === 1) {
      return hold.promise;
    }
    return profileResponse("addr-success-cleanup");
  });

  const client = new TonapiClient(
    baseConfig({ profileCacheTtlMs: 10 }),
    adapter,
    clock,
    async () => {},
  );

  const first = client.readAccountProfile("addr-success-cleanup");
  assert.equal(adapter.getCallCount, 1);

  hold.resolve(profileResponse("addr-success-cleanup"));
  assert.equal((await first).ok, true);

  clockMs = 1_020;
  const second = await client.readAccountProfile("addr-success-cleanup");

  assert.equal(second.ok, true);
  assert.equal(
    adapter.getCallCount,
    2,
    "successful in-flight request must be cleaned up so expired cache can refetch",
  );
}

async function main(): Promise<void> {
  await testInFlightCleanupAfterFailure();
  await testParallelSameAccountCollapse();
  await testParallelFailureCleanup();
  await testSuccessfulInFlightCleanupAfterTtlExpiry();
  console.log(`${LABEL} PASS`);
}

main().catch((err: unknown) => {
  console.error(`${LABEL} FAIL`);
  console.error(err);
  process.exit(1);
});
