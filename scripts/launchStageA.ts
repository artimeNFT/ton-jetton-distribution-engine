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
 *
 * Fault injection env vars (all ignored when FAULT_INJECTOR_ENABLED is absent or not "true"):
 *   FAULT_INJECTOR_ENABLED       — optional; set to "true" to enable deterministic fault injection
 *   FAULT_INJECT_CAMPAIGN_ID     — required when enabled; must match CAMPAIGN_ID exactly
 *   FAULT_INJECT_RECIPIENT_INDEX — required when enabled; 0-based index into recipients list
 *   FAULT_INJECT_KIND            — required when enabled; supported values: "rpc_transient", "operator_failover"
 *   FAULT_INJECT_ONCE            — optional; "true" (default) injects only on attemptNumber === 1
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

// Patch — TON address validation before Dispatcher handoff.
import { Address } from "@ton/core";

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

// ─── Recipient Address Validation ─────────────────────────────────────────────

/**
 * Validates every recipient address using @ton/core Address.parse before any
 * Dispatcher interaction occurs.
 *
 * Rules enforced:
 *   - address must be a non-empty string (defence-in-depth; loadRecipients
 *     already checked this structurally).
 *   - Address.parse(address.trim()) must succeed without throwing.
 *
 * Strategy: collect ALL failures before throwing so the operator sees every
 * invalid address in one error, not just the first.
 *
 * Throwing here guarantees:
 *   - dispatcher.dispatch is never called.
 *   - No StateEntry is written ("submitted" or otherwise).
 *   - No audit row (batch_in_flight, batch_success, batch_failure) is emitted.
 *   - No CSV row is written for any invalid address.
 */
