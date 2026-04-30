/**
 * @file lib/dispatcher/walletPool.ts
 * @description WalletPool - operator lifecycle manager for the Identity & Mint engine.
 * Stage A: Hook & Lock stabilization.
 *
 * Loads static operator config from data/operators.json (root array format).
 * Mnemonics are loaded from environment variables only - never from JSON.
 * All persisted runtime timestamps are ISO strings.
 *
 * Runtime operator state is held in RunState.operators via the injected
 * AtomicStateStore. The pool does NOT maintain its own conflicting truth.
 * The _runtimeSnapshot is a write-through mirror only; the stateStore is
 * the durable truth.
 *
 * Patch notes:
 *   2C: RunState imported; _persistRuntime draft explicitly typed as RunState.
 *   2D: All persisted times are ISO strings; numeric now only used at boundary.
 */

import * as fs from "fs/promises";
import * as path from "path";

import {
  type AtomicStateStore,
  type RunState,
  type OperatorRuntimeState,
  type ISO8601,
} from "./stateStore";

// --- Operator static config (mirrors data/operators.json) --------------------

export interface OperatorConfig {
  id: string;
  label: string;
  enabled: boolean;
  envMnemonicKey: string;
  walletVersion: string;
  subwalletNumber: number;
  minTonReserve: string;
  maxBatchSize: number;
  maxTxPerHour: number;
  notes?: string;
}

// --- Provider shape (returned to dispatcher) ---------------------------------

export interface Provider {
  id: string;
  label: string;
  mnemonic: string;
  walletVersion: string;
  subwalletNumber: number;
  minTonReserve: string;
  maxBatchSize: number;
  maxTxPerHour: number;
  notes?: string;
}

// --- Failure info shape ------------------------------------------------------

export interface ProviderFailureInfo {
  reason: string;
  cooldownUntil?: string | null;
  failedUntil?: string | null;
  now: number;
}

// --- WalletPool interface ----------------------------------------------------

export interface WalletPool {
  /** Returns the next available provider, or null if none are currently eligible. */
  getNextAvailableProvider(now: number): Provider | null;
  markSuccess(operatorId: string, nowMs: number): void;
  markFailure(operatorId: string, info: ProviderFailureInfo): void;
}

// --- WalletPoolConfig --------------------------------------------------------

export interface WalletPoolConfig {
  /**
   * Absolute or CWD-relative path to data/operators.json.
   * Must be a root-array of OperatorConfig objects.
   */
  operatorsFilePath: string;
  /**
   * Injected AtomicStateStore. Runtime operator state is read and written
   * here exclusively.
   */
  stateStore: AtomicStateStore;
}

// --- DefaultWalletPool -------------------------------------------------------

class DefaultWalletPool implements WalletPool {
  /**
   * Eligible operator configs (enabled, mnemonic resolved).
   * Order is stable for round-robin selection.
   */
  private readonly eligible: Array<OperatorConfig & { mnemonic: string }>;

  /** Full map including disabled operators (for error reporting). */
  private readonly allById: Map<string, OperatorConfig & { mnemonic: string | null }>;

  private readonly stateStore: AtomicStateStore;

  /** In-memory round-robin cursor. Not persisted. */
  private rrIndex = 0;

  /**
   * Write-through in-memory mirror of RunState.operators.
   * Used for synchronous availability checks in getNextAvailableProvider.
   * The durable source of truth remains the stateStore.
   */
  private readonly _runtimeSnapshot = new Map<string, OperatorRuntimeState>();

  constructor(
    eligible: Array<OperatorConfig & { mnemonic: string }>,
    allById: Map<string, OperatorConfig & { mnemonic: string | null }>,
    stateStore: AtomicStateStore
  ) {
    this.eligible = eligible;
    this.allById = allById;
    this.stateStore = stateStore;
  }

  // --- getNextAvailableProvider ----------------------------------------------

