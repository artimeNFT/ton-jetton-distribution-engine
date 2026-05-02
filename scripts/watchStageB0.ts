import "dotenv/config";
import * as fs from "fs/promises";

type WatcherStatus = "draft";


interface WatcherInputConfig {
  campaignId: string;
  targetsPath: string;
  statePath: string;
  reportDir: string | null;
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
    nowIso: optionalEnv("WATCH_NOW_ISO") ?? new Date().toISOString(),
  };
}

async function loadTargetsSummary(input: WatcherInputConfig): Promise<WatcherTargetsSummary> {
  const raw = await fs.readFile(input.targetsPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return { recipientCount: parsed.length, metaCampaignId: null };
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

  return { recipientCount: recipients.length, metaCampaignId };
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
  metaCampaignId: string | null;
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
}

function buildBootReport(
  input: WatcherInputConfig,
  artifactAccess: WatcherArtifactAccess,
  targets: WatcherTargetsSummary
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
  };
}

async function main(): Promise<void> {
  const input = loadInputConfig();
  const artifactAccess = await verifyArtifactAccess(input);
  const targets = await loadTargetsSummary(input);
  console.log(JSON.stringify(buildBootReport(input, artifactAccess, targets), null, 2));
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: "error", message }, null, 2));
  process.exitCode = 3;
});
