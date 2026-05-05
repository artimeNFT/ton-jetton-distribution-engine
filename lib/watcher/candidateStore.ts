/**
 * candidateStore.ts
 *
 * Single-process append-only writers, dedup store, cursor persistence, and
 * rate cap enforcement for the Stage B-2 Watcher ingestion layer.
 *
 * SINGLE-PROCESS CONSTRAINT: This module assumes it is the only writer to the
 * candidate JSONL files within a given process lifetime. Multiple concurrent
 * processes writing to the same files are not supported in B2 first pass.
 * Multi-process safety (advisory locks, etc.) is deferred to a future design.
 *
 * APPEND PROTOCOL: JSONL appends use fs.appendFile (POSIX O_APPEND).
 * Write-to-temp + rename is used ONLY for the cursor file, which is a
 * full-overwrite operation where atomicity is well-defined (single JSON object,
 * entire file replaced). JSONL appends must never use write-to-temp + rename.
 *
 * DECISIONS CONSTRAINT: This module never writes decisions.jsonl.
 * decisions.jsonl is exclusively the domain of the decision layer.
 *
 * Path conventions (all relative to dataDir):
 *   candidates:       <dataDir>/<campaignId>-candidates.jsonl
 *   candidate-events: <dataDir>/<campaignId>-candidate-events.jsonl
 *   cursor:           <dataDir>/watcher-cursor.json
 *
 * DEDUP: Rebuilt from candidates.jsonl on startup. No separate dedup log file.
 * detectedAt on each candidate record provides the seenAt timestamp for TTL.
 *
 * RATE CAP: On overflow, emits rate_cap_data_loss candidate event before
 * discarding the candidate. Log-only drop is never acceptable.
 *
 * Hard constraints:
 * - No RunState reads or writes.
 * - No targets.json generation.
 * - No decisions.jsonl writes.
 * - No metadata mutation.
 * - No funding logic.
 * - No signing, sending, or broadcasting.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  CandidateEventRecord,
  CandidateRecord,
  ClockProvider,
  DedupStore,
  WatcherCursor,
} from "./ingestionTypes";

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function candidatesPath(dataDir: string, campaignId: string): string {
  return path.join(dataDir, `${campaignId}-candidates.jsonl`);
}

function candidateEventsPath(dataDir: string, campaignId: string): string {
  return path.join(dataDir, `${campaignId}-candidate-events.jsonl`);
}

function cursorPath(dataDir: string): string {
  return path.join(dataDir, "watcher-cursor.json");
}

// ─── Directory Initialization ─────────────────────────────────────────────────

async function ensureDataDir(dataDir: string): Promise<void> {
  await fs.promises.mkdir(dataDir, { recursive: true });
}

// ─── JSONL Append Writers ─────────────────────────────────────────────────────

/**
 * Appends a candidate record to <dataDir>/<campaignId>-candidates.jsonl.
 *
 * Uses fs.appendFile (POSIX O_APPEND). Single-process only.
 * Each record is written as a single JSON line terminated by \n.
 * Immutable after write: this function must never be called to modify
 * an existing candidate record.
 *
 * decisions.jsonl is never written by this function or any Watcher module.
 */
export async function appendCandidate(
  dataDir: string,
  campaignId: string,
  record: CandidateRecord,
): Promise<void> {
  await ensureDataDir(dataDir);
  const line = JSON.stringify(record) + "\n";
  await fs.promises.appendFile(candidatesPath(dataDir, campaignId), line, {
    encoding: "utf8",
  });
}

/**
 * Appends a candidate event record to
 * <dataDir>/<campaignId>-candidate-events.jsonl.
 *
 * Uses fs.appendFile (POSIX O_APPEND). Single-process only.
 * Each record is written as a single JSON line terminated by \n.
 *
 * This is the correct path for: trace_invalidated, gap_detected,
 * replay_started, replay_completed, buffer_overflow_data_loss,
 * rate_cap_data_loss, duplicate_observation.
 */
export async function appendCandidateEvent(
  dataDir: string,
  campaignId: string,
  event: CandidateEventRecord,
): Promise<void> {
  await ensureDataDir(dataDir);
  const line = JSON.stringify(event) + "\n";
  await fs.promises.appendFile(
    candidateEventsPath(dataDir, campaignId),
    line,
    { encoding: "utf8" },
  );
}

// ─── Dedup Store ──────────────────────────────────────────────────────────────

/**
 * Loads and returns the dedup store, rebuilt from candidates.jsonl.
 *
 * On startup, reads every line of candidates.jsonl, parses candidateId and
 * detectedAt, and loads them into an in-memory Map<string, number>.
 *
 * seenAt is derived from detectedAt (ISO 8601 → Unix ms). Lines that fail
 * to parse (corrupt or truncated) are skipped with a structured warn log;
 * this is not fatal.
 *
 * TTL filtering is applied at load time: entries whose detectedAt age exceeds
 * ttlMs are excluded from the initial Map.
 *
 * markSeen writes to the in-memory Map only. No file is written.
 * The dedup state is therefore consistent with candidates.jsonl at all times:
 * any candidateId that is in candidates.jsonl is in the Map, and vice versa
 * for the current process session.
 */
