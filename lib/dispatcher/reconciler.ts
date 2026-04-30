/**
 * @file lib/dispatcher/reconciler.ts
 * @description Reconciler — the integrity officer of the Identity & Mint engine.
 *
 * Responsibilities:
 *   1. Preflight Validation  — verifies token metadata correctness and
 *      cache-bust hygiene before any campaign begins.
 *   2. Campaign Reconciliation — detects and safely recovers "zombie" batches
 *      that are stuck in-flight with no terminal audit outcome.
 *   3. Execution Shaping     — enforces invariants that the Orchestrator relies
 *      on, so the dispatch loop never operates on inconsistent state.
 *
 * Integration surface:
 *   - lib/dispatcher/stateStore.ts  (RunState, StateEntry, StateStatus, loadState, saveStateAtomic)
 *   - AuditWriter interface         (defined and exported here for callers to implement)
 *
 * No external dependencies. Node.js built-ins only.
 */

import * as fs from "fs/promises";
import * as path from "path";

import {
  type RunState,
  type StateEntry,
  type StateStatus,
  loadState,
  saveStateAtomic,
  upsertEntry,
} from "./stateStore";

// ─── Zombie Detection Constants ───────────────────────────────────────────────

/** A batch is declared a zombie only after it has been in-flight this long. */
const ZOMBIE_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

// ─── Metadata Model ───────────────────────────────────────────────────────────

/** Required fields every token metadata file must contain. */
const REQUIRED_METADATA_FIELDS = [
  "name",
  "symbol",
  "description",
  "image",
  "decimals",
  "contentVersion",
] as const;

type RequiredMetadataField = (typeof REQUIRED_METADATA_FIELDS)[number];

/** Shape of a validated token metadata document. */
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  /** Asset URL — may be mutated by force-refresh to include a cache-bust param. */
  image: string;
  decimals: number;
  contentVersion: number | string;
  /** Injected by force-refresh protocol; absent in source files. */
  refreshToken?: string;
  /** Passthrough for any additional fields in the source file. */
  [key: string]: unknown;
}

// ─── Audit Writer Interface ───────────────────────────────────────────────────

/**
 * Terminal outcomes that the Reconciler considers definitive proof that a
 * batch has been handled, regardless of its current in-flight state label.
 */
export type AuditOutcome =
  | "success"
  | "hard_failure"
  | "cooldown"
  | "skipped"
  | "cancelled";

/** A single structured entry in the operational audit log. */
export interface AuditLogEntry {
  batchId: string;
  recipientAddress: string;
  outcome: AuditOutcome;
  /** ISO 8601 timestamp of when the outcome was recorded. */
  recordedAt: string;
  txHash?: string;
  detail?: string;
}

/**
 * Minimal interface the Reconciler requires from any audit writer implementation.
 *
 * The Orchestrator is expected to inject a concrete implementation when
 * constructing the Reconciler.
 */
export interface AuditWriter {
  /**
   * Returns all audit log entries for the given campaign that carry a terminal
   * outcome. Only entries with `outcome` in {@link AuditOutcome} are relevant.
   */
  readTerminalEntries(campaignId: string): Promise<AuditLogEntry[]>;
}

// ─── Reconciler Interface ─────────────────────────────────────────────────────

export interface Reconciler {
  /**
   * Performs a full Integrity Check for the given campaign:
   *   - Loads current run state.
   *   - Identifies zombie in-flight batches (no terminal audit entry, timed out).
   *   - Safely resets zombie entries to "planned" for re-processing.
   *
   * @param input.campaignId - Campaign to reconcile.
   * @param input.now        - Optional epoch ms override (useful in tests).
   */
  reconcileCampaign(input: {
    campaignId: string;
    now?: number;
  }): Promise<void>;

  /**
   * Executes Preflight Validation for a token metadata file:
   *   - Loads and validates all required metadata fields.
   *   - When `requireForceRefresh` is true, appends a version query parameter
   *     to the image URL to force cache-busting across indexers and UIs.
   *
   * @returns The validated (and potentially mutated) {@link TokenMetadata}.
   */
  verifyMetadataPreflight(input: {
    metadataFilePath: string;
    requireForceRefresh?: boolean;
  }): Promise<TokenMetadata>;
}

// ─── ReconcilerConfig ─────────────────────────────────────────────────────────