  /**
   * Returns the next available provider using fair round-robin selection.
   *
   * Availability requires all of:
   *   1. Operator is enabled and mnemonic is present (static config).
   *   2. Runtime paused !== true.
   *   3. Runtime failedUntil is null or its timestamp has passed.
   *   4. Runtime cooldownUntil is null or its timestamp has passed.
   *
   * Returns null if no eligible operator passes all checks.
   */
  getNextAvailableProvider(now: number): Provider | null {
    if (this.eligible.length === 0) return null;

    const n = this.eligible.length;

    for (let attempt = 0; attempt < n; attempt++) {
      const idx = (this.rrIndex + attempt) % n;
      const op = this.eligible[idx]!;
      const runtime = this._runtimeSnapshot.get(op.id);

      if (runtime !== undefined) {
        if (runtime.paused) continue;

        if (
          runtime.failedUntil !== null &&
          new Date(runtime.failedUntil).getTime() > now
        ) {
          continue;
        }

        if (
          runtime.cooldownUntil !== null &&
          new Date(runtime.cooldownUntil).getTime() > now
        ) {
          continue;
        }
      }

      this.rrIndex = (idx + 1) % n;

      // 2F: persist lastSelectedAt as ISO string through stateStore on every selection.
      const selectedAt: ISO8601 = new Date(now).toISOString();
      this._mutateSnapshot(op.id, (r) => {
        r.lastSelectedAt = selectedAt;
      });
      void this._persistRuntime();

      return {
        id: op.id,
        label: op.label,
        mnemonic: op.mnemonic,
        walletVersion: op.walletVersion,
        subwalletNumber: op.subwalletNumber,
        minTonReserve: op.minTonReserve,
        maxBatchSize: op.maxBatchSize,
        maxTxPerHour: op.maxTxPerHour,
        notes: op.notes,
      };
    }

    return null;
  }

  // --- markSuccess ----------------------------------------------------------

  /**
   * 2F: On success:
   *   - status -> "active"
   *   - clear cooldownUntil and failedUntil
   *   - consecutiveFailures -> 0
   *   - lastSuccessAt = ISO(nowMs)
   */
  markSuccess(operatorId: string, nowMs: number): void {
    const lastSuccessAt: ISO8601 = new Date(nowMs).toISOString();

    this._mutateSnapshot(operatorId, (op) => {
      op.status = "active";
      op.cooldownUntil = null;
      op.failedUntil = null;
      op.consecutiveFailures = 0;
      op.lastSuccessAt = lastSuccessAt;
      op.lastSelectedAt = lastSuccessAt;
    });

    void this._persistRuntime();
  }

  // --- markFailure ----------------------------------------------------------

  /**
   * 2G: On failure:
   *   - increment consecutiveFailures
   *   - set lastFailureAt = ISO(now)
   *   - set lastError = reason
   *   - if failedUntil is future -> status "failed"
   *   - else if cooldownUntil is future -> status "cooldown"
   *   - else -> status "failed"
   *
   * 2D: Only ISO strings are persisted. Numeric now is only the boundary input.
   */
  markFailure(operatorId: string, info: ProviderFailureInfo): void {
    const { reason, cooldownUntil, failedUntil, now } = info;
    const lastFailureAt: ISO8601 = new Date(now).toISOString();

    const failedUntilIso: ISO8601 | null =
      failedUntil != null && failedUntil.trim() !== "" ? failedUntil : null;
    const cooldownUntilIso: ISO8601 | null =
      cooldownUntil != null && cooldownUntil.trim() !== "" ? cooldownUntil : null;

    const isFailedFuture =
      failedUntilIso !== null && new Date(failedUntilIso).getTime() > now;
    const isCooldownFuture =
      cooldownUntilIso !== null && new Date(cooldownUntilIso).getTime() > now;

    let newStatus: OperatorRuntimeState["status"];
    if (isFailedFuture) {
      newStatus = "failed";
    } else if (isCooldownFuture) {
      newStatus = "cooldown";
    } else {
      newStatus = "failed";
    }

    this._mutateSnapshot(operatorId, (op) => {
      op.status = newStatus;
      op.consecutiveFailures += 1;
      op.lastFailureAt = lastFailureAt;
      op.lastError = reason;
      op.failedUntil = isFailedFuture ? failedUntilIso : null;
      op.cooldownUntil = isCooldownFuture && !isFailedFuture ? cooldownUntilIso : null;
    });

    void this._persistRuntime();
  }

