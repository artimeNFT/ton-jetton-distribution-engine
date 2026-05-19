import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const LABEL = "[h-3-secrets-signer-boundary-policy-smoke]";
const POLICY_DOC = "docs/STAGE_H3_SECRETS_SIGNER_BOUNDARY_POLICY.md";
const MAX_FILE_BYTES = 1024 * 1024;

type FileCategory =
  | "POLICY_DOC"
  | "SCANNER_SELF"
  | "QUARANTINED_LEGACY"
  | "ACTIVE_SOURCE"
  | "ACTIVE_SCRIPT"
  | "TEST_OR_FIXTURE"
  | "CONTRACT_SOURCE"
  | "CI_CONFIG"
  | "PROJECT_CONFIG"
  | "UNKNOWN_TRACKED";

type OccurrenceClass =
  | "ALLOWED_POLICY_TEXT"
  | "ALLOWED_SCANNER_TEXT"
  | "ALLOWED_QUARANTINED_LEGACY_TEXT"
  | "POTENTIAL_BLOCKING"
  | "UNKNOWN_REQUIRES_CLASSIFICATION";

const TEXT_EXTENSIONS = [
  ".ts",
  ".js",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".tact",
  ".sh",
];

const SECRET_MARKERS = [
  "mnemonic",
  "privateKey",
  "secretKey",
  "seedPhrase",
  "decryptedKeyMaterial",
  "signedMessage",
  "signedBoc",
  "signedBOC",
  "bocToBroadcast",
  "rawSignature",
  "rpcToken",
  "providerCredential",
  "providerCredentials",
  "TON_API_KEY",
  "DRY_RUN=false",
];

function listTrackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

function isTextAuditCandidate(file: string): boolean {
  if (file.startsWith("node_modules/")) return false;
  if (file.startsWith("build/")) return false;
  if (file.startsWith("reports/")) return false;
  if (file.startsWith(".tmp/")) return false;

  return TEXT_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function classifyPath(file: string): FileCategory {
  if (file === POLICY_DOC) return "POLICY_DOC";
  if (file === "scripts/h-3-secrets-signer-boundary-policy-smoke.ts") {
    return "SCANNER_SELF";
  }

  if (file.startsWith(".github/")) return "CI_CONFIG";
  if (file.startsWith("data/")) return "PROJECT_CONFIG";
  if (file === "package.json") return "PROJECT_CONFIG";
  if (file === "package-lock.json") return "PROJECT_CONFIG";
  if (file === "tsconfig.json") return "PROJECT_CONFIG";
  if (file === "tact.config.json") return "PROJECT_CONFIG";
  if (file === "jest.config.ts") return "PROJECT_CONFIG";
  if (file === "jest.setup.ts") return "PROJECT_CONFIG";

  if (file.startsWith("contracts/")) return "CONTRACT_SOURCE";

  if (
    file.startsWith("tests/") ||
    file.startsWith("test-fixtures/") ||
    file.startsWith("fixtures/")
  ) {
    return "TEST_OR_FIXTURE";
  }

  if (file.startsWith("docs/")) return "POLICY_DOC";

  if (file.startsWith("legacy/")) return "QUARANTINED_LEGACY";
  if (file === "lib/staggered-broadcaster.js") return "QUARANTINED_LEGACY";
  if (file === "lib/getWalletAddress.js") return "QUARANTINED_LEGACY";
  if (file === "scripts/bulkMint.ts") return "QUARANTINED_LEGACY";
  if (file === "scripts/deployJettonMaster.ts") return "QUARANTINED_LEGACY";
  if (file === "scripts/batchStatusUpdate.ts") return "QUARANTINED_LEGACY";
  if (file === "scripts/vaultDistribution.ts") return "QUARANTINED_LEGACY";
  if (file === "scripts/vaultDistribution_linkTest.ts") return "QUARANTINED_LEGACY";
  if (file === "scripts/gasEstimator.ts") return "QUARANTINED_LEGACY";

  if (file.startsWith("lib/")) return "ACTIVE_SOURCE";
  if (file.startsWith("scripts/")) return "ACTIVE_SCRIPT";

  return "UNKNOWN_TRACKED";
}

function classifyOccurrence(category: FileCategory): OccurrenceClass {
  if (category === "POLICY_DOC") return "ALLOWED_POLICY_TEXT";
  if (category === "SCANNER_SELF") return "ALLOWED_SCANNER_TEXT";
  if (category === "QUARANTINED_LEGACY") {
    return "ALLOWED_QUARANTINED_LEGACY_TEXT";
  }

  if (category === "UNKNOWN_TRACKED") {
    return "UNKNOWN_REQUIRES_CLASSIFICATION";
  }

  return "POTENTIAL_BLOCKING";
}

interface MarkerOccurrence {
  readonly file: string;
  readonly category: FileCategory;
  readonly marker: string;
  readonly occurrenceClass: OccurrenceClass;
}

function readAuditText(file: string): string | null {
  const stat = statSync(file);
  if (stat.size > MAX_FILE_BYTES) return null;

  return readFileSync(file, "utf8");
}

function scanFileForMarkers(file: string): MarkerOccurrence[] {
  if (!isTextAuditCandidate(file)) return [];

  const category = classifyPath(file);
  const text = readAuditText(file);
  if (text === null) return [];

  const normalized = text.toLowerCase();
  const occurrences: MarkerOccurrence[] = [];

  for (const marker of SECRET_MARKERS) {
    if (normalized.includes(marker.toLowerCase())) {
      occurrences.push({
        file,
        category,
        marker,
        occurrenceClass: classifyOccurrence(category),
      });
    }
  }

  return occurrences;
}

function countBy<T extends string>(items: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;

  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }

  return counts;
}