export async function loadDedupStore(
  dataDir: string,
  campaignId: string,
  ttlMs: number,
): Promise<DedupStore> {
  const store = new Map<string, number>();
  const filePath = candidatesPath(dataDir, campaignId);
  const nowMs = Date.now();

  // File may not exist yet (first run). That is not an error.
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, { encoding: "utf8" });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Normal on first run: return empty store.
      return makeDedupStore(store);
    }
    throw err;
  }

  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      logWarn("DEDUP_LOAD_PARSE_ERROR", {
        detail: "Failed to parse candidates.jsonl line; skipping",
        line: line.slice(0, 200),
      });
      continue;
    }

    if (
      typeof record !== "object" ||
      record === null ||
      typeof (record as Record<string, unknown>)["candidateId"] !== "string" ||
      typeof (record as Record<string, unknown>)["detectedAt"] !== "string"
    ) {
      logWarn("DEDUP_LOAD_MISSING_FIELDS", {
        detail: "candidates.jsonl line missing candidateId or detectedAt; skipping",
      });
      continue;
    }

    const rec = record as { candidateId: string; detectedAt: string };
    const seenAt = new Date(rec.detectedAt).getTime();
    if (!Number.isFinite(seenAt)) {
      logWarn("DEDUP_LOAD_INVALID_DETECTED_AT", {
        candidateId: rec.candidateId,
        detectedAt: rec.detectedAt,
        detail: "detectedAt is not a valid date; skipping dedup entry",
      });
      continue;
    }

    // Apply TTL filter at load time.
    if (nowMs - seenAt <= ttlMs) {
      store.set(rec.candidateId, seenAt);
    }
  }

  return makeDedupStore(store);
}

function makeDedupStore(store: Map<string, number>): DedupStore {
  return {
    isSeen(candidateId: string): boolean {
      return store.has(candidateId);
    },

    async markSeen(candidateId: string, seenAt: number): Promise<void> {
      store.set(candidateId, seenAt);
    },

    prune(nowMs: number, ttlMs: number): void {
      for (const [id, seenAt] of store) {
        if (nowMs - seenAt > ttlMs) {
          store.delete(id);
        }
      }
    },
  };
}

// ─── Cursor Persistence ───────────────────────────────────────────────────────

/**
 * Loads the watcher cursor from <dataDir>/watcher-cursor.json.
 *
 * Returns null if the file does not exist (first run).
 * Throws on malformed JSON or unexpected read errors.
 */
export async function loadCursor(
  dataDir: string,
): Promise<WatcherCursor | null> {
  const filePath = cursorPath(dataDir);
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, { encoding: "utf8" });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  return JSON.parse(raw) as WatcherCursor;
}

/**
 * Saves the watcher cursor to <dataDir>/watcher-cursor.json.
 *
 * Uses write-to-temp + rename (atomic full-overwrite). This is the only place
 * in this module where write-to-temp + rename is used; it is appropriate here
 * because the cursor file is a single JSON object replaced in its entirety.
 *
 * The temp file is written inside dataDir (same filesystem) to ensure the
 * rename is atomic at the OS level.
 */
export async function saveCursor(
  dataDir: string,
  cursor: WatcherCursor,
): Promise<void> {
  await ensureDataDir(dataDir);
  const finalPath = cursorPath(dataDir);
  const tempPath = path.join(
    dataDir,
    `watcher-cursor.${process.pid}.${Date.now()}.tmp`,
  );
  const content = JSON.stringify(cursor, null, 2);
  try {
    await fs.promises.writeFile(tempPath, content, { encoding: "utf8" });
    await fs.promises.rename(tempPath, finalPath);
  } catch (err) {
    // Best-effort cleanup of temp file; ignore cleanup errors.
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

// ─── Rate Cap ─────────────────────────────────────────────────────────────────

export interface RateCap {
  /**
   * Returns true if a candidate may be written in the current window.
   * Increments the internal counter on a true return.
   *
   * On false return, the caller MUST:
   *   1. Call appendCandidateEvent with eventType "rate_cap_data_loss".
   *   2. Discard the candidate.
   * Log-only drop is not permitted.
   */
  isAllowed(): boolean;
}

/**
 * Creates a rate cap enforcing at most maxPerMinute candidates per 60-second
 * window.
 *
 * The window is anchored to the first isAllowed() call (or to the clock
 * reading at construction time). This makes the window fully reproducible
 * in tests.
 *
 * maxPerMinute must be a positive integer. Throws synchronously if invalid.
 *
 * clock is injectable for deterministic tests.
 * Production callers pass () => Date.now() or omit it to use that default.
 * If clock() returns a non-finite value at any point, isAllowed() throws
 * rather than allowing undefined behavior.
 *
 * No randomness. Fixed 60-second window. No jitter.
 */
export function createRateCap(
  maxPerMinute: number,
  clock: ClockProvider = () => Date.now(),
): RateCap {
  if (!Number.isInteger(maxPerMinute) || maxPerMinute <= 0) {
    throw new Error(
      `createRateCap: maxPerMinute must be a positive integer, got ${maxPerMinute}`,
    );
  }

  const windowMs = 60_000;
  const initialNow = clock();
  if (!Number.isFinite(initialNow)) {
    throw new Error(
      `createRateCap: clock() returned non-finite value at construction: ${initialNow}`,
    );
  }
  let windowStart: number = initialNow;
  let count = 0;

  return {
    isAllowed(): boolean {
      const now = clock();
      if (!Number.isFinite(now)) {
        throw new Error(
          `createRateCap: clock() returned non-finite value: ${now}`,
        );
      }
      // Reset window if 60 seconds have elapsed since windowStart.
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      if (count >= maxPerMinute) {
        return false;
      }
      count += 1;
      return true;
    },
  };
}

// ─── Internal Structured Log Helper ──────────────────────────────────────────

/**
 * Writes a minimal structured JSON log line to stderr.
 * Internal only. Not exported.
 */
function logWarn(msg: string, extra?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    level: "warn",
    msg,
    ts: new Date().toISOString(),
    ...extra,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}