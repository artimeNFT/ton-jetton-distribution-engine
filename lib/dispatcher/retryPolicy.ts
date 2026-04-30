/**
 * @file lib/dispatcher/retryPolicy.ts
 * @description Retry classification and backoff policy for TON distribution engine.
 *
 * Produces RetryDecision values that are compatible with both the legacy
 * retry-loop contract (retry / delayMs / shouldPauseWallet / shouldFailoverWallet)
 * and the dispatcher Stage-A entry-centric contract (disposition / reasonCode /
 * cooldownUntil / failedUntil as ISO strings).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetryCategory =
  | "transient_rpc"
  | "rate_limited"
  | "timeout"
  | "seqno_desync"
  | "insufficient_ton"
  | "invalid_input"
  | "contract_rejection"
  | "uncertain_submission"
  | "fatal"
  | "unknown";

/**
 * Dispatcher-compatible disposition values.
 * Must stay in sync with RetryDisposition in stateStore.ts
 * (excluding "none" which is a state-store-only sentinel).
 */
export type RetryDisposition =
  | "retry_same_identity"
  | "rotate_identity"
  | "fail_batch"
  | "stop_campaign";

export interface RetryContext {
  attempt: number;        // 1-based
  maxAttempts: number;
  campaignId: string;
  walletLabel?: string;
  recipientAddress?: string;
}

/**
 * Full decision model — backward-compatible with legacy callers and forward-
 * compatible with the dispatcher Stage-A entry-centric contract.
 */
export interface RetryDecision {
  // ── Legacy fields (kept for backward compatibility) ──────────────────────
  retry: boolean;
  category: RetryCategory;
  delayMs: number;
  reason: string;
  shouldPauseWallet: boolean;
  shouldFailoverWallet: boolean;

  // ── Dispatcher Stage-A fields ────────────────────────────────────────────
  /** Dispatcher-compatible disposition. */
  disposition: RetryDisposition;
  /** Machine-readable error code matching the category. */
  reasonCode: string;
  /**
   * ISO 8601 string indicating when the current identity's cooldown expires.
   * Null when no cooldown applies.
   */
  cooldownUntil: string | null;
  /**
   * ISO 8601 string indicating until when the identity is considered failed.
   * Null when no failedUntil applies.
   */
  failedUntil: string | null;
}

// ─── Default failed window for insufficient_ton ───────────────────────────────

/** How long (ms) an operator is treated as "failed" after an insufficient-TON error. */
const INSUFFICIENT_TON_FAILED_WINDOW_MS = 15 * 60 * 1_000; // 15 minutes

// ─── Public API ───────────────────────────────────────────────────────────────

export function classifyRetry(
  error: unknown,
  context: RetryContext
): RetryDecision {
  validateContext(context);

  const message = normalizeErrorMessage(error);
  const category = classifyMessage(message);

  switch (category) {
    case "rate_limited":
      return buildRetryDecision(
        context,
        category,
        "[retryPolicy] Rate limit detected.",
        exponentialBackoffMs(context.attempt, 2_000, 30_000),
        false,
        false,
        "retry_same_identity",
        "rate_limited"
      );

    case "transient_rpc":
      return buildRetryDecision(
        context,
        category,
        "[retryPolicy] Transient RPC failure detected.",
        exponentialBackoffMs(context.attempt, 1_500, 20_000),
        false,
        false,
        "retry_same_identity",
        "transient_rpc"
      );

    case "timeout":
      return buildRetryDecision(
        context,
        category,
        "[retryPolicy] Timeout detected.",
        exponentialBackoffMs(context.attempt, 2_500, 45_000),
        false,
        false,
        "retry_same_identity",
        "timeout"
      );

    case "seqno_desync":
      return buildRetryDecision(
        context,
        category,
        "[retryPolicy] Wallet seqno desynchronization detected.",
        exponentialBackoffMs(context.attempt, 1_000, 10_000),
        false,
        false,
        "retry_same_identity",
        "seqno_desync"
      );

    case "insufficient_ton":
      return buildRotateDecision(
        context,
        category,
        "[retryPolicy] Insufficient TON balance detected.",
        "insufficient_ton",
        null,
        futureIso(INSUFFICIENT_TON_FAILED_WINDOW_MS)
      );

    case "uncertain_submission":
      return buildRetryDecision(
        context,
        category,
        "[retryPolicy] Submission may have succeeded but confirmation is uncertain.",
        exponentialBackoffMs(context.attempt, 4_000, 60_000),
        false,
        false,
        "retry_same_identity",
        "uncertain_submission"
      );

    case "invalid_input":
      return buildTerminalDecision(
        category,
        "[retryPolicy] Invalid input; retry is not appropriate.",
        "invalid_input",
        "fail_batch"
      );

    case "contract_rejection":
      return buildTerminalDecision(
        category,
        "[retryPolicy] Contract rejected the operation; retry is not appropriate without state change.",
        "contract_rejection",
        "fail_batch"
      );

    case "fatal":
      return buildTerminalDecision(
        category,
        "[retryPolicy] Fatal error; retry is not appropriate.",
        "fatal",
        "stop_campaign"
      );

    case "unknown":
      return buildTerminalDecision(
        category,
        "[retryPolicy] Unknown error category; treating as non-retryable batch failure.",
        "unknown",
        "fail_batch"
      );

    default: {
      const _exhaustive: never = category;
      return buildTerminalDecision(
        "fatal",
        `[retryPolicy] Unhandled retry category: ${String(_exhaustive)}`,
        "fatal",
        "stop_campaign"
      );
    }
  }
}

