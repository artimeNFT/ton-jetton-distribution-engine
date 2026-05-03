import "dotenv/config";
import * as fs from "fs/promises";

type WatcherStatus = "draft";

type WatcherSeverity = "info" | "warning" | "critical";
const STUCK_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

interface WatcherFinding {
  code: string;
  severity: WatcherSeverity;
  message: string;
  details: Record<string, unknown>;
}

interface WatcherFindingsSummary {
  severity: WatcherSeverity;
  findings: number;
  warning: number;
  critical: number;
}

function summarizeFindings(findings: WatcherFinding[]): WatcherFindingsSummary {
  const warning = findings.filter((f) => f.severity === "warning").length;
  const critical = findings.filter((f) => f.severity === "critical").length;

  return {
    severity: critical > 0 ? "critical" : warning > 0 ? "warning" : "info",
    findings: findings.length,
    warning,
    critical,
  };
}

interface WatcherInputConfig {
  campaignId: string;
  targetsPath: string;
  statePath: string;
  reportDir: string | null;
  operatorsPath: string | null;
  nowIso: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`[watchStageB0] Required environment variable "${name}" is missing.`);
  }
  return value.trim();
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function loadInputConfig(): WatcherInputConfig {
  return {
    campaignId: requireEnv("WATCH_CAMPAIGN_ID"),
    targetsPath: requireEnv("WATCH_TARGETS_PATH"),
    statePath: requireEnv("WATCH_STATE_PATH"),
    reportDir: optionalEnv("WATCH_REPORT_DIR"),
    operatorsPath: optionalEnv("WATCH_OPERATORS_PATH"),
    nowIso: optionalEnv("WATCH_NOW_ISO") ?? new Date().toISOString(),
  };
}

function getAgeMs(nowIso: string, thenIso: string | null): number | null {
  if (thenIso === null) {
    return null;
  }

  const nowMs = Date.parse(nowIso);
  const thenMs = Date.parse(thenIso);

  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) {
    return null;
  }

  return nowMs - thenMs;
}

function extractNormalizedRecipientAddresses(recipients: unknown[]): string[] {
  return recipients.map((recipient) => {
    if (recipient === null || typeof recipient !== "object" || Array.isArray(recipient)) {
      return "";
    }

    const address = (recipient as Record<string, unknown>)["address"];
    return typeof address === "string" ? address.trim().toLowerCase() : "";
  });
}

async function loadTargetsSummary(input: WatcherInputConfig): Promise<WatcherTargetsSummary> {
  const raw = await fs.readFile(input.targetsPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    const normalizedAddresses = extractNormalizedRecipientAddresses(parsed);

    return {
      recipientCount: parsed.length,
      uniqueRecipientAddresses: new Set(normalizedAddresses).size,
      metaCampaignId: null,
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[watchStageB0] targets file must be an array or an object.");
  }

  const obj = parsed as Record<string, unknown>;
  const recipients = obj["recipients"];

  if (!Array.isArray(recipients)) {
    throw new Error("[watchStageB0] targets file must contain a recipients array.");
  }

  const meta = obj["meta"];
  const metaCampaignId =
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    typeof (meta as Record<string, unknown>)["campaignId"] === "string"
      ? ((meta as Record<string, unknown>)["campaignId"] as string)
      : null;

  const normalizedAddresses = extractNormalizedRecipientAddresses(recipients);

  return {
    recipientCount: recipients.length,
    uniqueRecipientAddresses: new Set(normalizedAddresses).size,
    metaCampaignId,
  };
}
async function loadOperatorsSummary(input: WatcherInputConfig): Promise<WatcherOperatorsSummary> {
  if (input.operatorsPath === null) {
    return {
      configured: false,
      operatorCount: 0,
      operatorIds: [],
      duplicateOperatorIds: [],
    };
  }

  const raw = await fs.readFile(input.operatorsPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("[watchStageB0] operators file must be a JSON array.");
  }

  const operatorIds = parsed
    .map((operator) => {
      if (operator === null || typeof operator !== "object" || Array.isArray(operator)) {
        return "";
      }

      const id = (operator as Record<string, unknown>)["id"];
      return typeof id === "string" ? id.trim() : "";
    })
    .filter((id) => id !== "");

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of operatorIds) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  return {
    configured: true,
    operatorCount: operatorIds.length,
    operatorIds: Array.from(new Set(operatorIds)).sort(),
    duplicateOperatorIds: Array.from(duplicates).sort(),
  };
}

