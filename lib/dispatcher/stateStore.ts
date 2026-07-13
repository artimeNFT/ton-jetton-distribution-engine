/**
 * @file lib/dispatcher/stateStore.ts
 * @description Entry-centric atomic state store for the Identity & Mint engine.
 * Schema version: stage-a-entry-centric-v1
 *
 * Key invariants:
 *   - RunState.entries is the sole execution source of truth.
 *   - All writes go through saveStateAtomic (write-to-temp + rename).
 *   - JsonAtomicStateStore serialises concurrent in-process updates via a
 *     promise chain and a filesystem lock file.
 *   - Runtime operator fields live exclusively in RunState.operators;
 *     they are never stored in operators.json.
 */

import * as fs from "fs/promises";
import * as path from "path";

// ─── Scalar Type Aliases ──────────────────────────────────────────────────────

export type ISO8601 = string;
export type StateKey = string;

// ─── Status Enumerations ──────────────────────────────────────────────────────

export type StateStatus =
  | "planned"
  | "submitted"
  | "success"
  | "hard_failure"
  | "cooldown"
  | "skipped"
  | "cancelled";

export type CampaignStatus =
  | "idle"
  | "running"
  | "completed"
  | "stopped";

export type RetryDisposition =
  | "none"
  | "retry_same_identity"
  | "rotate_identity"
  | "fail_batch"
  | "stop_campaign";

export type OperatorStatus =
  | "active"
  | "cooldown"
  | "failed"
  | "paused";

// ─── Core Domain Interfaces ───────────────────────────────────────────────────

export interface StateEntry {
  batchId: string;
  recipientAddress: string;
  recipientIndex: number;
  amount: string;

  status: StateStatus;
  attemptNumber: number;

  operatorId: string | null;
  operatorLabel: string | null;

  txHash: string | null;
  networkRef: string | null;

  createdAt: ISO8601;
  updatedAt: ISO8601;
  submittedAt: ISO8601 | null;
  finalizedAt: ISO8601 | null;
  cooldownUntil: ISO8601 | null;

  lastErrorCode: string | null;
  lastError: string | null;
  lastDecision: RetryDisposition | null;

  metadata?: Record<string, unknown>;
}

export interface OperatorRuntimeState {
  status: OperatorStatus;
  paused: boolean;
  cooldownUntil: ISO8601 | null;
  failedUntil: ISO8601 | null;
  consecutiveFailures: number;
  lastSelectedAt: ISO8601 | null;
  lastSuccessAt: ISO8601 | null;
  lastFailureAt: ISO8601 | null;
  lastError: string | null;
}

export interface RunLock {
  activeBatchId: string | null;
  activeOperatorId: string | null;
  activeAttemptNumber: number | null;
  lockedAt: ISO8601 | null;
}

export interface RunMeta {
  campaignId: string;
  status: CampaignStatus;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  startedAt: ISO8601 | null;
  finishedAt: ISO8601 | null;
  stopReason: string | null;
  lastError: string | null;
  batchAttempts: Record<string, number>;
  lastReconciledAt: ISO8601 | null;
}

export interface RunState {
  schemaVersion: "stage-a-entry-centric-v1";
  meta: RunMeta;
  entries: Record<StateKey, StateEntry>;
  operators: Record<string, OperatorRuntimeState>;
  lock: RunLock;
}

// ─── AtomicStateStore Interface ───────────────────────────────────────────────

export interface AtomicStateStore {
  read(): Promise<RunState>;
  update(mutator: (draft: RunState) => void | RunState): Promise<RunState>;
}

export type GuardedEntryStatus = StateStatus | "absent";

export interface EntryTransitionGuard {
  allowedStatuses: readonly GuardedEntryStatus[];
  expectedAttemptNumber?: number;
  expectedOperatorId?: string | null;
}

export interface RunLockIdentity {
  batchId: string;
  operatorId: string;
  attemptNumber: number;
}

export class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateConflictError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Schema Constants ─────────────────────────────────────────────────────────

