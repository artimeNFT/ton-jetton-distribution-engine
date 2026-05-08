/**
 * candidateDecision.ts
 *
 * Pure Candidate Decision types and deterministic ID construction.
 *
 * Hard constraints:
 * - No I/O.
 * - No network.
 * - No wall-clock reads.
 * - No randomness.
 * - No store writes.
 * - No target generation.
 * - No Dispatcher coupling.
 * - No RunState reads/writes.
 * - No signing, sending, broadcasting, or execution.
 */

import { createHash } from "crypto";
import type { CandidateRecord } from "./ingestionTypes";

export type CandidateDecisionState =
  | "pending"
  | "accepted"
  | "rejected"
  | "stale"
  | "manual_hold"
  | "invalidated";

export type CandidateDecisionReason =
  | "finality_not_confirmed"
  | "candidate_stale"
  | "profile_missing"
  | "profile_risky"
  | "blacklist_match"
  | "amount_invalid"
  | "budget_exceeded"
  | "budget_unknown"
  | "duplicate_candidate"
  | "manual_hold_required"
  | "manual_override_accept"
  | "manual_override_reject"
  | "policy_accept";

export type BudgetDecision =
  | "within_budget"
  | "exceeds_budget"
  | "budget_unknown"
  | "manual_review_required";

export interface CandidateBudgetSnapshot {
  readonly globalBudgetLimit: string;
  readonly globalBudgetUsedBeforeDecision: string;
  readonly globalBudgetAvailableBeforeDecision: string;
  readonly candidateAmount: string;
  readonly budgetCurrencyOrUnit: string;
  readonly budgetSnapshotAt: string;
  readonly budgetPolicyVersion: string;
  readonly budgetDecision: BudgetDecision;
}

export interface CandidateFinalitySnapshot {
  readonly finality: CandidateRecord["finality"];
  readonly confirmationDepthUsed: number | null;
  readonly finalityDecision: string;
}

export interface CandidateRulesetSnapshot {
  readonly rulesetVersion: string;
  readonly ruleIds: readonly string[];
}

export interface CandidateBlacklistSnapshot {
  readonly blacklistVersion: string;
  readonly matched: boolean;
  readonly matchReason: string | null;
}

export interface CandidateDecisionRecord {
  readonly decisionId: string;
  readonly candidateId: string;
  readonly decisionRunId: string;
  readonly builderRunId: string | null;
  readonly decision: CandidateDecisionState;
  readonly decisionReason: CandidateDecisionReason;
  readonly decisionAt: string;
  readonly candidateObservedAt: string;
  readonly candidateAgeMs: number;
  readonly decidedBy: string;
  readonly manualOverride: boolean;
  readonly rulesetVersion: string;
  readonly blacklistVersion: string;
  readonly schemaVersion: string;
  readonly traceability: CandidateDecisionTraceability;
  readonly budgetSnapshot: CandidateBudgetSnapshot;
  readonly finalitySnapshot: CandidateFinalitySnapshot;
  readonly rulesetSnapshot: CandidateRulesetSnapshot;
  readonly blacklistSnapshot: CandidateBlacklistSnapshot;
}

export interface CandidateDecisionTraceability {
  readonly eventId: string | null;
  readonly txHash: string;
  readonly traceId: string | null;
  readonly lt: string;
  readonly actionIndex: string;
  readonly sourceProvider: string;
  readonly sourceEndpoint: string;
  readonly observedAt: string;
  readonly receivedAt: string;
}

export interface CandidateDecisionIdInput {
  readonly candidateId: string;
  readonly decisionRunId: string;
  readonly decisionReason: CandidateDecisionReason;
  readonly rulesetVersion: string;
  readonly blacklistVersion: string;
  readonly budgetPolicyVersion: string;
}

export function buildDecisionKeyString(input: CandidateDecisionIdInput): string {
  return [
    input.candidateId,
    input.decisionRunId,
    input.decisionReason,
    input.rulesetVersion,
    input.blacklistVersion,
    input.budgetPolicyVersion,
  ].join(":::");
}

export function hashDecisionKey(keyString: string): string {
  return createHash("sha256").update(keyString, "utf8").digest("hex");
}

export function buildDecisionId(input: CandidateDecisionIdInput): string {
  return hashDecisionKey(buildDecisionKeyString(input));
}

export interface BuildCandidateDecisionRecordInput {
  readonly candidate: CandidateRecord;
  readonly decisionRunId: string;
  readonly builderRunId: string | null;
  readonly decision: CandidateDecisionState;
  readonly decisionReason: CandidateDecisionReason;
  readonly decisionAt: string;
  readonly candidateAgeMs: number;
  readonly decidedBy: string;
  readonly manualOverride: boolean;
  readonly traceability: CandidateDecisionTraceability;
  readonly budgetSnapshot: CandidateBudgetSnapshot;
  readonly finalitySnapshot: CandidateFinalitySnapshot;
  readonly rulesetSnapshot: CandidateRulesetSnapshot;
  readonly blacklistSnapshot: CandidateBlacklistSnapshot;
  readonly schemaVersion: string;
}