function assertPolicyDocIsTracked(files: readonly string[]): void {
  if (!files.includes(POLICY_DOC)) {
    throw new Error(`${LABEL} missing tracked policy doc: ${POLICY_DOC}`);
  }
}

function assertIgnoredRuntimeDirsAreNotTracked(files: readonly string[]): void {
  const forbidden = files.filter(
    (file) =>
      file.startsWith("node_modules/") ||
      file.startsWith("build/") ||
      file.startsWith("reports/") ||
      file.startsWith(".tmp/")
  );

  if (forbidden.length > 0) {
    throw new Error(`${LABEL} ignored runtime artifacts are tracked: ${forbidden.join(", ")}`);
  }
}


function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function main(): void {
  const files = listTrackedFiles();

  assertPolicyDocIsTracked(files);
  assertIgnoredRuntimeDirsAreNotTracked(files);

  const auditFiles = files.filter(isTextAuditCandidate);
  const categories = auditFiles.map(classifyPath);
  const categoryCounts = countBy(categories);

  const occurrences = auditFiles.flatMap(scanFileForMarkers);
  const occurrenceClasses = occurrences.map((item) => item.occurrenceClass);
  const occurrenceClassCounts = countBy(occurrenceClasses);

  console.log(`${LABEL} trackedFiles=${files.length}`);
  console.log(`${LABEL} auditFiles=${auditFiles.length}`);
  console.log(`${LABEL} categories=${JSON.stringify(categoryCounts)}`);
  const unknownTrackedFiles = uniqueSorted(
    auditFiles.filter((file) => classifyPath(file) === "UNKNOWN_TRACKED")
  );
  const potentialBlockingFiles = uniqueSorted(
    occurrences
      .filter((item) => item.occurrenceClass === "POTENTIAL_BLOCKING")
      .map((item) => `${item.file}::${item.marker}`)
  );
  const unknownOccurrenceFiles = uniqueSorted(
    occurrences
      .filter((item) => item.occurrenceClass === "UNKNOWN_REQUIRES_CLASSIFICATION")
      .map((item) => `${item.file}::${item.marker}`)
  );

  console.log(`${LABEL} markerOccurrences=${occurrences.length}`);
  console.log(`${LABEL} occurrenceClasses=${JSON.stringify(occurrenceClassCounts)}`);
  console.log(`${LABEL} unknownTrackedFiles=${JSON.stringify(unknownTrackedFiles)}`);
  console.log(`${LABEL} potentialBlockingFiles=${JSON.stringify(potentialBlockingFiles)}`);
  console.log(`${LABEL} unknownOccurrenceFiles=${JSON.stringify(unknownOccurrenceFiles)}`);

  console.log(`${LABEL} skeletonMode=true`);
  console.log(`${LABEL} enforcementMode=false`);
  console.log(`${LABEL} PASS`);
}

main();
