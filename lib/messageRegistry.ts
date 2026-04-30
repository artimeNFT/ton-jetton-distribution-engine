import { Builder, Cell, beginCell } from "@ton/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageCategory = "INFO" | "ERROR" | "NETWORK" | "MAINTENANCE" | "SYSTEM" | "ACTION";

export interface RegistryEntry {
  readonly category: MessageCategory;
  readonly message: string;
  readonly title: string; 
  readonly body: string;  
  readonly code: number;
  readonly opcode?: number; // ה-? הופך אותו לאופציונלי ומוחק את רוב השגיאות
}

/** All valid message keys derived from the registry at compile-time. */
export type MessageKey = keyof typeof MESSAGE_REGISTRY;

// ─── Snake-data serialisation ─────────────────────────────────────────────────

const CELL_MAX_BYTES = 127;

function encodeSnakeData(text: string): Cell {
  const textBytes = Buffer.from(text, "utf8");

  function packChunk(offset: number): Builder {
    const chunk = textBytes.subarray(offset, offset + CELL_MAX_BYTES);
    const builder = beginCell().storeBuffer(chunk);

    const nextOffset = offset + CELL_MAX_BYTES;
    if (nextOffset < textBytes.length) {
      builder.storeRef(packChunk(nextOffset).endCell());
    }

    return builder;
  }

  const ROOT_MAX_BYTES = CELL_MAX_BYTES - 4; // 123 bytes available in root
  const firstChunk = textBytes.subarray(0, ROOT_MAX_BYTES);
  const rootBuilder = beginCell()
    .storeUint(0x00000000, 32) // Standard text-comment prefix
    .storeBuffer(firstChunk);

  const nextOffset = ROOT_MAX_BYTES;
  if (nextOffset < textBytes.length) {
    rootBuilder.storeRef(packChunk(nextOffset).endCell());
  }

  return rootBuilder.endCell();
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const MESSAGE_REGISTRY = {
  // ── INFO ────────────────────────────────────────────────────────────────────
  TRANSACTION_PENDING: {
    category: "INFO",
    title: "Pending",
    body: "Transaction is currently awaiting block confirmation.",
    message: "Transaction pending",
    code: 1001,
  },
  
  // ── SYSTEM ──────────────────────────────────────────────────────────────────
  SYS_READY: { category: "SYSTEM", title: "Ready", body: "System initialized and registry loaded.", message: "System ready", code: 100 },
  SYS_DRY_RUN: { category: "SYSTEM", title: "Dry Run", body: "Running in simulation mode. No transactions will be sent.", message: "Dry run active", code: 101 },
  NET_CONNECTED: { category: "SYSTEM", title: "Network", body: "Successfully connected to TON network.", message: "Network connected", code: 102 },
  SYS_CONFIG_INVALID: { category: "ERROR", title: "Config Error", body: "The configuration or targets file is invalid.", message: "Invalid configuration", code: 406 },

  // ── BATCH & MINT ────────────────────────────────────────────────────────────
  BATCH_PARTIAL_FAILURE: { category: "ERROR", title: "Partial Failure", body: "Some mints in the batch failed.", message: "Batch partial failure", code: 400 },
  BATCH_COMPLETED: { category: "SYSTEM", title: "Batch Done", body: "All operations in the batch finished.", message: "Batch completed", code: 200 },
  BATCH_SEQNO_DESYNC: { category: "ERROR", title: "Seqno Desync", body: "Wallet sequence number out of sync.", message: "Sequence mismatch", code: 404 },
  
  MINT_SUCCESS: { category: "ACTION", title: "Mint Success", body: "Jettons successfully minted to destination.", message: "Mint successful", code: 201 },
  MINT_FAILED: { category: "ERROR", title: "Mint Failed", body: "The minting transaction failed or timed out.", message: "Mint failed", code: 500 },
  MINT_ZERO_AMOUNT: { category: "ERROR", title: "Zero Amount", body: "Cannot mint 0 jettons.", message: "Zero amount error", code: 402 },

  // ── VALIDATION ──────────────────────────────────────────────────────────────
  WALLET_ADDRESS_MISMATCH: { category: "ERROR", title: "Address Mismatch", body: "Derived wallet address does not match expected.", message: "Address mismatch", code: 401 },
  WALLET_NOT_FOUND: { category: "ERROR", title: "Not Found", body: "Target jetton wallet could not be found.", message: "Wallet not found", code: 405 },
  GAS_SAFEGUARD_TRIGGERED: { category: "ERROR", title: "Gas Safe", body: "Gas safeguard triggered to prevent drain.", message: "Gas safeguard active", code: 403 },
  INTERNAL_UNKNOWN: { category: "ERROR", title: "Unknown Error", body: "An unhandled internal error occurred.", message: "Internal error", code: 999 },
  TRANSACTION_CONFIRMED: 
  
  {
    category: "INFO",
    title: "Confirmed",
    body: "Transaction successfully validated on-chain.",
    message: "Transaction confirmed",
    code: 1002,
  },
  TRANSACTION_SUBMITTED: {
    category: "INFO",
    title: "Submitted",
    body: "Transaction has been broadcasted to the network mempool.",
    message: "Transaction submitted to mempool",
    code: 1003,
  },
  JETTON_TRANSFER_INITIATED: {
    category: "INFO",
    title: "Transfer Started",
    body: "The Jetton transfer process has begun.",
    message: "Jetton transfer initiated",
    code: 1004,
  },
  JETTON_TRANSFER_COMPLETE: {
    category: "INFO",
    title: "Transfer Success",
    body: "Jettons have been successfully delivered to the recipient.",
    message: "Jetton transfer complete",
    code: 1005,
  },
  JETTON_MINT_QUEUED: {
    category: "INFO",
    title: "Minting Queued",
    body: "The minting operation is waiting for execution.",
    message: "Jetton mint operation queued",
    code: 1006,
  },
  JETTON_BURN_QUEUED: {
    category: "INFO",
    title: "Burn Queued",
    body: "The burn operation is waiting for execution.",
    message: "Jetton burn operation queued",
    code: 1007,
  },
  BALANCE_SNAPSHOT_TAKEN: {
    category: "INFO",
    title: "Snapshot Recorded",
    body: "Current balance state has been saved to the database.",
    message: "Balance snapshot recorded",
    code: 1008,
  },
  WALLET_ACTIVATED: {
    category: "INFO",
    title: "Wallet Active",
    body: "Jetton wallet contract is now active on the blockchain.",
    message: "Jetton wallet activated on-chain",
    code: 1009,
  },
  OPERATION_SUCCESSFUL: {
    category: "INFO",
    title: "Success",
    body: "The requested operation was completed without issues.",
    message: "Operation completed successfully",
    code: 1010,
  },

  // ── ERROR ───────────────────────────────────────────────────────────────────
  TRANSACTION_FAILED: {
    category: "ERROR",
    title: "Execution Failed",
    body: "The transaction was rejected by the network or contract logic.",
    message: "Transaction execution failed",
    code: 2001,
  },
  TRANSACTION_TIMEOUT: {
    category: "ERROR",
    title: "Timeout",
    body: "The operation exceeded the maximum allowed time for confirmation.",
    message: "Transaction confirmation timeout exceeded",
    code: 2002,
  },
  INSUFFICIENT_BALANCE: {
    category: "ERROR",
    title: "Low Balance",
    body: "The account does not have enough Jettons to complete this task.",
    message: "Insufficient Jetton balance for operation",
    code: 2003,
  },
  INSUFFICIENT_GAS: {
    category: "ERROR",
    title: "Out of Gas",
    body: "Insufficient TON balance to cover blockchain transaction fees.",
    message: "Insufficient TON for gas fees",
    code: 2004,
  },
  INVALID_RECIPIENT: {
    category: "ERROR",
    title: "Invalid Address",
    body: "The recipient address is malformed or not an active wallet.",
    message: "Recipient address is invalid or inactive",
    code: 2005,
  },
  CONTRACT_EXECUTION_ERROR: {
    category: "ERROR",
    title: "Contract Error",
    body: "A logic error occurred within the smart contract execution.",
    message: "Smart contract execution error",
    code: 2006,
  },
  PAYLOAD_SERIALISATION_ERROR: {
    category: "ERROR",
    title: "Encoding Error",
    body: "Failed to format the message data for the blockchain.",
    message: "Message payload serialisation failed",
    code: 2007,
  },
  SIGNATURE_VERIFICATION_FAILED: {
    category: "ERROR",
    title: "Auth Failed",
    body: "Cryptographic signature verification did not match the sender.",
    message: "Transaction signature verification failed",
    code: 2008,
  },
  RATE_LIMIT_EXCEEDED: {
    category: "ERROR",
    title: "Throttled",
    body: "Too many requests in a short period. Please slow down.",
    message: "Operation rate limit exceeded",
    code: 2009,
  },
  UNAUTHORISED_OPERATION: {
    category: "ERROR",
    title: "Access Denied",
    body: "The caller does not have the required permissions for this action.",
    message: "Unauthorised operation attempted",
    code: 2010,
  },

  // ── NETWORK ─────────────────────────────────────────────────────────────────
  NETWORK_CONGESTION_DETECTED: {
    category: "NETWORK",
    title: "High Traffic",
    body: "TON network is experiencing heavy load. Fees may be higher.",
    message: "Network congestion detected — elevated fees expected",
    code: 3001,
  },
  NODE_SYNC_LAGGING: {
    category: "NETWORK",
    title: "Sync Lag",
    body: "The local node is behind the latest block height.",
    message: "Node synchronisation falling behind current block",
    code: 3002,
  },
  RPC_ENDPOINT_DEGRADED: {
    category: "NETWORK",
    title: "RPC Slowdown",
    body: "The connection to the blockchain provider is slow.",
    message: "RPC endpoint experiencing degraded performance",
    code: 3003,
  },
  RPC_ENDPOINT_UNREACHABLE: {
    category: "NETWORK",
    title: "RPC Offline",
    body: "Cannot connect to the blockchain provider. Trying failover.",
    message: "RPC endpoint unreachable — failover initiated",
    code: 3004,
  },
  SHARD_ROUTING_DELAY: {
    category: "NETWORK",
    title: "Routing Delay",
    body: "Cross-shard communication is taking longer than usual.",
    message: "Cross-shard message routing delay detected",
    code: 3005,
  },
  BLOCK_FINALITY_DELAYED: {
    category: "NETWORK",
    title: "Finality Lag",
    body: "Blocks are being produced but finality is not yet reached.",
    message: "Block finality confirmation delayed",
    code: 3006,
  },
  MEMPOOL_BACKLOG_HIGH: {
    category: "NETWORK",
    title: "Mempool Full",
    body: "Many transactions are waiting. Rebroadcasting might help.",
    message: "Mempool backlog elevated — rebroadcast may be required",
    code: 3007,
  },
  NETWORK_RESTORED: {
    category: "NETWORK",
    title: "Network OK",
    body: "Connectivity and performance have returned to baseline.",
    message: "Network conditions restored to normal",
    code: 3008,
  },

  // ── MAINTENANCE ─────────────────────────────────────────────────────────────
  MAINTENANCE_MODE_ACTIVE: {
    category: "MAINTENANCE",
    title: "Paused",
    body: "System is in maintenance. All transactions are suspended.",
    message: "Maintenance mode active — operations suspended",
    code: 4001,
  },
  MAINTENANCE_MODE_EXITING: {
    category: "MAINTENANCE",
    title: "Resuming",
    body: "Maintenance is over. Re-enabling system functions.",
    message: "Exiting maintenance mode — resuming operations",
    code: 4002,
  },
  CONTRACT_UPGRADE_PENDING: {
    category: "MAINTENANCE",
    title: "Upgrade Started",
    body: "A smart contract upgrade is in progress. Please wait.",
    message: "Contract upgrade pending — please await completion",
    code: 4003,
  },
  CONTRACT_UPGRADE_COMPLETE: {
    category: "MAINTENANCE",
    title: "Upgrade Done",
    body: "Smart contracts have been successfully updated.",
    message: "Contract upgrade complete — normal operation resumed",
    code: 4004,
  },
  ADMIN_INTERVENTION_REQUIRED: {
    category: "MAINTENANCE",
    title: "Admin Needed",
    body: "An issue requires manual resolution by the administrator.",
    message: "Administrative intervention required",
    code: 4005,
  },
  PROTOCOL_INTEGRITY_REQUIRED: {
    category: "MAINTENANCE",
    title: "Security Alert",
    body: "Protocol mismatch detected. Action required.",
    message: "452",
    code: 452,
  },
  SCHEDULED_DOWNTIME_IMMINENT: {
    category: "MAINTENANCE",
    title: "Downtime Soon",
    body: "System will go offline for maintenance shortly.",
    message: "Scheduled downtime commencing shortly",
    code: 4006,
  },
  CONFIGURATION_RELOAD: {
    category: "MAINTENANCE",
    title: "Reloading",
    body: "System settings are being updated from the config file.",
    message: "System configuration reload in progress",
    code: 4007,
  },
  AUDIT_SNAPSHOT_IN_PROGRESS: {
    category: "MAINTENANCE",
    title: "Auditing",
    body: "Generating a system audit snapshot. Operations are paused.",
    message: "Audit snapshot in progress — writes paused",
    code: 4008,
  },
} satisfies Record<string, RegistryEntry>;

// ─── Convenience utilities ────────────────────────────────────────────────────

/** Retrieves a RegistryEntry by key. */
export function getMessage(key: MessageKey): RegistryEntry {
  const entry = MESSAGE_REGISTRY[key];
  if (!entry) throw new Error(`[Registry] Key ${key} not found`);
  return entry;
}

/** * Formats a message for logging. 
 * Supports an optional detail string.
 */
export function formatMessage(key: MessageKey, detail?: string): string {
  const entry = getMessage(key);
  const base = `[${entry.code}] ${entry.category} | ${entry.title}: ${entry.message}`;
  return detail ? `${base} — ${detail}` : `${base} — ${entry.body}`;
}

/** * Returns a Cell ready for forward_payload.
 * Unified version for bulkMint.ts
 */
/** * Returns a Cell ready for forward_payload.
 * Unified version for bulkMint.ts
 */
export function packMessageToCell(key: MessageKey, suffix?: string): Cell {
  const entry = getMessage(key);
  const fullText = suffix ? `${entry.message}: ${suffix}` : entry.message;
  
  // הפיכת הטקסט ל-Buffer וקריאה לפונקציית העזר
  return serializeSnakeData(Buffer.from(fullText, "utf8"));
}

/**
 * Internal helper to serialize buffer into TON snake-formatted cells.
 */
function serializeSnakeData(data: Buffer): Cell {
  const chunks: Buffer[] = [];
  for (let i = 0; i < data.length; i += 127) {
    chunks.push(data.slice(i, i + 127));
  }
  let cur = beginCell();
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    const next = cur;
    cur = beginCell();
    cur.storeBuffer(chunk);
    if (i < chunks.length - 1) {
      cur.storeRef(next.endCell());
    }
  }
  return cur.endCell();
}