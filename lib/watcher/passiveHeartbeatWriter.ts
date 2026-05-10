import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  validatePassiveHeartbeatRecord,
  type PassiveHeartbeatRecord,
} from "./passiveHeartbeat";

const HEARTBEAT_PATH_PREFIX = "data/heartbeat/";
const HEARTBEAT_DEFAULT_FILE = "data/heartbeat/heartbeats.jsonl";

export type PassiveHeartbeatPathPreflightResult =
  | { readonly ok: true; readonly normalizedPath: string }
  | { readonly ok: false; readonly reason: string };

export type PassiveHeartbeatAppendResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

export type PassiveHeartbeatSerializationResult =
  | { readonly ok: true; readonly line: string }
  | { readonly ok: false; readonly reason: string };

function containsShellMetacharacter(value: string): boolean {
  return /[;&|`$<>(){}[\]*?!]/.test(value);
}

export function defaultPassiveHeartbeatPath(): string {
  return HEARTBEAT_DEFAULT_FILE;
}

export function preflightPassiveHeartbeatPath(
  path: string,
): PassiveHeartbeatPathPreflightResult {
  const normalizedPath = path.replaceAll("\\", "/").trim();

  if (normalizedPath.length === 0) return { ok: false, reason: "empty_path" };
  if (normalizedPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPath)) {
    return { ok: false, reason: "absolute_path_not_allowed" };
  }
  if (!normalizedPath.startsWith(HEARTBEAT_PATH_PREFIX)) {
    return { ok: false, reason: "path_outside_heartbeat_dir" };
  }
  if (normalizedPath.split("/").some((part) => part.length === 0)) {
    return { ok: false, reason: "empty_path_segment" };
  }
  if (normalizedPath.split("/").includes("..")) {
    return { ok: false, reason: "path_traversal_not_allowed" };
  }
  if (containsShellMetacharacter(normalizedPath)) {
    return { ok: false, reason: "shell_metacharacter_not_allowed" };
  }

  return { ok: true, normalizedPath };
}

export function serializePassiveHeartbeatRecord(
  record: PassiveHeartbeatRecord,
): PassiveHeartbeatSerializationResult {
  const validation = validatePassiveHeartbeatRecord(record);
  if (!validation.ok) return { ok: false, reason: "record_validation_failed" };

  return { ok: true, line: `${JSON.stringify(record)}\n` };
}

export async function appendPassiveHeartbeatRecord(
  path: string,
  record: PassiveHeartbeatRecord,
): Promise<PassiveHeartbeatAppendResult> {
  const pathPreflight = preflightPassiveHeartbeatPath(path);
  if (!pathPreflight.ok) {
    return { ok: false, reason: pathPreflight.reason };
  }

  const serialization = serializePassiveHeartbeatRecord(record);
  if (!serialization.ok) {
    return { ok: false, reason: serialization.reason };
  }

  await mkdir(dirname(pathPreflight.normalizedPath), { recursive: true });
  await appendFile(pathPreflight.normalizedPath, serialization.line, "utf8");

  return { ok: true, path: pathPreflight.normalizedPath };
}