const SCHEMA_VERSION = "stage-a-entry-centric-v1" as const;

// ─── makeStateKey ─────────────────────────────────────────────────────────────

/**
 * Builds a deterministic, stable state key for a given batch + recipient pair.
 * Keys are case-normalised so that address casing differences do not produce
 * duplicate entries.
 */
export function makeStateKey(batchId: string, recipientAddress: string): StateKey {
  return `${batchId}::${recipientAddress.trim().toLowerCase()}`;
}

// ─── createEmptyRunState ──────────────────────────────────────────────────────

/**
 * Returns a valid, fully-initialised RunState with no entries.
 * `nowIso` is injected for deterministic testing; defaults to current time.
 */
export function createEmptyRunState(campaignId: string, nowIso?: ISO8601): RunState {
  const ts = nowIso ?? new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      campaignId,
      status: "idle",
      createdAt: ts,
      updatedAt: ts,
      startedAt: null,
      finishedAt: null,
      stopReason: null,
      lastError: null,
      batchAttempts: {},
      lastReconciledAt: null,
    },
    entries: {},
    operators: {},
    lock: {
      activeBatchId: null,
      activeOperatorId: null,
      activeAttemptNumber: null,
      lockedAt: null,
    },
  };
}

// ─── loadState ────────────────────────────────────────────────────────────────

/**
 * Loads persisted RunState from `statePath`.
 *
 * Behaviour:
 *   1. Missing file → returns a fresh empty RunState for `campaignId`.
 *   2. Invalid JSON → throws.
 *   3. Schema version mismatch or missing → throws (no silent migration).
 *   4. Missing sub-containers are normalised to empty defaults.
 *   5. Missing meta.campaignId is patched to `campaignId`.
 */
export async function loadState(
  statePath: string,
  campaignId: string
): Promise<RunState> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, "utf8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return createEmptyRunState(campaignId);
    }
    throw new Error(
      `[stateStore] Cannot read state file at "${statePath}": ${errorMessage(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(
      `[stateStore] State file at "${statePath}" contains invalid JSON: ${errorMessage(err)}`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[stateStore] State file at "${statePath}" must contain a JSON object at root.`
    );
  }

  const obj = parsed as Record<string, unknown>;

  // Schema version guard — no silent migration.
  if (obj["schemaVersion"] !== SCHEMA_VERSION) {
    throw new Error(
      `[stateStore] Schema version mismatch in "${statePath}". ` +
        `Expected "${SCHEMA_VERSION}", got: ${JSON.stringify(obj["schemaVersion"])}. ` +
        `Manual migration is required.`
    );
  }

  // Validate root containers before interpreting their contents. Persisted
  // state is execution truth; malformed containers are never defaulted into an
  // execution-eligible shape.
  if (obj["meta"] === null || typeof obj["meta"] !== "object" || Array.isArray(obj["meta"])) {
    throw new Error(`[stateStore] State file at "${statePath}" has an invalid "meta" object.`);
  }
  if (obj["entries"] === null || typeof obj["entries"] !== "object" || Array.isArray(obj["entries"])) {
    throw new Error(`[stateStore] State file at "${statePath}" has an invalid "entries" map.`);
  }
  if (obj["operators"] === null || typeof obj["operators"] !== "object" || Array.isArray(obj["operators"])) {
    throw new Error(`[stateStore] State file at "${statePath}" has an invalid "operators" map.`);
  }
  if (obj["lock"] === null || typeof obj["lock"] !== "object" || Array.isArray(obj["lock"])) {
    throw new Error(`[stateStore] State file at "${statePath}" has an invalid "lock" object.`);
  }

  // Validate meta sub-object.
  const rawMeta =
    obj["meta"] !== null &&
    typeof obj["meta"] === "object" &&
    !Array.isArray(obj["meta"])
      ? (obj["meta"] as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const entries =
    obj["entries"] !== null &&
    typeof obj["entries"] === "object" &&
    !Array.isArray(obj["entries"])
      ? (obj["entries"] as Record<StateKey, StateEntry>)
      : {};

  const operators =
    obj["operators"] !== null &&
    typeof obj["operators"] === "object" &&
    !Array.isArray(obj["operators"])
      ? (obj["operators"] as Record<string, OperatorRuntimeState>)
      : {};

  // Normalise lock sub-object.
  const rawLock =
    obj["lock"] !== null &&
    typeof obj["lock"] === "object" &&
    !Array.isArray(obj["lock"])
      ? (obj["lock"] as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const state: RunState = {
    schemaVersion: SCHEMA_VERSION,
    meta: validateMeta(rawMeta, campaignId, statePath),
    entries: validateEntries(entries, statePath),
    operators: validateOperators(operators, statePath),
    lock: validateLock(rawLock, statePath),
  };

  assertValidRunState(state, campaignId);
  return state;
}

// ─── Normalization Helpers ────────────────────────────────────────────────────

const VALID_CAMPAIGN_STATUSES: ReadonlySet<string> = new Set([
  "idle",
  "running",
  "completed",
  "stopped",
]);

const VALID_STATE_STATUSES: ReadonlySet<string> = new Set([
  "planned",
  "submitted",
  "success",
  "hard_failure",
  "cooldown",
  "skipped",
  "cancelled",
]);

const VALID_RETRY_DISPOSITIONS: ReadonlySet<string> = new Set([
  "none",
  "retry_same_identity",
  "rotate_identity",
  "fail_batch",
  "stop_campaign",
]);

const VALID_OPERATOR_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "cooldown",
  "failed",
  "paused",
]);

