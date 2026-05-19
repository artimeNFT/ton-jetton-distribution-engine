import * as assert from "assert/strict";
import { readFileSync } from "node:fs";

const LABEL = "[h-x-historical-integrity-audit-smoke]";
const DOC = "docs/STAGE_HX_HISTORICAL_INTEGRITY_AUDIT.md";

function readDoc(): string {
  return readFileSync(DOC, "utf8");
}

function assertIncludes(text: string, expected: string): void {
  assert.equal(text.includes(expected), true, `missing: ${expected}`);
}

function testHxDocumentCoreIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Stage H-X — Historical Stage Integrity Audit");
  assertIncludes(doc, "Classify artifacts by evidence only");
  assertIncludes(doc, "Baseline: origin/main = 7871788");
}


function testArtifactClassificationsArePresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "REQUIRED_PROJECT_CONFIG_OR_INPUT");
  assertIncludes(doc, "TRACKED_TEST_FIXTURE");
  assertIncludes(doc, "IGNORED_LOCAL_SENSITIVE_ARTIFACT");
  assertIncludes(doc, "IGNORED_HISTORICAL_RUNTIME_OUTPUT");
  assertIncludes(doc, "GENERATED_DEPENDENCY_ARTIFACT");
  assertIncludes(doc, "ACTIVE_SOURCE_AUDIT_SURFACE");
  assertIncludes(doc, "QUARANTINED_LEGACY_LIVE_CAPABLE_SURFACE");
  assertIncludes(doc, "QUARANTINED_LIVE_CAPABLE_SCRIPT");
  assertIncludes(doc, "REVIEWED_DRY_RUN_EXCEPTION");
  assertIncludes(doc, "READONLY_LIVE_READ_PROBE");
  assertIncludes(doc, "TEST_DATA_GENERATOR");
  assertIncludes(doc, "BLOCKER_BEFORE_TESTNET");
}

function testSpecificRiskSurfacesArePresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "scripts/bulkMint.ts");
  assertIncludes(doc, "scripts/deployJettonMaster.ts");
  assertIncludes(doc, "scripts/batchStatusUpdate.ts");
  assertIncludes(doc, "scripts/vaultDistribution.ts");
  assertIncludes(doc, "scripts/vaultDistribution_linkTest.ts");
  assertIncludes(doc, "scripts/gasEstimator.ts");
  assertIncludes(doc, "scripts/launchStageA.ts");
  assertIncludes(doc, "scripts/updateMetadata.ts");
  assertIncludes(doc, "docs/STAGE_G3_SIGNER_BOUNDARY_DESIGN.md");
}

function testInvariantFindingsArePresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "RunState remains the execution source of truth");
  assertIncludes(doc, "DecisionStore remains evidence/preflight-oriented");
  assertIncludes(doc, "Date.now/new Date must not affect decisionId");
  assertIncludes(doc, "candidateId");
  assertIncludes(doc, "stateKey");
  assertIncludes(doc, "recipient");
  assertIncludes(doc, "amount");
  assertIncludes(doc, "H-3 must define secrets policy");
  assertIncludes(doc, "do not claim Stage A or Stage C have full aggregator coverage");
}

function testRecentHxSectionsArePresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Dispatcher Batch Planning / Amount Allocation");
  assertIncludes(doc, "Dispatcher Retry / WalletPool / Hook & Lock");
  assertIncludes(doc, "Legacy JavaScript Surface Audit");
  assertIncludes(doc, "GitHub Workflow Surface");
  assertIncludes(doc, "Generated Build / Local Temp Surfaces");
  assertIncludes(doc, "Contracts / Sandbox Test Surface");
  assertIncludes(doc, "H-X.2I — Asset Filter / Multi-Asset Ingress Boundary");
  assertIncludes(doc, "H-X.2J — Metadata Mutation / URI Injection Boundary");
  assertIncludes(doc, "H-X.2K — Multi-Token State Coexistence / stateKey Separation");
  assertIncludes(doc, "holder balance eligibility is not proven at baseline");
  assertIncludes(doc, "metadata mutation, contract metadata update, IPFS/Pinata upload");
  assertIncludes(doc, "RunState stateKey is not directly token/master-aware");
}

function testCiEvidenceCrossReferenceIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "CI Evidence Cross-Reference");
  assertIncludes(doc, "historical CI success ledger");
  assertIncludes(doc, "Stage H-2 history");
  assertIncludes(doc, "Stage G history");
  assertIncludes(doc, "Stage F history");
  assertIncludes(doc, "Stage E / E-Preflight history");
  assertIncludes(doc, "Stage D history");
  assertIncludes(doc, "Stage C history");
  assertIncludes(doc, "Stage B history");
  assertIncludes(doc, "CI history supports the static H-X findings but does not replace local read-only source/reachability audit");
}

testHxDocumentCoreIsPresent();
testArtifactClassificationsArePresent();
testSpecificRiskSurfacesArePresent();
testInvariantFindingsArePresent();
testRecentHxSectionsArePresent();
testCiEvidenceCrossReferenceIsPresent();

console.log(`${LABEL} PASS`);