  // --- Internal helpers -----------------------------------------------------

  private _mutateSnapshot(
    operatorId: string,
    mutator: (op: OperatorRuntimeState) => void
  ): void {
    const current = this._runtimeSnapshot.get(operatorId) ?? emptyRuntime();
    mutator(current);
    this._runtimeSnapshot.set(operatorId, current);
  }

  /**
   * Persists the in-memory snapshot into RunState.operators via the stateStore.
   * Fire-and-forget from the caller's perspective; errors are swallowed since
   * the snapshot remains consistent in-process.
   *
   * 2C: draft is explicitly typed as RunState (patch 1B alignment).
   */
  private async _persistRuntime(): Promise<void> {
    const snapshot = new Map(this._runtimeSnapshot);
    await this.stateStore.update((draft: RunState) => {
      for (const [id, runtime] of snapshot) {
        draft.operators[id] = runtime;
      }
    });
  }

  /**
   * Seeds the in-memory snapshot from whatever runtime state is already in the
   * store. Called once by the factory before returning the pool.
   */
  async _loadRuntimeSnapshot(): Promise<void> {
    const state = await this.stateStore.read();
    for (const [id, runtime] of Object.entries(state.operators)) {
      this._runtimeSnapshot.set(id, runtime);
    }
    for (const op of this.eligible) {
      if (!this._runtimeSnapshot.has(op.id)) {
        this._runtimeSnapshot.set(op.id, emptyRuntime());
      }
    }
  }
}

// --- Factory -----------------------------------------------------------------

/**
 * Loads operators from config.operatorsFilePath (root-array format),
 * validates static config, resolves mnemonics from environment, then returns
 * a ready-to-use WalletPool with its runtime snapshot seeded from the store.
 *
 * 2H: Throws if any enabled operator is missing its mnemonic in .env.
 */
export async function createWalletPool(config: WalletPoolConfig): Promise<WalletPool> {
  const absPath = path.resolve(config.operatorsFilePath);
  const operators = await loadOperatorsJson(absPath);

  for (const op of operators) {
    validateOperatorConfig(op, absPath);
  }

  const allById = new Map<string, OperatorConfig & { mnemonic: string | null }>();
  const eligible: Array<OperatorConfig & { mnemonic: string }> = [];

  for (const op of operators) {
    const mnemonic = resolveOperatorMnemonic(op);
    allById.set(op.id, { ...op, mnemonic });

    if (!op.enabled) continue;

    if (mnemonic === null) {
      throw new WalletPoolError(
        `[WalletPool] Operator "${op.id}" is enabled but its mnemonic key ` +
          `"${op.envMnemonicKey}" is not set in the environment. ` +
          `Either set the variable or disable this operator in operators.json.`,
        "MNEMONIC_MISSING"
      );
    }

    eligible.push({ ...op, mnemonic });
  }

  if (eligible.length === 0) {
    throw new WalletPoolError(
      "[WalletPool] No enabled operators with resolved mnemonics were found. " +
        "At least one operator must be enabled and have its mnemonic set.",
      "NO_ELIGIBLE_OPERATORS"
    );
  }

  const pool = new DefaultWalletPool(eligible, allById, config.stateStore);
  await pool._loadRuntimeSnapshot();
  return pool;
}

// --- WalletPoolError ---------------------------------------------------------

