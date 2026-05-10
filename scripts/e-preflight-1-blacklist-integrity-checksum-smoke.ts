import * as assert from "assert/strict";
import {
  computeSha256Hex,
  verifyBlacklistIntegrity,
} from "../lib/watcher/blacklistIntegrity";

const LABEL = "[e-preflight-1-blacklist-integrity-checksum-smoke]";

function testValidChecksumPasses(): void {
  const content = JSON.stringify({ addresses: ["EQ_TEST"] });
  const checksum = computeSha256Hex(content);

  const result = verifyBlacklistIntegrity({
    blacklistContent: content,
    expectedSha256Hex: checksum,
    required: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.checksum, checksum);
}

function testMissingRequiredBlacklistFailsClosed(): void {
  const result = verifyBlacklistIntegrity({
    blacklistContent: null,
    expectedSha256Hex: null,
    required: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "blacklist_missing");
}

function testMissingExpectedChecksumFailsClosed(): void {
  const result = verifyBlacklistIntegrity({
    blacklistContent: "[]",
    expectedSha256Hex: null,
    required: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expected_checksum_missing");
}

function testInvalidExpectedChecksumFailsClosed(): void {
  const result = verifyBlacklistIntegrity({
    blacklistContent: "[]",
    expectedSha256Hex: "not-a-sha256",
    required: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_expected_checksum");
}

function testChecksumMismatchFailsClosed(): void {
  const result = verifyBlacklistIntegrity({
    blacklistContent: "[]",
    expectedSha256Hex: "0".repeat(64),
    required: true,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "checksum_mismatch");
}

function main(): void {
  testValidChecksumPasses();
  testMissingRequiredBlacklistFailsClosed();
  testMissingExpectedChecksumFailsClosed();
  testInvalidExpectedChecksumFailsClosed();
  testChecksumMismatchFailsClosed();

  console.log(`${LABEL} PASS`);
}

main();
