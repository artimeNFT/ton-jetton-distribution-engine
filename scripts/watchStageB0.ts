import "dotenv/config";

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

interface WatcherBootReport {
  stage: "Stage B-0";
  status: WatcherStatus;
  readOnly: true;
  mutationEnabled: false;
  executionEnabled: false;
  input: WatcherInputConfig;
}

function buildBootReport(input: WatcherInputConfig): WatcherBootReport {
  return {
    stage: "Stage B-0",
    status: "draft",
    readOnly: true,
    mutationEnabled: false,
    executionEnabled: false,
    input,
  };
}

async function main(): Promise<void> {
  const input = loadInputConfig();
  console.log(JSON.stringify(buildBootReport(input), null, 2));
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ level: "error", message }, null, 2));
  process.exitCode = 3;
});
