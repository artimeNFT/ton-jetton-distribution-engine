import * as assert from "assert/strict";
import {
  buildDecisionId,
  buildDecisionKeyString,
  hashDecisionKey,
  type CandidateDecisionIdInput,
} from "../lib/watcher/candidateDecision";

const LABEL = "[stage-d4-1-candidate-decision-smoke]";

function sampleInput(): CandidateDecisionIdInput {
  return {
    candidateId: "candidate-001",
    decisionRunId: "decision-run-001",
    decisionReason: "policy_accept",
    rulesetVersion: "ruleset-v1",
    blacklistVersion: "blacklist-v1",
    budgetPolicyVersion: "budget-v1",
  };
}

function testDecisionIdIsDeterministic(): void {
  const input = sampleInput();
  assert.equal(buildDecisionId(input), buildDecisionId(input));
}

function testDecisionIdChangesWithDecisionRunId(): void {
  const first = sampleInput();
  const second = { ...first, decisionRunId: "decision-run-002" };
  assert.notEqual(buildDecisionId(first), buildDecisionId(second));
}

function testDecisionKeyStringOrder(): void {
  const input = sampleInput();
  assert.equal(
    buildDecisionKeyString(input),
    "candidate-001:::decision-run-001:::policy_accept:::ruleset-v1:::blacklist-v1:::budget-v1",
  );
}

function testHashDecisionKeyMatchesDecisionId(): void {
  const input = sampleInput();
  assert.equal(
    buildDecisionId(input),
    hashDecisionKey(buildDecisionKeyString(input)),
  );
}

function main(): void {
  testDecisionIdIsDeterministic();
  testDecisionIdChangesWithDecisionRunId();
  testDecisionKeyStringOrder();
  testHashDecisionKeyMatchesDecisionId();
  console.log(`${LABEL} PASS`);
}

main();
