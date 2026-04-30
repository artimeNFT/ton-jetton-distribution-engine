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
// The `amount` field is not carried in dispatcher events; "0" is written as a
// safe placeholder — this is a known Stage A limitation.

function buildDispatcherAuditRecorder(
  auditFilePath: string
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

      const row: AuditRow = {
        timestamp: new Date(event.ts).toISOString(),
        campaignId: event.campaignId,
        batchId,
        recipientAddress,
        // Amount is not carried in dispatcher events.
        // "0" is a valid placeholder per auditWriter validation (/^\d+$/).
        amount: "0",
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

  // RawRecipient is structurally compatible with BatchRecipient from batchPlanner.ts.
  // The cast through unknown is required because BatchRecipient is declared in
  // batchPlanner.ts (not present in the provided file tree; see compile risk note).
  const recipients = rawRecipients as unknown as CampaignConfig["recipients"];

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
    auditRecorder: buildDispatcherAuditRecorder(auditFilePath),
    matchingEngine,
    dryRun: isDryRun,
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
