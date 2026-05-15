import * as assert from "assert/strict";
import { createHash } from "node:crypto";
import { buildDispatchIntentFromDecision } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import { planRunStateDispatchIntentApply } from "../lib/dispatcher/runStatePlanApply";
import {
  createEmptyRunState,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import { planDispatcherDryRunIntake } from "../lib/dispatcher/dispatcherDryRunIntake";
import { planDispatcherDryRunTransition } from "../lib/dispatcher/dispatcherDryRunTransitionPlan";
import type { CandidateDecisionRecord } from "../lib/watcher/candidateDecision";
import type { CandidateRecord } from "../lib/watcher/ingestionTypes";
import type { DispatchIntent } from "../lib/dispatcher/decisionStoreRunStateAdapter";
import type { BatchRecipient } from "../lib/dispatcher/batchPlanner";
import type { OperatorPlanCandidate } from "../lib/dispatcher/dispatcherDryRunTransitionPlan";

const LABEL = "[g-2-deterministic-execution-context-audit-smoke]";

const NOW_ISO = "2026-01-01T00:00:00.000Z";
const CAMPAIGN_ID = "campaign-g2";
const BATCH_ID = "campaign-g2-batch-1";
const CANDIDATE_ID = "candidate-g2-001";
const DECISION_ID = "decision-g2-001";
const DECISION_RUN_ID = "decision-run-g2-001";
const DESTINATION_ADDRESS = "EQDestinationMixedCaseG2";
const DESTINATION_CANONICAL_KEY = "0:destination-canonical-g2";
const JETTON_MASTER_CANONICAL_KEY = "0:jetton-master-g2";
const AMOUNT = "777888999";

function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForCanonicalJson(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = normalizeForCanonicalJson(record[key]);
    }
    return out;
  }

  return value;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeCandidateRecord(
  overrides: Partial<CandidateRecord> = {},
): CandidateRecord {
  return {
    candidateId: CANDIDATE_ID,
    destinationAddress: DESTINATION_ADDRESS,
    destinationCanonicalKey: DESTINATION_CANONICAL_KEY,
    jettonMasterCanonicalKey: JETTON_MASTER_CANONICAL_KEY,
    amount: AMOUNT,
    ...overrides,
  } as unknown as CandidateRecord;
}

function makeDecisionRecord(
  overrides: Partial<CandidateDecisionRecord> = {},
): CandidateDecisionRecord {
  return {
    decisionId: DECISION_ID,
    candidateId: CANDIDATE_ID,
    decisionRunId: DECISION_RUN_ID,
    decision: "accepted",
    decisionReason: "policy_accept",
    budgetSnapshot: { candidateAmount: AMOUNT },
    traceability: {
      txHash: "tx-hash-g2-001",
      lt: "11223344556",
      actionIndex: "0",
    },
    ...overrides,
  } as unknown as CandidateDecisionRecord;
}

function makeRunStateWithCampaign(): RunState {
  return createEmptyRunState(CAMPAIGN_ID, NOW_ISO);
}

function makeActiveOperator(id: string, label: string): OperatorPlanCandidate {
  return {
    operatorId: id,
    operatorLabel: label,
    status: "active",
    cooldownUntil: null,
    failedUntil: null,
  };
}

function makeOperatorPolicy() {
  return {
    eligibleOperators: [
      makeActiveOperator("op-g2-a", "Operator G2-A"),
      makeActiveOperator("op-g2-b", "Operator G2-B"),
    ],
    previousOperatorId: null,
    selectionSeed: "operator-seed-g2",
  };
}

function makeProviderPolicy() {
  return {
    eligibleProviders: [
      { providerId: "provider-g2-a", endpointKey: "endpoint-g2-a", status: "active" as const },
    ],
    selectionSeed: "provider-seed-g2",
  };
}

function makeFeePolicy() {
  return {
    baseFeeNano: "1000",
    maxFeeNano: "2000",
    tierStepNano: "10",
    tierCount: 10,
    selectionSeed: "fee-seed-g2",
  };
}

function buildIntent(
  decisionRecord = makeDecisionRecord(),
  candidateRecord = makeCandidateRecord(),
): DispatchIntent {
  const result = buildDispatchIntentFromDecision({
    decisionRecord,
    candidateRecord,
    batchId: BATCH_ID,
    recipientIndex: 0,
    nowIso: NOW_ISO,
  });

  if (!result.ok) throw new Error(`buildIntent failed: ${result.reason}`);
  return result.intent;
}

function makeBatchFromEntry(entry: StateEntry): unknown {
  const ev = entry as unknown as Record<string, unknown>;
  const amount = BigInt(ev["amount"] as string);

  return {
    batchId: ev["batchId"],
    index: 0,
    recipients: [
      { address: ev["recipientAddress"], amount } as unknown as BatchRecipient,
    ],
    totalAmount: amount,
    size: 1,
  };
}