function validateMeta(
  raw: Record<string, unknown>,
  campaignId: string,
  source: string
): RunMeta {
  requireNonEmptyString(raw["campaignId"], `${source}: meta.campaignId`);
  if (raw["campaignId"] !== campaignId) {
    throw new Error(`[stateStore] ${source}: meta.campaignId does not match requested campaign "${campaignId}".`);
  }
  if (!VALID_CAMPAIGN_STATUSES.has(String(raw["status"]))) {
    throw new Error(`[stateStore] ${source}: invalid meta.status ${JSON.stringify(raw["status"])}.`);
  }
  requireIso(raw["createdAt"], `${source}: meta.createdAt`);
  requireIso(raw["updatedAt"], `${source}: meta.updatedAt`);
  requireNullableIso(raw["startedAt"], `${source}: meta.startedAt`);
  requireNullableIso(raw["finishedAt"], `${source}: meta.finishedAt`);
  requireNullableString(raw["stopReason"], `${source}: meta.stopReason`);
  requireNullableString(raw["lastError"], `${source}: meta.lastError`);
  requireNullableIso(raw["lastReconciledAt"], `${source}: meta.lastReconciledAt`);
  if (raw["batchAttempts"] === null || typeof raw["batchAttempts"] !== "object" || Array.isArray(raw["batchAttempts"])) {
    throw new Error(`[stateStore] ${source}: meta.batchAttempts must be an object.`);
  }
  for (const [batchId, attempt] of Object.entries(raw["batchAttempts"] as Record<string, unknown>)) {
    requireNonEmptyString(batchId, `${source}: meta.batchAttempts key`);
    if (!Number.isInteger(attempt) || (attempt as number) < 0) {
      throw new Error(`[stateStore] ${source}: meta.batchAttempts[${JSON.stringify(batchId)}] must be an integer >= 0.`);
    }
  }
  return raw as unknown as RunMeta;
}

/**
 * Strict normalisation of every StateEntry in the entries map.
 * Malformed field values are replaced with safe defaults; entries are never
 * dropped so the Reconciler always sees the full picture.
 */
function validateEntries(
  raw: Record<StateKey, StateEntry>,
  source: string
): Record<StateKey, StateEntry> {
  const validated: Record<StateKey, StateEntry> = {};
  for (const [key, rawEntry] of Object.entries(raw)) {
    assertValidStateEntry(key, rawEntry, `${source}: entries[${JSON.stringify(key)}]`);
    validated[key] = rawEntry;
  }
  return validated;
}