export type WalletPoolErrorCode =
  | "JSON_INVALID"
  | "JSON_NOT_ARRAY"
  | "OPERATOR_INVALID"
  | "MNEMONIC_MISSING"
  | "NO_ELIGIBLE_OPERATORS";

export class WalletPoolError extends Error {
  public readonly code: WalletPoolErrorCode;
  constructor(message: string, code: WalletPoolErrorCode) {
    super(message);
    this.name = "WalletPoolError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// --- Operators JSON Loader ---------------------------------------------------

async function loadOperatorsJson(absPath: string): Promise<OperatorConfig[]> {
  let raw: string;
  try {
    raw = await fs.readFile(absPath, "utf8");
  } catch (err: unknown) {
    throw new WalletPoolError(
      `[WalletPool] Cannot read operators file at "${absPath}": ${errorMessage(err)}`,
      "JSON_INVALID"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new WalletPoolError(
      `[WalletPool] operators.json at "${absPath}" contains invalid JSON: ${errorMessage(err)}`,
      "JSON_INVALID"
    );
  }

  if (!Array.isArray(parsed)) {
    throw new WalletPoolError(
      `[WalletPool] operators.json at "${absPath}" must be a root JSON array of operator objects. Got: ${typeof parsed}.`,
      "JSON_NOT_ARRAY"
    );
  }

  return parsed as OperatorConfig[];
}

// --- Static Config Validation ------------------------------------------------

function validateOperatorConfig(op: unknown, source: string): void {
  if (op === null || typeof op !== "object" || Array.isArray(op)) {
    throw new WalletPoolError(
      `[WalletPool] Each entry in "${source}" must be an object. Got: ${typeof op}.`,
      "OPERATOR_INVALID"
    );
  }

  const o = op as Record<string, unknown>;

  requireString(o, "id", source);
  requireString(o, "label", source);
  requireString(o, "envMnemonicKey", source);
  requireString(o, "walletVersion", source);
  requireString(o, "minTonReserve", source);

  if (typeof o["enabled"] !== "boolean") {
    throw new WalletPoolError(
      `[WalletPool] Operator "${String(o["id"])}" in "${source}" must have a boolean "enabled" field.`,
      "OPERATOR_INVALID"
    );
  }

  requirePositiveInteger(o, "maxBatchSize", source);
  requirePositiveInteger(o, "maxTxPerHour", source);

  const sub = Number(o["subwalletNumber"]);
  if (!Number.isInteger(sub) || sub < 0) {
    throw new WalletPoolError(
      `[WalletPool] Operator "${String(o["id"])}" in "${source}" must have a non-negative integer "subwalletNumber". Got: ${String(o["subwalletNumber"])}.`,
      "OPERATOR_INVALID"
    );
  }
}

function requireString(o: Record<string, unknown>, field: string, source: string): void {
  if (typeof o[field] !== "string" || (o[field] as string).trim() === "") {
    throw new WalletPoolError(
      `[WalletPool] Operator "${String(o["id"] ?? "?")} in "${source}" must have a non-empty string "${field}". Got: ${JSON.stringify(o[field])}.`,
      "OPERATOR_INVALID"
    );
  }
}

function requirePositiveInteger(o: Record<string, unknown>, field: string, source: string): void {
  const v = Number(o[field]);
  if (!Number.isInteger(v) || v <= 0) {
    throw new WalletPoolError(
      `[WalletPool] Operator "${String(o["id"] ?? "?")} in "${source}" must have a positive integer "${field}". Got: ${String(o[field])}.`,
      "OPERATOR_INVALID"
    );
  }
}

// --- Mnemonic Resolution -----------------------------------------------------

function resolveOperatorMnemonic(op: OperatorConfig): string | null {
  const raw = process.env[op.envMnemonicKey];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  return raw.trim();
}

// --- Runtime Helpers ---------------------------------------------------------

function emptyRuntime(): OperatorRuntimeState {
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}