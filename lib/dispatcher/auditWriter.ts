/**
 * @file lib/dispatcher/auditWriter.ts
 * @description CSV audit writer for TON distribution engine.
 *
 * Appends one audit row per recipient attempt.
 * Ensures the target directory exists, writes a header once per file,
 * and escapes CSV fields safely.
 */

import * as fs from "fs/promises";
import * as path from "path";

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface AuditRow {
  timestamp: string;          // ISO string
  campaignId: string;
  batchId: string;
  recipientAddress: string;
  amount: string;             // bigint serialized as decimal string
  status: string;             // success / failed / skipped / uncertain / etc.
  attempts: number;
  walletLabel?: string;
  txHash?: string;
  reason?: string;
  error?: string;
}

export interface AuditWriterOptions {
  filePath: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Appends one CSV audit row to `filePath`.
 * If the file does not exist yet, writes the CSV header first.
 */
export async function appendAuditRow(
  options: AuditWriterOptions,
  row: AuditRow
): Promise<void> {
  validateOptions(options);
  validateAuditRow(row);

  const resolvedPath = path.resolve(options.filePath);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });

  const exists = await fileExists(resolvedPath);
  const lines: string[] = [];

  if (!exists) {
    lines.push(buildHeader());
  }

  lines.push(buildRow(row));

  await fs.appendFile(resolvedPath, lines.join("\n") + "\n", "utf8");
}

/**
 * Appends multiple audit rows in one operation.
 * Writes the CSV header once if the file does not exist.
 */
export async function appendAuditRows(
  options: AuditWriterOptions,
  rows: AuditRow[]
): Promise<void> {
  validateOptions(options);

  if (!Array.isArray(rows)) {
    throw new Error(`[auditWriter] rows must be an array.`);
  }

  if (rows.length === 0) {
    return;
  }

  for (let i = 0; i < rows.length; i++) {
    validateAuditRow(rows[i]!);
  }

  const resolvedPath = path.resolve(options.filePath);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });

  const exists = await fileExists(resolvedPath);
  const lines: string[] = [];

  if (!exists) {
    lines.push(buildHeader());
  }

  for (const row of rows) {
    lines.push(buildRow(row));
  }

  await fs.appendFile(resolvedPath, lines.join("\n") + "\n", "utf8");
}

/**
 * Builds a deterministic default CSV file name for a campaign.
 * Example:
 *   reports/mint_report_<campaignId>_<timestamp>.csv
 */
export function buildAuditFilePath(
  reportDir: string,
  campaignId: string,
  timestampIso: string = new Date().toISOString()
): string {
  assertNonEmptyString(reportDir, "reportDir");
  assertNonEmptyString(campaignId, "campaignId");
  assertNonEmptyString(timestampIso, "timestampIso");

  const safeTimestamp = timestampIso.replace(/[:.]/g, "-");
  return path.join(reportDir, `mint_report_${campaignId}_${safeTimestamp}.csv`);
}

// ─── CSV Builders ─────────────────────────────────────────────────────────────

function buildHeader(): string {
  return [
    "timestamp",
    "campaignId",
    "batchId",
    "recipientAddress",
    "amount",
    "status",
    "attempts",
    "walletLabel",
    "txHash",
    "reason",
    "error",
  ].join(",");
}

function buildRow(row: AuditRow): string {
  const fields = [
    row.timestamp,
    row.campaignId,
    row.batchId,
    row.recipientAddress,
    row.amount,
    row.status,
    String(row.attempts),
    row.walletLabel ?? "",
    row.txHash ?? "",
    row.reason ?? "",
    row.error ?? "",
  ];

  return fields.map(csvEscape).join(",");
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, `""`);
  return `"${escaped}"`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateOptions(options: AuditWriterOptions): void {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new Error(`[auditWriter] options must be an object.`);
  }

  assertNonEmptyString(options.filePath, "filePath");
}

function validateAuditRow(row: AuditRow): void {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`[auditWriter] row must be an object.`);
  }

  assertNonEmptyString(row.timestamp, "row.timestamp");
  assertNonEmptyString(row.campaignId, "row.campaignId");
  assertNonEmptyString(row.batchId, "row.batchId");
  assertNonEmptyString(row.recipientAddress, "row.recipientAddress");
  assertNonEmptyString(row.amount, "row.amount");
  assertNonEmptyString(row.status, "row.status");

  if (!/^\d+$/.test(row.amount.trim())) {
    throw new Error(
      `[auditWriter] row.amount must be a non-empty unsigned decimal integer string. Received: "${row.amount}"`
    );
  }

  if (!Number.isInteger(row.attempts) || row.attempts < 0) {
    throw new Error(
      `[auditWriter] row.attempts must be an integer >= 0. Received: ${String(row.attempts)}`
    );
  }

  if (row.walletLabel !== undefined && typeof row.walletLabel !== "string") {
    throw new Error(`[auditWriter] row.walletLabel must be a string when provided.`);
  }

  if (row.txHash !== undefined && typeof row.txHash !== "string") {
    throw new Error(`[auditWriter] row.txHash must be a string when provided.`);
  }

  if (row.reason !== undefined && typeof row.reason !== "string") {
    throw new Error(`[auditWriter] row.reason must be a string when provided.`);
  }

  if (row.error !== undefined && typeof row.error !== "string") {
    throw new Error(`[auditWriter] row.error must be a string when provided.`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`[auditWriter] ${name} must be a non-empty string.`);
  }
}