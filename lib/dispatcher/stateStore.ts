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

  // Normalise meta sub-object.
  const rawMeta =
    obj["meta"] !== null &&
    typeof obj["meta"] === "object" &&
    !Array.isArray(obj["meta"])
      ? (obj["meta"] as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  if (!rawMeta["campaignId"]) {
    rawMeta["campaignId"] = campaignId;
  }
  if (
    !rawMeta["batchAttempts"] ||
    typeof rawMeta["batchAttempts"] !== "object" ||
    Array.isArray(rawMeta["batchAttempts"])
  ) {
    rawMeta["batchAttempts"] = {};
  }

  // Normalise containers to empty objects if absent or wrong type.
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

  const lock: RunLock = {
    activeBatchId:
      typeof rawLock["activeBatchId"] === "string" ? rawLock["activeBatchId"] : null,
    activeOperatorId:
      typeof rawLock["activeOperatorId"] === "string" ? rawLock["activeOperatorId"] : null,
    activeAttemptNumber:
      typeof rawLock["activeAttemptNumber"] === "number"
        ? rawLock["activeAttemptNumber"]
        : null,
    lockedAt:
      typeof rawLock["lockedAt"] === "string" ? rawLock["lockedAt"] : null,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: normalizeMeta(rawMeta, campaignId),
    entries: normalizeEntries(entries),
    operators: normalizeOperators(operators),
    lock,
  };
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

function normIsoOrNull(v: unknown): ISO8601 | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function normIsoOrNow(v: unknown, fallback: ISO8601): ISO8601 {
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

function normStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Strict normalisation of RunMeta. No unsafe cast — every field is
 * individually validated and defaulted.
 */
function normalizeMeta(
  raw: Record<string, unknown>,
  campaignId: string
): RunMeta {
  const now = new Date().toISOString();
  return {
    campaignId:
      typeof raw["campaignId"] === "string" && raw["campaignId"].trim().length > 0
        ? raw["campaignId"]
        : campaignId,
    status: VALID_CAMPAIGN_STATUSES.has(String(raw["status"]))
      ? (raw["status"] as CampaignStatus)
      : "idle",
    createdAt: normIsoOrNow(raw["createdAt"], now),
    updatedAt: normIsoOrNow(raw["updatedAt"], now),
    startedAt: normIsoOrNull(raw["startedAt"]),
    finishedAt: normIsoOrNull(raw["finishedAt"]),
    stopReason: normStringOrNull(raw["stopReason"]),
    lastError: normStringOrNull(raw["lastError"]),
    batchAttempts:
      raw["batchAttempts"] !== null &&
      typeof raw["batchAttempts"] === "object" &&
      !Array.isArray(raw["batchAttempts"])
        ? (raw["batchAttempts"] as Record<string, number>)
        : {},
    lastReconciledAt: normIsoOrNull(raw["lastReconciledAt"]),
  };
}

/**
 * Strict normalisation of every StateEntry in the entries map.
 * Malformed field values are replaced with safe defaults; entries are never
 * dropped so the Reconciler always sees the full picture.
 */
function normalizeEntries(
  raw: Record<StateKey, StateEntry>
): Record<StateKey, StateEntry> {
  const now = new Date().toISOString();
  const normalised: Record<StateKey, StateEntry> = {};

  for (const [key, rawEntry] of Object.entries(raw)) {
    if (rawEntry === null || typeof rawEntry !== "object") {
      // Corrupt entry — insert a recoverable placeholder.
      normalised[key] = {
        batchId: key,
        recipientAddress: "",
        recipientIndex: 0,
        amount: "0",
        status: "planned",
        attemptNumber: 1,
        operatorId: null,
        operatorLabel: null,
        txHash: null,
        networkRef: null,
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
        finalizedAt: null,
        cooldownUntil: null,
        lastErrorCode: null,
        lastError: "entry was corrupt on load and has been reset",
        lastDecision: "none",
      };
      continue;
    }

    const e = rawEntry as unknown as Record<string, unknown>;

    const attemptRaw = Number(e["attemptNumber"]);
    const attemptNumber =
      Number.isInteger(attemptRaw) && attemptRaw >= 1 ? attemptRaw : 1;

    const recipientIndexRaw = Number(e["recipientIndex"]);
    const recipientIndex = Number.isFinite(recipientIndexRaw)
      ? Math.floor(recipientIndexRaw)
      : 0;

    const rawMetadata = e["metadata"];
    const metadata: Record<string, unknown> | undefined =
      rawMetadata !== null &&
      typeof rawMetadata === "object" &&
      !Array.isArray(rawMetadata)
        ? (rawMetadata as Record<string, unknown>)
        : undefined;

    const entry: StateEntry = {
      batchId: typeof e["batchId"] === "string" ? e["batchId"] : String(key),
      recipientAddress:
        typeof e["recipientAddress"] === "string" ? e["recipientAddress"] : "",
      recipientIndex,
      amount: typeof e["amount"] === "string" ? e["amount"] : "0",
      status: VALID_STATE_STATUSES.has(String(e["status"]))
        ? (e["status"] as StateStatus)
        : "planned",
      attemptNumber,
      operatorId: normStringOrNull(e["operatorId"]),
      operatorLabel: normStringOrNull(e["operatorLabel"]),
      txHash: normStringOrNull(e["txHash"]),
      networkRef: normStringOrNull(e["networkRef"]),
      createdAt: normIsoOrNow(e["createdAt"], now),
      updatedAt: normIsoOrNow(e["updatedAt"], now),
      submittedAt: normIsoOrNull(e["submittedAt"]),
      finalizedAt: normIsoOrNull(e["finalizedAt"]),
      cooldownUntil: normIsoOrNull(e["cooldownUntil"]),
      lastErrorCode: normStringOrNull(e["lastErrorCode"]),
      lastError: normStringOrNull(e["lastError"]),
      lastDecision: VALID_RETRY_DISPOSITIONS.has(String(e["lastDecision"]))
        ? (e["lastDecision"] as RetryDisposition)
        : "none",
    };

    if (metadata !== undefined) {
      entry.metadata = metadata;
    }

    normalised[key] = entry;
  }

  return normalised;
}

/**
 * Strict normalisation of every OperatorRuntimeState record.
 * No unsafe cast — every field validated individually.
 */
function normalizeOperators(
  raw: Record<string, OperatorRuntimeState>
): Record<string, OperatorRuntimeState> {
  const normalised: Record<string, OperatorRuntimeState> = {};

  for (const [id, rawOp] of Object.entries(raw)) {
    if (rawOp === null || typeof rawOp !== "object") {
      normalised[id] = emptyOperatorRuntime();
      continue;
    }

    const o = rawOp as unknown as Record<string, unknown>;

    const consecutiveRaw = Number(o["consecutiveFailures"]);
    const consecutiveFailures =
      Number.isInteger(consecutiveRaw) && consecutiveRaw >= 0
        ? consecutiveRaw
        : 0;

    normalised[id] = {
      status: VALID_OPERATOR_STATUSES.has(String(o["status"]))
        ? (o["status"] as OperatorStatus)
        : "active",
      paused: o["paused"] === true,
      cooldownUntil: normIsoOrNull(o["cooldownUntil"]),
      failedUntil: normIsoOrNull(o["failedUntil"]),
      consecutiveFailures,
      lastSelectedAt: normIsoOrNull(o["lastSelectedAt"]),
      lastSuccessAt: normIsoOrNull(o["lastSuccessAt"]),
      lastFailureAt: normIsoOrNull(o["lastFailureAt"]),
      lastError: normStringOrNull(o["lastError"]),
    };
  }

  return normalised;
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