export interface ReconcilerConfig {
  /**
   * Absolute or CWD-relative path to the directory that holds run-state JSON
   * files. One file per campaign: `<stateDir>/<campaignId>.state.json`.
   */
  stateDir: string;
  /** Injected audit writer — no direct file IO is done by the Reconciler. */
  auditWriter: AuditWriter;
  /**
   * Optional logger. When absent, structured messages are written to stdout
   * via `console.log` / `console.warn` / `console.error`.
   */
  logger?: ReconcilerLogger;
  /**
   * Override for the zombie timeout in milliseconds.
   * Defaults to {@link ZOMBIE_TIMEOUT_MS} (5 minutes).
   */
  zombieTimeoutMs?: number;
}

export interface ReconcilerLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ─── DefaultReconciler Implementation ────────────────────────────────────────

/**
 * Production implementation of the {@link Reconciler} interface.
 *
 * Construct via {@link createReconciler} rather than `new DefaultReconciler()`
 * to keep the module surface functional and tree-shakeable.
 */
class DefaultReconciler implements Reconciler {
  private readonly stateDir: string;
  private readonly auditWriter: AuditWriter;
  private readonly logger: ReconcilerLogger;
  private readonly zombieTimeoutMs: number;

  constructor(config: ReconcilerConfig) {
    validateConfig(config);
    this.stateDir = path.resolve(config.stateDir);
    this.auditWriter = config.auditWriter;
    this.zombieTimeoutMs = config.zombieTimeoutMs ?? ZOMBIE_TIMEOUT_MS;
    this.logger = config.logger ?? buildConsoleLogger();
  }

  // ── reconcileCampaign ──────────────────────────────────────────────────────

  async reconcileCampaign(input: {
    campaignId: string;
    now?: number;
  }): Promise<void> {
    const { campaignId, now: nowOverride } = input;

    assertNonEmptyString(campaignId, "reconcileCampaign.campaignId");

    const now = nowOverride ?? Date.now();
    const statePath = this.resolveStatePath(campaignId);

    this.logger.info("[Reconciler] Integrity Check started", { campaignId, statePath });

    // ── 1. Load current state ─────────────────────────────────────────────
    let state: RunState;
    try {
      state = await loadState(statePath, campaignId);
    } catch (err: unknown) {
      throw new ReconcilerError(
        `[Reconciler] Integrity Check failed: cannot load state for campaign "${campaignId}". ` +
          `Cause: ${errorMessage(err)}`,
        "STATE_LOAD_FAILURE"
      );
    }

    // ── 2. Fetch terminal audit entries ───────────────────────────────────
    let terminalEntries: AuditLogEntry[];
    try {
      terminalEntries = await this.auditWriter.readTerminalEntries(campaignId);
    } catch (err: unknown) {
      throw new ReconcilerError(
        `[Reconciler] Integrity Check failed: cannot read audit log for campaign "${campaignId}". ` +
          `Cause: ${errorMessage(err)}`,
        "AUDIT_READ_FAILURE"
      );
    }

    // Build a fast-lookup set: "<batchId>:<recipientAddress>" → true
    const resolvedKeys = buildResolvedKeySet(terminalEntries);

    // ── 3. Detect zombie entries ──────────────────────────────────────────
    const zombieKeys = detectZombies(state, resolvedKeys, now, this.zombieTimeoutMs);

    if (zombieKeys.length === 0) {
      this.logger.info("[Reconciler] Integrity Check complete — no zombies detected", {
        campaignId,
        totalEntries: Object.keys(state.entries).length,
      });
      return;
    }

    this.logger.warn("[Reconciler] Zombie batches detected — initiating Safe Recovery", {
      campaignId,
      zombieCount: zombieKeys.length,
      zombieKeys,
    });

    // ── 4. Safe Recovery: reset zombies to "planned" ──────────────────────
    let recovered = state;
    const recoveryTimestamp = new Date(now).toISOString();

    for (const key of zombieKeys) {
      const existing = recovered.entries[key];
      if (existing === undefined) continue; // should never happen, but guard

      const reset: StateEntry = {
        ...existing,
        status: "planned" as StateStatus,
        updatedAt: recoveryTimestamp,
      };

      recovered = upsertEntry(recovered, key, reset);

      this.logger.info("[Reconciler] Safe Recovery: entry reset to planned", {
        campaignId,
        key,
        previousUpdatedAt: existing.updatedAt,
      });
    }

    // ── 5. Persist recovered state atomically ─────────────────────────────
    try {
      await saveStateAtomic(statePath, recovered);
    } catch (err: unknown) {
      throw new ReconcilerError(
        `[Reconciler] Safe Recovery failed during atomic state save for campaign "${campaignId}". ` +
          `Cause: ${errorMessage(err)}`,
        "STATE_SAVE_FAILURE"
      );
    }

    this.logger.info("[Reconciler] Safe Recovery complete", {
      campaignId,
      zombiesRecovered: zombieKeys.length,
    });
  }

