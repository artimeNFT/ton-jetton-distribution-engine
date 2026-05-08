import { execFileSync } from "node:child_process";

type ProbeSummary = {
  readonly probeId: string;
  readonly sourceStage: "C-8.2";
  readonly provider: "tonapi";
  readonly endpointPath: string;
  readonly controlGroupSize: number;
  readonly requestAttempted: false;
  readonly providerStatus: "not_attempted_c8_2_gate_only";
  readonly eventsObserved: 0;
  readonly skippedCount: 0;
  readonly finalityDecision: "not_evaluated_no_provider_call";
  readonly confirmationDepthUsed: 5;
  readonly killSwitchState: "clear" | "blocked";
  readonly abortGateState: "clear" | "blocked";
};

const LABEL = "[stage-c8-readonly-tonapi-probe]";
const REQUIRED_API_KEY_ENV = "TONAPI_API_KEY";
const CONTROL_GROUP_ENV = "TONAPI_C8_CONTROL_GROUP";
const PRE_PROVIDER_ABORT_ENV = "C8_MANUAL_ABORT_PRE_PROVIDER";
const APPROVAL_ENV = "C8_READONLY_PROBE_APPROVAL";
const EXPECTED_APPROVAL = "C8_GATE_ONLY_NO_PROVIDER_CALL";
const EXPECTED_ABORT_CLEAR = "CLEAR";
const DEFAULT_MAX_CONTROL_GROUP_SIZE = 5;
const MIN_CONFIRMATION_DEPTH = 5;

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

function failClosed(reason: string): never {
  const summary: ProbeSummary = {
    probeId: "c8_2_gate_only_probe",
    sourceStage: "C-8.2",
    provider: "tonapi",
    endpointPath: "/v2/accounts/{account_id}/jettons/history",
    controlGroupSize: 0,
    requestAttempted: false,
    providerStatus: "not_attempted_c8_2_gate_only",
    eventsObserved: 0,
    skippedCount: 0,
    finalityDecision: "not_evaluated_no_provider_call",
    confirmationDepthUsed: MIN_CONFIRMATION_DEPTH,
    killSwitchState: "blocked",
    abortGateState: "blocked",
  };

  console.error(`${LABEL} FAIL_CLOSED ${reason}`);
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

function printSuccess(controlGroupSize: number): void {
  const summary: ProbeSummary = {
    probeId: "c8_2_gate_only_probe",
    sourceStage: "C-8.2",
    provider: "tonapi",
    endpointPath: "/v2/accounts/{account_id}/jettons/history",
    controlGroupSize,
    requestAttempted: false,
    providerStatus: "not_attempted_c8_2_gate_only",
    eventsObserved: 0,
    skippedCount: 0,
    finalityDecision: "not_evaluated_no_provider_call",
    confirmationDepthUsed: MIN_CONFIRMATION_DEPTH,
    killSwitchState: "clear",
    abortGateState: "clear",
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log(`${LABEL} PASS`);
}

function assertGitClean(): void {
  const status = execFileSync("git", ["status", "--short"], {
    encoding: "utf8",
  }).trim();

  if (status.length > 0) {
    failClosed("git_state_not_clean");
  }
}

function parseControlGroup(raw: string): string[] {
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  const unique = new Set(values);

  if (values.length === 0) {
    failClosed("control_group_empty");
  }

  if (unique.size !== values.length) {
    failClosed("control_group_contains_duplicates");
  }

  if (values.length > DEFAULT_MAX_CONTROL_GROUP_SIZE) {
    failClosed("control_group_too_large");
  }

  return values;
}

function main(): void {
  assertGitClean();

  const approval = readEnv(APPROVAL_ENV);
  if (approval !== EXPECTED_APPROVAL) {
    failClosed("missing_or_invalid_probe_approval");
  }

  const apiKeyPresent = readEnv(REQUIRED_API_KEY_ENV) !== null;
  if (!apiKeyPresent) {
    failClosed("missing_tonapi_api_key_env");
  }

  const abortState = readEnv(PRE_PROVIDER_ABORT_ENV);
  if (abortState !== EXPECTED_ABORT_CLEAR) {
    failClosed("manual_pre_provider_abort_not_clear");
  }

  const controlGroupRaw = readEnv(CONTROL_GROUP_ENV);
  if (controlGroupRaw === null) {
    failClosed("missing_control_group");
  }

  const controlGroup = parseControlGroup(controlGroupRaw);

  printSuccess(controlGroup.length);
}

main();
