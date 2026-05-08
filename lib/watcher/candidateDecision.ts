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
