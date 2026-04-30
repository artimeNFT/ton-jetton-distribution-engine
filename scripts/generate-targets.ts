/**
 * @file scripts/generate-targets.ts
 * @description Synthetic recipient dataset generator for Stage A stress tests.
 *
 * Generates mathematically valid TON addresses (workchain 0, testnet,
 * non-bounceable) with guaranteed uniqueness to prevent state-key collisions
 * of the form <batchId>::<recipientAddressLowercase>.
 *
 * Usage:
 *   npx ts-node scripts/generate-targets.ts --count 100 --amount 1000000000
 *   npx ts-node scripts/generate-targets.ts --count 50 --amount 500000000 \
 *     --output data/targets.50.json \
 *     --campaign-id stress_stage_a_50_run1 \
 *     --tag stress50 \
 *     --memo-prefix stress-recipient
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

import { Address } from "@ton/core";

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

interface CLIArgs {
  count: number;
  amount: string;
  output: string;
  campaignId: string;
  tag: string;
  memoPrefix: string;
}

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    const val = args[idx + 1];
    if (val === undefined || val.startsWith("--")) {
      throw new Error(`[generate-targets] Flag "${flag}" requires a value.`);
    }
    return val;
  };

  // ── Required ────────────────────────────────────────────────────────────

  const rawCount = get("--count");
  if (rawCount === undefined) {
    throw new Error('[generate-targets] Missing required argument: --count <number>');
  }
  const count = Number(rawCount);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `[generate-targets] --count must be a positive integer. Got: "${rawCount}".`
    );
  }

  const amount = get("--amount");
  if (amount === undefined) {
    throw new Error('[generate-targets] Missing required argument: --amount <decimal-string>');
  }
  if (!/^[0-9]+$/.test(amount.trim())) {
    throw new Error(
      `[generate-targets] --amount must be an unsigned decimal integer string. Got: "${amount}".`
    );
  }
  if (amount.trim() === "0") {
    throw new Error('[generate-targets] --amount must be greater than 0.');
  }

  // ── Optional with defaults ───────────────────────────────────────────────

  const output =
    get("--output") ?? path.join("data", `targets.${count}.json`);
  const campaignId =
    get("--campaign-id") ?? `stress_stage_a_${count}_generated`;
  const tag =
    get("--tag") ?? "generated";
  const memoPrefix =
    get("--memo-prefix") ?? "generated-recipient";

  return {
    count,
    amount: amount.trim(),
    output,
    campaignId,
    tag,
    memoPrefix,
  };
}

// ─── Address Generation ───────────────────────────────────────────────────────

/**
 * Generates a single valid TON address.
 *
 * Strategy:
 *   - 32 random bytes from crypto.randomBytes(32) as the address hash.
 *   - Workchain 0.
 *   - Serialized as testOnly=true, bounceable=false (user-friendly testnet
 *     non-bounceable format), which produces the "0Q..." prefix.
 */
function generateTonAddress(): string {
  const hashBytes = crypto.randomBytes(32);
  const addr = new Address(0, hashBytes);
  return addr.toString({
    testOnly: true,
    bounceable: false,
  });
}

/**
 * Generates exactly `count` unique TON addresses.
 *
 * Uniqueness is enforced on the lowercased string representation, mirroring
 * the makeStateKey contract in stateStore.ts:
 *   key = `${batchId}::${recipientAddress.trim().toLowerCase()}`
 *
 * If a collision occurs (astronomically unlikely with 32-byte entropy),
 * the loop retries until the required count is satisfied.
 */
function generateUniqueAddresses(count: number): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];

  while (addresses.length < count) {
    const addr = generateTonAddress();
    const normalized = addr.trim().toLowerCase();

    if (seen.has(normalized)) {
      // Collision — retry.
      continue;
    }

    seen.add(normalized);
    addresses.push(addr);
  }

  return addresses;
}

// ─── Output Schema ────────────────────────────────────────────────────────────

interface RecipientRecord {
  address: string;
  amount: string;
  tag: string;
  memo: string;
}

interface TargetsEnvelope {
  _comment: string;
  meta: {
    version: "1.0.0";
    campaignId: string;
    description: string;
    createdAt: string;
    createdBy: "generator";
  };
  defaults: {
    tag: string;
    memo: "";
  };
  recipients: RecipientRecord[];
}

function buildEnvelope(args: CLIArgs, addresses: string[]): TargetsEnvelope {
  const createdAt = new Date().toISOString();
  const padWidth = String(args.count).length;

  const recipients: RecipientRecord[] = addresses.map((address, i) => ({
    address,
    amount: args.amount,
    tag: args.tag,
    memo: `${args.memoPrefix}-${String(i + 1).padStart(Math.max(3, padWidth), "0")}`,
  }));

  return {
    _comment: `Stage A stress test — ${args.count} synthetic recipients — generated ${createdAt}`,
    meta: {
      version: "1.0.0",
      campaignId: args.campaignId,
      description: `Synthetic stress dataset: ${args.count} unique recipients at ${args.amount} nanotons each`,
      createdAt,
      createdBy: "generator",
    },
    defaults: {
      tag: args.tag,
      memo: "",
    },
    recipients,
  };
}

// ─── File Writer ──────────────────────────────────────────────────────────────

async function writeOutput(outputPath: string, envelope: TargetsEnvelope): Promise<void> {
  const resolved = path.resolve(outputPath);
  const dir = path.dirname(resolved);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(resolved, JSON.stringify(envelope, null, 2), "utf8");

  return;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function assertOutputIntegrity(envelope: TargetsEnvelope, expectedCount: number): void {
  if (envelope.recipients.length !== expectedCount) {
    throw new Error(
      `[generate-targets] Integrity check failed: expected ${expectedCount} recipients, ` +
        `got ${envelope.recipients.length}.`
    );
  }

  const seen = new Set<string>();
  for (const r of envelope.recipients) {
    const key = r.address.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `[generate-targets] Integrity check failed: duplicate address detected: "${r.address}".`
      );
    }
    seen.add(key);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: CLIArgs;
  try {
    args = parseArgs(process.argv);
  } catch (err: unknown) {
    console.error(errorMessage(err));
    console.error(
      "\nUsage:\n" +
        "  npx ts-node scripts/generate-targets.ts \\\n" +
        "    --count <N> \\\n" +
        "    --amount <decimal-string> \\\n" +
        "    [--output <path>] \\\n" +
        "    [--campaign-id <string>] \\\n" +
        "    [--tag <string>] \\\n" +
        "    [--memo-prefix <string>]"
    );
    process.exit(1);
  }

  console.log(
    `[generate-targets] Generating ${args.count} unique TON addresses…`
  );

  const addresses = generateUniqueAddresses(args.count);
  const envelope = buildEnvelope(args, addresses);

  // Post-generation integrity gate — fail loudly before any file IO.
  assertOutputIntegrity(envelope, args.count);

  await writeOutput(args.output, envelope);

  const resolvedOutput = path.resolve(args.output);

  console.log(
    [
      "",
      "✓ Targets file written successfully.",
      `  Output path   : ${resolvedOutput}`,
      `  Recipients    : ${envelope.recipients.length}`,
      `  Campaign ID   : ${args.campaignId}`,
      `  Amount each   : ${args.amount} nanotons`,
      "",
    ].join("\n")
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error(`[generate-targets] Fatal: ${errorMessage(err)}`);
  process.exit(1);
});
