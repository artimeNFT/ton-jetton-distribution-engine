import * as assert from "assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const LABEL = "[h-2-network-boundary-guarding-smoke]";

type Env = Record<string, string | undefined>;

interface BoundaryDecision {
  readonly ok: boolean;
  readonly reason: string;
  readonly signerBoundaryLoadAllowed: boolean;
  readonly providerLoadAllowed: boolean;
  readonly broadcastAllowed: boolean;
}

function reject(reason: string): BoundaryDecision {
  return {
    ok: false,
    reason,
    signerBoundaryLoadAllowed: false,
    providerLoadAllowed: false,
    broadcastAllowed: false,
  };
}

function allow(): BoundaryDecision {
  return {
    ok: true,
    reason: "boundary_validated",
    signerBoundaryLoadAllowed: true,
    providerLoadAllowed: true,
    broadcastAllowed: true,
  };
}

function requireEnv(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function evaluateNetworkBoundary(env: Env): BoundaryDecision {
  if (env["ADMINISTRATIVE_HALT"] === "true") {
    return reject("administrative_halt");
  }

  if (env["STAGE_H2_NETWORK_BOUNDARY_ENABLED"] !== "true") {
    return reject("boundary_disabled");
  }

  if (env["DRY_RUN"] !== "true") {
    return reject("dry_run_required");
  }

  const expectedChainId = requireEnv(env, "EXPECTED_CHAIN_ID");
  const observedChainId = requireEnv(env, "OBSERVED_CHAIN_ID");

  if (!expectedChainId) return reject("missing_expected_chain_id");
  if (!observedChainId) return reject("missing_observed_chain_id");
  if (observedChainId !== expectedChainId) return reject("chain_id_mismatch");

  const campaignId = requireEnv(env, "CAMPAIGN_ID");
  const confirmedCampaignId = requireEnv(env, "CONFIRM_CAMPAIGN_ID");

  if (!campaignId) return reject("missing_campaign_id");
  if (!confirmedCampaignId) return reject("missing_confirm_campaign_id");
  if (confirmedCampaignId !== campaignId) {
    return reject("campaign_confirmation_mismatch");
  }

  if (env["DRY_RUN_PROOF"] !== "stage-g-h1-locked") {
    return reject("dry_run_proof_invalid");
  }

  const expectedCommit = requireEnv(env, "EXPECTED_COMMIT");
  const ciWorkflowName = requireEnv(env, "CI_WORKFLOW_NAME");
  const ciStatus = requireEnv(env, "CI_STATUS");
  const ciConclusion = requireEnv(env, "CI_CONCLUSION");
  const ciCommit = requireEnv(env, "CI_COMMIT");

  if (!expectedCommit) return reject("missing_expected_commit");
  if (ciWorkflowName !== "Stage B Full Check") return reject("ci_workflow_invalid");
  if (ciStatus !== "completed") return reject("ci_status_invalid");
  if (ciConclusion !== "success") return reject("ci_conclusion_invalid");
  if (ciCommit !== expectedCommit) return reject("ci_commit_mismatch");

  const approvalId = requireEnv(env, "APPROVAL_ID");
  const approvalNowRaw = requireEnv(env, "APPROVAL_NOW_MS");
  const approvalExpiresRaw = requireEnv(env, "APPROVAL_EXPIRES_AT_MS");

  if (!approvalId) return reject("missing_approval_id");
  if (!approvalNowRaw) return reject("missing_approval_now");
  if (!approvalExpiresRaw) return reject("missing_approval_expiry");

  const approvalNowMs = Number(approvalNowRaw);
  const approvalExpiresAtMs = Number(approvalExpiresRaw);

  if (!Number.isSafeInteger(approvalNowMs)) return reject("approval_now_invalid");
  if (!Number.isSafeInteger(approvalExpiresAtMs)) return reject("approval_expiry_invalid");
  if (approvalExpiresAtMs <= approvalNowMs) return reject("approval_expired");

  return allow();
}

const VALID_ENV: Env = {
  ADMINISTRATIVE_HALT: "false",
  STAGE_H2_NETWORK_BOUNDARY_ENABLED: "true",
  DRY_RUN: "true",
  EXPECTED_CHAIN_ID: "ton-testnet",
  OBSERVED_CHAIN_ID: "ton-testnet",
  CAMPAIGN_ID: "campaign-h2",
  CONFIRM_CAMPAIGN_ID: "campaign-h2",
  DRY_RUN_PROOF: "stage-g-h1-locked",
  EXPECTED_COMMIT: "commit-h2",
  CI_WORKFLOW_NAME: "Stage B Full Check",
  CI_STATUS: "completed",
  CI_CONCLUSION: "success",
  CI_COMMIT: "commit-h2",
  APPROVAL_ID: "approval-h2",
  APPROVAL_NOW_MS: "1000",
  APPROVAL_EXPIRES_AT_MS: "2000",
};

function testAllowsOnlyAfterAllGatesPass(): void {
  const decision = evaluateNetworkBoundary(VALID_ENV);
  assert.equal(decision.ok, true);
  assert.equal(decision.reason, "boundary_validated");
  assert.equal(decision.signerBoundaryLoadAllowed, true);
  assert.equal(decision.providerLoadAllowed, true);
  assert.equal(decision.broadcastAllowed, true);
}

function withEnv(overrides: Env): Env {
  return { ...VALID_ENV, ...overrides };
}

function assertRejected(env: Env, expectedReason: string): void {
  const decision = evaluateNetworkBoundary(env);
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, expectedReason);
  assert.equal(decision.signerBoundaryLoadAllowed, false);
  assert.equal(decision.providerLoadAllowed, false);
  assert.equal(decision.broadcastAllowed, false);
}