async function loadStateSummary(input: WatcherInputConfig): Promise<WatcherStateSummary> {
  const raw = await fs.readFile(input.statePath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[watchStageB0] state file must be a JSON object.");
  }

  const obj = parsed as Record<string, unknown>;
  const meta = obj["meta"];
  const entries = obj["entries"];
  const lock = obj["lock"];

  const metaStatus =
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    typeof (meta as Record<string, unknown>)["status"] === "string"
      ? ((meta as Record<string, unknown>)["status"] as string)
      : null;

  const metaCampaignId =
    meta !== null &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    typeof (meta as Record<string, unknown>)["campaignId"] === "string"
      ? ((meta as Record<string, unknown>)["campaignId"] as string)
      : null;

  const entryCount =
    entries !== null && typeof entries === "object" && !Array.isArray(entries)
      ? Object.keys(entries as Record<string, unknown>).length
      : 0;

  const statusCounts: Record<string, number> = {};

  if (entries !== null && typeof entries === "object" && !Array.isArray(entries)) {
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const status = (entry as Record<string, unknown>)["status"];
      if (typeof status !== "string") {
        continue;
      }

      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
  }

  let successWithoutTxHash = 0;

  if (entries !== null && typeof entries === "object" && !Array.isArray(entries)) {
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const status = record["status"];
      const txHash = record["txHash"];

      if (
        status === "success" &&
        (typeof txHash !== "string" || txHash.trim() === "")
      ) {
        successWithoutTxHash += 1;
      }
    }
  }
  let hardFailureMissingReason = 0;

  if (entries !== null && typeof entries === "object" && !Array.isArray(entries)) {
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const status = record["status"];
      const lastError = record["lastError"];
      const lastErrorCode = record["lastErrorCode"];

      const missingLastError =
        typeof lastError !== "string" || lastError.trim() === "";

      const missingLastErrorCode =
        typeof lastErrorCode !== "string" || lastErrorCode.trim() === "";

      if (status === "hard_failure" && (missingLastError || missingLastErrorCode)) {
        hardFailureMissingReason += 1;
      }
    }
  }

  let submittedStuckCount = 0;

  if (entries !== null && typeof entries === "object" && !Array.isArray(entries)) {
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const status = record["status"];
      const submittedAt = typeof record["submittedAt"] === "string" ? record["submittedAt"] : null;
      const updatedAt = typeof record["updatedAt"] === "string" ? record["updatedAt"] : null;
      const ageMs = getAgeMs(input.nowIso, submittedAt ?? updatedAt);

      if (status === "submitted" && ageMs !== null && ageMs > STUCK_LOCK_THRESHOLD_MS) {
        submittedStuckCount += 1;
      }
    }
  }

  const batchIds = new Set<string>();

  if (entries !== null && typeof entries === "object" && !Array.isArray(entries)) {
    for (const entry of Object.values(entries as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const batchId = (entry as Record<string, unknown>)["batchId"];
      if (typeof batchId === "string" && batchId.trim() !== "") {
        batchIds.add(batchId);
      }
    }
  }

  const lockActive =
    lock !== null &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    typeof (lock as Record<string, unknown>)["activeBatchId"] === "string" &&
    ((lock as Record<string, unknown>)["activeBatchId"] as string).trim() !== "";

  const activeBatchId =
    lock !== null &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    typeof (lock as Record<string, unknown>)["activeBatchId"] === "string"
      ? ((lock as Record<string, unknown>)["activeBatchId"] as string)
      : null;

  const activeOperatorId =
    lock !== null &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    typeof (lock as Record<string, unknown>)["activeOperatorId"] === "string"
      ? ((lock as Record<string, unknown>)["activeOperatorId"] as string)
      : null;

  const lockedAt =
    lock !== null &&
    typeof lock === "object" &&
    !Array.isArray(lock) &&
    typeof (lock as Record<string, unknown>)["lockedAt"] === "string"
      ? ((lock as Record<string, unknown>)["lockedAt"] as string)
      : null;

  return {
    metaCampaignId,
    metaStatus,
    entryCount,
    statusCounts,
    successWithoutTxHash,
    hardFailureMissingReason,
    submittedStuckCount,
    batchIds: Array.from(batchIds).sort(),
    lockActive,
    activeBatchId,
    activeOperatorId,
    lockedAt,
  };
}

