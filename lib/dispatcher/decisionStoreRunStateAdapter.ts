import type { CandidateDecisionRecord } from "../watcher/candidateDecision";
import type { CandidateRecord } from "../watcher/ingestionTypes";
import {
  makeStateKey,
  type StateEntry,
  type StateKey,
} from "./stateStore";

// ---------------------------------------------------------------------------
// Reason union
// ---------------------------------------------------------------------------

export type DecisionStoreRunStateAdapterReason =
  | "invalid_input"
  | "invalid_decision_record"
  | "invalid_candidate_record"
  | "candidate_id_mismatch"
  | "decision_not_accepted"
  | "unsupported_accept_reason"
  | "amount_mismatch"
  | "invalid_batch_id"
  | "invalid_recipient_index"
  | "invalid_now_iso"
  | "invalid_recipient_address"
  | "invalid_amount";

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface DispatchIntentEvidence {
  readonly decisionId: string;
  readonly candidateId: string;
  readonly decisionRunId: string;
  readonly decisionReason: string;
  readonly traceTxHash: string;
  readonly traceLt: string;
  readonly traceActionIndex: string;
  readonly jettonMasterCanonicalKey: string;
  readonly destinationCanonicalKey: string;
}

// ---------------------------------------------------------------------------
// DispatchIntent
// ---------------------------------------------------------------------------

