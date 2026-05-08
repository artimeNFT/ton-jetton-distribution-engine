/**
 * tonapiClient.ts
 *
 * TonAPI REST read-only client for Stage C-4.
 *
 * Hard constraints:
 * - No fetch. No live HTTP. No WebSocket. No polling.
 * - No Date.now(). ClockProvider only.
 * - No Dispatcher. No RunState. No targets.
 * - No candidate persistence. No cursor persistence.
 * - No signing, sending, broadcasting, or execution.
 * - No random jitter. Deterministic load management only.
 * - API key value is never stored, logged, or passed to the adapter.
 * - Missing API key env var fails closed before any adapter call.
 * - Transfer entries lacking required fields are skipped; explicitly counted.
 *   Required transfer fields: txHash, lt, traceId, actionIndex, amount,
 *   destinationAddress, jettonMaster. No placeholder values are invented.
 * - ProfileCache is mandatory. Cache hit must not trigger provider request.
 * - In-flight request collapsing on readAccountProfile: at most one concurrent
 *   provider request per canonical account id. Collapsed callers do not consume
 *   additional rate-limit capacity.
 * - Bulk endpoint wire schema is provisional; offline/mock-compatible only in C-4.
 */

import {
  RECONNECT_BACKOFF_MS,
  type ClockProvider,
  type RawProviderEvent,
} from "./ingestionTypes";

// ─── HTTP Adapter Interface ───────────────────────────────────────────────────
//
// Interface only. No implementation in C-4.
// The smoke test provides a local mock adapter.
// A future real adapter wraps fetch and reads the API key from
// process.env[config.apiKeyEnvName] itself. The client never passes the key value
// to this interface.
//
// Callers that need to signal a non-2xx HTTP response must throw TonapiHttpError.

export interface TonapiHttpAdapter {
  get(
    path: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<unknown>;

  post(
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
}

// ─── HTTP Error ───────────────────────────────────────────────────────────────
//
// Thrown by adapters to signal a received HTTP error response.
// status drives retryability: 429 and 5xx are retryable; other 4xx are not.

export class TonapiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(`TonAPI HTTP ${status}`);
    this.name = "TonapiHttpError";
  }
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface TonapiClientConfig {
  /** TonAPI base URL, e.g. "https://tonapi.io". Not used by mock adapter. */
  readonly baseUrl: string;
  /** Name of the environment variable that holds the API key. Value never stored. */
  readonly apiKeyEnvName: string;
  /** Per-request timeout in milliseconds. Must be a positive integer. */
  readonly requestTimeoutMs: number;
  /** Maximum adapter calls per 60-second window. Must be a positive integer. */
  readonly maxRequestsPerMinute: number;
  /**
   * Deterministic backoff table (ms per attempt, 0-based index).
   * Each entry must be a positive integer.
   * Falls back to RECONNECT_BACKOFF_MS from ingestionTypes if empty array.
   */
  readonly backoffMs: readonly number[];
  /** Maximum total attempts per operation before returning max_attempts_exceeded. Must be a positive integer. */
  readonly maxAttempts: number;
  /** Maximum items per history page request. Must be a positive integer. */
  readonly pageLimit: number;
  /**
   * Maximum address count per bulk profile request.
   * readAccountProfilesBulk fails closed with invalid_request if the uncached
   * address count exceeds this value. Must be a positive integer.
   */
  readonly profileBatchSize: number;
  /** Profile cache TTL in milliseconds. Must be a positive integer. */
  readonly profileCacheTtlMs: number;
  /** Maximum number of profiles held in the cache at once. Must be a positive integer. */
  readonly profileCacheMaxEntries: number;
}

// ─── Failure Types ────────────────────────────────────────────────────────────

export type TonapiFailureReason =
  | "missing_credentials"   // env var absent or empty; fail-closed before adapter call
  | "rate_limit_exceeded"   // rate cap denied; synchronous; no waiting or queuing
  | "max_attempts_exceeded" // all retry attempts consumed
  | "request_timeout"       // AbortSignal fired on final attempt
  | "http_error"            // non-retryable HTTP status received
  | "malformed_response"    // response failed envelope or required-field validation
  | "invalid_request";      // caller-supplied arguments violate a configured bound

export type TonapiResult<T> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly reason: TonapiFailureReason; readonly detail: string };

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface TonapiReadCursor {
  /** Value to use as the `before_lt` query parameter on the next page request. */
  readonly beforeLt: string;
}

