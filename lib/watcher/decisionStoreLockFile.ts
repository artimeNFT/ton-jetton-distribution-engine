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
  decideDecisionStoreLockAcquire,
  decideDecisionStoreLockRelease,
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

function isErrnoException(error: unknown): error is { readonly code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

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
  } catch (error) {
    return {
      ok: false,
      reason: isErrnoException(error) && error.code === "ENOENT"
        ? "lock_file_missing"
        : "lock_file_read_failed",
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

export type DecisionStoreLockFileAcquireResult =
  | {
      readonly ok: true;
      readonly action: "acquired";
      readonly normalizedPath: string;
      readonly lock: DecisionStoreLockRecord;
    }
  | {
      readonly ok: false;
      readonly action: "active_lock";
      readonly normalizedPath: string;
      readonly existingLock: DecisionStoreLockRecord;
      readonly requestedOwnerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "acquire_failed";
      readonly reason: string;
      readonly normalizedPath?: string;
    };

export async function acquireDecisionStoreLockFileShell(
  path: string,
  requestedLock: DecisionStoreLockRecord,
  nowMs: number,
): Promise<DecisionStoreLockFileAcquireResult> {
  const existingRead = await readDecisionStoreLockFile(path);

  if (!existingRead.ok && existingRead.reason !== "lock_file_missing") {
    return {
      ok: false,
      action: "acquire_failed",
      reason: existingRead.reason,
      normalizedPath: existingRead.normalizedPath,
    };
  }

  const acquireDecision = decideDecisionStoreLockAcquire(
    existingRead.ok ? existingRead.lock : null,
    requestedLock.ownerId,
    nowMs,
  );

  if (acquireDecision.action === "active_lock") {
    return {
      ok: false,
      action: "active_lock",
      normalizedPath: existingRead.ok ? existingRead.normalizedPath : path,
      existingLock: acquireDecision.existingLock,
      requestedOwnerId: acquireDecision.requestedOwnerId,
    };
  }

  if (!acquireDecision.ok) {
    return {
      ok: false,
      action: "acquire_failed",
      reason: acquireDecision.reason,
      normalizedPath: existingRead.ok ? existingRead.normalizedPath : undefined,
    };
  }

  const writeResult = await writeDecisionStoreLockFile(path, requestedLock);
  if (!writeResult.ok) {
    return {
      ok: false,
      action: "acquire_failed",
      reason: writeResult.reason,
      normalizedPath: writeResult.normalizedPath,
    };
  }

  return {
    ok: true,
    action: "acquired",
    normalizedPath: writeResult.normalizedPath,
    lock: requestedLock,
  };
}

export type DecisionStoreLockFileReleaseResult =
  | {
      readonly ok: true;
      readonly action: "release_allowed";
      readonly normalizedPath: string;
      readonly lockId: string;
      readonly ownerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "release_owner_mismatch";
      readonly normalizedPath: string;
      readonly existingLock: DecisionStoreLockRecord;
      readonly requestedOwnerId: string;
    }
  | {
      readonly ok: false;
      readonly action: "release_failed";
      readonly reason: string;
      readonly normalizedPath?: string;
    };

export async function releaseDecisionStoreLockFileShell(
  path: string,
  requestedOwnerId: string,
): Promise<DecisionStoreLockFileReleaseResult> {
  const existingRead = await readDecisionStoreLockFile(path);

  if (!existingRead.ok) {
    return {
      ok: false,
      action: "release_failed",
      reason: existingRead.reason,
      normalizedPath: existingRead.normalizedPath,
    };
  }

  const releaseDecision = decideDecisionStoreLockRelease(existingRead.lock, requestedOwnerId);

  if (releaseDecision.action === "release_owner_mismatch") {
    return {
      ok: false,
      action: "release_owner_mismatch",
      normalizedPath: existingRead.normalizedPath,
      existingLock: releaseDecision.existingLock,
      requestedOwnerId: releaseDecision.requestedOwnerId,
    };
  }

  if (!releaseDecision.ok) {
    return {
      ok: false,
      action: "release_failed",
      reason: releaseDecision.reason,
      normalizedPath: existingRead.normalizedPath,
    };
  }

  return {
    ok: true,
    action: "release_allowed",
    normalizedPath: existingRead.normalizedPath,
    lockId: releaseDecision.lockId,
    ownerId: releaseDecision.ownerId,
  };
}