function runExecutionContextAuditFixture(): {
  readonly sourceFixture: unknown;
  readonly artifact: unknown;
  readonly canonicalJson: string;
  readonly artifactHash: string;
} {
  const decisionRecord = makeDecisionRecord();
  const candidateRecord = makeCandidateRecord();
  const sourceFixture = {
    decisionRecord,
    candidateRecord,
    batchId: BATCH_ID,
    recipientIndex: 0,
    nowIso: NOW_ISO,
  };

  const sourceBefore = canonicalStringify(sourceFixture);
  const intent = buildIntent(decisionRecord, candidateRecord);
  const runState = makeRunStateWithCampaign();

  const plan = planRunStateDispatchIntentApply({ runState, intent });
  assert.equal(plan.ok, true, `insert plan must succeed`);
  if (!plan.ok) throw new Error("insert plan failed");
  assert.equal(plan.action, "insert_entry", "insert plan action must be insert_entry");
  if (plan.action !== "insert_entry") {
    throw new Error("expected insert_entry");
  }

  (runState.entries as Record<string, unknown>)[plan.stateKey] = plan.entry;
  const insertedEntry = plan.entry;

  const batch = makeBatchFromEntry(insertedEntry);
  const intakeResult = planDispatcherDryRunIntake({ runState, batch });
  assert.equal(intakeResult.ok, true, `intake must succeed`);
  if (!intakeResult.ok) throw new Error("intake failed");

  const plannedEntry = intakeResult.entries[0];

  const transitionResult = planDispatcherDryRunTransition({
    plannedEntry,
    nowIso: NOW_ISO,
    retryDisposition: "none",
    operatorPolicy: makeOperatorPolicy(),
    providerPolicy: makeProviderPolicy(),
    feePolicy: makeFeePolicy(),
    administrativeHalt: { active: false, reason: null },
  });

  assert.equal(transitionResult.ok, true, `transition must succeed`);
  if (!transitionResult.ok) throw new Error("transition failed");

  const submittedEntry = transitionResult.submittedEntry;
  const transition = transitionResult.transition;

  const artifact = {
    stage: "G-2",
    auditType: "deterministic_execution_context",
    source: {
      campaignId: CAMPAIGN_ID,
      batchId: BATCH_ID,
      candidateId: CANDIDATE_ID,
      decisionId: DECISION_ID,
      recipientAddress: DESTINATION_ADDRESS,
      amount: AMOUNT,
      nowIso: NOW_ISO,
    },
    runState: {
      campaignId: CAMPAIGN_ID,
      entryCount: Object.keys(runState.entries as Record<string, unknown>).length,
      entries: runState.entries,
    },
    intent,
    insertedEntry,
    intake: {
      action: intakeResult.action,
      stateKeys: intakeResult.entries.map((entry) => entry.stateKey),
    },
    transition,
    submittedEntry,
  };

  assert.equal(
    canonicalStringify(sourceFixture),
    sourceBefore,
    "source fixture must not be mutated",
  );

  const canonicalJson = canonicalStringify(artifact);
  const artifactHash = sha256Hex(canonicalJson);

  return {
    sourceFixture,
    artifact,
    canonicalJson,
    artifactHash,
  };
}

function assertNoExecutionCapability(artifact: unknown): void {
  const canonical = canonicalStringify(artifact);

  assert.equal(
    canonical.includes("signedMessage"),
    false,
    "artifact must not contain signedMessage",
  );
  assert.equal(
    canonical.includes("privateKey"),
    false,
    "artifact must not contain privateKey",
  );
  assert.equal(
    canonical.includes("rpcEndpoint"),
    false,
    "artifact must not contain rpcEndpoint",
  );
  assert.equal(
    canonical.includes("broadcast"),
    false,
    "artifact must not contain broadcast",
  );
}

function testTwoIndependentRunsProduceIdenticalArtifacts(): void {
  const run1 = runExecutionContextAuditFixture();
  const run2 = runExecutionContextAuditFixture();

  assert.equal(
    run1.canonicalJson,
    run2.canonicalJson,
    "canonical execution context artifacts must be identical",
  );

  assert.equal(
    run1.artifactHash,
    run2.artifactHash,
    "execution context artifact hashes must be identical",
  );

  assertNoExecutionCapability(run1.artifact);
  assertNoExecutionCapability(run2.artifact);
}

function testCanonicalHashIsSha256Hex(): void {
  const run = runExecutionContextAuditFixture();

  assert.match(
    run.artifactHash,
    /^[a-f0-9]{64}$/,
    "artifactHash must be lowercase sha256 hex",
  );

  assert.equal(
    sha256Hex(run.canonicalJson),
    run.artifactHash,
    "artifactHash must equal sha256(canonicalJson)",
  );
}

function testCanonicalStringifyIsKeyOrderStable(): void {
  const a = { z: 1, a: { y: 2, b: 3 } };
  const b = { a: { b: 3, y: 2 }, z: 1 };

  assert.equal(
    canonicalStringify(a),
    canonicalStringify(b),
    "canonicalStringify must sort object keys recursively",
  );
}

function main(): void {
  testTwoIndependentRunsProduceIdenticalArtifacts();
  testCanonicalHashIsSha256Hex();
  testCanonicalStringifyIsKeyOrderStable();

  console.log(`${LABEL} PASS`);
}

main();
