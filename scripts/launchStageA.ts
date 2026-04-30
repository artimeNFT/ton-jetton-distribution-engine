/**
 * @file scripts/launchStageA.ts
 * @description Stage A Composition Root — Identity & Mint engine launcher.
 *
 * Wires all verified runtime dependencies and invokes the Dispatcher.
 * Live-chain execution is intentionally blocked at this stage; only DRY_RUN=true
 * is supported. Set DRY_RUN=false only after a live MintExecutor is implemented.
 *
 * Environment variables consumed:
 *   CAMPAIGN_ID        — required; stable identifier for this distribution run
 *   DRY_RUN            — optional; defaults to "true" (any value != "false" is treated as true)
 *   TARGETS_PATH       — required; absolute or CWD-relative path to targets.json
 *   STATE_PATH         — required; absolute or CWD-relative path to the state file
 *                        (stateDir is derived from dirname of this path)
 *   REPORT_DIR         — required; directory where audit CSV files are written
 *   METADATA_FILE_PATH — optional; defaults to ./data/token-metadata.json
 *   BATCH_SIZE         — optional; positive integer; falls back to the first enabled
 *                        operator's maxBatchSize from operators.json
 *   ENTRY_DELAY_MS     — optional; non-negative integer; per-entry pacing delay passed
 *                        to the Dispatcher (overrides any compiled-in default)
 *   BATCH_DELAY_MS     — optional; non-negative integer; inter-batch pacing delay passed
 *                        to the Dispatcher (overrides any compiled-in default)
 */

import * as path from "path";
import * as fs from "fs/promises";

import * as dotenv from "dotenv";

// Verified factory / class imports — matched exactly against the export inventory.
import {
  createDispatcher,
  type CampaignConfig,
  type AuditRecorder,
  type AuditRecordEvent,
  type MintExecutor,
  type BroadcastParams,
  type BroadcastResult,
  type DispatchReport,
} from "../lib/dispatcher/dispatcher";

import {
  createWalletPool,
  type WalletPoolConfig,
  type OperatorConfig,
} from "../lib/dispatcher/walletPool";

import {
  createReconciler,
  type AuditWriter,
  type AuditLogEntry,
} from "../lib/dispatcher/reconciler";

import { DefaultRetryPolicy } from "../lib/dispatcher/retryPolicy";
import { DefaultMatchingEngine }  from "../lib/matchingEngine";
import { JsonAtomicStateStore }   from "../lib/dispatcher/stateStore";

import {
  appendAuditRow,
  buildAuditFilePath,
  type AuditWriterOptions,
  type AuditRow,
} from "../lib/dispatcher/auditWriter";

// Blueprint NetworkProvider — required by the TON compile convention.
// COMPILE RISK: only present when @ton/blueprint is installed.
import type { NetworkProvider } from "@ton/blueprint";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

dotenv.config();

// ─── Environment Helpers ──────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(
      `[launchStageA] Required environment variable "${name}" is not set or is empty.`
    );
  }
  return v.trim();
}

function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

/**
 * Reads an optional environment variable as a non-negative integer.
 *
 * Returns:
 *   - `undefined`  when the variable is absent or empty.
 *   - The parsed integer when the value is a valid non-negative integer string.
 *
 * Throws a descriptive error when the variable is present but not a
 * non-negative integer (e.g. negative, float, or non-numeric string).
 */
function optionalNonNegativeIntEnv(name: string): number | undefined {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim() === "") {
    return undefined;
  }
  const trimmed = v.trim();
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `[launchStageA] Environment variable "${name}" must be a non-negative integer. ` +
        `Got: "${trimmed}".`
    );
  }
  return parsed;
}

// ─── Targets Loader ───────────────────────────────────────────────────────────

/**
 * Raw recipient shape expected inside targets.json.
 * Supports both a root array and a { recipients: [...] } envelope.
 */
interface RawRecipient {
  address: string;
  amount: string | number;
}

