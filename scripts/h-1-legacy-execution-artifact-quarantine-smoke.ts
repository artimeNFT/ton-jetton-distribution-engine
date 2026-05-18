import * as assert from "assert/strict";
import { readFileSync } from "node:fs";

const LABEL = "[h-1-legacy-execution-artifact-quarantine-smoke]";
const DOC_PATH = "docs/STAGE_H1_LEGACY_EXECUTION_ARTIFACT_QUARANTINE.md";

function readDoc(): string {
  return readFileSync(DOC_PATH, "utf8");
}

function assertIncludes(text: string, needle: string): void {
  assert.equal(text.includes(needle), true, `missing required text: ${needle}`);
}

function testClassificationModelIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Safe Dry-Run Fixture");
  assertIncludes(doc, "Quarantined Artifact");
  assertIncludes(doc, "Manually Reviewed Exception");
  assertIncludes(doc, "Forbidden Live Path");
}

function testControlBoundaryIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "It does not authorize signing, sending, broadcasting");
  assertIncludes(doc, "DRY_RUN=false");
  assertIncludes(doc, "destructive deletion");
}

function testInitialFindingsArePresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "scripts/bulkMint.ts");
  assertIncludes(doc, "scripts/deployJettonMaster.ts");
  assertIncludes(doc, "scripts/updateMetadata.ts");
  assertIncludes(doc, "package.json: deploy");
  assertIncludes(doc, "package.json: mint");
}

function testPackageReachabilityEvidenceIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Reachability Evidence — Package Scripts");
  assertIncludes(doc, "no `deploySecureTether` script file");
  assertIncludes(doc, "`deployAndMint.ts` only under `legacy/`");
  assertIncludes(doc, "stale package-level command surface requiring review");
}

function testBulkMintClassificationIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Artifact Classification — scripts/bulkMint.ts");
  assertIncludes(doc, "Classification: Quarantined Artifact.");
  assertIncludes(doc, "assertLegacyScriptBlocked()");
  assertIncludes(doc, "LEGACY_SCRIPT_BLOCKED");
  assertIncludes(doc, "do not execute it");
  assertIncludes(doc, "do not delete it in this step");
}

function testDeployVaultClassificationIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Artifact Classification — deploy/vault legacy scripts");
  assertIncludes(doc, "scripts/deployJettonMaster.ts");
  assertIncludes(doc, "scripts/vaultDistribution.ts");
  assertIncludes(doc, "scripts/vaultDistribution_linkTest.ts");
  assertIncludes(doc, "contain Blueprint NetworkProvider entrypoints");
  assertIncludes(doc, "contain contract send(...) calls");
}

function testBatchStatusUpdateClassificationIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Artifact Classification — scripts/batchStatusUpdate.ts");
  assertIncludes(doc, "Classification: Quarantined Artifact.");
  assertIncludes(doc, "getSeqno()");
  assertIncludes(doc, "provider.provider(...).getState()");
  assertIncludes(doc, "master.send(...)");
  assertIncludes(doc, "assertLegacyScriptBlocked()");
}

function testStageAggregatorReachabilityEvidenceIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Reachability Evidence — Stage Aggregators");
  assertIncludes(doc, "no approved Stage F/G/H aggregator path invoking");
  assertIncludes(doc, "launchStageA is referenced by Stage B gate smokes");
  assertIncludes(doc, "updateMetadata is referenced by the Stage B update-metadata gate smoke");
  assertIncludes(doc, "legacy live-capable artifacts remain Quarantined Artifacts, not deletion candidates");
}

function testLocalSensitiveArtifactSurfaceIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Local Sensitive Artifact Surface");
  assertIncludes(doc, ".env and .env backup files");
  assertIncludes(doc, "root *.state.json RunState artifacts");
  assertIncludes(doc, "reports/*.csv audit/report artifacts");
  assertIncludes(doc, "Local Sensitive Artifact Git Protection");
  assertIncludes(doc, "they must not be committed");
  assertIncludes(doc, "they must not be read for content during H-1 inventory");
  assertIncludes(doc, "they must not be deleted blindly");
}

function testLegacySurfaceClassificationIsPresent(): void {
  const doc = readDoc();
  assertIncludes(doc, "Artifact Classification — legacy/* and staggered broadcaster");
  assertIncludes(doc, "legacy/deployAndMint.ts");
  assertIncludes(doc, "legacy/privacyProtocol.ts");
  assertIncludes(doc, "legacy/matchingEngine.ts");
  assertIncludes(doc, "legacy/liquidityMonitor.ts");
  assertIncludes(doc, "lib/staggered-broadcaster.js");
  assertIncludes(doc, "Quarantined / Forbidden Live Path candidates requiring remediation review");
  assertIncludes(doc, "require explicit remediation review before any Stage I/Testnet work");
}

testClassificationModelIsPresent();
testControlBoundaryIsPresent();
testInitialFindingsArePresent();
testPackageReachabilityEvidenceIsPresent();
testBulkMintClassificationIsPresent();
testDeployVaultClassificationIsPresent();
testBatchStatusUpdateClassificationIsPresent();
testStageAggregatorReachabilityEvidenceIsPresent();
testLocalSensitiveArtifactSurfaceIsPresent();
testLegacySurfaceClassificationIsPresent();

console.log(`${LABEL} PASS`);
