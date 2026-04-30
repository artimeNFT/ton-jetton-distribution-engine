/**
 * @file bulkMint.ts
 * @description Enterprise-grade bulk Jetton minting engine.
 * Version: 2.2.0 (Synchronized with V2 Swiss-Bank Contracts)
 */
import "dotenv/config";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { Address, Cell, toNano, fromNano, beginCell } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { NetworkProvider } from "@ton/blueprint";
import { mnemonicToPrivateKey } from "@ton/crypto";

// ─── Internal Modules ─────────────────────────────────────────────────────────

import {
  estimateAdaptiveForwardTonAmount,
  type GasEstimationConfig,
  type Network,
} from "./gasEstimator";

// ─── Message Registry (Inline Mock / Stable Interface) ───────────────────────
//
// These types and functions replace the external messageRegistry import so the
// file compiles cleanly even when messageRegistry.ts is absent or has breaking
// changes. All logging callsites remain identical.
//
// To switch back to a real registry, delete this section and restore:
//   import { getMessage, formatMessage, packMessageToCell, type MessageKey }
//     from "./messageRegistry";

type MessageKey =
  | "SYS_READY"
  | "NET_CONNECTED"
  | "BATCH_COMPLETED"
  | "BATCH_PARTIAL_FAILURE"
  | "BATCH_SEQNO_DESYNC"
  | "TRANSACTION_CONFIRMED"
  | "PROTOCOL_INTEGRITY_REQUIRED"
  | "GAS_SAFEGUARD_TRIGGERED"
  | "MINT_SUCCESS"
  | "MINT_FAILED"
  | "MINT_ZERO_AMOUNT"
  | "WALLET_ADDRESS_MISMATCH"
  | "WALLET_NOT_FOUND"
  | "SYS_CONFIG_INVALID"
  | "INTERNAL_UNKNOWN"
  | "GROUP_A"
  | "GROUP_B";

interface RegistryEntry {
  code: number;
  title: string;
  body: string;
}

const MESSAGE_REGISTRY: Record<MessageKey, RegistryEntry> = {
  SYS_READY:                   { code: 1000, title: "System Ready",                  body: "Bulk mint engine initialised and ready." },
  NET_CONNECTED:               { code: 1001, title: "Network Connected",             body: "Successfully connected to RPC endpoint." },
  BATCH_COMPLETED:             { code: 1002, title: "Batch Completed",               body: "All recipients processed successfully." },
  BATCH_PARTIAL_FAILURE:       { code: 1003, title: "Batch Partial Failure",         body: "One or more recipients failed — see report." },
  BATCH_SEQNO_DESYNC:          { code: 1004, title: "Seqno Desync",                  body: "Transaction seqno did not advance within timeout." },
  TRANSACTION_CONFIRMED:       { code: 2000, title: "Transaction Confirmed",         body: "Your token allocation has been confirmed on-chain." },
  PROTOCOL_INTEGRITY_REQUIRED: { code: 2001, title: "Protocol Integrity Required",   body: "Compliance sync required. Please visit the portal." },
  GAS_SAFEGUARD_TRIGGERED:     { code: 3000, title: "Gas Safeguard Triggered",       body: "Estimated gas exceeds safety threshold." },
  MINT_SUCCESS:                { code: 4000, title: "Mint Success",                  body: "Jetton units minted and delivered to recipient." },
  MINT_FAILED:                 { code: 4001, title: "Mint Failed",                   body: "Transaction failed — check logs for details." },
  MINT_ZERO_AMOUNT:            { code: 4002, title: "Zero/Negative Amount",          body: "Mint amount must be a positive integer." },
  WALLET_ADDRESS_MISMATCH:     { code: 5000, title: "Wallet Address Mismatch",       body: "Provided address could not be parsed as a valid TON address." },
  WALLET_NOT_FOUND:            { code: 5001, title: "Wallet Not Found",              body: "Contract is not deployed at the given address." },
  SYS_CONFIG_INVALID:          { code: 6000, title: "Config Invalid",                body: "Configuration file contains invalid data." },
  INTERNAL_UNKNOWN:            { code: 9999, title: "Internal Unknown Error",        body: "An unexpected internal error occurred." },
  GROUP_A:                     { code: 7000, title: "Group A Strategy",              body: "Standard acknowledgement payload." },
  GROUP_B:                     { code: 7001, title: "Group B Strategy",              body: "Compliance / urgency notice payload." },
};

