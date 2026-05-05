/**
 * commanderState.ts
 *
 * Read-only Commander safety-state interface for the Stage B-2 Watcher.
 *
 * The Commander is the future control plane. This module reads a JSON file
 * written by the Commander process and exposes a typed, fail-closed interface.
 *
 * No Commander implementation exists in the tracked repository at this
 * checkpoint. In B2 first pass, the Commander state file is absent.
 * All absent-file, malformed-file, and stale-file cases return a passive
 * state with candidateWritesAllowed: false.
 *
 * Hard constraints:
 * - Read-only. No Commander mutations are ever performed by this module.
 * - Fail-closed: any uncertainty → emergencyStop true, candidateWritesAllowed false.
 * - lockdown: true keeps status "active" — no new status value is introduced.
 *   isCandidateWriteAllowed returns false when lockdown is true, independent
 *   of status.
 * - reason: string | null is preserved on all states for audit traceability.
 * - No logging dependency. Callers write structured log lines.
 * - No I/O beyond reading the Commander state file.
 * - No signing, sending, broadcasting, execution of any kind.
 */

import * as fs from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Operational mode of the Commander process.
 *
 * "active"          – Commander is running normally. lockdown may still be true.
 * "emergency_stop"  – Emergency stop is active. All writes blocked.
 * "passive"         – Used for file-absent, malformed, or stale states.
 *                     Always implies candidateWritesAllowed: false.
 * "unavailable"     – Commander process is unreachable (future use).
 *
 * lockdown: true does not introduce a new status. It keeps status "active"
 * while blocking candidate writes via isCandidateWriteAllowed.
 */
export type CommanderSafetyStatus =
  | "active"
  | "emergency_stop"
  | "passive"
  | "unavailable";

/**
 * Snapshot of Commander safety state at a point in time.
 *
 * isCandidateWriteAllowed must be called to determine write permission.
 * status alone is not sufficient: lockdown: true blocks writes even when
 * status is "active".
 *
 * reason is preserved for audit. It is non-null whenever a condition caused
 * writes to be blocked (e.g. "lockdown_active", "commander_state_file_absent").
 */
export interface CommanderSafetyState {
  readonly status: CommanderSafetyStatus;
  readonly emergencyStop: boolean;
  readonly lockdown: boolean;
  readonly candidateWritesAllowed: boolean;
  readonly reason: string | null;
  readonly checkedAt: string;           // ISO 8601
}

/**
 * Read-only interface for the Commander state.
 * No mutation methods. No side effects beyond file I/O.
 */
export interface CommanderStateReader {
  readSafetyState(): Promise<CommanderSafetyState>;
}

// ─── Fail-Closed Guard ────────────────────────────────────────────────────────

/**
 * Returns true only when ALL of the following hold:
 *   - status === "active"
 *   - emergencyStop === false
 *   - lockdown === false
 *   - candidateWritesAllowed === true
 *
 * status is an explicit gate: a state with status "passive", "emergency_stop",
 * or "unavailable" always returns false, even if the boolean fields were
 * somehow inconsistently set. This prevents any unknown or degraded status
 * from accidentally permitting writes.
 */
export function isCandidateWriteAllowed(
  state: CommanderSafetyState,
): boolean {
  return (
    state.status === "active" &&
    !state.emergencyStop &&
    !state.lockdown &&
    state.candidateWritesAllowed
  );
}

// ─── Passive State Constructor ────────────────────────────────────────────────

/**
 * Returns a passive (fail-closed) state with the given reason preserved.
 *
 * Always sets:
 *   status: "passive"
 *   emergencyStop: true
 *   lockdown: false
 *   candidateWritesAllowed: false
 *   reason: <provided string>
 *   checkedAt: current ISO 8601 wall-clock time
 *
 * Used for: file-absent, malformed, stale, and any other condition where
 * the Commander state cannot be determined with confidence.
 */
export function makePassiveState(reason: string): CommanderSafetyState {
  return {
    status: "passive",
    emergencyStop: true,
    lockdown: false,
    candidateWritesAllowed: false,
    reason,
    checkedAt: new Date().toISOString(),
  };
}

// ─── File-Based Reader ────────────────────────────────────────────────────────

