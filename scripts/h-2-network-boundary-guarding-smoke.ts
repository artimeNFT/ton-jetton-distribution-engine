import * as assert from "assert/strict";
import { readFileSync } from "node:fs";

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

testAllowsOnlyAfterAllGatesPass();
testRejectsUnsafeBoundaryInputs();
testRejectsMissingRequiredInputs();
testPreSignerHardStopPreventsLoaderInvocation();
testNoForbiddenNetworkOrSignerImports();

console.log(`${LABEL} PASS`);