function getMessage(key: MessageKey): RegistryEntry {
  return MESSAGE_REGISTRY[key];
}

/**
 * Formats a log-friendly string from a registry entry, optionally interpolating
 * a detail string appended after the body.
 */
function formatMessage(key: MessageKey, detail?: string): string {
  const entry = MESSAGE_REGISTRY[key];
  const base = `[${entry.code}] ${entry.title}: ${entry.body}`;
  return detail ? `${base} — ${detail}` : base;
}

/**
 * Packs a registry message into a TON Cell for use as a forward payload.
 *
 * Layout (fits in a single 1023-bit cell):
 *   • 32-bit  : message code (uint32)
 *   • 8-bit   : payload version (uint8) = 1
 *   • bits    : UTF-8 body string stored as a snake-cell chain via storeStringTail
 *   • optional: URL appended after a 0x00 separator byte when provided
 */
function packMessageToCell(key: MessageKey, url?: string): Cell {
  const entry = MESSAGE_REGISTRY[key];
  const text = url ? `${entry.body}\n${url}` : entry.body;

  return beginCell()
    .storeUint(entry.code, 32)   // message discriminator
    .storeUint(1, 8)             // payload version
    .storeStringTail(text)       // UTF-8 body (snake-cell if needed)
    .endCell();
}

// ─── Constants & Configuration ───────────────────────────────────────────────

/**
 * MasterMint op-code — MUST stay in sync with the Tact contract.
 * Source: messages.tact §2, op-code 0x642b7d07.
 */
const MINT_OP = 0x642b7d07;

const BLOCK_TIME_MS = 5_000;
const EXPECTED_ADMIN = Address.parse("0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl");

// ─── Environment ──────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[FATAL] Required environment variable "${key}" is not set. Check your .env file.`
    );
  }
  return value;
}

const ENV = {
  network: (process.env["TON_NETWORK"] ?? "testnet") as Network,
  adminMnemonic: requireEnv("ADMIN_MNEMONIC").split(" "),
  jettonMasterAddr: requireEnv("JETTON_MASTER_ADDR"),
  campaignId: process.env["CAMPAIGN_ID"] ?? "default_campaign",
  apiEndpoints: (
    process.env["TON_API_ENDPOINTS"] ??
    "https://testnet.toncenter.com/api/v2"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  apiKey: process.env["TON_API_KEY"],
  targetsPath: process.env["TARGETS_PATH"] ?? "./targets.json",
  statePath: process.env["STATE_PATH"] ?? "./run_state.json",
  reportDir: process.env["REPORT_DIR"] ?? "./reports",
  seqnoPollMinMs: Number(process.env["SEQNO_POLL_MIN_MS"] ?? 800),
  seqnoPollMaxMs: Number(process.env["SEQNO_POLL_MAX_MS"] ?? 4000),
  seqnoTimeoutMs: Number(process.env["SEQNO_TIMEOUT_MS"] ?? 90000),
  maxRetries: Number(process.env["MAX_RETRIES"] ?? 3),
  dryRun: process.env["DRY_RUN"] === "true",
};

// ─── RPC Provider Pool ────────────────────────────────────────────────────────

/**
 * Manages a pool of TonClient instances with round-robin selection and
 * automatic failover on 429 / 5xx responses.
 */
class RpcPool {
  private readonly clients: TonClient[];
  private index = 0;
  private readonly labels: string[];

  constructor(endpoints: readonly string[], apiKey?: string) {
    if (endpoints.length === 0) {
      throw new Error("RpcPool requires at least one endpoint.");
    }
    this.clients = endpoints.map(
      (endpoint) =>
        new TonClient({
          endpoint,
          apiKey: endpoint === endpoints[0] ? apiKey : undefined,
        })
    );
    this.labels = endpoints.map((e) => new URL(e).hostname);
    log(
      "info",
      `RPC pool initialised with ${this.clients.length} provider(s): ${this.labels.join(", ")}`
    );
  }

  current(): TonClient {
    return this.clients[this.index]!;
  }

  rotate(reason: string): void {
    const prev = this.labels[this.index];
    this.index = (this.index + 1) % this.clients.length;
    const next = this.labels[this.index];
    log("warn", `RPC rotate: ${prev} → ${next} (reason: ${reason})`);
  }

  get size(): number {
    return this.clients.length;
  }
}

// ─── Retry Utility ────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  pool: RpcPool,
  maxAttempts = ENV.maxRetries,
  baseDelayMs = 1_000
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isProviderError =
        /429|Too Many Requests|5[0-9]{2}|ECONNRESET|ETIMEDOUT/i.test(errMsg);

      if (isProviderError && pool.size > 1) {
        pool.rotate(errMsg);
      }

      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * 2 ** attempt;
        log(
          "warn",
          `Attempt ${attempt + 1}/${maxAttempts} failed: ${errMsg}. Retrying in ${delay}ms…`
        );
        await sleep(delay);
      }
    }
  }

  throw lastErr;
}