/**
 * Strict normalisation of every OperatorRuntimeState record.
 * No unsafe cast — every field validated individually.
 */
function validateOperators(
  raw: Record<string, OperatorRuntimeState>,
  source: string
): Record<string, OperatorRuntimeState> {
  const validated: Record<string, OperatorRuntimeState> = {};
  for (const [id, rawOp] of Object.entries(raw)) {
    requireNonEmptyString(id, `${source}: operator id`);
    if (rawOp === null || typeof rawOp !== "object" || Array.isArray(rawOp)) {
      throw new Error(`[stateStore] ${source}: operators[${JSON.stringify(id)}] must be an object.`);
    }
    const o = rawOp as unknown as Record<string, unknown>;
    if (!VALID_OPERATOR_STATUSES.has(String(o["status"]))) {
      throw new Error(`[stateStore] ${source}: invalid operator status for ${JSON.stringify(id)}.`);
    }
    if (typeof o["paused"] !== "boolean") {
      throw new Error(`[stateStore] ${source}: operators[${JSON.stringify(id)}].paused must be boolean.`);
    }
    if (!Number.isInteger(o["consecutiveFailures"]) || (o["consecutiveFailures"] as number) < 0) {
      throw new Error(`[stateStore] ${source}: operators[${JSON.stringify(id)}].consecutiveFailures must be an integer >= 0.`);
    }
    requireNullableIso(o["cooldownUntil"], `${source}: operator.cooldownUntil`);
    requireNullableIso(o["failedUntil"], `${source}: operator.failedUntil`);
    requireNullableIso(o["lastSelectedAt"], `${source}: operator.lastSelectedAt`);
    requireNullableIso(o["lastSuccessAt"], `${source}: operator.lastSuccessAt`);
    requireNullableIso(o["lastFailureAt"], `${source}: operator.lastFailureAt`);
    requireNullableString(o["lastError"], `${source}: operator.lastError`);
    validated[id] = rawOp;
  }
  return validated;
}

function validateLock(raw: Record<string, unknown>, source: string): RunLock {
  requireNullableString(raw["activeBatchId"], `${source}: lock.activeBatchId`);
  requireNullableString(raw["activeOperatorId"], `${source}: lock.activeOperatorId`);
  requireNullableIso(raw["lockedAt"], `${source}: lock.lockedAt`);
  if (raw["activeAttemptNumber"] !== null && (!Number.isInteger(raw["activeAttemptNumber"]) || (raw["activeAttemptNumber"] as number) < 1)) {
    throw new Error(`[stateStore] ${source}: lock.activeAttemptNumber must be null or an integer >= 1.`);
  }
  const values = [raw["activeBatchId"], raw["activeOperatorId"], raw["activeAttemptNumber"], raw["lockedAt"]];
  const allNull = values.every((v) => v === null);
  const allPresent = values.every((v) => v !== null);
  if (!allNull && !allPresent) {
    throw new Error(`[stateStore] ${source}: run lock must be entirely clear or entirely populated.`);
  }
  return raw as unknown as RunLock;
}

