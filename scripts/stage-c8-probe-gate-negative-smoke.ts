import * as assert from "assert/strict";
import { spawnSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";

const LABEL = "[stage-c8-probe-gate-negative-smoke]";
const PROBE_SCRIPT = "scripts/stage-c8-readonly-tonapi-probe.ts";

type RunResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runProbe(env: Record<string, string>): RunResult {
  const result = spawnSync("npx", ["ts-node", PROBE_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      TONAPI_API_KEY: "",
      TONAPI_C8_CONTROL_GROUP: "",
      C8_MANUAL_ABORT_PRE_PROVIDER: "",
      C8_READONLY_PROBE_APPROVAL: "",
      ...env,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertFailClosed(run: RunResult, reason: string): void {
  assert.notEqual(run.status, 0, `${reason} must exit non-zero`);
  assert.ok(
    run.stderr.includes(`[stage-c8-readonly-tonapi-probe] FAIL_CLOSED ${reason}`),
    `stderr must include FAIL_CLOSED ${reason}`,
  );
  assert.ok(
    run.stderr.includes('"requestAttempted": false'),
    "failure summary must prove no provider request was attempted",
  );
}

function validGateEnv(): Record<string, string> {
  return {
    TONAPI_API_KEY: "smoke",
    TONAPI_C8_CONTROL_GROUP: "addr-control-1,addr-control-2",
    C8_MANUAL_ABORT_PRE_PROVIDER: "CLEAR",
    C8_READONLY_PROBE_APPROVAL: "C8_GATE_ONLY_NO_PROVIDER_CALL",
  };
}

function testMissingApprovalFailsClosed(): void {
  const env = validGateEnv();
  delete env.C8_READONLY_PROBE_APPROVAL;
  assertFailClosed(runProbe(env), "missing_or_invalid_probe_approval");
}

function testMissingApiKeyFailsClosed(): void {
  const env = validGateEnv();
  delete env.TONAPI_API_KEY;
  assertFailClosed(runProbe(env), "missing_tonapi_api_key_env");
}

function testManualAbortFailsClosed(): void {
  const env = validGateEnv();
  env.C8_MANUAL_ABORT_PRE_PROVIDER = "ABORT";
  assertFailClosed(runProbe(env), "manual_pre_provider_abort_not_clear");
}

function testMissingControlGroupFailsClosed(): void {
  const env = validGateEnv();
  delete env.TONAPI_C8_CONTROL_GROUP;
  assertFailClosed(runProbe(env), "missing_control_group");
}

function testDuplicateControlGroupFailsClosed(): void {
  const env = validGateEnv();
  env.TONAPI_C8_CONTROL_GROUP = "addr-control-1,addr-control-1";
  assertFailClosed(runProbe(env), "control_group_contains_duplicates");
}

function testOversizedControlGroupFailsClosed(): void {
  const env = validGateEnv();
  env.TONAPI_C8_CONTROL_GROUP = "a,b,c,d,e,f";
  assertFailClosed(runProbe(env), "control_group_too_large");
}

function testDirtyGitFailsClosed(): void {
  const dirtyPath = ".tmp-stage-c8-negative-dirty";
  writeFileSync(dirtyPath, "dirty\n");

  try {
    assertFailClosed(runProbe(validGateEnv()), "git_state_not_clean");
  } finally {
    unlinkSync(dirtyPath);
  }
}

function main(): void {
  testMissingApprovalFailsClosed();
  testMissingApiKeyFailsClosed();
  testManualAbortFailsClosed();
  testMissingControlGroupFailsClosed();
  testDuplicateControlGroupFailsClosed();
  testOversizedControlGroupFailsClosed();
  testDirtyGitFailsClosed();
  console.log(`${LABEL} PASS`);
}

main();
