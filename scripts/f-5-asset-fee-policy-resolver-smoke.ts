import * as assert from "assert/strict";
import {
  resolveAssetFeePolicy,
  type AssetFeePolicyRecord,
} from "../lib/dispatcher/assetFeePolicyResolver";

const LABEL = "[f-5-asset-fee-policy-resolver-smoke]";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMPAIGN_ID = "campaign-f5-asset-fee";
const JETTON_A = "jetton-master-a-canonical";
const JETTON_B = "jetton-master-b-canonical";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function makePolicy(overrides: Partial<AssetFeePolicyRecord> = {}): AssetFeePolicyRecord {
  return {
    assetId: "asset-a",
    jettonMasterCanonicalKey: JETTON_A,
    feePolicyVersion: "fee-policy-asset-a-v1",
    baseFeeNano: "1000",
    maxFeeNano: "1090",
    tierStepNano: "10",
    tierCount: 10,
    selectionSeed: "fee-seed-asset-a",
    enabled: true,
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}): unknown {
  return {
    campaignId: CAMPAIGN_ID,
    jettonMasterCanonicalKey: JETTON_A,
    policies: [makePolicy()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: resolves matching policy
// ---------------------------------------------------------------------------

function testResolvesMatchingPolicy(): void {
  const result = resolveAssetFeePolicy(baseInput());

  assert.equal(result.ok, true, `expected ok, got: ${stringify(result)}`);
  if (!result.ok) return;

  assert.equal(result.action, "asset_fee_policy_resolved");
  assert.equal(result.resolved.assetId, "asset-a");
  assert.equal(result.resolved.jettonMasterCanonicalKey, JETTON_A);
  assert.equal(result.resolved.feePolicyVersion, "fee-policy-asset-a-v1");
  assert.deepEqual(result.resolved.feePolicy, {
    baseFeeNano: "1000",
    maxFeeNano: "1090",
    tierStepNano: "10",
    tierCount: 10,
    selectionSeed: "fee-seed-asset-a",
  });
}

// ---------------------------------------------------------------------------
// Test 2: resolves correct asset among multiple policies
// ---------------------------------------------------------------------------

function testResolvesCorrectAmongMultiple(): void {
  const policyB = makePolicy({
    assetId: "asset-b",
    jettonMasterCanonicalKey: JETTON_B,
    feePolicyVersion: "fee-policy-asset-b-v1",
    selectionSeed: "fee-seed-asset-b",
  });

  const result = resolveAssetFeePolicy(
    baseInput({
      jettonMasterCanonicalKey: JETTON_B,
      policies: [makePolicy(), policyB],
    }),
  );

  assert.equal(result.ok, true, `expected ok, got: ${stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.resolved.assetId, "asset-b");
  assert.equal(result.resolved.feePolicyVersion, "fee-policy-asset-b-v1");
}

// ---------------------------------------------------------------------------
// Test 3: trims campaignId and requested jettonMasterCanonicalKey
// ---------------------------------------------------------------------------

function testTrimsCampaignIdAndKey(): void {
  const spacedKey = `  ${JETTON_A}  `;
  const policyWithSpaces = makePolicy({ jettonMasterCanonicalKey: spacedKey });

  const result = resolveAssetFeePolicy(
    baseInput({
      campaignId: `  ${CAMPAIGN_ID}  `,
      jettonMasterCanonicalKey: spacedKey,
      policies: [policyWithSpaces],
    }),
  );

  assert.equal(result.ok, true, `expected ok after trim, got: ${stringify(result)}`);
  if (!result.ok) return;
  assert.equal(
    result.resolved.jettonMasterCanonicalKey,
    JETTON_A,
    "resolved jettonMasterCanonicalKey must be normalized to the requested trimmed key",
  );
}

// ---------------------------------------------------------------------------
// Test 4: invalid input
// ---------------------------------------------------------------------------

function testInvalidInput(): void {
  for (const input of [null, [], "x"]) {
    const result = resolveAssetFeePolicy(input);
    assert.equal(result.ok, false, `expected rejection for ${stringify(input)}`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_input", `expected invalid_input for ${stringify(input)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test 5: invalid campaignId
// ---------------------------------------------------------------------------

function testInvalidCampaignId(): void {
  for (const campaignId of ["", "   "]) {
    const result = resolveAssetFeePolicy(baseInput({ campaignId }));
    assert.equal(result.ok, false, `expected rejection for campaignId="${campaignId}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_campaign_id");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 6: invalid requested jettonMasterCanonicalKey
// ---------------------------------------------------------------------------

function testInvalidRequestedKey(): void {
  for (const jettonMasterCanonicalKey of ["", "   "]) {
    const result = resolveAssetFeePolicy(baseInput({ jettonMasterCanonicalKey }));
    assert.equal(result.ok, false, `expected rejection for key="${jettonMasterCanonicalKey}"`);
    if (!result.ok) {
      assert.equal(result.reason, "invalid_jetton_master_canonical_key");
    }
  }
}

// ---------------------------------------------------------------------------
// Test 7: invalid policy registry
// ---------------------------------------------------------------------------

function testInvalidPolicyRegistry(): void {
  // policies missing
  {
    const { policies: _p, ...inputWithout } = baseInput() as Record<string, unknown>;
    const result = resolveAssetFeePolicy(inputWithout);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_policy_registry");
  }

  // policies []
  {
    const result = resolveAssetFeePolicy(baseInput({ policies: [] }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_policy_registry");
  }

  // policies not array
  {
    const result = resolveAssetFeePolicy(baseInput({ policies: "not-an-array" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_policy_registry");
  }
}

// ---------------------------------------------------------------------------
// Test 8: invalid policy record fields
// ---------------------------------------------------------------------------

function testInvalidPolicyRecordFields(): void {
  const cases: [Partial<AssetFeePolicyRecord>, string][] = [
    [{ assetId: "" }, "fee_policy_invalid"],
    [{ jettonMasterCanonicalKey: "" }, "fee_policy_invalid"],
    [{ feePolicyVersion: "" }, "fee_policy_invalid"],
    [{ baseFeeNano: "0" }, "fee_policy_invalid"],
    [{ maxFeeNano: "0" }, "fee_policy_invalid"],
    [{ tierStepNano: "-1" }, "fee_policy_invalid"],
    [{ tierCount: 0 }, "fee_policy_invalid"],
    [{ tierCount: 1025 }, "fee_policy_invalid"],
    [{ selectionSeed: "" }, "fee_policy_invalid"],
    [{ enabled: "true" as unknown as boolean }, "fee_policy_invalid"],
  ];

  for (const [override, expectedReason] of cases) {
    const result = resolveAssetFeePolicy(
      baseInput({ policies: [makePolicy(override)] }),
    );
    assert.equal(result.ok, false, `expected rejection for ${stringify(override)}`);
    if (!result.ok) {
      assert.equal(
        result.reason,
        expectedReason,
        `expected ${expectedReason} for ${stringify(override)}, got ${result.reason}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test 9: duplicate policy for same Jetton Master
// ---------------------------------------------------------------------------

function testDuplicatePolicyForSameJettonMaster(): void {
  const policyEnabled = makePolicy({ enabled: true });
  const policyDisabled = makePolicy({ enabled: false });

  const result = resolveAssetFeePolicy(
    baseInput({ policies: [policyEnabled, policyDisabled] }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "duplicate_policy_for_jetton_master");
  }
}

// ---------------------------------------------------------------------------
// Test 10: policy not found
// ---------------------------------------------------------------------------

function testPolicyNotFound(): void {
  const unknownKey = "unknown-jetton-key";
  const result = resolveAssetFeePolicy(
    baseInput({ jettonMasterCanonicalKey: unknownKey }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "policy_not_found");
    assert.equal(
      result.jettonMasterCanonicalKey,
      unknownKey.trim(),
      "rejected jettonMasterCanonicalKey must equal requested trimmed key",
    );
  }
}

// ---------------------------------------------------------------------------
// Test 11: policy disabled
// ---------------------------------------------------------------------------

function testPolicyDisabled(): void {
  const result = resolveAssetFeePolicy(
    baseInput({ policies: [makePolicy({ enabled: false })] }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "policy_disabled");
  }
}

// ---------------------------------------------------------------------------
// Test 12: fee cap invalid when base > max
// ---------------------------------------------------------------------------

function testFeeCapInvalidBaseGtMax(): void {
  const result = resolveAssetFeePolicy(
    baseInput({
      policies: [makePolicy({ baseFeeNano: "2000", maxFeeNano: "1000" })],
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "fee_cap_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 13: fee cap invalid when max possible tier exceeds cap
// ---------------------------------------------------------------------------

function testFeeCapInvalidMaxTierExceedsCap(): void {
  // baseFeeNano=1000, tierStepNano=10, tierCount=10
  // maxPossible = 1000 + 9*10 = 1090 > maxFeeNano=1050
  const result = resolveAssetFeePolicy(
    baseInput({
      policies: [
        makePolicy({
          baseFeeNano: "1000",
          maxFeeNano: "1050",
          tierStepNano: "10",
          tierCount: 10,
        }),
      ],
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "fee_cap_invalid");
  }
}

// ---------------------------------------------------------------------------
// Test 14: tierStepNano "0" is valid
// ---------------------------------------------------------------------------

function testTierStepZeroIsValid(): void {
  const result = resolveAssetFeePolicy(
    baseInput({
      policies: [
        makePolicy({
          baseFeeNano: "1000",
          maxFeeNano: "1000",
          tierStepNano: "0",
          tierCount: 10,
        }),
      ],
    }),
  );

  assert.equal(result.ok, true, `expected ok for tierStepNano "0", got: ${stringify(result)}`);
  if (!result.ok) return;
  assert.equal(result.resolved.feePolicy.tierStepNano, "0");
}

// ---------------------------------------------------------------------------
// Test 15: exact canonical key equality after trim only (no lowercasing)
// ---------------------------------------------------------------------------

function testExactCanonicalKeyEqualityNoLowercase(): void {
  const result = resolveAssetFeePolicy(
    baseInput({
      jettonMasterCanonicalKey: "jetton-key-a",
      policies: [makePolicy({ jettonMasterCanonicalKey: "Jetton-Key-A" })],
    }),
  );

  // "Jetton-Key-A".trim() !== "jetton-key-a" — case differs
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.reason,
      "policy_not_found",
      "resolver must not lowercase keys; case mismatch must yield policy_not_found",
    );
  }
}

// ---------------------------------------------------------------------------
// Test 16: does not mutate inputs
// ---------------------------------------------------------------------------

function testDoesNotMutateInputs(): void {
  const input = baseInput() as Record<string, unknown>;
  const before = stringify(input);

  resolveAssetFeePolicy(input);

  assert.equal(stringify(input), before, "input must not be mutated");
}

// ---------------------------------------------------------------------------
// Test 17: deterministic
// ---------------------------------------------------------------------------

function testDeterministic(): void {
  const input = baseInput();
  const r1 = resolveAssetFeePolicy(input);
  const r2 = resolveAssetFeePolicy(input);
  assert.deepEqual(r1, r2, "same input must produce identical results across calls");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  testResolvesMatchingPolicy();
  testResolvesCorrectAmongMultiple();
  testTrimsCampaignIdAndKey();
  testInvalidInput();
  testInvalidCampaignId();
  testInvalidRequestedKey();
  testInvalidPolicyRegistry();
  testInvalidPolicyRecordFields();
  testDuplicatePolicyForSameJettonMaster();
  testPolicyNotFound();
  testPolicyDisabled();
  testFeeCapInvalidBaseGtMax();
  testFeeCapInvalidMaxTierExceedsCap();
  testTierStepZeroIsValid();
  testExactCanonicalKeyEqualityNoLowercase();
  testDoesNotMutateInputs();
  testDeterministic();

  console.log(`${LABEL} PASS`);
}

main();