  // ── verifyMetadataPreflight ────────────────────────────────────────────────

  async verifyMetadataPreflight(input: {
    metadataFilePath: string;
    requireForceRefresh?: boolean;
  }): Promise<TokenMetadata> {
    const { metadataFilePath, requireForceRefresh = false } = input;

    assertNonEmptyString(metadataFilePath, "verifyMetadataPreflight.metadataFilePath");

    const absolutePath = path.resolve(metadataFilePath);

    this.logger.info("[Reconciler] Preflight Validation started", {
      metadataFilePath: absolutePath,
      requireForceRefresh,
    });

    // ── 1. Load file ──────────────────────────────────────────────────────
    let raw: string;
    try {
      raw = await fs.readFile(absolutePath, "utf8");
    } catch (err: unknown) {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: cannot read metadata file ` +
          `at "${absolutePath}". Cause: ${errorMessage(err)}`,
        "METADATA_FILE_READ_FAILURE"
      );
    }

    // ── 2. Parse JSON safely ──────────────────────────────────────────────
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(raw);
    } catch (err: unknown) {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: metadata file at ` +
          `"${absolutePath}" contains invalid JSON. Cause: ${errorMessage(err)}`,
        "METADATA_JSON_PARSE_FAILURE"
      );
    }

    // Explicit cast — validation below guards every required field.
    if (parsedRaw === null || typeof parsedRaw !== "object" || Array.isArray(parsedRaw)) {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: metadata file at ` +
          `"${absolutePath}" must contain a JSON object at root level.`,
        "METADATA_SHAPE_INVALID"
      );
    }

    const parsed = parsedRaw as Record<string, unknown>;

    // ── 3. Validate required fields ───────────────────────────────────────
    validateMetadataFields(parsed, absolutePath);

    // Safe coercions — validateMetadataFields guarantees presence and type.
    const metadata: TokenMetadata = {
      ...parsed,
      name: parsed["name"] as string,
      symbol: parsed["symbol"] as string,
      description: parsed["description"] as string,
      image: parsed["image"] as string,
      decimals: parsed["decimals"] as number,
      contentVersion: parsed["contentVersion"] as number | string,
    };

    // ── 4. Force Refresh Protocol ─────────────────────────────────────────
    if (requireForceRefresh) {
      metadata.image = applyForceRefresh(metadata, absolutePath);
      this.logger.info("[Reconciler] Force Refresh Protocol applied", {
        updatedImageUrl: metadata.image,
        contentVersion: String(metadata.contentVersion),
      });
    }

    this.logger.info("[Reconciler] Preflight Validation passed", {
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      contentVersion: String(metadata.contentVersion),
      requireForceRefresh,
    });

    return metadata;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private resolveStatePath(campaignId: string): string {
    return path.join(this.stateDir, `${campaignId}.state.json`);
  }
}

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Creates a fully configured {@link Reconciler} instance.
 * Prefer this over direct instantiation to keep call-sites decoupled from the
 * concrete class name.
 */
export function createReconciler(config: ReconcilerConfig): Reconciler {
  return new DefaultReconciler(config);
}

// ─── ReconcilerError ──────────────────────────────────────────────────────────

/** Error codes emitted by the Reconciler. Safe to log without redaction. */
export type ReconcilerErrorCode =
  | "STATE_LOAD_FAILURE"
  | "STATE_SAVE_FAILURE"
  | "AUDIT_READ_FAILURE"
  | "METADATA_FILE_READ_FAILURE"
  | "METADATA_JSON_PARSE_FAILURE"
  | "METADATA_SHAPE_INVALID"
  | "METADATA_FIELD_MISSING"
  | "METADATA_FIELD_TYPE_INVALID"
  | "FORCE_REFRESH_TOKEN_MISSING"
  | "CONFIG_INVALID";

export class ReconcilerError extends Error {
  public readonly code: ReconcilerErrorCode;

  constructor(message: string, code: ReconcilerErrorCode) {
    super(message);
    this.name = "ReconcilerError";
    this.code = code;
    // Restore prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Zombie Detection Logic ───────────────────────────────────────────────────

/**
 * Builds a lookup set from terminal audit entries.
 * Key format: `<batchId>:<recipientAddress>` — mirrors the state key prefix
 * used by makeStateKey so we can match without re-parsing state key components.
 */
function buildResolvedKeySet(entries: AuditLogEntry[]): Set<string> {
  const resolved = new Set<string>();
  for (const entry of entries) {
    resolved.add(`${entry.batchId}:${entry.recipientAddress}`);
  }
  return resolved;
}

/**
 * Scans all state entries and returns keys that are:
 *   1. Currently in "submitted" status (the in-flight marker), AND
 *   2. Have no corresponding terminal audit entry, AND
 *   3. Have been in that state for longer than `zombieTimeoutMs`.
 */
function detectZombies(
  state: RunState,
  resolvedKeys: Set<string>,
  now: number,
  zombieTimeoutMs: number
): string[] {
  const zombies: string[] = [];

  for (const [key, entry] of Object.entries(state.entries)) {
    if (entry.status !== "submitted") continue;

    // Has a terminal audit record — not a zombie.
    const auditKey = `${entry.batchId}:${entry.recipientAddress}`;
    if (resolvedKeys.has(auditKey)) continue;

    // Only declare zombie after the safety timeout has elapsed.
    const updatedAtMs = Date.parse(entry.updatedAt);
    if (isNaN(updatedAtMs)) {
      // Unparseable timestamp: treat as ancient — safe to recover.
      zombies.push(key);
      continue;
    }

    const ageMs = now - updatedAtMs;
    if (ageMs > zombieTimeoutMs) {
      zombies.push(key);
    }
  }

  return zombies;
}

// ─── Metadata Validation ──────────────────────────────────────────────────────

/**
 * Validates that every required metadata field is present and has the expected
 * primitive type. Throws a descriptive {@link ReconcilerError} on the first
 * violation encountered.
 */
function validateMetadataFields(
  parsed: Record<string, unknown>,
  source: string
): void {
  const fieldTypeMap: Record<RequiredMetadataField, "string" | "number"> = {
    name: "string",
    symbol: "string",
    description: "string",
    image: "string",
    decimals: "number",
    contentVersion: "number", // string is also accepted — see below
  };

  for (const field of REQUIRED_METADATA_FIELDS) {
    const value = parsed[field];

    if (value === undefined || value === null) {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: required field "${field}" is ` +
          `missing in metadata file "${source}".`,
        "METADATA_FIELD_MISSING"
      );
    }

    // contentVersion accepts number OR non-empty string (semver-style tokens).
    if (field === "contentVersion") {
      if (typeof value !== "number" && typeof value !== "string") {
        throw new ReconcilerError(
          `[Reconciler] Preflight Validation failed: field "contentVersion" must be ` +
            `a number or string in metadata file "${source}". Got: ${typeLabel(value)}.`,
          "METADATA_FIELD_TYPE_INVALID"
        );
      }
      if (typeof value === "string" && value.trim() === "") {
        throw new ReconcilerError(
          `[Reconciler] Preflight Validation failed: field "contentVersion" must not ` +
            `be an empty string in metadata file "${source}".`,
          "METADATA_FIELD_TYPE_INVALID"
        );
      }
      continue;
    }

    const expectedType = fieldTypeMap[field];
    if (typeof value !== expectedType) {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: field "${field}" must be a ` +
          `${expectedType} in metadata file "${source}". Got: ${typeLabel(value)}.`,
        "METADATA_FIELD_TYPE_INVALID"
      );
    }

    // String fields must not be empty.
    if (expectedType === "string" && (value as string).trim() === "") {
      throw new ReconcilerError(
        `[Reconciler] Preflight Validation failed: field "${field}" must not be ` +
          `an empty string in metadata file "${source}".`,
        "METADATA_FIELD_TYPE_INVALID"
      );
    }

    // decimals must be a non-negative integer.
    if (field === "decimals") {
      const n = value as number;
      if (!Number.isInteger(n) || n < 0) {
        throw new ReconcilerError(
          `[Reconciler] Preflight Validation failed: field "decimals" must be a ` +
            `non-negative integer in metadata file "${source}". Got: ${n}.`,
          "METADATA_FIELD_TYPE_INVALID"
        );
      }
    }
  }
}

// ─── Force Refresh Protocol ───────────────────────────────────────────────────

/**
 * Applies the Force Refresh Protocol to the metadata image URL.
 *
 * Strategy:
 *   1. Prefer `metadata.refreshToken` as the version identifier.
 *   2. Fall back to `String(metadata.contentVersion)` if refreshToken is absent.
 *   3. Append `?v=<token>` (or replace an existing `v` parameter) to the URL.
 *
 * This ensures downstream indexers and UI wallets invalidate their cached
 * token logo when the content changes.
 */
function applyForceRefresh(metadata: TokenMetadata, source: string): string {
  // Resolve version token: prefer explicit refreshToken, fall back to contentVersion.
  const versionToken: string =
    typeof metadata.refreshToken === "string" && metadata.refreshToken.trim() !== ""
      ? metadata.refreshToken.trim()
      : String(metadata.contentVersion).trim();

  if (versionToken === "") {
    throw new ReconcilerError(
      `[Reconciler] Force Refresh Protocol: no usable version token found in ` +
        `metadata file "${source}". Neither "refreshToken" nor "contentVersion" ` +
        `produced a non-empty string. Aborting to prevent stale asset propagation.`,
      "FORCE_REFRESH_TOKEN_MISSING"
    );
  }

  return appendVersionParam(metadata.image, versionToken);
}

/**
 * Appends or replaces the `v` query parameter on a URL string.
 * Falls back to simple string concatenation when the URL cannot be parsed
 * (e.g., IPFS `ipfs://` schemes), so the function never throws on exotic URLs.
 */
function appendVersionParam(imageUrl: string, version: string): string {
  try {
    // Use a placeholder base so relative URLs can be parsed too.
    const base = imageUrl.startsWith("http") ? imageUrl : `https://placeholder/${imageUrl}`;
    const url = new URL(base);
    url.searchParams.set("v", version);

    if (imageUrl.startsWith("http")) {
      return url.toString();
    }
    // Reconstruct non-http URLs: preserve original scheme prefix.
    const schemeEnd = imageUrl.indexOf("://");
    if (schemeEnd !== -1) {
      const scheme = imageUrl.slice(0, schemeEnd + 3);
      const rest = url.pathname + url.search;
      return `${scheme}${rest.replace(/^\/placeholder/, "")}`;
    }
    // Final fallback: naive append.
    return imageUrl.includes("?")
      ? `${imageUrl}&v=${encodeURIComponent(version)}`
      : `${imageUrl}?v=${encodeURIComponent(version)}`;
  } catch {
    // URL parse failed — use naive append rather than crashing.
    return imageUrl.includes("?")
      ? `${imageUrl}&v=${encodeURIComponent(version)}`
      : `${imageUrl}?v=${encodeURIComponent(version)}`;
  }
}

// ─── Config Validation ────────────────────────────────────────────────────────

function validateConfig(config: ReconcilerConfig): void {
  if (!config || typeof config !== "object") {
    throw new ReconcilerError(
      "[Reconciler] Configuration must be a non-null object.",
      "CONFIG_INVALID"
    );
  }
  if (typeof config.stateDir !== "string" || config.stateDir.trim() === "") {
    throw new ReconcilerError(
      '[Reconciler] Configuration field "stateDir" must be a non-empty string.',
      "CONFIG_INVALID"
    );
  }
  if (
    !config.auditWriter ||
    typeof config.auditWriter !== "object" ||
    typeof config.auditWriter.readTerminalEntries !== "function"
  ) {
    throw new ReconcilerError(
      '[Reconciler] Configuration field "auditWriter" must implement AuditWriter ' +
        "(readTerminalEntries: (campaignId: string) => Promise<AuditLogEntry[]>).",
      "CONFIG_INVALID"
    );
  }
  if (
    config.zombieTimeoutMs !== undefined &&
    (!Number.isFinite(config.zombieTimeoutMs) || config.zombieTimeoutMs <= 0)
  ) {
    throw new ReconcilerError(
      '[Reconciler] Configuration field "zombieTimeoutMs" must be a positive finite number.',
      "CONFIG_INVALID"
    );
  }
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function assertNonEmptyString(value: unknown, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReconcilerError(
      `[Reconciler] "${fieldName}" must be a non-empty string. Got: ${typeLabel(value)}.`,
      "CONFIG_INVALID"
    );
  }
}

function typeLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildConsoleLogger(): ReconcilerLogger {
  return {
    info: (msg, meta) =>
      console.log(
        JSON.stringify({ level: "info", msg, ...(meta ?? {}), ts: new Date().toISOString() })
      ),
    warn: (msg, meta) =>
      console.warn(
        JSON.stringify({ level: "warn", msg, ...(meta ?? {}), ts: new Date().toISOString() })
      ),
    error: (msg, meta) =>
      console.error(
        JSON.stringify({ level: "error", msg, ...(meta ?? {}), ts: new Date().toISOString() })
      ),
  };
}