function validateRecipientAddressesForLaunch(
  recipients: Array<{ address: string; amount: bigint; [key: string]: unknown }>
): void {
  const invalid: Array<{ index: number; address: string; reason: string }> = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]!;
    const addr = r.address;

    if (typeof addr !== "string" || addr.trim() === "") {
      invalid.push({
        index: i,
        address: String(addr),
        reason: "address is empty or not a string",
      });
      continue;
    }

    try {
      Address.parse(addr.trim());
    } catch (err: unknown) {
      invalid.push({
        index: i,
        address: addr,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (invalid.length === 0) return;

  const lines = invalid
    .map((v) => `  index ${v.index}: "${v.address}" — ${v.reason}`)
    .join("\n");

  throw new Error(
    `[launchStageA] Target validation failed: ${invalid.length} invalid recipient address(es):\n` +
      lines
  );
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

// ─── Fault Injection ──────────────────────────────────────────────────────────
//
// Deterministic, env-driven fault injection for Stage A fault matrix testing.
// All fault logic is confined to this section and buildMintExecutor below.
// When FAULT_INJECTOR_ENABLED is absent or not "true", zero behaviour changes.

/** Parsed, validated representation of the fault injection environment. */
interface FaultConfig {
  /** Verified campaign ID — must equal the active campaignId at startup. */
  campaignId: string;
  /** 0-based index into mappedRecipients. Resolved to an address before use. */
  recipientIndex: number;
  /**
   * Fault kind. Determines which classifiable error message the executor throws.
   *   "rpc_transient"    → 503 → transient_rpc    → retry_same_identity
   *   "operator_failover" → insufficient TON → insufficient_ton → rotate_identity
   */
  kind: "rpc_transient" | "operator_failover";
  /**
   * When true, inject only on attemptNumber === 1.
   * Persisted attemptNumber ensures second-run suppression without extra state.
   * Defaults to true when FAULT_INJECT_ONCE is absent or not "false".
   */
  once: boolean;
}

/**
 * Reads and validates fault injection env vars.
 *
 * Returns null when FAULT_INJECTOR_ENABLED is absent or not exactly "true".
 * Throws a descriptive error for any present-but-invalid configuration so
 * misconfigured fault runs fail loudly before Dispatcher handoff.
 *
 * @param campaignId - The active campaign ID resolved from CAMPAIGN_ID.
 */
function parseFaultConfig(campaignId: string): FaultConfig | null {
  const enabled = process.env["FAULT_INJECTOR_ENABLED"];
  if (typeof enabled !== "string" || enabled.trim().toLowerCase() !== "true") {
    return null;
  }

  // FAULT_INJECT_CAMPAIGN_ID — must match active campaignId exactly.
  const injectCampaignId = process.env["FAULT_INJECT_CAMPAIGN_ID"];
  if (typeof injectCampaignId !== "string" || injectCampaignId.trim() === "") {
    throw new Error(
      "[launchStageA] FAULT_INJECTOR_ENABLED=true but FAULT_INJECT_CAMPAIGN_ID is not set."
    );
  }
  if (injectCampaignId.trim() !== campaignId) {
    throw new Error(
      `[launchStageA] FAULT_INJECT_CAMPAIGN_ID "${injectCampaignId.trim()}" does not match ` +
        `active CAMPAIGN_ID "${campaignId}". ` +
        `Refusing to inject into the wrong campaign.`
    );
  }

  // FAULT_INJECT_RECIPIENT_INDEX — non-negative integer.
  const indexRaw = process.env["FAULT_INJECT_RECIPIENT_INDEX"];
  if (typeof indexRaw !== "string" || indexRaw.trim() === "") {
    throw new Error(
      "[launchStageA] FAULT_INJECTOR_ENABLED=true but FAULT_INJECT_RECIPIENT_INDEX is not set."
    );
  }
  const recipientIndex = Number(indexRaw.trim());
  if (!Number.isInteger(recipientIndex) || recipientIndex < 0) {
    throw new Error(
      `[launchStageA] FAULT_INJECT_RECIPIENT_INDEX must be a non-negative integer. ` +
        `Got: "${indexRaw.trim()}".`
    );
  }

  // FAULT_INJECT_KIND — "rpc_transient" or "operator_failover".
  const kindRaw = process.env["FAULT_INJECT_KIND"];
  if (typeof kindRaw !== "string" || kindRaw.trim() === "") {
    throw new Error(
      "[launchStageA] FAULT_INJECTOR_ENABLED=true but FAULT_INJECT_KIND is not set."
    );
  }
  const kindNorm = kindRaw.trim();
  if (kindNorm !== "rpc_transient" && kindNorm !== "operator_failover") {
    throw new Error(
      `[launchStageA] FAULT_INJECT_KIND "${kindNorm}" is not supported. ` +
        `Accepted values: "rpc_transient", "operator_failover".`
    );
  }
  const kind = kindNorm as FaultConfig["kind"];

  // FAULT_INJECT_ONCE — defaults to true; must be explicitly "false" to disable.
  const onceRaw = process.env["FAULT_INJECT_ONCE"];
  const once =
    typeof onceRaw !== "string" ||
    onceRaw.trim() === "" ||
    onceRaw.trim().toLowerCase() !== "false";

  return {
    campaignId: injectCampaignId.trim(),
    recipientIndex,
    kind,
    once,
  };
}

// ─── MintExecutor Factory ─────────────────────────────────────────────────────
//
// Returns a dry-run MintExecutor.  When fault config is present and the
// broadcast params match the injected recipient/attempt, throws a
// classifiable error instead of returning a synthetic txHash.
//
// Classification targets inside retryPolicy.ts classifyMessage:
//   "rpc_transient"    → "503" matches transient_rpc    → retry_same_identity
//   "operator_failover" → "insufficient ton" matches insufficient_ton → rotate_identity
//
// Injection guard logic (all conditions must be true to inject):
//   1. fault config is non-null.
//   2. params.recipientAddress.trim().toLowerCase() === resolvedInjectAddress.
//   3. If fault.once === true: params.attemptNumber === 1.
//      On second run, stateStore persists attemptNumber=1; the dispatcher
//      computes nextAttemptNumber=2, so FAULT_INJECT_ONCE=true is silently
//      suppressed without needing any external state.

/** Error messages keyed by fault kind, chosen to produce deterministic retryPolicy classification. */
const FAULT_ERROR_MESSAGES: Record<FaultConfig["kind"], string> = {
  rpc_transient:    "503 Service Unavailable — injected fault [rpc_transient]",
  operator_failover: "Insufficient TON balance — injected fault [operator_failover]",
};

/**
 * Builds the MintExecutor used by the Dispatcher.
 *
 * @param fault                - Parsed fault config, or null for clean dry-run.
 * @param resolvedInjectAddress - Normalised (trim + lowercase) address of the
 *                                recipient to inject, or null when fault is null.
 */
function buildMintExecutor(
  fault: FaultConfig | null,
  resolvedInjectAddress: string | null
): MintExecutor {
  return {
    async broadcast(params: BroadcastParams): Promise<BroadcastResult> {
      // ── Fault injection gate ─────────────────────────────────────────────
      if (fault !== null && resolvedInjectAddress !== null) {
        const normalizedParamAddress = params.recipientAddress.trim().toLowerCase();
        const addressMatches = normalizedParamAddress === resolvedInjectAddress;
        const attemptMatches = !fault.once || params.attemptNumber === 1;

        if (addressMatches && attemptMatches) {
          const errorMessage = FAULT_ERROR_MESSAGES[fault.kind];
          console.log(
            JSON.stringify({
              level: "info",
              msg: "[FaultInjector] Injecting fault",
              kind: fault.kind,
              campaignId: params.campaignId,
              batchId: params.batchId,
              recipientAddress: params.recipientAddress,
              attemptNumber: params.attemptNumber,
              once: fault.once,
              errorMessage,
            })
          );
          throw new Error(errorMessage);
        }
      }

      // ── Standard dry-run path ────────────────────────────────────────────
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
}

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

  // ── 2a. Parse fault injection config ─────────────────────────────────────
  //
  // Parsed here — after campaignId is resolved — so FAULT_INJECT_CAMPAIGN_ID
  // can be validated against the active campaign before any I/O begins.
  // Returns null when FAULT_INJECTOR_ENABLED is absent or not "true".
  const faultConfig = parseFaultConfig(campaignId);

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

  // ── 6a. Address validation gate ───────────────────────────────────────────
  //
  // Validates every recipient address via @ton/core Address.parse BEFORE any
  // Dispatcher, StateStore, or AuditRecorder interaction begins.
  //
  // If this throws:
  //   - dispatcher.dispatch is never called.
  //   - No StateEntry transitions to "submitted".
  //   - No batch_in_flight / batch_success / batch_failure audit event fires.
  //   - No CSV row is produced for any invalid address.
  //
  // This is the sole enforcement point. No other file is modified.
  validateRecipientAddressesForLaunch(mappedRecipients);

  // ── 6b. Resolve fault injection target address ────────────────────────────
  //
  // Resolved after address validation so the index is guaranteed to land on a
  // structurally valid, Address.parse-verified recipient.
  // The normalised address (trim + lowercase) is what the executor will match
  // against params.recipientAddress at broadcast time.
  let resolvedInjectAddress: string | null = null;
  if (faultConfig !== null) {
    const idx = faultConfig.recipientIndex;
    if (idx >= mappedRecipients.length) {
      throw new Error(
        `[launchStageA] FAULT_INJECT_RECIPIENT_INDEX ${idx} is out of bounds. ` +
          `Recipient list has ${mappedRecipients.length} entries (0-based max index: ${mappedRecipients.length - 1}).`
      );
    }
    resolvedInjectAddress = mappedRecipients[idx]!.address.trim().toLowerCase();
    console.log(
      JSON.stringify({
        level: "info",
        msg: "[launchStageA] Fault injection configured",
        kind: faultConfig.kind,
        recipientIndex: idx,
        resolvedInjectAddress,
        once: faultConfig.once,
        campaignId,
      })
    );
  }

  // ── 6c. Build MintExecutor ────────────────────────────────────────────────
  //
  // When faultConfig is null, buildMintExecutor returns a standard dry-run
  // executor identical in behaviour to the old dryRunExecutor constant.
  // When faultConfig is non-null, the executor will throw a transient-
  // classifiable error for the resolved recipient on the matching attempt.
  const mintExecutor = buildMintExecutor(faultConfig, resolvedInjectAddress);

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
    executor: mintExecutor,
    walletPool,
    retryPolicy: DefaultRetryPolicy,
    auditRecorder: buildDispatcherAuditRecorder(auditFilePath, amountLookup),
    matchingEngine,
    dryRun: faultConfig !== null ? false : isDryRun,
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