export interface DispatchIntent {
  readonly stateKey: StateKey;
  readonly entry: StateEntry;
  readonly decisionId: string;
  readonly candidateId: string;
  readonly evidence: DispatchIntentEvidence;
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type DecisionStoreRunStateAdapterResult =
  | {
      readonly ok: true;
      readonly action: "dispatch_intent_ready";
      readonly intent: DispatchIntent;
    }
  | {
      readonly ok: false;
      readonly action: "rejected";
      readonly reason: DecisionStoreRunStateAdapterReason;
    };

// ---------------------------------------------------------------------------
// Input interface
// ---------------------------------------------------------------------------

interface AdapterInput {
  readonly decisionRecord: CandidateDecisionRecord;
  readonly candidateRecord: CandidateRecord;
  readonly batchId: unknown;
  readonly recipientIndex: unknown;
  readonly nowIso: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isValidDecimalAmount(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function isValidIso(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function rejected(
  reason: DecisionStoreRunStateAdapterReason,
): DecisionStoreRunStateAdapterResult {
  return { ok: false, action: "rejected", reason };
}

const SUPPORTED_ACCEPT_REASONS = new Set<string>([
  "policy_accept",
  "manual_override_accept",
]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function buildDispatchIntentFromDecision(
  input: unknown,
): DecisionStoreRunStateAdapterResult {
  // Rule 1: input must be a non-null, non-array object
  if (!isNonArrayObject(input)) {
    return rejected("invalid_input");
  }

  const candidate = input as unknown as AdapterInput;

  // Rule 2: decisionRecord structural validation
  if (!isNonArrayObject(candidate.decisionRecord)) {
    return rejected("invalid_decision_record");
  }

  const dr = candidate.decisionRecord as unknown as Record<string, unknown>;

  if (
    !isNonEmptyString(dr["decisionId"]) ||
    !isNonEmptyString(dr["candidateId"]) ||
    !isNonEmptyString(dr["decisionRunId"]) ||
    !isNonEmptyString(dr["decisionReason"]) ||
    !isNonEmptyString(dr["decision"])
  ) {
    return rejected("invalid_decision_record");
  }

  // budgetSnapshot.candidateAmount
  if (!isNonArrayObject(dr["budgetSnapshot"])) {
    return rejected("invalid_decision_record");
  }
  const budgetSnapshot = dr["budgetSnapshot"] as Record<string, unknown>;
  if (!isNonEmptyString(budgetSnapshot["candidateAmount"])) {
    return rejected("invalid_decision_record");
  }

  // traceability
  if (!isNonArrayObject(dr["traceability"])) {
    return rejected("invalid_decision_record");
  }
  const traceability = dr["traceability"] as Record<string, unknown>;
  if (
    !isNonEmptyString(traceability["txHash"]) ||
    !isNonEmptyString(traceability["lt"]) ||
    !isNonEmptyString(traceability["actionIndex"])
  ) {
    return rejected("invalid_decision_record");
  }

  // Rule 3: candidateRecord structural validation
  if (!isNonArrayObject(candidate.candidateRecord)) {
    return rejected("invalid_candidate_record");
  }

  const cr = candidate.candidateRecord as unknown as Record<string, unknown>;

  if (
    !isNonEmptyString(cr["candidateId"]) ||
    typeof cr["destinationAddress"] !== "string" ||
    !isNonEmptyString(cr["destinationCanonicalKey"]) ||
    !isNonEmptyString(cr["jettonMasterCanonicalKey"]) ||
    !isNonEmptyString(cr["amount"])
  ) {
    return rejected("invalid_candidate_record");
  }

  // Rule 4: candidateId must match exactly
  if (dr["candidateId"] !== cr["candidateId"]) {
    return rejected("candidate_id_mismatch");
  }

  // Rule 5: decision must equal "accepted"
  if (dr["decision"] !== "accepted") {
    return rejected("decision_not_accepted");
  }

  // Rule 6: accepted reason must be supported
  if (!SUPPORTED_ACCEPT_REASONS.has(dr["decisionReason"] as string)) {
    return rejected("unsupported_accept_reason");
  }

  // Rule 7: amounts must match exactly
  if ((cr["amount"] as string) !== (budgetSnapshot["candidateAmount"] as string)) {
    return rejected("amount_mismatch");
  }

  // Rule 8: batchId must be non-empty string after trim
  if (!isNonEmptyString(candidate.batchId)) {
    return rejected("invalid_batch_id");
  }
  const batchId = (candidate.batchId as string).trim();

  // Rule 9: recipientIndex must be safe integer >= 0
  if (!isSafeNonNegativeInteger(candidate.recipientIndex)) {
    return rejected("invalid_recipient_index");
  }
  const recipientIndex = candidate.recipientIndex as number;

  // Rule 10: nowIso must be valid ISO string
  if (!isValidIso(candidate.nowIso)) {
    return rejected("invalid_now_iso");
  }
  const nowIso = candidate.nowIso as string;

  // Rule 11: destinationAddress must be non-empty string
  const destinationAddress = cr["destinationAddress"] as string;
  if (!isNonEmptyString(destinationAddress)) {
    return rejected("invalid_recipient_address");
  }

  // Rule 12: amount must be valid positive decimal string
  const amount = cr["amount"] as string;
  if (!isValidDecimalAmount(amount)) {
    return rejected("invalid_amount");
  }

  // Rule 13: stateKey
  const stateKey: StateKey = makeStateKey(batchId, destinationAddress);

  // Typed aliases
  const decisionId = dr["decisionId"] as string;
  const candidateId = cr["candidateId"] as string;
  const decisionRunId = dr["decisionRunId"] as string;
  const decisionReason = dr["decisionReason"] as string;
  const jettonMasterCanonicalKey = cr["jettonMasterCanonicalKey"] as string;
  const destinationCanonicalKey = cr["destinationCanonicalKey"] as string;
  const traceTxHash = traceability["txHash"] as string;
  const traceLt = traceability["lt"] as string;
  const traceActionIndex = traceability["actionIndex"] as string;

  // Rule 14: entry
  const entry: StateEntry = {
    batchId,
    recipientAddress: destinationAddress,
    recipientIndex,
    amount,
    status: "planned",
    attemptNumber: 0,
    operatorId: null,
    operatorLabel: null,
    txHash: null,
    networkRef: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    submittedAt: null,
    finalizedAt: null,
    cooldownUntil: null,
    lastErrorCode: null,
    lastError: null,
    lastDecision: null,
    metadata: {
      source: "decision_store_adapter",
      decisionId,
      candidateId,
      decisionRunId,
      decisionReason,
      traceability: {
        txHash: traceTxHash,
        lt: traceLt,
        actionIndex: traceActionIndex,
      },
      jettonMasterCanonicalKey,
      destinationCanonicalKey,
    },
  };

  const evidence: DispatchIntentEvidence = {
    decisionId,
    candidateId,
    decisionRunId,
    decisionReason,
    traceTxHash,
    traceLt,
    traceActionIndex,
    jettonMasterCanonicalKey,
    destinationCanonicalKey,
  };

  const intent: DispatchIntent = {
    stateKey,
    entry,
    decisionId,
    candidateId,
    evidence,
  };

  return { ok: true, action: "dispatch_intent_ready", intent };
}
