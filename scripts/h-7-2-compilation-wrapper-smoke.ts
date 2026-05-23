import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LABEL = "[h-7-2-compilation-wrapper-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

const REQUIRED_BUILD_FILES = [
  "build/JettonMaster.compiled.json",
  "build/JettonWallet.compiled.json",
  "build/JettonMaster/JettonMaster_JettonMaster.ts",
  "build/JettonMaster/JettonMaster_JettonWallet.ts",
  "build/JettonWallet/JettonWallet_JettonWallet.ts",
] as const;

const FORBIDDEN_SOURCE_PATTERNS = [
  "ResearchMonster_ResearchMonster",
  "JettonWallet_JettonWallet",
  "wrappers/",
  "tact_",
] as const;

const SOURCE_DIRS = ["lib", "scripts", "tests"] as const;
const SELF_FILE = "scripts/h-7-2-compilation-wrapper-smoke.ts";

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const QUARANTINED_LEGACY_FILES = new Set([
  "lib/getWalletAddress.js",
  "lib/staggered-broadcaster.js",
  "scripts/bulkMint.ts",
  "scripts/deployJettonMaster.ts",
  "scripts/batchStatusUpdate.ts",
  "scripts/vaultDistribution.ts",
  "scripts/vaultDistribution_linkTest.ts",
  "scripts/gasEstimator.ts",
]);

function isQuarantinedLegacy(file: string): boolean {
  return file.startsWith("legacy/") || QUARANTINED_LEGACY_FILES.has(file);
}

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

function assertRequiredBuildFiles(): void {
  for (const file of REQUIRED_BUILD_FILES) {
    assert(existsSync(file), `missing required generated build file: ${file}`);
  }
}

function assertNoActiveStaleWrapperReferences(): void {
  const files = SOURCE_DIRS.flatMap(listFiles)
    .filter((file) => /\.(ts|js)$/.test(file))
    .filter((file) => file !== SELF_FILE)
    .filter((file) => !isQuarantinedLegacy(file));

  for (const file of files) {
    const text = readText(file);
    for (const pattern of FORBIDDEN_SOURCE_PATTERNS) {
      assert(
        !text.includes(pattern),
        `active source contains stale wrapper/import pattern: ${file} :: ${pattern}`
      );
    }
  }
}

function assertNoManualWrapperDirectory(): void {
  assert(!existsSync("wrappers"), "manual wrappers directory must not exist");
}

function assertTactCompilerPinned(): void {
  const pkg = JSON.parse(readText("package.json")) as {
    readonly devDependencies?: Record<string, string>;
  };

  assert(
    pkg.devDependencies?.["@tact-lang/compiler"] === "1.6.13",
    "@tact-lang/compiler must be pinned to 1.6.13"
  );
}

function main(): void {
  assertRequiredBuildFiles();
  assertNoManualWrapperDirectory();
  assertNoActiveStaleWrapperReferences();
  assertTactCompilerPinned();

  console.log(`${LABEL} PASS`);
}

main();