/**
 * Creates a file-based CommanderStateReader.
 *
 * Reads a JSON file at stateFilePath on each readSafetyState() call.
 * The file is expected to contain a CommanderSafetyState-compatible JSON object.
 *
 * Fail-closed behavior:
 *   - File absent (ENOENT)     → makePassiveState("commander_state_file_absent")
 *   - File malformed (parse)   → makePassiveState("commander_state_file_malformed")
 *   - checkedAt missing/stale  → makePassiveState("commander_state_stale")
 *   - Unexpected read error    → makePassiveState("commander_state_read_error:<msg>")
 *   - emergencyStop: true      → returned as-is (already blocks writes)
 *   - lockdown: true           → returned as-is; isCandidateWriteAllowed handles it
 *
 * maxAgeMs: maximum acceptable age of the state file's checkedAt timestamp.
 * If the state is older than maxAgeMs, it is treated as stale and passive
 * mode is returned.
 *
 * The file path is passed in by the caller. This module does not read
 * environment variables.
 */
export function createFileCommanderStateReader(
  stateFilePath: string,
  maxAgeMs: number,
): CommanderStateReader {
  return {
    async readSafetyState(): Promise<CommanderSafetyState> {
      let raw: string;
      try {
        raw = await fs.promises.readFile(stateFilePath, { encoding: "utf8" });
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return makePassiveState("commander_state_file_absent");
        }
        const msg =
          err instanceof Error ? err.message : String(err);
        return makePassiveState(`commander_state_read_error:${msg}`);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return makePassiveState("commander_state_file_malformed");
      }

      if (typeof parsed !== "object" || parsed === null) {
        return makePassiveState("commander_state_file_malformed");
      }

      const obj = parsed as Record<string, unknown>;

      // Validate checkedAt presence and staleness.
      if (typeof obj["checkedAt"] !== "string") {
        return makePassiveState("commander_state_stale");
      }
      const checkedAtMs = new Date(obj["checkedAt"] as string).getTime();
      if (!Number.isFinite(checkedAtMs)) {
        return makePassiveState("commander_state_stale");
      }
      if (Date.now() - checkedAtMs > maxAgeMs) {
        return makePassiveState("commander_state_stale");
      }

      // Validate required boolean fields. Any missing field → passive.
      if (typeof obj["emergencyStop"] !== "boolean") {
        return makePassiveState("commander_state_file_malformed");
      }
      if (typeof obj["lockdown"] !== "boolean") {
        return makePassiveState("commander_state_file_malformed");
      }
      if (typeof obj["candidateWritesAllowed"] !== "boolean") {
        return makePassiveState("commander_state_file_malformed");
      }

      // Validate status field.
      // Unknown status values fail closed to passive — they must not be treated
      // as a benign "unavailable" that might still permit writes through the
      // boolean fields. Only the four known values are accepted.
      const rawStatus = obj["status"];
      if (
        rawStatus !== "active" &&
        rawStatus !== "emergency_stop" &&
        rawStatus !== "passive" &&
        rawStatus !== "unavailable"
      ) {
        return makePassiveState("commander_state_unknown_status");
      }
      const status: CommanderSafetyStatus = rawStatus;

      const fileReason =
        typeof obj["reason"] === "string" ? obj["reason"] : null;

      const emergencyStop = obj["emergencyStop"] as boolean;
      const lockdown = obj["lockdown"] as boolean;
      const candidateWritesAllowed = obj["candidateWritesAllowed"] as boolean;

      // Normalize reason fields for known unsafe conditions.
      // emergencyStop: true with no reason → supply "emergency_stop_active" for audit.
      // lockdown: true → always force candidateWritesAllowed false and set reason
      //   "lockdown_active", regardless of what the file contained. This applies
      //   even if candidateWritesAllowed was already false in the file.
      let resolvedReason = fileReason;
      let resolvedWritesAllowed = candidateWritesAllowed;

      if (emergencyStop && resolvedReason === null) {
        resolvedReason = "emergency_stop_active";
      }

      if (lockdown) {
        resolvedWritesAllowed = false;
        resolvedReason = "lockdown_active";
      }

      const state: CommanderSafetyState = {
        status,
        emergencyStop,
        lockdown,
        candidateWritesAllowed: resolvedWritesAllowed,
        reason: resolvedReason,
        checkedAt: obj["checkedAt"] as string,
      };

      return state;
    },
  };
}