export function buildCandidateDecisionRecord(
  input: BuildCandidateDecisionRecordInput,
): CandidateDecisionRecord {
  const decisionId = buildDecisionId({
    candidateId: input.candidate.candidateId,
    decisionRunId: input.decisionRunId,
    decisionReason: input.decisionReason,
    rulesetVersion: input.rulesetSnapshot.rulesetVersion,
    blacklistVersion: input.blacklistSnapshot.blacklistVersion,
    budgetPolicyVersion: input.budgetSnapshot.budgetPolicyVersion,
  });

  return {
    decisionId,
    candidateId: input.candidate.candidateId,
    decisionRunId: input.decisionRunId,
    builderRunId: input.builderRunId,
    decision: input.decision,
    decisionReason: input.decisionReason,
    decisionAt: input.decisionAt,
    candidateObservedAt: input.candidate.detectedAt,
    candidateAgeMs: input.candidateAgeMs,
    decidedBy: input.decidedBy,
    manualOverride: input.manualOverride,
    rulesetVersion: input.rulesetSnapshot.rulesetVersion,
    blacklistVersion: input.blacklistSnapshot.blacklistVersion,
    schemaVersion: input.schemaVersion,
    traceability: input.traceability,
    budgetSnapshot: input.budgetSnapshot,
    finalitySnapshot: input.finalitySnapshot,
    rulesetSnapshot: input.rulesetSnapshot,
    blacklistSnapshot: input.blacklistSnapshot,
  };
}

export type CandidateDecisionValidationReason =
  | "missing_candidate_id"
  | "missing_decision_run_id"
  | "invalid_decision_at"
  | "invalid_candidate_observed_at"
  | "invalid_candidate_age_ms"
  | "missing_decided_by"
  | "missing_schema_version"
  | "missing_trace_tx_hash"
  | "invalid_trace_tx_hash"
  | "invalid_trace_id"
  | "invalid_trace_lt"
  | "invalid_trace_action_index"
  | "missing_trace_source"
  | "invalid_trace_observed_at"
  | "invalid_trace_received_at"
  | "invalid_budget_amount"
  | "invalid_budget_consistency"
  | "invalid_budget_policy_version"
  | "invalid_budget_snapshot_at"
  | "invalid_finality_depth"
  | "missing_finality_decision"
  | "missing_ruleset_version"
  | "missing_blacklist_version";

export interface CandidateDecisionValidationIssue {
  readonly reason: CandidateDecisionValidationReason;
  readonly field: string;
  readonly detail: string;
}

export type CandidateDecisionValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly CandidateDecisionValidationIssue[];
    };

function isNonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoLike(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isDecimalString(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

function isSaneIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_:\/+=.-]+$/.test(value);
}

function pushIssue(
  issues: CandidateDecisionValidationIssue[],
  reason: CandidateDecisionValidationReason,
  field: string,
  detail: string,
): void {
  issues.push({ reason, field, detail });
}