function testRejectsUnsafeBoundaryInputs(): void {
  assertRejected(withEnv({ ADMINISTRATIVE_HALT: "true" }), "administrative_halt");
  assertRejected(withEnv({ STAGE_H2_NETWORK_BOUNDARY_ENABLED: "false" }), "boundary_disabled");
  assertRejected(withEnv({ DRY_RUN: "false" }), "dry_run_required");
  assertRejected(withEnv({ OBSERVED_CHAIN_ID: "ton-mainnet" }), "chain_id_mismatch");
  assertRejected(withEnv({ CONFIRM_CAMPAIGN_ID: "wrong-campaign" }), "campaign_confirmation_mismatch");
  assertRejected(withEnv({ DRY_RUN_PROOF: "missing" }), "dry_run_proof_invalid");
  assertRejected(withEnv({ EXPECTED_COMMIT: undefined }), "missing_expected_commit");
  assertRejected(withEnv({ CI_WORKFLOW_NAME: "Other Workflow" }), "ci_workflow_invalid");
  assertRejected(withEnv({ CI_STATUS: "in_progress" }), "ci_status_invalid");
  assertRejected(withEnv({ CI_CONCLUSION: "failure" }), "ci_conclusion_invalid");
  assertRejected(withEnv({ CI_COMMIT: "wrong-commit" }), "ci_commit_mismatch");
  assertRejected(withEnv({ APPROVAL_ID: undefined }), "missing_approval_id");
  assertRejected(withEnv({ APPROVAL_NOW_MS: undefined }), "missing_approval_now");
  assertRejected(withEnv({ APPROVAL_EXPIRES_AT_MS: undefined }), "missing_approval_expiry");
  assertRejected(withEnv({ APPROVAL_NOW_MS: "not-a-number" }), "approval_now_invalid");
  assertRejected(withEnv({ APPROVAL_EXPIRES_AT_MS: "not-a-number" }), "approval_expiry_invalid");
  assertRejected(withEnv({ APPROVAL_NOW_MS: "2000", APPROVAL_EXPIRES_AT_MS: "2000" }), "approval_expired");
}

function testRejectsMissingRequiredInputs(): void {
  assertRejected(withEnv({ EXPECTED_CHAIN_ID: undefined }), "missing_expected_chain_id");
  assertRejected(withEnv({ OBSERVED_CHAIN_ID: undefined }), "missing_observed_chain_id");
  assertRejected(withEnv({ CAMPAIGN_ID: undefined }), "missing_campaign_id");
  assertRejected(withEnv({ CONFIRM_CAMPAIGN_ID: undefined }), "missing_confirm_campaign_id");
}