async function loadRecipients(targetsPath: string): Promise<RawRecipient[]> {
  const abs = path.resolve(targetsPath);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err: unknown) {
    throw new Error(
      `[launchStageA] Cannot read targets file at "${abs}": ${errorMessage(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(
      `[launchStageA] targets.json at "${abs}" contains invalid JSON: ${errorMessage(err)}`
    );
  }

  // Accept either a root array or an envelope object with a "recipients" key.
  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as Record<string, unknown>)["recipients"])
  ) {
    list = (parsed as Record<string, unknown>)["recipients"];
  } else {
    throw new Error(
      `[launchStageA] targets.json at "${abs}" must be either a root JSON array ` +
        `or an object with a "recipients" array field.`
    );
  }

  const arr = list as unknown[];
  if (arr.length === 0) {
    throw new Error(
      `[launchStageA] targets.json at "${abs}" contains zero recipients.`
    );
  }

  // Validate each entry minimally; fail fast on first malformed record.
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        `[launchStageA] targets.json: entry at index ${i} must be an object.`
      );
    }
    const o = item as Record<string, unknown>;
    if (typeof o["address"] !== "string" || (o["address"] as string).trim() === "") {
      throw new Error(
        `[launchStageA] targets.json: entry at index ${i} is missing a non-empty "address" field.`
      );
    }
    const amt = o["amount"];
    if (typeof amt !== "string" && typeof amt !== "number") {
      throw new Error(
        `[launchStageA] targets.json: entry at index ${i} is missing an "amount" field ` +
          `(must be a string or number).`
      );
    }
  }

  return arr as RawRecipient[];
}

// ─── Amount Conversion ────────────────────────────────────────────────────────

/**
 * Converts a raw amount value (string or number) to a positive bigint.
 *
 * String rules:
 *   - Whitespace is trimmed.
 *   - A trailing "n" (bigint literal suffix) is stripped before conversion.
 *   - The remaining value must be an unsigned decimal integer string.
 *
 * Number rules:
 *   - Must be a positive safe integer (no floats, no negatives, no zero).
 *
 * Throws a descriptive error on the first violation, identifying the index.
 */
function convertAmountToBigInt(raw: string | number, index: number): bigint {
  let normalized: string;

  if (typeof raw === "string") {
    let trimmed = raw.trim();
    if (trimmed.endsWith("n")) {
      trimmed = trimmed.slice(0, -1);
    }
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(
        `[launchStageA] targets.json: entry at index ${index} has an invalid amount string ` +
          `"${raw}". After stripping optional "n" suffix, value must be an unsigned decimal ` +
          `integer (e.g. "1000000000" or "1000000000n").`
      );
    }
    normalized = trimmed;
  } else {
    // typeof raw === "number"
    if (!Number.isInteger(raw) || raw <= 0 || !Number.isSafeInteger(raw)) {
      throw new Error(
        `[launchStageA] targets.json: entry at index ${index} has an invalid amount number ` +
          `${String(raw)}. Amount must be a positive safe integer.`
      );
    }
    normalized = String(raw);
  }

  let converted: bigint;
  try {
    converted = BigInt(normalized);
  } catch {
    throw new Error(
      `[launchStageA] targets.json: entry at index ${index} — BigInt conversion failed ` +
        `for normalized value "${normalized}".`
    );
  }

  if (converted <= 0n) {
    throw new Error(
      `[launchStageA] targets.json: entry at index ${index} has amount ${converted}n. ` +
        `Amount must be > 0.`
    );
  }

  return converted;
}

/**
 * Maps raw recipients (amount as string | number) into the shape expected by
 * batchPlanner (amount as bigint). All other fields are passed through unchanged.
 */
function mapRecipients(
  raw: RawRecipient[]
): Array<{ address: string; amount: bigint; [key: string]: unknown }> {
  return raw.map((r, i) => ({
    ...r,
    amount: convertAmountToBigInt(r.amount, i),
  }));
}

// ─── Amount Lookup Map ────────────────────────────────────────────────────────

/**
 * Builds a normalised address → decimal amount string lookup map from the
 * already-validated, bigint-converted recipient list.
 *
 * Key:   recipient address trimmed and lowercased — matches the casing
 *        applied by makeStateKey (stateKey format: "<batchId>::<address.toLowerCase()>").
 * Value: bigint amount serialised as a decimal string (/^\d+$/ — valid for auditWriter).
 *
 * Built once after mapRecipients and closed over by buildDispatcherAuditRecorder
 * so the write-side adapter never touches recipients directly.
 */
function buildAmountLookup(
  mapped: Array<{ address: string; amount: bigint; [key: string]: unknown }>
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const r of mapped) {
    lookup.set(r.address.trim().toLowerCase(), r.amount.toString());
  }
  return lookup;
}

// ─── Operators JSON Loader (batchSize fallback) ───────────────────────────────

async function loadFirstEnabledMaxBatchSize(
  operatorsFilePath: string
): Promise<number> {
  const abs = path.resolve(operatorsFilePath);
  let raw: string;
  try {
    raw = await fs.readFile(abs, "utf8");
  } catch (err: unknown) {
    throw new Error(
      `[launchStageA] Cannot read operators file at "${abs}" for batchSize fallback: ` +
        errorMessage(err)
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(
      `[launchStageA] operators.json at "${abs}" contains invalid JSON: ${errorMessage(err)}`
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `[launchStageA] operators.json at "${abs}" must be a non-empty JSON array.`
    );
  }

  const first = (parsed as OperatorConfig[]).find((op) => op.enabled === true);

  if (first === undefined) {
    throw new Error(
      `[launchStageA] No enabled operator found in "${abs}". ` +
        `Cannot derive a default batchSize. Set BATCH_SIZE explicitly.`
    );
  }

  const maxBatchSize = Number(first.maxBatchSize);
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new Error(
      `[launchStageA] Operator "${first.id}" has an invalid maxBatchSize (${String(first.maxBatchSize)}). ` +
        `Set BATCH_SIZE explicitly.`
    );
  }

  return maxBatchSize;
}

// ─── Local Adapter A: Dispatcher AuditRecorder ────────────────────────────────
//
// Maps AuditRecordEvent → CSV row via appendAuditRow.
// Only batch_success and batch_failure carry enough per-recipient detail to
// produce a meaningful CSV row. All other event types are emitted to stdout only.
//
// Amount resolution uses amountLookup — a normalised address → decimal string
// map built from the verified, bigint-converted recipient list. The stateKey
// embedded in event.details carries the recipient address already lowercased
// (makeStateKey contract: "<batchId>::<address.toLowerCase()>"), so the lookup
// key normalisation is consistent without any extra work.
//
// If amount cannot be resolved from the lookup (address absent from map):
//   - The CSV row is NOT written (appendAuditRow validates /^\d+$/ and would
//     throw on an empty string; patching auditWriter.ts is out of scope).
//   - A structured warning is emitted to stdout with reason
//     "amount_unresolved_in_audit_adapter" so the gap is traceable.

function buildDispatcherAuditRecorder(
  auditFilePath: string,
  amountLookup: Map<string, string>
): AuditRecorder {
  const options: AuditWriterOptions = { filePath: auditFilePath };

  return {
    async write(event: AuditRecordEvent): Promise<void> {
      // Always emit a structured log line for every event type.
      console.log(
        JSON.stringify({
          level: "audit",
          type: event.type,
          campaignId: event.campaignId,
          batchId: event.batchId ?? null,
          operatorId: event.operatorId ?? null,
          attemptNumber: event.attemptNumber ?? null,
          ts: new Date(event.ts).toISOString(),
          details: event.details ?? null,
        })
      );

      // CSV rows are written only for per-recipient terminal events.
      if (event.type !== "batch_success" && event.type !== "batch_failure") {
        return;
      }

      const details = event.details ?? {};

      // stateKey format from makeStateKey: "<batchId>::<recipientAddress.toLowerCase()>"
      const stateKey =
        typeof details["stateKey"] === "string" ? details["stateKey"] : "";
      const parts = stateKey.split("::");
      const recipientAddress =
        parts.length >= 2 && parts[1] !== undefined && parts[1].trim() !== ""
          ? parts[1]
          : stateKey || "unknown";

      const batchId =
        typeof event.batchId === "string" && event.batchId.trim() !== ""
          ? event.batchId
          : event.campaignId;

      const txHash =
        typeof details["txHash"] === "string" ? details["txHash"] : undefined;
      const disposition =
        typeof details["disposition"] === "string"
          ? details["disposition"]
          : undefined;
      const reason =
        typeof details["reason"] === "string" ? details["reason"] : undefined;

      // ── Amount resolution ───────────────────────────────────────────────
      // recipientAddress is already lowercase (extracted from stateKey).
      // Trim defensively before lookup to guard against any whitespace edge case.
      const lookupKey = recipientAddress.trim().toLowerCase();
      const resolvedAmount = amountLookup.get(lookupKey);

      if (resolvedAmount === undefined) {
        // Cannot produce a valid CSV row: auditWriter rejects non-/^\d+$/ amounts
        // and patching auditWriter.ts is out of scope for this change. Emit a
        // structured warning so the gap is fully traceable in the run log.
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "[DispatcherAuditRecorder] CSV row skipped — amount unresolvable",
            reason: "amount_unresolved_in_audit_adapter",
            recipientAddress,
            lookupKey,
            batchId,
            campaignId: event.campaignId,
            type: event.type,
            ts: new Date(event.ts).toISOString(),
          })
        );
        return;
      }

      const row: AuditRow = {
        timestamp: new Date(event.ts).toISOString(),
        campaignId: event.campaignId,
        batchId,
        recipientAddress,
        amount: resolvedAmount,
        status: event.type === "batch_success" ? "success" : "failed",
        attempts: event.attemptNumber ?? 0,
        walletLabel: event.operatorId,
        txHash,
        reason: disposition,
        error: reason,
      };

      await appendAuditRow(options, row);
    },
  };
}

// ─── Local Adapter B: Reconciler AuditWriter ─────────────────────────────────
//
// For Stage A dry-run, no prior audit records exist on disk.
// readTerminalEntries returns [] — safe and correct for a fresh first run.
// A persistent implementation backed by the audit CSV can be wired in Stage B.

const reconcilerAuditWriter: AuditWriter = {
  async readTerminalEntries(_campaignId: string): Promise<AuditLogEntry[]> {
    return [];
  },
};

// ─── Dry-Run MintExecutor ─────────────────────────────────────────────────────
//
// Returns a synthetic txHash without touching the TON chain.
// DRY_RUN=false is explicitly blocked until a live executor is implemented.

const dryRunExecutor: MintExecutor = {
  async broadcast(params: BroadcastParams): Promise<BroadcastResult> {
    const txHash = `dry-run-${params.batchId}-${params.recipientAddress}-${Date.now()}`;
    console.log(
      JSON.stringify({
        level: "info",
        msg: "[DryRunExecutor] Synthetic broadcast",
        campaignId: params.campaignId,
        batchId: params.batchId,
        recipientAddress: params.recipientAddress,
        amount: params.amount,
        operatorId: params.operatorId,
        attemptNumber: params.attemptNumber,
        txHash,
      })
    );
    return { txHash, networkRef: null };
  },
};

// ─── run ─────────────────────────────────────────────────────────────────────

export async function run(_provider: NetworkProvider): Promise<void> {
  // ── 1. Resolve environment ────────────────────────────────────────────────

  const campaignId = requireEnv("CAMPAIGN_ID");
  const targetsPath = requireEnv("TARGETS_PATH");
  const statePath = requireEnv("STATE_PATH");
  const reportDir = requireEnv("REPORT_DIR");

  const dryRunRaw = optionalEnv("DRY_RUN", "true");
  const isDryRun = dryRunRaw.toLowerCase() !== "false";

  const metadataFilePath = optionalEnv(
    "METADATA_FILE_PATH",
    path.resolve("data/token-metadata.json")
  );

  const operatorsFilePath = path.resolve("data/operators.json");

  // ── 2. Guard: live execution is not implemented at Stage A ────────────────

  if (!isDryRun) {
    throw new Error(
      "[launchStageA] DRY_RUN=false is not supported at Stage A. " +
        "A live MintExecutor has not been implemented. " +
        "Set DRY_RUN=true or implement the executor before enabling live mode."
    );
  }

  // ── 3. Derive paths ───────────────────────────────────────────────────────

  const stateDir = path.dirname(path.resolve(statePath));
  // Reconciler and WalletPool must share the same campaign state file.
  const campaignStatePath = path.join(stateDir, `${campaignId}.state.json`);

  // ── 4. Build audit file path ──────────────────────────────────────────────

  const auditFilePath = buildAuditFilePath(
    reportDir,
    campaignId,
    new Date().toISOString()
  );

  console.log(
    JSON.stringify({
      level: "info",
      msg: "[launchStageA] Composition Root — wiring dependencies",
      campaignId,
      isDryRun,
      stateDir,
      campaignStatePath,
      metadataFilePath,
      operatorsFilePath,
      auditFilePath,
    })
  );

  // ── 5. Resolve batchSize ──────────────────────────────────────────────────

  let batchSize: number;
  const batchSizeEnv = process.env["BATCH_SIZE"];

  if (typeof batchSizeEnv === "string" && batchSizeEnv.trim() !== "") {
    const parsed = Number(batchSizeEnv.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(
        `[launchStageA] BATCH_SIZE must be a positive integer. Got: "${batchSizeEnv}".`
      );
    }
    batchSize = parsed;
  } else {
    batchSize = await loadFirstEnabledMaxBatchSize(operatorsFilePath);
    console.log(
      JSON.stringify({
        level: "info",
        msg: "[launchStageA] BATCH_SIZE not set — derived from first enabled operator",
        batchSize,
      })
    );
  }

  // ── 5½. Resolve pacing overrides ─────────────────────────────────────────

  const entryDelayMs = optionalNonNegativeIntEnv("ENTRY_DELAY_MS");
  const batchDelayMs = optionalNonNegativeIntEnv("BATCH_DELAY_MS");

  if (entryDelayMs !== undefined || batchDelayMs !== undefined) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "[launchStageA] Pacing overrides applied from environment",
        entryDelayMs: entryDelayMs ?? null,
        batchDelayMs: batchDelayMs ?? null,
      })
    );
  }

  // ── 6. Load recipients ────────────────────────────────────────────────────

  const rawRecipients = await loadRecipients(targetsPath);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "[launchStageA] Targets loaded",
      count: rawRecipients.length,
      targetsPath,
    })
  );

  // Convert raw amounts (string | number) → bigint, as required by batchPlanner.
  // All other fields (address, tag, memo, …) are spread through unchanged.
  // The cast through unknown bridges the structural RawRecipient → BatchRecipient
  // gap caused by batchPlanner.ts not being present in the provided file tree.
  const mappedRecipients = mapRecipients(rawRecipients);
  const recipients = mappedRecipients as unknown as CampaignConfig["recipients"];

  // Build the amount lookup map immediately after conversion so the write-side
  // audit adapter can resolve real amounts from verified local data.
  // Key: normalised (trimmed, lowercased) address. Value: decimal amount string.
  const amountLookup = buildAmountLookup(mappedRecipients);

  // ── 7. Build AtomicStateStore ─────────────────────────────────────────────

  const stateStore = new JsonAtomicStateStore(campaignStatePath, campaignId);

  // ── 8. Build WalletPool ───────────────────────────────────────────────────

  const walletPoolConfig: WalletPoolConfig = {
    operatorsFilePath,
    stateStore,
  };

  const walletPool = await createWalletPool(walletPoolConfig);

  // ── 9. Build Reconciler ───────────────────────────────────────────────────

  const reconciler = createReconciler({
    stateDir,
    auditWriter: reconcilerAuditWriter,
  });

  // ── 10. Build MatchingEngine ──────────────────────────────────────────────

  const matchingEngine = new DefaultMatchingEngine();

  // ── 11. Build Dispatcher ──────────────────────────────────────────────────

  const dispatcher = createDispatcher({
    stateDir,
    reconciler,
    executor: dryRunExecutor,
    walletPool,
    retryPolicy: DefaultRetryPolicy,
    auditRecorder: buildDispatcherAuditRecorder(auditFilePath, amountLookup),
    matchingEngine,
    dryRun: isDryRun,
    entryDelayMs,
    batchDelayMs,
  });

  // ── 12. Build CampaignConfig ──────────────────────────────────────────────

  const campaignConfig: CampaignConfig = {
    campaignId,
    metadataFilePath,
    recipients,
    batchSize,
    requireForceRefresh: false,
  };

  // ── 13. Dispatch ──────────────────────────────────────────────────────────

  console.log(
    JSON.stringify({
      level: "info",
      msg: "[launchStageA] Handing off to Dispatcher",
      campaignId,
      totalRecipients: recipients.length,
      batchSize,
      isDryRun,
    })
  );

  const report: DispatchReport = await dispatcher.dispatch(campaignConfig);

  // ── 14. Emit final report ─────────────────────────────────────────────────

  console.log(
    JSON.stringify({
      level: "info",
      msg: "[launchStageA] Dispatch complete",
      ...report,
    })
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}