export interface TonapiTransferHistoryResult {
  /** Successfully normalized transfer events. Ready for the filter pipeline. */
  readonly events: RawProviderEvent[];
  /** Cursor for the next page, or null if the response contained no continuation. */
  readonly nextCursor: TonapiReadCursor | null;
  /**
   * Count of JettonTransfer actions skipped because one or more required fields
   * (txHash, lt, traceId, actionIndex, amount, destinationAddress, jettonMaster)
   * were absent or empty. No placeholder values are invented.
   */
  readonly skippedCount: number;
}

export interface TonapiAccountProfile {
  readonly accountAddress: string;
  readonly accountStatus: string | null;
  /**
   * Extracted from the `code_hash` field of the account response.
   * Null if the field is absent, empty, or not a string.
   * PROVISIONAL: field name subject to confirmation against live API response.
   */
  readonly codeHash: string | null;
  /**
   * Always null in C-4.
   * No approved source field has been confirmed from TonAPI REST account responses.
   * Must not be inferred from any response field. Remains null until explicitly approved.
   */
  readonly walletTypeHint: string | null;
  /**
   * Extracted from the `name` field of the account response.
   * Null if absent. PROVISIONAL: field name subject to confirmation.
   */
  readonly entityLabel: string | null;
  /** ISO 8601 timestamp produced by clock() at the moment of fetch. */
  readonly fetchedAt: string;
}

export interface TonApiBulkProfileResult {
  /** Profiles successfully fetched and normalized, including cache hits. */
  readonly profiles: TonapiAccountProfile[];
  /**
   * Addresses that were requested but absent or unparseable in the bulk response.
   * Populated only for addresses that were NOT cache hits.
   */
  readonly failedAddresses: string[];
}

// ─── Profile Cache (internal — not exported) ──────────────────────────────────
//
// Bounded LRU cache keyed by canonical account id.
// Deterministic eviction: on overflow, the entry with the smallest
// lastAccessedAt is removed. No random eviction. No unbounded growth.
//
// The cache must not store API keys, authorization headers, raw provider
// credentials, or execution state.
//
// Observable only through TonapiClient public methods; not exported.

interface ProfileCacheEntry {
  readonly profile: TonapiAccountProfile;
  /** clock() value at insertion. Used for TTL expiry check. */
  readonly cachedAt: number;
  /** clock() value at last successful get(). Mutated on every cache hit. */
  lastAccessedAt: number;
}

class ProfileCache {
  private readonly store = new Map<string, ProfileCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly clock: ClockProvider;

  constructor(ttlMs: number, maxEntries: number, clock: ClockProvider) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.clock = clock;
  }

  /**
   * Returns the cached profile, or null on miss or TTL expiry.
   * On hit: updates lastAccessedAt; does NOT trigger any provider request.
   * On TTL expiry: deletes the stale entry before returning null.
   */
  get(canonicalAccountId: string): TonapiAccountProfile | null {
    const entry = this.store.get(canonicalAccountId);
    if (entry === undefined) {
      return null;
    }
    const now = this.clock();
    if (now - entry.cachedAt > this.ttlMs) {
      this.store.delete(canonicalAccountId);
      return null;
    }
    entry.lastAccessedAt = now;
    return entry.profile;
  }

  /**
   * Inserts or replaces a profile.
   * If at capacity, evicts the entry with the smallest lastAccessedAt (LRU).
   * Eviction is a deterministic linear scan; no random selection.
   */
  set(canonicalAccountId: string, profile: TonapiAccountProfile): void {
    // Delete first so re-insertion of an existing key resets its LRU position.
    this.store.delete(canonicalAccountId);

    if (this.store.size >= this.maxEntries) {
      let lruKey: string | undefined;
      let lruTime = Infinity;
      for (const [key, entry] of this.store) {
        if (entry.lastAccessedAt < lruTime) {
          lruTime = entry.lastAccessedAt;
          lruKey = key;
        }
      }
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
      }
    }

    const now = this.clock();
    this.store.set(canonicalAccountId, {
      profile,
      cachedAt: now,
      lastAccessedAt: now,
    });
  }

  invalidate(canonicalAccountId: string): void {
    this.store.delete(canonicalAccountId);
  }

  size(): number {
    return this.store.size;
  }
}

