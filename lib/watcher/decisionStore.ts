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

import {
  buildDecisionId,
  validateBuildCandidateDecisionRecordInput,
  type BuildCandidateDecisionRecordInput,
  type CandidateDecisionRecord,
  type CandidateDecisionValidationIssue,
} from "./candidateDecision";
import type { CandidateRecord } from "./ingestionTypes";

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

export type DecisionStoreRecordValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly issues?: readonly CandidateDecisionValidationIssue[];
    };

function decisionRecordToValidationInput(
  record: CandidateDecisionRecord,
): BuildCandidateDecisionRecordInput {
  return {
    candidate: {
      candidateId: record.candidateId,
      detectedAt: record.candidateObservedAt,
      finality: record.finalitySnapshot.finality,
    } as CandidateRecord,
    decisionRunId: record.decisionRunId,
    builderRunId: record.builderRunId,
    decision: record.decision,
    decisionReason: record.decisionReason,
    decisionAt: record.decisionAt,
    candidateAgeMs: record.candidateAgeMs,
    decidedBy: record.decidedBy,
    manualOverride: record.manualOverride,
    traceability: record.traceability,
    budgetSnapshot: record.budgetSnapshot,
    finalitySnapshot: record.finalitySnapshot,
    rulesetSnapshot: record.rulesetSnapshot,
    blacklistSnapshot: record.blacklistSnapshot,
    schemaVersion: record.schemaVersion,
  };
}

export function validateDecisionStoreRecord(
  record: CandidateDecisionRecord,
): DecisionStoreRecordValidationResult {
  const input = decisionRecordToValidationInput(record);
  const validation = validateBuildCandidateDecisionRecordInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      reason: "record_validation_failed",
      issues: validation.issues,
    };
  }

  const expectedDecisionId = buildDecisionId({
    candidateId: record.candidateId,
    decisionRunId: record.decisionRunId,
    decisionReason: record.decisionReason,
    rulesetVersion: record.rulesetSnapshot.rulesetVersion,
    blacklistVersion: record.blacklistSnapshot.blacklistVersion,
    budgetPolicyVersion: record.budgetSnapshot.budgetPolicyVersion,
  });

  if (record.decisionId !== expectedDecisionId) {
    return { ok: false, reason: "decision_id_mismatch" };
  }

  return { ok: true };
}

export type DecisionStoreDuplicateClassification =
  | { readonly kind: "new_record" }
  | { readonly kind: "identical_duplicate"; readonly existingDecisionId: string }
  | {
      readonly kind: "conflicting_duplicate";
      readonly existingDecisionId: string;
      readonly reason: string;
    };

function canonicalRecordContent(record: CandidateDecisionRecord): string {
  return JSON.stringify(record);
}

function hasSameCandidateDecisionRun(
  existing: CandidateDecisionRecord,
  incoming: CandidateDecisionRecord,
): boolean {
  return (
    existing.candidateId === incoming.candidateId &&
    existing.decisionRunId === incoming.decisionRunId
  );
}

function hasSnapshotConflict(
  existing: CandidateDecisionRecord,
  incoming: CandidateDecisionRecord,
): boolean {
  return (
    JSON.stringify(existing.rulesetSnapshot) !== JSON.stringify(incoming.rulesetSnapshot) ||
    JSON.stringify(existing.blacklistSnapshot) !== JSON.stringify(incoming.blacklistSnapshot) ||
    JSON.stringify(existing.budgetSnapshot) !== JSON.stringify(incoming.budgetSnapshot) ||
    JSON.stringify(existing.finalitySnapshot) !== JSON.stringify(incoming.finalitySnapshot)
  );
}

export function classifyDecisionStoreDuplicate(
  existing: CandidateDecisionRecord | null,
  incoming: CandidateDecisionRecord,
): DecisionStoreDuplicateClassification {
  if (existing === null) {
    return { kind: "new_record" };
  }

  if (existing.decisionId === incoming.decisionId) {
    if (canonicalRecordContent(existing) === canonicalRecordContent(incoming)) {
      return {
        kind: "identical_duplicate",
        existingDecisionId: existing.decisionId,
      };
    }

    return {
      kind: "conflicting_duplicate",
      existingDecisionId: existing.decisionId,
      reason: "same_decision_id_different_content",
    };
  }

  if (hasSameCandidateDecisionRun(existing, incoming)) {
    if (hasSnapshotConflict(existing, incoming)) {
      return {
        kind: "conflicting_duplicate",
        existingDecisionId: existing.decisionId,
        reason: "same_candidate_run_snapshot_conflict",
      };
    }

    if (canonicalRecordContent(existing) !== canonicalRecordContent(incoming)) {
      return {
        kind: "conflicting_duplicate",
        existingDecisionId: existing.decisionId,
        reason: "same_candidate_run_different_content",
      };
    }
  }

  return { kind: "new_record" };
}

export interface DecisionStoreInMemoryIndex {
  readonly byDecisionId: ReadonlyMap<string, CandidateDecisionRecord>;
  readonly validRecordCount: number;
  readonly identicalDuplicateCount: number;
}

export type DecisionStoreInMemoryIndexResult =
  | { readonly ok: true; readonly index: DecisionStoreInMemoryIndex }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly decisionId?: string;
      readonly candidateId?: string;
      readonly decisionRunId?: string;
    };

function findConflictingCandidateRunRecord(
  records: readonly CandidateDecisionRecord[],
  incoming: CandidateDecisionRecord,
): CandidateDecisionRecord | null {
  for (const existing of records) {
    if (
      existing.candidateId === incoming.candidateId &&
      existing.decisionRunId === incoming.decisionRunId
    ) {
      return existing;
    }
  }

  return null;
}

export function buildDecisionStoreInMemoryIndex(
  records: readonly CandidateDecisionRecord[],
): DecisionStoreInMemoryIndexResult {
  const byDecisionId = new Map<string, CandidateDecisionRecord>();
  const acceptedRecords: CandidateDecisionRecord[] = [];
  let identicalDuplicateCount = 0;

  for (const record of records) {
    const validation = validateDecisionStoreRecord(record);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        decisionId: record.decisionId,
        candidateId: record.candidateId,
        decisionRunId: record.decisionRunId,
      };
    }

    const sameDecisionId = byDecisionId.get(record.decisionId) ?? null;
    const sameCandidateRun = findConflictingCandidateRunRecord(acceptedRecords, record);
    const existing = sameDecisionId ?? sameCandidateRun;

    const classification = classifyDecisionStoreDuplicate(existing, record);

    if (classification.kind === "conflicting_duplicate") {
      return {
        ok: false,
        reason: classification.reason,
        decisionId: record.decisionId,
        candidateId: record.candidateId,
        decisionRunId: record.decisionRunId,
      };
    }

    if (classification.kind === "identical_duplicate") {
      identicalDuplicateCount += 1;
      continue;
    }

    byDecisionId.set(record.decisionId, record);
    acceptedRecords.push(record);
  }

  return {
    ok: true,
    index: {
      byDecisionId,
      validRecordCount: byDecisionId.size,
      identicalDuplicateCount,
    },
  };
}
