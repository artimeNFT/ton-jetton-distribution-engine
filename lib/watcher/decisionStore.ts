/**
 * decisionStore.ts
 *
 * Pure Decision Store serialization helpers.
 *
 * Hard constraints:
 * - No filesystem.
 * - No append.
 * - No locks.
 * - No recovery scan.
 * - No adapter.
 * - No targets.
 * - No Dispatcher coupling.
 * - No RunState reads/writes.
 * - No signing, sending, broadcasting, or execution.
 */

import type { CandidateDecisionRecord } from "./candidateDecision";

export type DecisionStoreSerializationResult =
  | { readonly ok: true; readonly line: string }
  | { readonly ok: false; readonly reason: string };

export type DecisionStoreParseResult =
  | { readonly ok: true; readonly record: CandidateDecisionRecord }
  | { readonly ok: false; readonly reason: string };

export function serializeDecisionRecordToJsonl(
  record: CandidateDecisionRecord,
): DecisionStoreSerializationResult {
  try {
    const line = JSON.stringify(record);

    if (line.includes("\n") || line.includes("\r")) {
      return { ok: false, reason: "serialized_record_contains_newline" };
    }

    return { ok: true, line: `${line}\n` };
  } catch {
    return { ok: false, reason: "serialization_failed" };
  }
}

export function parseDecisionRecordJsonlLine(
  line: string,
): DecisionStoreParseResult {
  if (line.includes("\n") || line.includes("\r")) {
    return { ok: false, reason: "line_contains_newline" };
  }

  try {
    const parsed = JSON.parse(line);

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "parsed_record_not_object" };
    }

    const candidate = parsed as Partial<CandidateDecisionRecord>;

    if (
      typeof candidate.decisionId !== "string" ||
      typeof candidate.candidateId !== "string" ||
      typeof candidate.decisionRunId !== "string"
    ) {
      return { ok: false, reason: "parsed_record_missing_required_fields" };
    }

    return { ok: true, record: parsed as CandidateDecisionRecord };
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
}