function guardedLoad(decision: BoundaryDecision, loader: () => string): string {
  if (!decision.signerBoundaryLoadAllowed) {
    throw new Error(`pre_signer_hard_stop:${decision.reason}`);
  }
  return loader();
}

function testPreSignerHardStopPreventsLoaderInvocation(): void {
  let loadCount = 0;

  assert.throws(
    () =>
      guardedLoad(
        evaluateNetworkBoundary(withEnv({ ADMINISTRATIVE_HALT: "true" })),
        () => {
          loadCount++;
          return "loaded";
        }
      ),
    /pre_signer_hard_stop:administrative_halt/
  );

  assert.equal(loadCount, 0);
}

function testNoForbiddenNetworkOrSignerImports(): void {
  const source = readFileSync(__filename, "utf8");
  const importLines = source
    .split("\n")
    .filter((line) => line.trim().startsWith("import "));

  for (const forbidden of ["@ton/", "dotenv", "mnemonic", "TonClient", "NetworkProvider"]) {
    assert.equal(importLines.some((line) => line.includes(forbidden)), false);
  }
}

function assertFailClosedPackageScript(name: "start" | "deploy" | "mint"): void {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const command = pkg.scripts?.[name] ?? "";
  assert.equal(command.includes("STAGE_H_FAIL_CLOSED"), true);
  assert.equal(command.includes("process.exit(1)"), true);
  assert.equal(command.includes("blueprint run"), false);
  assert.equal(command.includes("--testnet"), false);
  assert.equal(command.includes("deploySecureTether"), false);
  assert.equal(command.includes("deployAndMint"), false);
}

function testPackageScriptsCannotBypassH2(): void {
  assertFailClosedPackageScript("start");
  assertFailClosedPackageScript("deploy");
  assertFailClosedPackageScript("mint");
}

function listStageAggregators(): string[] {
  return readdirSync("scripts")
    .filter((name) => /^stage-.*-smoke\.sh$/.test(name))
    .map((name) => `scripts/${name}`)
    .sort();
}

function testStageAggregatorsCannotBypassH2(): void {
  const aggregators = listStageAggregators();
  assert.equal(aggregators.includes("scripts/stage-h-full-smoke.sh"), true);

  const combined = aggregators
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  for (const forbidden of [
    "deploySecureTether",
    "deployAndMint",
    "bulkMint",
    "deployJettonMaster",
    "vaultDistribution",
    "batchStatusUpdate",
    "legacy/deployAndMint",
    "--testnet",
  ]) {
    assert.equal(combined.includes(forbidden), false, `stage aggregator bypass surface: ${forbidden}`);
  }
}

function testH2ClosureDocumentIsPresent(): void {
  const doc = readFileSync("docs/STAGE_H2_NETWORK_BOUNDARY_GUARDING_CLOSURE.md", "utf8");
  assert.equal(doc.includes("Stage H-2 — Network Boundary & Execution Guarding Closure"), true);
  assert.equal(doc.includes("H-2.1 — Network Boundary Guarding Smoke"), true);
  assert.equal(doc.includes("H-2.2 — CI Proof and Approval Expiry Gate"), true);
  assert.equal(doc.includes("H-2.3 — Alternate Script Bypass Scan"), true);
  assert.equal(doc.includes("proxy/IP/OPSEC routing logic"), true);
  assert.equal(doc.includes("GitHub Actions completed success on the same SHA"), true);
}

testAllowsOnlyAfterAllGatesPass();
testRejectsUnsafeBoundaryInputs();
testRejectsMissingRequiredInputs();
testPreSignerHardStopPreventsLoaderInvocation();
testNoForbiddenNetworkOrSignerImports();
testPackageScriptsCannotBypassH2();
testStageAggregatorsCannotBypassH2();
testH2ClosureDocumentIsPresent();

console.log(`${LABEL} PASS`);