// ─── Rate Limiter (internal) ──────────────────────────────────────────────────
//
// Fixed 60-second window. No jitter. ClockProvider injected.
// Mirrors the invariants of createRateCap() in candidateStore.ts.
// isAllowed() returns false without side effects when the window is exhausted.

class TonapiRateLimiter {
  private static readonly WINDOW_MS = 60_000;
  private readonly maxPerMinute: number;
  private readonly clock: ClockProvider;
  private windowStart: number;
  private count = 0;

  constructor(maxPerMinute: number, clock: ClockProvider) {
    this.maxPerMinute = maxPerMinute;
    this.clock = clock;
    this.windowStart = clock();
  }

  isAllowed(): boolean {
    const now = this.clock();
    if (now - this.windowStart >= TonapiRateLimiter.WINDOW_MS) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.maxPerMinute) {
      return false;
    }
    this.count += 1;
    return true;
  }
}

// ─── Internal Parse Helpers ───────────────────────────────────────────────────

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns the value if it is a non-empty string; otherwise null. */
function optionalString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function optionalNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

/** Returns the first element of an array if it is a plain object; otherwise {}. */
function firstObject(value: unknown): JsonObject {
  if (!Array.isArray(value) || value.length === 0) return {};
  const first = value[0];
  return isObject(first) ? first : {};
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return new Date(value * 1000).toISOString();
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    (err as { code?: unknown }).code === "ABORT_ERR"
  );
}

// ─── Config Validation ────────────────────────────────────────────────────────

function validateConfig(c: TonapiClientConfig): void {
  if (typeof c.baseUrl !== "string" || c.baseUrl.length === 0) {
    throw new Error("TonapiClient: config.baseUrl must be a non-empty string");
  }
  if (typeof c.apiKeyEnvName !== "string" || c.apiKeyEnvName.length === 0) {
    throw new Error("TonapiClient: config.apiKeyEnvName must be a non-empty string");
  }
  const positiveIntFields: ReadonlyArray<keyof TonapiClientConfig> = [
    "requestTimeoutMs",
    "maxRequestsPerMinute",
    "maxAttempts",
    "pageLimit",
    "profileBatchSize",
    "profileCacheTtlMs",
    "profileCacheMaxEntries",
  ];
  for (const field of positiveIntFields) {
    const v = c[field];
    if (!Number.isInteger(v) || (v as number) <= 0) {
      throw new Error(
        `TonapiClient: config.${field} must be a positive integer, got ${JSON.stringify(v)}`,
      );
    }
  }
  for (let i = 0; i < c.backoffMs.length; i++) {
    const v = c.backoffMs[i];
    if (!Number.isInteger(v) || (v as number) <= 0) {
      throw new Error(
        `TonapiClient: config.backoffMs[${i}] must be a positive integer, got ${JSON.stringify(v)}`,
      );
    }
  }
}

// ─── TonapiClient ─────────────────────────────────────────────────────────────

export class TonapiClient {
  private readonly config: TonapiClientConfig;
  private readonly adapter: TonapiHttpAdapter;
  private readonly clock: ClockProvider;
  private readonly waitFn: (ms: number) => Promise<void>;
  private readonly profileCache: ProfileCache;
  private readonly rateLimiter: TonapiRateLimiter;

  /**
   * Tracks currently pending provider requests keyed by canonical account id.
   *
   * Purpose: prevent duplicate concurrent provider requests for the same account.
   * An entry is stored from the moment the adapter call is initiated until the
   * promise settles (success or failure). Settled entries are removed in a finally
   * block; the map never retains completed or failed requests.
   *
   * Collapsed callers (those that find an existing entry) await the stored promise
   * directly and do NOT consume additional rate-limit capacity.
   */
  private readonly inFlightProfileRequests = new Map<
    string,
    Promise<TonapiResult<TonapiAccountProfile>>
  >();