// ─── Decision Builders ────────────────────────────────────────────────────────

/**
 * Builds a retryable decision (retry_same_identity).
 * Sets cooldownUntil to ISO(now + delayMs) when delayMs > 0.
 */
function buildRetryDecision(
  context: RetryContext,
  category: RetryCategory,
  baseReason: string,
  delayMs: number,
  shouldPauseWallet: boolean,
  shouldFailoverWallet: boolean,
  disposition: RetryDisposition,
  reasonCode: string
): RetryDecision {
  const retry = context.attempt < context.maxAttempts;
  const effectiveDelay = retry ? delayMs : 0;
  const cooldownUntil =
    retry && effectiveDelay > 0 ? futureIso(effectiveDelay) : null;

  return {
    retry,
    category,
    delayMs: effectiveDelay,
    reason: retry
      ? `${baseReason} Retry allowed (attempt ${context.attempt}/${context.maxAttempts}).`
      : `${baseReason} Retry exhausted at attempt ${context.attempt}/${context.maxAttempts}.`,
    shouldPauseWallet,
    shouldFailoverWallet,
    disposition: retry ? disposition : "fail_batch",
    reasonCode,
    cooldownUntil,
    failedUntil: null,
  };
}

/**
 * Builds a rotate-identity decision (insufficient_ton).
 * Always non-retryable at this layer; signals provider rotation.
 */
function buildRotateDecision(
  context: RetryContext,
  category: RetryCategory,
  reason: string,
  reasonCode: string,
  cooldownUntil: string | null,
  failedUntil: string | null
): RetryDecision {
  return {
    retry: false,
    category,
    delayMs: 0,
    reason: `${reason} Rotate identity (attempt ${context.attempt}/${context.maxAttempts}).`,
    shouldPauseWallet: true,
    shouldFailoverWallet: true,
    disposition: "rotate_identity",
    reasonCode,
    cooldownUntil,
    failedUntil,
  };
}

/**
 * Builds a non-retryable terminal decision (fail_batch or stop_campaign).
 */
function buildTerminalDecision(
  category: RetryCategory,
  reason: string,
  reasonCode: string,
  disposition: "fail_batch" | "stop_campaign"
): RetryDecision {
  return {
    retry: false,
    category,
    delayMs: 0,
    reason,
    shouldPauseWallet: false,
    shouldFailoverWallet: false,
    disposition,
    reasonCode,
    cooldownUntil: null,
    failedUntil: null,
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyMessage(message: string): RetryCategory {
  const m = message.toLowerCase();

  if (includesAny(m, ["429", "rate limit", "too many requests", "throttled"])) {
    return "rate_limited";
  }

  if (
    includesAny(m, [
      "503", "502", "504", "bad gateway", "gateway timeout",
      "service unavailable", "request failed", "network error",
      "socket hang up", "econnreset", "econnrefused", "etimedout",
      "temporarily unavailable", "rpc endpoint unreachable",
    ])
  ) {
    return "transient_rpc";
  }

  if (includesAny(m, ["timeout", "timed out", "confirmation timeout", "deadline exceeded"])) {
    return "timeout";
  }

  if (
    includesAny(m, [
      "seqno", "sequence mismatch",
      "wallet sequence number out of sync", "out of sync",
    ])
  ) {
    return "seqno_desync";
  }

  if (
    includesAny(m, [
      "insufficient ton", "insufficient balance", "not enough balance",
      "out of gas", "low balance", "funds are insufficient",
    ])
  ) {
    return "insufficient_ton";
  }

  if (
    includesAny(m, [
      "submitted", "broadcasted", "broadcast", "sent transaction",
      "mempool", "unknown confirmation state", "could not confirm",
    ])
  ) {
    return "uncertain_submission";
  }

  if (
    includesAny(m, [
      "invalid address", "malformed address", "zero amount",
      "amount must be positive", "invalid configuration", "missing required",
      "cannot mint 0", "recipient address is invalid", "wrong workchain",
    ])
  ) {
    return "invalid_input";
  }

  if (
    includesAny(m, [
      "exit code", "contract rejected", "contract error", "execution failed",
      "unauthorised", "not owner", "not mintable", "bounce", "bounced",
    ])
  ) {
    return "contract_rejection";
  }

  if (
    includesAny(m, [
      "cannot find module", "syntaxerror", "typeerror", "referenceerror",
      "missing environment variable", "sender address is not available",
    ])
  ) {
    return "fatal";
  }

  return "unknown";
}

// ─── Backoff ──────────────────────────────────────────────────────────────────

export function exponentialBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error(
      `[retryPolicy] attempt must be an integer >= 1. Received: ${String(attempt)}`
    );
  }
  if (!Number.isInteger(baseDelayMs) || baseDelayMs < 0) {
    throw new Error(
      `[retryPolicy] baseDelayMs must be an integer >= 0. Received: ${String(baseDelayMs)}`
    );
  }
  if (!Number.isInteger(maxDelayMs) || maxDelayMs < 0) {
    throw new Error(
      `[retryPolicy] maxDelayMs must be an integer >= 0. Received: ${String(maxDelayMs)}`
    );
  }

  const raw = baseDelayMs * Math.pow(2, attempt - 1);
  return Math.min(Math.floor(raw), maxDelayMs);
}