function emptyOperatorRuntime(): OperatorRuntimeState {
  return {
    status: "active",
    paused: false,
    cooldownUntil: null,
    failedUntil: null,
    consecutiveFailures: 0,
    lastSelectedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

// ─── saveStateAtomic ──────────────────────────────────────────────────────────

/**
 * Atomically persists `state` to `statePath`.
 *
 * Algorithm:
 *   1. Ensure target directory exists.
 *   2. Write to temp file: `<statePath>.tmp.<pid>.<timestamp>`.
 *   3. Rename temp file over target (atomic on POSIX, best-effort on Windows).
 *   4. If rename fails, do NOT delete the original; clean up temp file only.
 */
export async function saveStateAtomic(
  statePath: string,
  state: RunState
): Promise<void> {
  assertValidRunState(state, state.meta.campaignId);
  const dir = path.dirname(path.resolve(statePath));
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${statePath}.tmp.${process.pid}.${Date.now()}`;
  const serialised = JSON.stringify(state, null, 2);

  await fs.writeFile(tmpPath, serialised, { encoding: "utf8", flag: "w" });

  try {
    await fs.rename(tmpPath, statePath);
  } catch (renameErr: unknown) {
    // Best-effort cleanup of temp file; original is left intact.
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors.
    }
    throw new Error(
      `[stateStore] Atomic rename failed for "${statePath}": ${errorMessage(renameErr)}`
    );
  }
}

// ─── upsertEntry ─────────────────────────────────────────────────────────────

/**
 * Inserts or fully replaces the entry at `key` inside `state.entries`.
 *
 * Mutation semantics: the passed-in state object is modified in place and
 * returned. Callers using JsonAtomicStateStore always operate on a cloned draft,
 * so mutation is safe. No deep-merge of the optional metadata field.
 */
export function upsertEntry(
  state: RunState,
  key: StateKey,
  entry: StateEntry
): RunState {
  state.entries[key] = entry;
  return state;
}

/**
 * The single guarded entry mutation primitive used by the active Dispatcher
 * and Reconciler paths. The state-store transaction supplies atomicity; this
 * function supplies stale-read and conflicting-state rejection.
 */
export function setEntryGuarded(
  state: RunState,
  key: StateKey,
  guard: EntryTransitionGuard,
  nextEntry: StateEntry
): StateEntry {
  const current = state.entries[key];
  const currentStatus: GuardedEntryStatus = current?.status ?? "absent";
  if (!guard.allowedStatuses.includes(currentStatus)) {
    throw new StateConflictError(
      `[stateStore] Guarded transition rejected for "${key}": expected status in ` +
        `${JSON.stringify(guard.allowedStatuses)}, found "${currentStatus}".`
    );
  }
  if (guard.expectedAttemptNumber !== undefined && current?.attemptNumber !== guard.expectedAttemptNumber) {
    throw new StateConflictError(
      `[stateStore] Guarded transition rejected for "${key}": expected attempt ` +
        `${guard.expectedAttemptNumber}, found ${String(current?.attemptNumber)}.`
    );
  }
  if (guard.expectedOperatorId !== undefined && current?.operatorId !== guard.expectedOperatorId) {
    throw new StateConflictError(
      `[stateStore] Guarded transition rejected for "${key}": expected operator ` +
        `${JSON.stringify(guard.expectedOperatorId)}, found ${JSON.stringify(current?.operatorId)}.`
    );
  }
  assertValidStateEntry(key, nextEntry, `guarded next entry ${JSON.stringify(key)}`);
  state.entries[key] = nextEntry;
  return nextEntry;
}

export function acquireRunLockGuarded(state: RunState, identity: RunLockIdentity, lockedAt: ISO8601): void {
  if (state.lock.activeBatchId !== null) {
    throw new StateConflictError(
      `[stateStore] Run lock is already held by batch ${JSON.stringify(state.lock.activeBatchId)}.`
    );
  }
  requireIso(lockedAt, "run lock lockedAt");
  state.lock = {
    activeBatchId: identity.batchId,
    activeOperatorId: identity.operatorId,
    activeAttemptNumber: identity.attemptNumber,
    lockedAt,
  };
}

export function releaseRunLockGuarded(state: RunState, identity: RunLockIdentity): void {
  if (
    state.lock.activeBatchId !== identity.batchId ||
    state.lock.activeOperatorId !== identity.operatorId ||
    state.lock.activeAttemptNumber !== identity.attemptNumber
  ) {
    throw new StateConflictError(
      `[stateStore] Refusing to clear a run lock not owned by ` +
        `${identity.batchId}/${identity.operatorId}/${identity.attemptNumber}.`
    );
  }
  state.lock = {
    activeBatchId: null,
    activeOperatorId: null,
    activeAttemptNumber: null,
    lockedAt: null,
  };
}

export function assertValidRunState(state: RunState, campaignId: string): void {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`[stateStore] Invalid schemaVersion ${JSON.stringify(state.schemaVersion)}.`);
  }
  validateMeta(state.meta as unknown as Record<string, unknown>, campaignId, "RunState");
  validateEntries(state.entries, "RunState");
  validateOperators(state.operators, "RunState");
  validateLock(state.lock as unknown as Record<string, unknown>, "RunState");
}

function assertValidStateEntry(key: string, rawEntry: unknown, source: string): asserts rawEntry is StateEntry {
  if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
    throw new Error(`[stateStore] ${source} must be an object.`);
  }
  const e = rawEntry as Record<string, unknown>;
  requireNonEmptyString(e["batchId"], `${source}.batchId`);
  requireNonEmptyString(e["recipientAddress"], `${source}.recipientAddress`);
  if (key !== makeStateKey(e["batchId"] as string, e["recipientAddress"] as string)) {
    throw new Error(`[stateStore] ${source} key/content mismatch.`);
  }
  if (!Number.isInteger(e["recipientIndex"]) || (e["recipientIndex"] as number) < 0) {
    throw new Error(`[stateStore] ${source}.recipientIndex must be an integer >= 0.`);
  }
  if (typeof e["amount"] !== "string" || !/^\d+$/.test(e["amount"] as string) || BigInt(e["amount"] as string) <= 0n) {
    throw new Error(`[stateStore] ${source}.amount must be a positive unsigned decimal string.`);
  }
  if (!VALID_STATE_STATUSES.has(String(e["status"]))) {
    throw new Error(`[stateStore] ${source}.status is invalid.`);
  }
  const minimumAttempt = e["status"] === "planned" ? 0 : 1;
  if (!Number.isInteger(e["attemptNumber"]) || (e["attemptNumber"] as number) < minimumAttempt) {
    throw new Error(`[stateStore] ${source}.attemptNumber is invalid for status ${String(e["status"])}.`);
  }
  requireNullableString(e["operatorId"], `${source}.operatorId`);
  requireNullableString(e["operatorLabel"], `${source}.operatorLabel`);
  requireNullableString(e["txHash"], `${source}.txHash`);
  requireNullableString(e["networkRef"], `${source}.networkRef`);
  requireIso(e["createdAt"], `${source}.createdAt`);
  requireIso(e["updatedAt"], `${source}.updatedAt`);
  requireNullableIso(e["submittedAt"], `${source}.submittedAt`);
  requireNullableIso(e["finalizedAt"], `${source}.finalizedAt`);
  requireNullableIso(e["cooldownUntil"], `${source}.cooldownUntil`);
  requireNullableString(e["lastErrorCode"], `${source}.lastErrorCode`);
  requireNullableString(e["lastError"], `${source}.lastError`);
  if (e["lastDecision"] !== null && !VALID_RETRY_DISPOSITIONS.has(String(e["lastDecision"]))) {
    throw new Error(`[stateStore] ${source}.lastDecision is invalid.`);
  }
  if (e["metadata"] !== undefined && (e["metadata"] === null || typeof e["metadata"] !== "object" || Array.isArray(e["metadata"]))) {
    throw new Error(`[stateStore] ${source}.metadata must be an object when present.`);
  }
  if (e["status"] === "submitted") {
    if (e["submittedAt"] === null || e["operatorId"] === null || e["operatorLabel"] === null) {
      throw new Error(`[stateStore] ${source} submitted entries require submittedAt and operator identity.`);
    }
  }
  if (e["status"] === "cooldown" && e["cooldownUntil"] === null) {
    throw new Error(`[stateStore] ${source} cooldown entries require cooldownUntil.`);
  }
}

function requireNonEmptyString(value: unknown, source: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[stateStore] ${source} must be a non-empty string.`);
  }
}