  constructor(
    config: TonapiClientConfig,
    adapter: TonapiHttpAdapter,
    clock: ClockProvider,
    /**
     * Async delay function for retry backoff.
     * Injectable for deterministic tests: pass `async (_ms) => {}` to skip waits.
     * Production default is a real setTimeout-backed promise.
     */
    waitFn: (ms: number) => Promise<void> = (ms) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {
    validateConfig(config);
    this.config = config;
    this.adapter = adapter;
    this.clock = clock;
    this.waitFn = waitFn;
    this.profileCache = new ProfileCache(
      config.profileCacheTtlMs,
      config.profileCacheMaxEntries,
      clock,
    );
    this.rateLimiter = new TonapiRateLimiter(config.maxRequestsPerMinute, clock);
  }

  // ─── Credential Guard ─────────────────────────────────────────────────────────
  //
  // Checks existence of the env var by name only. Value is never stored or logged.
  // Must be called before every adapter call.

  private hasCredentials(): boolean {
    const value = process.env[this.config.apiKeyEnvName];
    return typeof value === "string" && value.length > 0;
  }

  private credentialsMissing(): TonapiResult<never> {
    return {
      ok: false,
      reason: "missing_credentials",
      detail: `environment variable "${this.config.apiKeyEnvName}" is absent or empty`,
    };
  }

  // ─── Retry Wrapper ────────────────────────────────────────────────────────────
  //
  // Each attempt consumes one rate-limit slot before the adapter call is made.
  // Rate exhaustion mid-loop returns rate_limit_exceeded immediately.
  //
  // Retryable errors: network errors, AbortError (timeout), TonapiHttpError with
  // status 429 or 5xx.
  // Non-retryable: TonapiHttpError with other 4xx status.
  //
  // Backoff is taken from config.backoffMs (if non-empty) or RECONNECT_BACKOFF_MS.
  // Index is clamped to the last entry after the table is exhausted.

  private async callWithRetry(
    fn: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<TonapiResult<unknown>> {
    const { maxAttempts, requestTimeoutMs } = this.config;
    const table =
      this.config.backoffMs.length > 0
        ? this.config.backoffMs
        : RECONNECT_BACKOFF_MS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!this.rateLimiter.isAllowed()) {
        return {
          ok: false,
          reason: "rate_limit_exceeded",
          detail: `rate limit exhausted before attempt ${attempt + 1} of ${maxAttempts}`,
        };
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        requestTimeoutMs,
      );

      try {
        const raw = await fn(controller.signal);
        clearTimeout(timeoutHandle);
        return { ok: true, value: raw };
      } catch (err: unknown) {
        clearTimeout(timeoutHandle);

        const isLast = attempt >= maxAttempts - 1;

        if (err instanceof TonapiHttpError) {
          if (!isRetryableStatus(err.status)) {
            return {
              ok: false,
              reason: "http_error",
              detail: `HTTP ${err.status} (non-retryable)`,
            };
          }
          if (isLast) {
            return {
              ok: false,
              reason: "max_attempts_exceeded",
              detail: `HTTP ${err.status} after ${maxAttempts} attempt(s)`,
            };
          }
        } else if (isAbortError(err)) {
          if (isLast) {
            return {
              ok: false,
              reason: "request_timeout",
              detail: `timed out after ${requestTimeoutMs}ms on attempt ${attempt + 1}`,
            };
          }
        } else {
          if (isLast) {
            return {
              ok: false,
              reason: "max_attempts_exceeded",
              detail: `failed after ${maxAttempts} attempt(s): ${String(err)}`,
            };
          }
        }

        await this.waitFn(table[Math.min(attempt, table.length - 1)] ?? 1_000);
      }
    }

    // Unreachable given the loop structure; satisfies TypeScript's return analysis.
    /* istanbul ignore next */
    return {
      ok: false,
      reason: "max_attempts_exceeded",
      detail: `exhausted ${maxAttempts} attempt(s)`,
    };
  }

  // ─── readTransferHistory ──────────────────────────────────────────────────────
  //
  // Maps GET /v2/accounts/{account_id}/jettons/history.
  //
  // Required fields per JettonTransfer action:
  //   txHash, lt, traceId, actionIndex, amount, destinationAddress, jettonMaster.
  // If any required field is absent or empty, the action is skipped and counted
  // in skippedCount. No fallback values are invented.
  //
  // This client does NOT filter by jetton master. Master filtering is the
  // responsibility of the downstream filterAndNormalize pipeline in eventFilter.ts.
  //
  // Cursor is returned to the caller but is NOT persisted by this client.
  // Caller owns cursor lifecycle.

