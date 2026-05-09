/**
 * decisionStoreLockFile.ts
 *
 * Minimal Decision Store lock file reader/writer shell.
 *
 * No atomic acquire.
 * No release/delete.
 * No append/recovery integration.
 * No Dispatcher / RunState / targets / execution coupling.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { preflightDecisionStorePath } from "./decisionStore";
import {
  validateDecisionStoreLockRecord,
  type DecisionStoreLockRecord,
} from "./decisionStoreLock";

export type DecisionStoreLockFileReadResult =
  | {
      readonly ok: true;
      readonly normalizedPath: string;
      readonly lock: DecisionStoreLockRecord;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly normalizedPath?: string;
    };

export type DecisionStoreLockFileWriteResult =
  | {
      readonly ok: true;
      readonly action: "written";
      readonly normalizedPath: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly normalizedPath?: string;
    };

function serializeDecisionStoreLockRecord(record: DecisionStoreLockRecord): string {
  return `${JSON.stringify(record)}\n`;
}

function parseDecisionStoreLockRecord(content: string): DecisionStoreLockFileReadResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return { ok: false, reason: "lock_parse_failed" };
  }

  const record = parsed as DecisionStoreLockRecord;
  const validation = validateDecisionStoreLockRecord(record);

  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  return {
    ok: true,
    normalizedPath: "",
    lock: record,
  };
}

export async function readDecisionStoreLockFile(
  path: string,
): Promise<DecisionStoreLockFileReadResult> {
  const pathPreflight = preflightDecisionStorePath(path);

  if (!pathPreflight.ok) {
    return { ok: false, reason: pathPreflight.reason };
  }

  try {
    const content = await readFile(pathPreflight.normalizedPath, "utf8");
    const parsed = parseDecisionStoreLockRecord(content);

    if (!parsed.ok) {
      return {
        ok: false,
        reason: parsed.reason,
        normalizedPath: pathPreflight.normalizedPath,
      };
    }

    return {
      ok: true,
      normalizedPath: pathPreflight.normalizedPath,
      lock: parsed.lock,
    };
  } catch {
    return {
      ok: false,
      reason: "lock_file_read_failed",
      normalizedPath: pathPreflight.normalizedPath,
    };
  }
}

export async function writeDecisionStoreLockFile(
  path: string,
  record: DecisionStoreLockRecord,
): Promise<DecisionStoreLockFileWriteResult> {
  const pathPreflight = preflightDecisionStorePath(path);

  if (!pathPreflight.ok) {
    return { ok: false, reason: pathPreflight.reason };
  }

  const validation = validateDecisionStoreLockRecord(record);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      normalizedPath: pathPreflight.normalizedPath,
    };
  }

  const normalizedPath = pathPreflight.normalizedPath;
  const tempPath = `${normalizedPath}.tmp`;

  try {
    await mkdir(dirname(normalizedPath), { recursive: true });
    await writeFile(tempPath, serializeDecisionStoreLockRecord(record), "utf8");
    await rename(tempPath, normalizedPath);

    return {
      ok: true,
      action: "written",
      normalizedPath,
    };
  } catch {
    return {
      ok: false,
      reason: "lock_file_write_failed",
      normalizedPath,
    };
  }
}