export function validateBuildCandidateDecisionRecordInput(
  input: BuildCandidateDecisionRecordInput,
): CandidateDecisionValidationResult {
  const issues: CandidateDecisionValidationIssue[] = [];

  if (!isNonEmpty(input.candidate.candidateId)) {
    pushIssue(issues, "missing_candidate_id", "candidate.candidateId", "required");
  }

  if (!isNonEmpty(input.decisionRunId)) {
    pushIssue(issues, "missing_decision_run_id", "decisionRunId", "required");
  }

  if (!isIsoLike(input.decisionAt)) {
    pushIssue(issues, "invalid_decision_at", "decisionAt", "must parse as date");
  }

  if (!isIsoLike(input.candidate.detectedAt)) {
    pushIssue(issues, "invalid_candidate_observed_at", "candidate.detectedAt", "must parse as date");
  }

  if (!Number.isInteger(input.candidateAgeMs) || input.candidateAgeMs < 0) {
    pushIssue(issues, "invalid_candidate_age_ms", "candidateAgeMs", "must be non-negative integer");
  }

  if (!isNonEmpty(input.traceability.txHash)) {
    pushIssue(issues, "missing_trace_tx_hash", "traceability.txHash", "required");
  } else if (!isSaneIdentifier(input.traceability.txHash)) {
    pushIssue(issues, "invalid_trace_tx_hash", "traceability.txHash", "invalid format");
  }

  if (input.traceability.traceId !== null && !isSaneIdentifier(input.traceability.traceId)) {
    pushIssue(issues, "invalid_trace_id", "traceability.traceId", "invalid format");
  }

  if (!isDecimalString(input.traceability.lt)) {
    pushIssue(issues, "invalid_trace_lt", "traceability.lt", "must be decimal string");
  }

  if (!isDecimalString(input.traceability.actionIndex)) {
    pushIssue(issues, "invalid_trace_action_index", "traceability.actionIndex", "must be decimal string");
  }

  if (!isNonEmpty(input.traceability.sourceProvider) || !isNonEmpty(input.traceability.sourceEndpoint)) {
    pushIssue(issues, "missing_trace_source", "traceability.source", "provider and endpoint are required");
  }

  if (!isIsoLike(input.traceability.observedAt)) {
    pushIssue(issues, "invalid_trace_observed_at", "traceability.observedAt", "must parse as date");
  }

  if (!isIsoLike(input.traceability.receivedAt)) {
    pushIssue(issues, "invalid_trace_received_at", "traceability.receivedAt", "must parse as date");
  }

  const budgetAmounts = [
    ["budgetSnapshot.globalBudgetLimit", input.budgetSnapshot.globalBudgetLimit],
    ["budgetSnapshot.globalBudgetUsedBeforeDecision", input.budgetSnapshot.globalBudgetUsedBeforeDecision],
    ["budgetSnapshot.globalBudgetAvailableBeforeDecision", input.budgetSnapshot.globalBudgetAvailableBeforeDecision],
    ["budgetSnapshot.candidateAmount", input.budgetSnapshot.candidateAmount],
  ] as const;

  for (const [field, value] of budgetAmounts) {
    if (!isDecimalString(value)) {
      pushIssue(issues, "invalid_budget_amount", field, "must be decimal string");
    }
  }

  if (
    isDecimalString(input.budgetSnapshot.globalBudgetLimit) &&
    isDecimalString(input.budgetSnapshot.globalBudgetUsedBeforeDecision) &&
    isDecimalString(input.budgetSnapshot.globalBudgetAvailableBeforeDecision)
  ) {
    const limit = BigInt(input.budgetSnapshot.globalBudgetLimit);
    const used = BigInt(input.budgetSnapshot.globalBudgetUsedBeforeDecision);
    const available = BigInt(input.budgetSnapshot.globalBudgetAvailableBeforeDecision);
    if (used + available !== limit) {
      pushIssue(issues, "invalid_budget_consistency", "budgetSnapshot", "used plus available must equal limit");
    }
  }

  if (!isNonEmpty(input.budgetSnapshot.budgetPolicyVersion)) {
    pushIssue(issues, "invalid_budget_policy_version", "budgetSnapshot.budgetPolicyVersion", "required");
  }

  if (!isIsoLike(input.budgetSnapshot.budgetSnapshotAt)) {
    pushIssue(issues, "invalid_budget_snapshot_at", "budgetSnapshot.budgetSnapshotAt", "must parse as date");
  }

  if (
    input.finalitySnapshot.confirmationDepthUsed !== null &&
    (!Number.isInteger(input.finalitySnapshot.confirmationDepthUsed) ||
      input.finalitySnapshot.confirmationDepthUsed < 0)
  ) {
    pushIssue(issues, "invalid_finality_depth", "finalitySnapshot.confirmationDepthUsed", "must be null or non-negative integer");
  }

  if (!isNonEmpty(input.finalitySnapshot.finalityDecision)) {
    pushIssue(issues, "missing_finality_decision", "finalitySnapshot.finalityDecision", "required");
  }

  if (!isNonEmpty(input.rulesetSnapshot.rulesetVersion)) {
    pushIssue(issues, "missing_ruleset_version", "rulesetSnapshot.rulesetVersion", "required");
  }

  if (!isNonEmpty(input.blacklistSnapshot.blacklistVersion)) {
    pushIssue(issues, "missing_blacklist_version", "blacklistSnapshot.blacklistVersion", "required");
  }

  if (!isNonEmpty(input.decidedBy)) {
    pushIssue(issues, "missing_decided_by", "decidedBy", "required");
  }

  if (!isNonEmpty(input.schemaVersion)) {
    pushIssue(issues, "missing_schema_version", "schemaVersion", "required");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export type CandidateDecisionBuildResult =
  | { readonly ok: true; readonly record: CandidateDecisionRecord }
  | {
      readonly ok: false;
      readonly issues: readonly CandidateDecisionValidationIssue[];
    };

export function tryBuildCandidateDecisionRecord(
  input: BuildCandidateDecisionRecordInput,
): CandidateDecisionBuildResult {
  const validation = validateBuildCandidateDecisionRecordInput(input);

  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }

  return {
    ok: true,
    record: buildCandidateDecisionRecord(input),
  };
}
