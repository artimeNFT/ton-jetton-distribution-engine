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

testClassificationModelIsPresent();
testControlBoundaryIsPresent();
testInitialFindingsArePresent();

console.log(`${LABEL} PASS`);