function requireNullableString(value: unknown, source: string): void {
  if (value !== null && typeof value !== "string") {
    throw new Error(`[stateStore] ${source} must be null or a string.`);
  }
}

function requireIso(value: unknown, source: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`[stateStore] ${source} must be a parseable ISO timestamp.`);
  }
}

function requireNullableIso(value: unknown, source: string): void {
  if (value !== null) requireIso(value, source);
}

// ─── JsonAtomicStateStore ─────────────────────────────────────────────────────

/**
 * In-process-serialised, lock-file-guarded implementation of AtomicStateStore.
 *
 * Concurrent in-process calls to update() are serialised via `writeChain`.
 * Cross-process safety is provided by an exclusive filesystem lock file.
 *
 * Lock acquisition strategy:
 *   - Poll with fs.open(lockPath, "wx") every 50 ms.
 *   - Give up after 10_000 ms and throw "stateStore: lock timeout".
 */
export class JsonAtomicStateStore implements AtomicStateStore {
  /**
   * In-process serialisation anchor.
   * Each update() call chains onto this promise so updates never interleave.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly statePath: string,
    private readonly campaignId: string
  ) {}

  // ── read ─────────────────────────────────────────────────────────────────

  async read(): Promise<RunState> {
    return loadState(this.statePath, this.campaignId);
  }

  // ── update ────────────────────────────────────────────────────────────────

  /**
   * Enqueues a state mutation transaction onto the write chain.
   * The transaction acquires the filesystem lock, clones current state,
   * applies the mutator, stamps updatedAt, persists atomically, and
   * releases the lock.
   *
   * If the mutator returns a RunState, that value is used as nextState.
   * If it returns void, the mutated draft is used.
   */
  update(mutator: (draft: RunState) => void | RunState): Promise<RunState> {
    const next = this.writeChain.then(() => this._doUpdate(mutator));
    // Keep a non-rejecting reference as the chain anchor so future updates
    // are not blocked by a previous error. Callers receive the real rejection.
    this.writeChain = next.catch(() => {
      /* intentionally swallowed on chain anchor */
    });
    return next;
  }

