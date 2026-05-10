import * as assert from "assert/strict";
import {
  validateGasEstimateSnapshot,
  type GasEstimateSnapshot,
} from "../lib/watcher/gasSnapshot";

const LABEL = "[stage-d9-2-gas-snapshot-validation-smoke]";
const DECISION_AT = "2026-01-01T00:01:00.000Z";

function sampleSnapshot(overrides: Partial<GasEstimateSnapshot> = {}): GasEstimateSnapshot {
  return {
    gasEstimateSource: "offline_fixed",
    gasEstimateMethod: "fixed-dry-run-v1",
    gasEstimatorVersion: "gas-estimator-v1",
    gasObservedAt: "2026-01-01T00:00:30.000Z",
    gasMaxFreshnessMs: 60_000,
    gasFreshnessDecision: "not_applicable_offline_fixed",

    gasChain: null,
    gasWorkchain: null,
    gasChainSeqno: null,
    gasChainConfigHash: null,
    gasChainConfigParamVersion: null,
    estimatedStorageFeeNanoTon: "10",
    estimatedComputeFeeNanoTon: "20",
    estimatedForwardFeeNanoTon: "30",
    estimatedActionFeeNanoTon: "40",
    estimatedTotalFeeNanoTon: "100",
    feeAllowanceNanoTon: "150",

    feePolicyVersion: "fee-policy-v1",
    feeDecision: "within_fee_allowance",
    ...overrides,
  };
}

function testValidOfflineFixedSnapshotPasses(): void {
  assert.deepEqual(validateGasEstimateSnapshot(sampleSnapshot(), DECISION_AT), {
    ok: true,
  });
}

function testInvalidDecimalStringFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({ estimatedComputeFeeNanoTon: "1.5" }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "invalid_decimal_string_estimatedComputeFeeNanoTon",
    },
  );
}

function testFeeArithmeticMismatchFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({ estimatedTotalFeeNanoTon: "999" }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "fee_arithmetic_mismatch",
    },
  );
}

function testStaleGasEstimateFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({
        gasEstimateSource: "rpc_config",
        gasFreshnessDecision: "fresh",
        gasChain: "ton-mainnet",
        gasWorkchain: 0,
        gasChainSeqno: "123456",
        gasChainConfigHash: "config-hash-001",
        gasChainConfigParamVersion: "21",
        gasObservedAt: "2026-01-01T00:00:00.000Z",
        gasMaxFreshnessMs: 10_000,
      }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "gas_estimate_stale",
    },
  );
}

function testRpcConfigMissingChainContextFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({
        gasEstimateSource: "rpc_config",
        gasFreshnessDecision: "fresh",
      }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "missing_gas_chain",
    },
  );
}

function testOfflineFixedWrongFreshnessDecisionFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({ gasFreshnessDecision: "fresh" }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "invalid_offline_fixed_freshness_decision",
    },
  );
}

function main(): void {
  testValidOfflineFixedSnapshotPasses();
  testInvalidDecimalStringFailsClosed();
  testFeeArithmeticMismatchFailsClosed();
  testStaleGasEstimateFailsClosed();
  testRpcConfigMissingChainContextFailsClosed();
  testOfflineFixedWrongFreshnessDecisionFailsClosed();
  testWithinAllowanceDecisionMismatchFailsClosed();
  testFeeContextUnavailableFailsClosedWhenFeesArePresent();
  testValidRpcConfigSnapshotPasses();
  testValidExceedsAllowanceSnapshotPasses();
  console.log(`${LABEL} PASS`);
}

main();

function testWithinAllowanceDecisionMismatchFailsClosed(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({
        estimatedTotalFeeNanoTon: "100",
        feeAllowanceNanoTon: "50",
        feeDecision: "within_fee_allowance",
      }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "fee_decision_mismatch",
    },
  );
}

function testFeeContextUnavailableFailsClosedWhenFeesArePresent(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({ feeDecision: "fee_context_unavailable" }),
      DECISION_AT,
    ),
    {
      ok: false,
      reason: "fee_context_unavailable",
    },
  );
}

function testValidRpcConfigSnapshotPasses(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({
        gasEstimateSource: "rpc_config",
        gasFreshnessDecision: "fresh",
        gasChain: "ton-mainnet",
        gasWorkchain: 0,
        gasChainSeqno: "123456",
        gasChainConfigHash: "config-hash-001",
        gasChainConfigParamVersion: "21",
      }),
      DECISION_AT,
    ),
    { ok: true },
  );
}

function testValidExceedsAllowanceSnapshotPasses(): void {
  assert.deepEqual(
    validateGasEstimateSnapshot(
      sampleSnapshot({
        estimatedTotalFeeNanoTon: "100",
        feeAllowanceNanoTon: "50",
        feeDecision: "exceeds_fee_allowance",
      }),
      DECISION_AT,
    ),
    { ok: true },
  );
}