function detectFindings(
  input: WatcherInputConfig,
  targets: WatcherTargetsSummary,
  state: WatcherStateSummary
): WatcherFinding[] {
  const findings: WatcherFinding[] = [];

  if (
    targets.metaCampaignId !== null &&
    targets.metaCampaignId !== input.campaignId
  ) {
    findings.push({
      code: "W002",
      severity: "critical",
      message: "Targets campaign ID differs from watcher campaign ID.",
      details: {
        expectedCampaignId: input.campaignId,
        targetsMetaCampaignId: targets.metaCampaignId,
      },
    });
  }

  if (
    state.metaCampaignId !== null &&
    state.metaCampaignId !== input.campaignId
  ) {
    findings.push({
      code: "W002",
      severity: "critical",
      message: "State campaign ID differs from watcher campaign ID.",
      details: {
        expectedCampaignId: input.campaignId,
        stateMetaCampaignId: state.metaCampaignId,
      },
    });
  }

  if (targets.uniqueRecipientAddresses < targets.recipientCount) {
    findings.push({
      code: "W006",
      severity: "critical",
      message: "Duplicate target recipient addresses detected.",
      details: {
        recipientCount: targets.recipientCount,
        uniqueRecipientAddresses: targets.uniqueRecipientAddresses,
      },
    });
  }

  if (state.metaStatus === "completed") {
    const nonTerminalAfterCompleted =
      (state.statusCounts["planned"] ?? 0) +
      (state.statusCounts["submitted"] ?? 0) +
      (state.statusCounts["cooldown"] ?? 0);

    if (nonTerminalAfterCompleted > 0) {
      findings.push({
        code: "W008",
        severity: "critical",
        message: "Completed campaign contains non-terminal entries.",
        details: {
          metaStatus: state.metaStatus,
          planned: state.statusCounts["planned"] ?? 0,
          submitted: state.statusCounts["submitted"] ?? 0,
          cooldown: state.statusCounts["cooldown"] ?? 0,
          nonTerminalAfterCompleted,
        },
      });
    }
  }

  if (
    state.activeBatchId !== null &&
    !state.batchIds.includes(state.activeBatchId)
  ) {
    findings.push({
      code: "W011",
      severity: "critical",
      message: "Active lock references an unknown batch ID.",
      details: {
        activeBatchId: state.activeBatchId,
        knownBatchCount: state.batchIds.length,
      },
    });
  }

  if (state.submittedStuckCount > 0) {
    findings.push({
      code: "W009",
      severity: "critical",
      message: "Submitted entries are older than the configured threshold.",
      details: {
        submittedStuckCount: state.submittedStuckCount,
        thresholdMs: STUCK_LOCK_THRESHOLD_MS,
      },
    });
  }

  if (state.lockActive) {
    const lockAgeMs = getAgeMs(input.nowIso, state.lockedAt);

    if (lockAgeMs !== null && lockAgeMs > STUCK_LOCK_THRESHOLD_MS) {
      findings.push({
        code: "W010",
        severity: "critical",
        message: "Active lock is older than the configured threshold.",
        details: {
          lockedAt: state.lockedAt,
          nowIso: input.nowIso,
          lockAgeMs,
          thresholdMs: STUCK_LOCK_THRESHOLD_MS,
        },
      });
    }
  }

  if (state.successWithoutTxHash > 0) {
    findings.push({
      code: "W014",
      severity: "critical",
      message: "Success entries without txHash detected.",
      details: {
        successWithoutTxHash: state.successWithoutTxHash,
      },
    });
  }

  if (state.hardFailureMissingReason > 0) {
    findings.push({
      code: "W015",
      severity: "warning",
      message: "Hard failure entries missing error reason.",
      details: {
        hardFailureMissingReason: state.hardFailureMissingReason,
      },
    });
  }

  return findings;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function verifyArtifactAccess(input: WatcherInputConfig): Promise<WatcherArtifactAccess> {
  await fs.access(input.targetsPath);
  await fs.access(input.statePath);

  return {
    targetsReadable: true,
    stateReadable: true,
    reportDirReadable: input.reportDir === null ? null : await pathExists(input.reportDir),
  };
}

interface WatcherArtifactAccess {
  targetsReadable: boolean;
  stateReadable: boolean;
  reportDirReadable: boolean | null;
}

interface WatcherTargetsSummary {
  recipientCount: number;
  uniqueRecipientAddresses: number;
  metaCampaignId: string | null;
}

interface WatcherOperatorsSummary {
  configured: boolean;
  operatorCount: number;
  operatorIds: string[];
  duplicateOperatorIds: string[];
}

interface WatcherStateSummary {
  metaCampaignId: string | null;
  metaStatus: string | null;
  entryCount: number;
  statusCounts: Record<string, number>;
  successWithoutTxHash: number;
  hardFailureMissingReason: number;
  submittedStuckCount: number;
  batchIds: string[];
  lockActive: boolean;
  activeBatchId: string | null;
  activeOperatorId: string | null;
  lockedAt: string | null;
}

interface WatcherBootReport {
  stage: "Stage B-0";
  status: WatcherStatus;
  readOnly: true;
  mutationEnabled: false;
  executionEnabled: false;
  input: WatcherInputConfig;
  artifactAccess: WatcherArtifactAccess;
  targets: WatcherTargetsSummary;
  operators: WatcherOperatorsSummary;
  state: WatcherStateSummary;
  summary: WatcherFindingsSummary;
  findings: WatcherFinding[];
}

function buildBootReport(
  input: WatcherInputConfig,
  artifactAccess: WatcherArtifactAccess,
  targets: WatcherTargetsSummary,
  operators: WatcherOperatorsSummary,
  state: WatcherStateSummary,
  findings: WatcherFinding[]
): WatcherBootReport {
  return {
    stage: "Stage B-0",
    status: "draft",
    readOnly: true,
    mutationEnabled: false,
    executionEnabled: false,
    input,
    artifactAccess,
    targets,
    operators,
    state,
    summary: summarizeFindings(findings),
    findings,
  };
}

async function main(): Promise<void> {
  const input = loadInputConfig();
  const artifactAccess = await verifyArtifactAccess(input);
  const targets = await loadTargetsSummary(input);
  const operators = await loadOperatorsSummary(input);
  const state = await loadStateSummary(input);
  const findings = detectFindings(input, targets, state);
  console.log(JSON.stringify(buildBootReport(input, artifactAccess, targets, operators, state, findings), null, 2));
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: "error", message }, null, 2));
  process.exitCode = 3;
});