// ─── Time Helpers ─────────────────────────────────────────────────────────────

/** Returns current time as an ISO 8601 string. */
function nowIso(): string {
  return new Date().toISOString();
}

/** Returns an ISO 8601 string `delayMs` milliseconds in the future. */
function futureIso(delayMs: number): string {
  return new Date(Date.now() + delayMs).toISOString();
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateContext(context: RetryContext): void {
  if (!Number.isInteger(context.attempt) || context.attempt < 1) {
    throw new Error(
      `[retryPolicy] context.attempt must be an integer >= 1. Received: ${String(context.attempt)}`
    );
  }
  if (!Number.isInteger(context.maxAttempts) || context.maxAttempts < 1) {
    throw new Error(
      `[retryPolicy] context.maxAttempts must be an integer >= 1. Received: ${String(context.maxAttempts)}`
    );
  }
  if (context.attempt > context.maxAttempts) {
    throw new Error(
      `[retryPolicy] context.attempt cannot exceed context.maxAttempts. ` +
        `Received attempt=${context.attempt}, maxAttempts=${context.maxAttempts}`
    );
  }
  if (
    typeof context.campaignId !== "string" ||
    context.campaignId.trim().length === 0
  ) {
    throw new Error(`[retryPolicy] context.campaignId must be a non-empty string.`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function includesAny(haystack: string, needles: string[]): boolean {
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}

// ─── Dispatcher Compatibility Layer ───────────────────────────────────────────
//
// Thin wrapper that maps the dispatcher's RetryPolicyInput contract onto the
// existing classifyRetry / RetryContext API. No existing logic is changed.

/** Default max-attempts used when the dispatcher does not specify one. */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Input shape expected by dispatcher.ts when calling RetryPolicy.classify.
 */
export interface RetryPolicyInput {
  error: unknown;
  attemptNumber: number;
  batchId: string;
  campaignId: string;
  operatorId: string;
}

/**
 * Dispatcher-facing RetryPolicy interface.
 * Implemented by DefaultRetryPolicy below.
 */
export interface RetryPolicy {
  classify(input: RetryPolicyInput): RetryDecision;
}

/**
 * Maps a RetryPolicyInput (dispatcher contract) into a RetryContext and
 * delegates to classifyRetry. Returns the decision unchanged.
 *
 * Validation:
 *   - attemptNumber must be integer >= 1
 *   - batchId must be non-empty string
 *   - campaignId must be non-empty string
 *   - operatorId must be non-empty string
 */
export function classify(input: RetryPolicyInput): RetryDecision {
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error(
      `[retryPolicy] RetryPolicyInput.attemptNumber must be an integer >= 1. ` +
        `Received: ${String(input.attemptNumber)}`
    );
  }
  if (typeof input.batchId !== "string" || input.batchId.trim().length === 0) {
    throw new Error(
      `[retryPolicy] RetryPolicyInput.batchId must be a non-empty string.`
    );
  }
  if (typeof input.campaignId !== "string" || input.campaignId.trim().length === 0) {
    throw new Error(
      `[retryPolicy] RetryPolicyInput.campaignId must be a non-empty string.`
    );
  }
  if (typeof input.operatorId !== "string" || input.operatorId.trim().length === 0) {
    throw new Error(
      `[retryPolicy] RetryPolicyInput.operatorId must be a non-empty string.`
    );
  }

  const context: RetryContext = {
    attempt: input.attemptNumber,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    campaignId: input.campaignId,
    walletLabel: input.operatorId,
    // recipientAddress is not available at the dispatcher call-site; omitted.
  };

  return classifyRetry(input.error, context);
}

/**
 * Singleton adapter object satisfying the RetryPolicy interface.
 * Inject this into DispatcherConfig.retryPolicy.
 */
export const DefaultRetryPolicy: RetryPolicy = {
  classify,
};