  // ── Internal transaction ──────────────────────────────────────────────────

  private async _doUpdate(
    mutator: (draft: RunState) => void | RunState
  ): Promise<RunState> {
    const lockPath = `${this.statePath}.lock`;
    const lockHandle = await this.acquireLock(lockPath);
    try {
      // Step 1: Load current persisted state.
      const current = await loadState(this.statePath, this.campaignId);

      // Step 2: Clone — mutator operates on a safe draft copy.
      const draft: RunState =
        typeof structuredClone === "function"
          ? structuredClone(current)
          : (JSON.parse(JSON.stringify(current)) as RunState);

      // Step 3: Apply mutator; use returned value if the mutator is fluent.
      const returned = mutator(draft);
      const nextState: RunState = returned !== undefined ? returned : draft;

      // Step 4: Stamp updatedAt unconditionally.
      nextState.meta.updatedAt = new Date().toISOString();

      // Step 4b: Fail closed before persistence if any mutation produced an
      // invalid or internally inconsistent RunState.
      assertValidRunState(nextState, this.campaignId);

      // Step 5: Persist atomically.
      await saveStateAtomic(this.statePath, nextState);

      return nextState;
    } finally {
      // Step 6: Always release the lock even if the body threw.
      await this.releaseLock(lockHandle, lockPath);
    }
  }

  // ── Lock helpers ──────────────────────────────────────────────────────────

  private async acquireLock(lockPath: string): Promise<fs.FileHandle> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        // "wx" = create exclusively; fails with EEXIST if already present.
        const handle = await fs.open(lockPath, "wx");
        return handle;
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "EEXIST") {
          await sleepMs(50);
          continue;
        }
        throw new Error(
          `[stateStore] Unexpected error acquiring lock at "${lockPath}": ${errorMessage(err)}`
        );
      }
    }
    throw new Error("stateStore: lock timeout");
  }

  private async releaseLock(
    handle: fs.FileHandle,
    lockPath: string
  ): Promise<void> {
    try {
      await handle.close();
    } catch {
      // Ignore close errors.
    }
    try {
      await fs.unlink(lockPath);
    } catch {
      // Ignore unlink errors — another process may have cleaned up first.
    }
  }
}

// ─── Internal Utilities ───────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}