  async readTransferHistory(
    accountId: string,
    cursor: TonapiReadCursor | null,
    finality: "confirmed" | "finalized",
  ): Promise<TonapiResult<TonapiTransferHistoryResult>> {
    if (!this.hasCredentials()) {
      return this.credentialsMissing();
    }

    const path = `/v2/accounts/${encodeURIComponent(accountId)}/jettons/history`;
    const params: Record<string, string> = {
      limit: String(this.config.pageLimit),
    };
    if (cursor !== null) {
      params["before_lt"] = cursor.beforeLt;
    }

    const result = await this.callWithRetry((signal) =>
      this.adapter.get(path, params, signal),
    );

    if (!result.ok) {
      return result;
    }

    const normalized = this.normalizeTransferHistory(result.value, finality);
    if (normalized === null) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "transfer history response failed envelope validation (missing 'events' array)",
      };
    }

    return { ok: true, value: normalized };
  }

  private normalizeTransferHistory(
    raw: unknown,
    finality: "confirmed" | "finalized",
  ): TonapiTransferHistoryResult | null {
    if (!isObject(raw)) return null;

    const rawEvents = raw["events"];
    if (!Array.isArray(rawEvents)) return null;

    const events: RawProviderEvent[] = [];
    let skippedCount = 0;

    for (const rawEvent of rawEvents) {
      if (!isObject(rawEvent)) {
        skippedCount++;
        continue;
      }

      const actions = rawEvent["actions"];
      if (!Array.isArray(actions)) {
        skippedCount++;
        continue;
      }

      const eventLevelTimestamp = unixSecondsToIso(rawEvent["timestamp"]);

      for (const action of actions) {
        if (!isObject(action)) {
          skippedCount++;
          continue;
        }

        // Non-JettonTransfer actions are silently skipped; not counted.
        if (action["type"] !== "JettonTransfer") {
          continue;
        }

        const transfer = isObject(action["JettonTransfer"])
          ? action["JettonTransfer"]
          : null;
        if (transfer === null) {
          skippedCount++;
          continue;
        }

        const baseTx = firstObject(action["base_transactions"]);
        const recipientObj = isObject(transfer["recipient"])
          ? transfer["recipient"]
          : null;
        const jettonObj = isObject(transfer["jetton"])
          ? transfer["jetton"]
          : null;

        // ── Required fields ──────────────────────────────────────────────────
        // All seven fields must be present and non-empty.
        // Any absence causes this action to be skipped and counted.
        // No placeholder or fallback values are invented.

        const txHash       = optionalString(baseTx["hash"]);
        const lt           = optionalString(baseTx["lt"]);
        const amount       = optionalString(transfer["amount"]);
        const traceId      = optionalString(action["trace_id"]);
        const actionIndex  = optionalNonNegativeInteger(action["action_index"]);
        const destinationAddress =
          recipientObj !== null ? optionalString(recipientObj["address"]) : null;
        const jettonMaster =
          jettonObj !== null ? optionalString(jettonObj["address"]) : null;

        if (
          txHash === null ||
          lt === null ||
          amount === null ||
          traceId === null ||
          actionIndex === null ||
          destinationAddress === null ||
          jettonMaster === null
        ) {
          skippedCount++;
          continue;
        }

        // ── Optional fields ──────────────────────────────────────────────────
        // Null is a valid value; no entry is skipped on their absence.

        const senderObj = isObject(transfer["sender"])
          ? transfer["sender"]
          : null;
        const sourceAddress =
          senderObj !== null ? optionalString(senderObj["address"]) : null;
        const messageHash = optionalString(action["message_hash"]);

        // utime from base_transactions preferred over event-level timestamp.
        const eventTimestamp =
          unixSecondsToIso(baseTx["utime"]) ?? eventLevelTimestamp;

        events.push({
          provider: "tonapi",
          receivedAt: new Date(this.clock()).toISOString(),
          payload: {
            eventType: "jetton_transfer",
            sourceAddress,
            destinationAddress,
            jettonMaster,
            amount,
            txHash,
            traceId,
            actionIndex,
            messageHash,
            lt,
            eventTimestamp,
            finality,
          },
        });
      }
    }

    const nextCursor = this.extractNextCursor(raw);
    return { events, nextCursor, skippedCount };
  }

  private extractNextCursor(raw: JsonObject): TonapiReadCursor | null {
    // next_from may arrive as a positive integer (logical time) or decimal string.
    const nextFrom = raw["next_from"];
    if (
      typeof nextFrom === "number" &&
      Number.isInteger(nextFrom) &&
      nextFrom > 0
    ) {
      return { beforeLt: String(nextFrom) };
    }
    if (typeof nextFrom === "string" && nextFrom.length > 0) {
      return { beforeLt: nextFrom };
    }
    return null;
  }

  // ─── readAccountProfile ───────────────────────────────────────────────────────
  //
  // Maps GET /v2/blockchain/accounts/{account_id}.
  //
  // Lookup order:
  //   1. ProfileCache — hit returns immediately; inFlightProfileRequests not touched.
  //   2. inFlightProfileRequests — if a pending promise exists for this id, the
  //      caller awaits it directly. The collapsed caller does NOT consume any
  //      rate-limit capacity; only the original caller does.
  //   3. New provider request — created exactly once, stored in
  //      inFlightProfileRequests, removed in a finally block regardless of outcome.
  //      On success: profile is written to ProfileCache before the promise resolves.
  //      On failure: in-flight entry is removed so a subsequent call can retry.
  //
  // codeHash: extracted from "code_hash" field only; null if absent.
  // walletTypeHint: always null in C-4 (no approved source field confirmed).

  async readAccountProfile(
    canonicalAccountId: string,
  ): Promise<TonapiResult<TonapiAccountProfile>> {
    // ── Step 1: ProfileCache ─────────────────────────────────────────────────
    const cached = this.profileCache.get(canonicalAccountId);
    if (cached !== null) {
      return { ok: true, value: cached };
    }

    // ── Step 2: In-flight collapsing ─────────────────────────────────────────
    const existing = this.inFlightProfileRequests.get(canonicalAccountId);
    if (existing !== undefined) {
      return existing;
    }

    // ── Step 3: New provider request ─────────────────────────────────────────
    const promise = this.fetchAccountProfileOnce(canonicalAccountId);
    this.inFlightProfileRequests.set(canonicalAccountId, promise);
    try {
      return await promise;
    } finally {
      // Unconditional cleanup; map must never retain completed or failed entries.
      this.inFlightProfileRequests.delete(canonicalAccountId);
    }
  }

  /**
   * Issues a single provider request for one account profile.
   * Called only from readAccountProfile when no in-flight entry exists.
   * On success: normalizes response and writes to ProfileCache.
   * On any failure: returns a controlled TonapiResult without modifying the cache.
   */
  private async fetchAccountProfileOnce(
    canonicalAccountId: string,
  ): Promise<TonapiResult<TonapiAccountProfile>> {
    if (!this.hasCredentials()) {
      return this.credentialsMissing();
    }

    const path = `/v2/blockchain/accounts/${encodeURIComponent(canonicalAccountId)}`;

    const result = await this.callWithRetry((signal) =>
      this.adapter.get(path, {}, signal),
    );

    if (!result.ok) {
      return result;
    }

    const profile = this.normalizeAccountProfile(canonicalAccountId, result.value);
    if (profile === null) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: `account profile response for "${canonicalAccountId}" failed validation`,
      };
    }

    this.profileCache.set(canonicalAccountId, profile);
    return { ok: true, value: profile };
  }

  private normalizeAccountProfile(
    canonicalAccountId: string,
    raw: unknown,
  ): TonapiAccountProfile | null {
    if (!isObject(raw)) return null;

    // accountStatus: from "status" field.
    const accountStatus = optionalString(raw["status"]);

    // codeHash: from "code_hash" field only.
    // PROVISIONAL: "code_hash" is the expected snake_case field name for TonAPI
    // REST account responses. Must be confirmed against live API or OpenAPI spec
    // before treating this extraction as authoritative.
    const codeHash = optionalString(raw["code_hash"]);

    // walletTypeHint: always null in C-4.
    // No approved source field has been confirmed from TonAPI REST account
    // responses. Must not be inferred from "interfaces", "known_contracts",
    // or any other field. Remains null until a specific field is explicitly approved.
    const walletTypeHint: string | null = null;

    // entityLabel: from "name" field.
    // PROVISIONAL: "name" is the expected field for known-entity labels in TonAPI
    // account responses. Must be confirmed.
    const entityLabel = optionalString(raw["name"]);

    return {
      accountAddress: canonicalAccountId,
      accountStatus,
      codeHash,
      walletTypeHint,
      entityLabel,
      fetchedAt: new Date(this.clock()).toISOString(),
    };
  }

  // ─── readAccountProfilesBulk ──────────────────────────────────────────────────
  //
  // Maps POST /v2/blockchain/accounts/_bulk.
  //
  // PROVISIONAL: The wire schema (request body shape and response envelope) is
  // not confirmed from fixtures. This implementation targets the most likely shape
  // based on TonAPI REST API conventions. Offline/mock-compatible only in C-4.
  //
  // Behavior:
  // - Empty input returns immediately; no adapter call.
  // - ProfileCache is checked first for each id; cache hits are not re-fetched.
  // - If uncached address count exceeds config.profileBatchSize, fails closed
  //   with invalid_request before any adapter call is made.
  // - A single bulk adapter call is made for the uncached subset.
  // - Results are written to ProfileCache after the response.
  // - Bulk request collapsing (de-duplication of concurrent bulk calls) is deferred
  //   to a future review; only per-address ProfileCache hits are collapsed here.

  async readAccountProfilesBulk(
    canonicalAccountIds: readonly string[],
  ): Promise<TonapiResult<TonApiBulkProfileResult>> {
    if (canonicalAccountIds.length === 0) {
      return { ok: true, value: { profiles: [], failedAddresses: [] } };
    }

    const hitProfiles: TonapiAccountProfile[] = [];
    const missIds: string[] = [];

    for (const id of canonicalAccountIds) {
      const cached = this.profileCache.get(id);
      if (cached !== null) {
        hitProfiles.push(cached);
      } else {
        missIds.push(id);
      }
    }

    if (missIds.length === 0) {
      return { ok: true, value: { profiles: hitProfiles, failedAddresses: [] } };
    }

    // Fail closed if uncached count exceeds the configured batch size.
    // No adapter call is made when this guard fires.
    if (missIds.length > this.config.profileBatchSize) {
      return {
        ok: false,
        reason: "invalid_request",
        detail:
          `uncached address count (${missIds.length}) exceeds ` +
          `config.profileBatchSize (${this.config.profileBatchSize})`,
      };
    }

    if (!this.hasCredentials()) {
      return this.credentialsMissing();
    }

    // PROVISIONAL request body shape: { account_ids: string[] }
    const body: JsonObject = { account_ids: missIds };

    const result = await this.callWithRetry((signal) =>
      this.adapter.post("/v2/blockchain/accounts/_bulk", body, signal),
    );

    if (!result.ok) {
      return result;
    }

    const bulkResult = this.normalizeBulkProfiles(missIds, result.value);
    if (bulkResult === null) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "bulk account profile response failed envelope validation",
      };
    }

    for (const profile of bulkResult.profiles) {
      this.profileCache.set(profile.accountAddress, profile);
    }

    return {
      ok: true,
      value: {
        profiles: [...hitProfiles, ...bulkResult.profiles],
        failedAddresses: bulkResult.failedAddresses,
      },
    };
  }

  private normalizeBulkProfiles(
    requestedIds: readonly string[],
    raw: unknown,
  ): TonApiBulkProfileResult | null {
    // PROVISIONAL response envelope: { accounts: Array<account_object> }
    // Each account_object is expected to contain an "address" field.
    if (!isObject(raw)) return null;

    const accounts = raw["accounts"];
    if (!Array.isArray(accounts)) return null;

    const profiles: TonapiAccountProfile[] = [];
    const returnedIds = new Set<string>();

    for (const account of accounts) {
      if (!isObject(account)) continue;

      const accountAddress = optionalString(account["address"]);
      if (accountAddress === null) continue;

      const profile = this.normalizeAccountProfile(accountAddress, account);
      if (profile !== null) {
        profiles.push(profile);
        returnedIds.add(accountAddress);
      }
    }

    // Addresses requested but absent or unparseable in the response.
    const failedAddresses = requestedIds.filter((id) => !returnedIds.has(id));

    return { profiles, failedAddresses };
  }
}