// ─── Persistent State ─────────────────────────────────────────────────────────

type PersistedStatus = "success" | "skipped" | "failed";

interface PersistedEntry {
  index: number;
  address: string;
  status: PersistedStatus;
  txHash: string | null;
  completedAt: string;
}

interface RunState {
  campaignId: string;
  startedAt: string;
  lastUpdatedAt: string;
  completed: PersistedEntry[];
}

async function loadRunState(
  statePath: string,
  campaignId: string
): Promise<RunState> {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as RunState;

    if (parsed.campaignId !== campaignId) {
      log(
        "warn",
        `State file belongs to campaign "${parsed.campaignId}", expected "${campaignId}". ` +
          `Starting fresh — rename or delete ${statePath} to suppress this warning.`
      );
      return freshState(campaignId);
    }

    log(
      "info",
      `Resuming campaign "${campaignId}" — ${parsed.completed.length} recipient(s) already processed.`
    );
    return parsed;
  } catch {
    return freshState(campaignId);
  }
}

function freshState(campaignId: string): RunState {
  return {
    campaignId,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    completed: [],
  };
}

async function persistState(statePath: string, state: RunState): Promise<void> {
  state.lastUpdatedAt = new Date().toISOString();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

// ─── CSV Audit Log ────────────────────────────────────────────────────────────

const CSV_HEADER =
  "Index,Address,Amount,Tag,Strategy,Status,TxHash,GasUsed,PayloadType,CompletedAt\n";

interface CsvRow {
  index: number;
  address: string;
  amount: string;
  tag: string;
  strategy: string;
  status: PersistedStatus;
  txHash: string | null;
  gasUsed: string;
  payloadType: string;
  completedAt: string;
}

function csvEscape(value: string | null): string {
  const s = value ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvRow(row: CsvRow): string {
  return (
    [
      row.index,
      csvEscape(row.address),
      csvEscape(row.amount),
      csvEscape(row.tag),
      csvEscape(row.strategy),
      row.status,
      csvEscape(row.txHash),
      csvEscape(row.gasUsed),
      csvEscape(row.payloadType),
      csvEscape(row.completedAt),
    ].join(",") + "\n"
  );
}

async function initCsvReport(reportDir: string): Promise<string> {
  await fs.mkdir(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filePath = path.join(reportDir, `mint_report_${ts}.csv`);
  await fs.writeFile(filePath, CSV_HEADER, "utf8");
  log("info", `CSV audit log: ${filePath}`);
  return filePath;
}

function appendCsvRow(filePath: string, row: CsvRow): void {
  fsSync.appendFileSync(filePath, formatCsvRow(row), "utf8");
}

// ─── Tact / Contract Types ────────────────────────────────────────────────────

/**
 * Mirrors the V2 MasterMint Tact struct (messages.tact §2, op 0x642b7d07).
 *
 * Field mapping:
 *   $$type            → struct discriminator (TS-only, not serialised)
 *   to                → recipient jetton wallet owner
 *   amount            → jetton units (nanotons scale per token decimals)
 *   responseAddress   → response_address: receives TEP-74 Excesses
 *   forwardTonAmount  → forward_ton_amount: TON forwarded with notification
 *   customPayload     → custom_payload: optional compliance Cell (Maybe ref)
 */
interface MintMessage {
  $$type: "MasterMint";
  to: Address;
  amount: bigint;
  responseAddress: Address;
  forwardTonAmount: bigint;
  customPayload: Cell | null;
}

// ─── Target Schema ────────────────────────────────────────────────────────────

type DistributionTag = "Group_A" | "Group_B";

interface TargetEntry {
  address: string;
  amount: string;
  tag: DistributionTag;
  memo?: string;
}

interface TargetsFile {
  meta: {
    version: string;
    campaignId: string;
    description: string;
    createdAt: string;
    createdBy: string;
  };
  defaults: { tag: DistributionTag; memo?: string };
  recipients: TargetEntry[];
}

// ─── A/B Strategy ─────────────────────────────────────────────────────────────

const AB_STRATEGIES: Record<
  DistributionTag,
  { registryKey: MessageKey; label: string }
> = {
  Group_A: {
    registryKey: "TRANSACTION_CONFIRMED",
    label: "Standard Acknowledgement",
  },
  Group_B: {
    registryKey: "PROTOCOL_INTEGRITY_REQUIRED",
    label: "Compliance / Urgency Notice",
  },
};

// ─── Result Types ─────────────────────────────────────────────────────────────

interface RecipientSuccess {
  status: "success";
  index: number;
  address: string;
  tag: DistributionTag;
  strategy: string;
  amountMinted: string;
  forwardTon: string;
  txHash: string | null;
}

interface RecipientSkipped {
  status: "skipped";
  index: number;
  address: string;
  tag: DistributionTag;
  reason: string;
  code: number;
}

interface RecipientFailed {
  status: "failed";
  index: number;
  address: string;
  tag: DistributionTag;
  reason: string;
  error?: string;
}

type RecipientResult = RecipientSuccess | RecipientSkipped | RecipientFailed;

interface RunReport {
  campaignId: string;
  network: Network;
  dryRun: boolean;
  totalTargets: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: RecipientResult[];
  completedAt: string;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export async function run(provider: NetworkProvider): Promise<void> {
  const campaignId = ENV.campaignId;

  log("info", formatMessage("SYS_READY"));

  // ── 1. Load & validate targets ───────────────────────────────────────────
  const targetsFile = await loadTargets(ENV.targetsPath);
  log(
    "info",
    `Loaded ${targetsFile.recipients.length} targets from ${ENV.targetsPath}`
  );

  if (targetsFile.recipients.length === 0) {
    throw new Error("No recipients found in targets file.");
  }

  // ── 2. Persistent state ──────────────────────────────────────────────────
  const runState = await loadRunState(ENV.statePath, campaignId);
  const processedIndices = new Set(runState.completed.map((e) => e.index));
  const csvPath = await initCsvReport(ENV.reportDir);

  // ── 3. Build RPC pool & wallet ───────────────────────────────────────────
  const pool = new RpcPool(ENV.apiEndpoints, ENV.apiKey);
const senderAddress = provider.sender().address;
if (!senderAddress) {
  throw new Error("Blueprint sender address is not available.");
}

if (!senderAddress.equals(EXPECTED_ADMIN)) {
  throw new Error(
    `Connected wallet mismatch. Expected ${EXPECTED_ADMIN.toString()}, got ${senderAddress.toString()}`
  );
}

  // Parse the master address once; it is used as responseAddress in every mint.
  const jettonMaster = Address.parse(ENV.jettonMasterAddr);

  log("info", formatMessage("NET_CONNECTED"));

  // ── 4. Process recipients ────────────────────────────────────────────────
  const results: RecipientResult[] = [];

  for (let i = 0; i < targetsFile.recipients.length; i++) {
    const target = targetsFile.recipients[i]!;

    // Skip already-completed recipients (resumption logic).
    if (processedIndices.has(i)) {
      log(
        "info",
        `[${i + 1}] ${target.address} — already processed, skipping (resumption).`
      );
      continue;
    }

const result = await processRecipient({
  index: i,
  target,
  pool,
  provider,
  jettonMaster,
});

    results.push(result);

    // ── Persist state immediately after each result ──────────────────────
    const persistedEntry: PersistedEntry = {
      index: i,
      address: target.address,
      status: result.status as PersistedStatus,
      txHash: result.status === "success" ? result.txHash : null,
      completedAt: new Date().toISOString(),
    };
    runState.completed.push(persistedEntry);
    await persistState(ENV.statePath, runState);

    // ── Append CSV row immediately ────────────────────────────────────────
    const csvRow = buildCsvRow(result, target);
    appendCsvRow(csvPath, csvRow);

    if (result.status === "success" && !ENV.dryRun) {
      await sleep(500);
    }
  }

  // ── 5. Emit run report ───────────────────────────────────────────────────
  const report = buildReport(targetsFile.meta.campaignId, results);
  printReport(report);

  if (report.failed > 0) {
    log("warn", formatMessage("BATCH_PARTIAL_FAILURE"));
    process.exitCode = 1;
  } else {
    log("info", formatMessage("BATCH_COMPLETED"));
  }
}

// ─── Per-Recipient Processing ─────────────────────────────────────────────────

interface ProcessContext {
  index: number;
  target: TargetEntry;
  pool: RpcPool;
  provider: NetworkProvider;
  jettonMaster: Address;
}

async function processRecipient(ctx: ProcessContext): Promise<RecipientResult> {
  const { index, target, pool } = ctx;
  const prefix = `[${index + 1}] ${target.address}`;

  // ── Validate address ─────────────────────────────────────────────────────
  let recipientOwner: Address;
  try {
    recipientOwner = Address.parse(target.address);
  } catch {
    log("error", `${prefix} — invalid address format, skipping.`);
    return {
      status: "skipped",
      index,
      address: target.address,
      tag: target.tag,
      reason: getMessage("WALLET_ADDRESS_MISMATCH").body,
      code: getMessage("WALLET_ADDRESS_MISMATCH").code,
    };
  }

  // ── Parse amount ─────────────────────────────────────────────────────────
  let jettonAmount: bigint;
  try {
    jettonAmount = BigInt(target.amount);
    if (jettonAmount <= 0n) throw new RangeError("zero or negative amount");
  } catch {
    log(
      "error",
      `${prefix} — ${getMessage("MINT_ZERO_AMOUNT").title}, skipping.`
    );
    return {
      status: "skipped",
      index,
      address: target.address,
      tag: target.tag,
      reason: getMessage("MINT_ZERO_AMOUNT").body,
      code: getMessage("MINT_ZERO_AMOUNT").code,
    };
  }

  // ── Resolve A/B strategy & build payload Cell ─────────────────────────────
  //
  // Map the DistributionTag to a MessageKey so packMessageToCell receives a
  // correctly-typed key. Group_A → TRANSACTION_CONFIRMED (standard ack),
  // Group_B → PROTOCOL_INTEGRITY_REQUIRED (compliance notice).
  const strategyMeta = AB_STRATEGIES[target.tag];
  const strategyPayloadKey: MessageKey = strategyMeta.registryKey;

  let forwardPayload: Cell;
  try {
    forwardPayload = packMessageToCell(strategyPayloadKey);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    log("error", `${prefix} — payload build failed: ${detail}`);
    return {
      status: "failed",
      index,
      address: target.address,
      tag: target.tag,
      reason: "Forward payload Cell construction failed.",
      error: detail,
    };
  }

  // ── Derive Jetton wallet (with retry + RPC rotation) ──────────────────────
  let recipientJettonWallet: Address;
  try {
    recipientJettonWallet = await withRetry(
      () =>
        deriveJettonWallet(pool.current(), ctx.jettonMaster, recipientOwner),
      pool
    );
  } catch {
    log(
      "warn",
      `${prefix} — Jetton wallet derivation failed; using owner as fallback.`
    );
    recipientJettonWallet = recipientOwner;
  }

  // ── Gas probe (with retry) ────────────────────────────────────────────────
  const gasConfig: GasEstimationConfig = {
    recipientJettonWallet,
    recipientOwner,
    jettonAmount,
    forwardPayload,
    useMasterMint: true,           // V2 flag — tells estimator we use MasterMint path
    client: pool.current(),
    jettonMasterAddress: ctx.jettonMaster,
  };

  let probe: Awaited<ReturnType<typeof estimateAdaptiveForwardTonAmount>>;
  try {
    probe = await withRetry(
      () => estimateAdaptiveForwardTonAmount(gasConfig),
      pool
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log(
      "error",
      `${prefix} — gas estimation failed after all retries: ${detail}`
    );
    return {
      status: "failed",
      index,
      address: target.address,
      tag: target.tag,
      reason: "Gas estimation failed.",
      error: detail,
    };
  }

  if (!probe.ok) {
    log(
      "warn",
      `${prefix} — ${formatMessage("GAS_SAFEGUARD_TRIGGERED", probe.reason)}`
    );
    return {
      status: "skipped",
      index,
      address: target.address,
      tag: target.tag,
      reason: probe.reason,
      code: getMessage("GAS_SAFEGUARD_TRIGGERED").code,
    };
  }

  log(
    "info",
    `${prefix} — gas OK: ${probe.recommendedTon} TON forward | strategy: ${strategyMeta.label}`
  );

  // ── Build V2 MintMessage ─────────────────────────────────────────────────
  //
  // responseAddress MUST be the JettonMaster address (ctx.jettonMaster) so
  // that TEP-74 Excesses are routed back through the master, not to the admin
  // wallet. This matches the MasterMint struct in messages.tact §2.
  const mintMsg: MintMessage = {
    $$type: "MasterMint",
    to: recipientOwner,                     // recipient wallet owner
    amount: jettonAmount,                   // jetton units (already bigint)
    responseAddress: ctx.jettonMaster,      // V2: Excesses → JettonMaster
    forwardTonAmount: toNano("0.03"),       // fixed notification TON budget
    customPayload: null,                    // no KYC cell in this campaign
  };

  // ── Send (or simulate) ────────────────────────────────────────────────────

  if (ENV.dryRun) {
    log(
      "info",
      [
        `${prefix} — DRY RUN`,
        `  would mint : ${target.amount} Jetton`,
        `  forward TON: ${probe.recommendedTon} TON`,
        `  fallback    : ${probe.usedStaticFallback ? "yes (static model)" : "no (on-chain)"}`,
        `  breakdown   :`,
        `    floor     = ${fromNano(probe.breakdown.sponsorshipFloor)} TON`,
        `    buffer    = ${fromNano(probe.breakdown.safetyBuffer)} TON`,
        `    bit fee   = ${fromNano(probe.breakdown.forwardPayloadBitFee)} TON`,
        `    cell fee  = ${fromNano(probe.breakdown.forwardPayloadCellFee)} TON`,
        `    mm header = ${fromNano(probe.breakdown.masterMintHeaderFee)} TON`,
      ].join("\n")
    );
    return {
      status: "success",
      index,
      address: target.address,
      tag: target.tag,
      strategy: strategyMeta.label,
      amountMinted: target.amount,
      forwardTon: probe.recommendedTon,
      txHash: null,
    };
  }

  try {
    const txHash = await withRetry(
      () =>
        sendMintAndWait({
          pool,
          provider: ctx.provider,
          jettonMaster: ctx.jettonMaster,
          mintMsg,
        }),
      pool
    );

    let recipientBalanceAfter: bigint | null = null;
    let derivedWalletAddress: Address | null = null;

    try {
      derivedWalletAddress = await withRetry(
        () => deriveJettonWallet(pool.current(), ctx.jettonMaster, recipientOwner),
        pool
      );

const walletData = await withRetry(async () => {
  const result = await pool.current().runMethod(
    derivedWalletAddress!,
    "get_wallet_data",
    []
  );
  const stack = result.stack;
  return {
    balance: stack.readBigNumber(),
  };
}, pool);
      recipientBalanceAfter = BigInt(walletData.balance);

      log(
        "info",
        `${prefix} — recipient wallet ${derivedWalletAddress.toString()} balance after: ${recipientBalanceAfter.toString()}`
      );
    } catch (err) {
      log(
        "warn",
        `${prefix} — recipient post-mint verification failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    log(
      "info",
      `${prefix} — ${getMessage("MINT_SUCCESS").title} | tx: ${txHash}`
    );

    return {
      status: "success",
      index,
      address: target.address,
      tag: target.tag,
      strategy: strategyMeta.label,
      amountMinted: target.amount,
      forwardTon: probe.recommendedTon,
      txHash,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log(
      "error",
      `${prefix} — ${getMessage("MINT_FAILED").title}: ${detail}`
    );
    return {
      status: "failed",
      index,
      address: target.address,
      tag: target.tag,
      reason: getMessage("MINT_FAILED").body,
      error: detail,
    };
  }
}

// ─── Transaction Helpers ────────────────────────

interface SendMintParams {
  pool: RpcPool;
  provider: NetworkProvider;
  jettonMaster: Address;
  mintMsg: MintMessage;
}

async function sendMintAndWait(params: SendMintParams): Promise<string> {
  const { provider, jettonMaster, mintMsg } = params;
  const msgBody = encodeMintMessage(mintMsg);

  await provider.sender().send({
    to: jettonMaster,
    value: toNano("0.15"),
    body: msgBody,
    bounce: true,
  });

  await sleep(BLOCK_TIME_MS + 2000);
  return "submitted";
}

/**
 * Adaptive seqno poller.
 *
 * Strategy: start polling at `maxMs`, then tighten the interval as elapsed
 * time approaches `BLOCK_TIME_MS`. This reduces unnecessary RPC calls in the
 * slow phase while reacting quickly as the block window arrives.
 *
 * Poll interval formula:
 *   interval = max(minMs, maxMs * (1 - elapsed / BLOCK_TIME_MS))
 * After BLOCK_TIME_MS, the interval floors at minMs for the remainder.
 */
async function waitForSeqnoAdaptive(
  pool: RpcPool,
  wallet: WalletContractV4,
  seqnoBefore: number
): Promise<void> {
  const deadline = Date.now() + ENV.seqnoTimeoutMs;
  const start = Date.now();
  const minMs = ENV.seqnoPollMinMs;
  const maxMs = ENV.seqnoPollMaxMs;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - start;
    const ratio = Math.min(1, elapsed / BLOCK_TIME_MS);
    const interval = Math.max(minMs, maxMs * (1 - ratio));

    await sleep(interval);

    try {
      const contract = pool.current().open(wallet);
      const current = await withRetry(
        () => (contract as any).getSeqno() as Promise<number>,
        pool,
        3,
        500
      );
      if (current > seqnoBefore) return;
    } catch (err) {
      log(
        "warn",
        `Seqno poll error (will retry): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  throw new Error(
    formatMessage(
      "BATCH_SEQNO_DESYNC",
      `Seqno stuck at ${seqnoBefore} after ${ENV.seqnoTimeoutMs}ms`
    )
  );
}

/**
 * Encodes a MintMessage into a Cell body matching the V2 MasterMint struct.
 *
 * TL-B layout (TEP-74 §4.2 + messages.tact §2, op 0x642b7d07):
 *   op              : uint32   — MasterMint discriminator
 *   query_id        : uint64   — correlation ID (0 for fire-and-forget)
 *   to              : Address  — recipient wallet owner
 *   amount          : Coins    — jetton units
 *   response_address: Address  — CRITICAL V2 field: Excesses destination
 *   forward_ton_amount: Coins  — TON forwarded with TokenNotification
 *   custom_payload  : MaybeRef — optional KYC/compliance Cell
 *
 * Gas optimisations applied (April 2026 TL-B conventions):
 *   • `ihrDisabled = true` eliminates the IHR fee field from the in-msg.
 *   • `bounce = true` ensures failed mint ops return value to the admin.
 *   • `storeMaybeRef` (1-bit flag + optional ref) rather than always
 *     allocating a ref Cell — saves ~68 gas per null case.
 *   • Fields are ordered to align to cell boundaries naturally.
 */
function encodeMintMessage(msg: MintMessage): Cell {
  return beginCell()
    .storeUint(MINT_OP, 32)               // op-code: 0x642b7d07
    .storeUint(0, 64)                     // query_id: 0 (fire-and-forget)
    .storeAddress(msg.to)                 // to: recipient owner address
    .storeCoins(msg.amount)               // amount: jetton units
    .storeAddress(msg.responseAddress)    // response_address: V2 CRITICAL field
    .storeCoins(msg.forwardTonAmount)     // forward_ton_amount
    .storeMaybeRef(msg.customPayload)     // custom_payload: Maybe<Cell>
    .endCell();
}

// ─── Wallet & Chain Helpers ───────────────────────────────────────────────────

async function prepareAdminWallet(client: TonClient): Promise<{
  wallet: WalletContractV4;
  keyPair: { publicKey: Buffer; secretKey: Buffer };
}> {
  const keyPair = await mnemonicToPrivateKey(ENV.adminMnemonic);
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });

  if (!wallet.address.equals(EXPECTED_ADMIN)) {
  throw new Error(
    `ADMIN_MNEMONIC does not derive the expected admin wallet. Expected ${EXPECTED_ADMIN.toString()}, got ${wallet.address.toString()}`
  );
}

  const isDeployed = await client.isContractDeployed(wallet.address);
  if (!isDeployed) {
    throw new Error(
      formatMessage("WALLET_NOT_FOUND", `Admin wallet: ${wallet.address}`)
    );
  }

  return { wallet, keyPair };
}

async function deriveJettonWallet(
  client: TonClient,
  jettonMaster: Address,
  ownerAddress: Address
): Promise<Address> {
  const result = await client.runMethod(
    jettonMaster,
    "get_wallet_address",
    [
      {
        type: "slice",
        cell: beginCell().storeAddress(ownerAddress).endCell(),
      },
    ]
  );
  return result.stack.readAddress();
}

// ─── Data Loading & Validation ────────────────────────────────────────────────

async function loadTargets(filePath: string): Promise<TargetsFile> {
  const resolved = path.resolve(filePath);
  let raw: string;

  try {
    raw = await fs.readFile(resolved, "utf8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read targets file: ${msg}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      formatMessage("SYS_CONFIG_INVALID", "targets.json is not valid JSON.")
    );
  }

  return validateTargetsFile(parsed);
}

const VALID_TAGS = new Set<DistributionTag>(["Group_A", "Group_B"]);

function validateTargetsFile(raw: unknown): TargetsFile {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      formatMessage("SYS_CONFIG_INVALID", "Root must be an object.")
    );
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj["recipients"])) {
    throw new Error(
      formatMessage("SYS_CONFIG_INVALID", '"recipients" must be an array.')
    );
  }

  (obj["recipients"] as unknown[]).forEach((item, i) => {
    const r = item as Record<string, unknown>;
    if (
      typeof r["address"] !== "string" ||
      typeof r["amount"] !== "string" ||
      !VALID_TAGS.has(r["tag"] as DistributionTag)
    ) {
      throw new Error(
        formatMessage(
          "SYS_CONFIG_INVALID",
          `Invalid recipient at index ${i}: address, amount, and tag are required.`
        )
      );
    }
  });

  return raw as TargetsFile;
}

// ─── CSV Helper ───────────────────────────────────────────────────────────────

function buildCsvRow(result: RecipientResult, target: TargetEntry): CsvRow {
  const strategy =
    result.status === "success"
      ? result.strategy
      : AB_STRATEGIES[target.tag].label;
  const txHash = result.status === "success" ? result.txHash : null;
  const gasUsed = result.status === "success" ? result.forwardTon : "";

  return {
    index: result.index,
    address: result.address,
    amount: target.amount,
    tag: target.tag,
    strategy,
    status: result.status as PersistedStatus,
    txHash,
    gasUsed,
    payloadType: AB_STRATEGIES[target.tag].registryKey,
    completedAt: new Date().toISOString(),
  };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function buildReport(
  campaignId: string,
  results: RecipientResult[]
): RunReport {
  return {
    campaignId,
    network: ENV.network,
    dryRun: ENV.dryRun,
    totalTargets: results.length,
    succeeded: results.filter((r) => r.status === "success").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    completedAt: new Date().toISOString(),
  };
}

function printReport(report: RunReport): void {
  log("info", "─".repeat(60));
  log("info", `Run Report — Campaign: ${report.campaignId}`);
  log(
    "info",
    `Network : ${report.network}${report.dryRun ? " (DRY RUN)" : ""}`
  );
  log("info", `Total   : ${report.totalTargets}`);
  log("info", `Success : ${report.succeeded}`);
  log("info", `Skipped : ${report.skipped}`);
  log("info", `Failed  : ${report.failed}`);
  log("info", "─".repeat(60));

  for (const r of report.results) {
    const idx = `[${r.index + 1}]`;
    if (r.status === "success") {
      log(
        "info",
        `${idx} ✓ ${r.address} | ${r.strategy} | fwd: ${r.forwardTon} TON`
      );
    } else if (r.status === "skipped") {
      log(
        "warn",
        `${idx} ⚠ SKIPPED ${r.address} — code ${r.code}: ${r.reason.slice(0, 80)}`
      );
    } else {
      log(
        "error",
        `${idx} ✗ FAILED  ${r.address} — ${r.reason.slice(0, 80)}`
      );
    }
  }

  log("info", `Completed at: ${report.completedAt}`);
  log("info", "─".repeat(60));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, msg: string): void {
  const timestamp = new Date().toISOString();
  const icons: Record<LogLevel, string> = {
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
  };
  console.log(
    `${icons[level]} [${timestamp}] [${level.toUpperCase()}] ${msg}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
