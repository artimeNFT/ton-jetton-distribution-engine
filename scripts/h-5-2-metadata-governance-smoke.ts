import { createHash } from "node:crypto";

const LABEL = "[h-5-2-metadata-governance-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

type GovernanceLabel =
  | "METADATA_GOVERNANCE_OK"
  | "HASH_DRIFT"
  | "MISSING_METADATA_FIELD"
  | "INVALID_DECIMALS"
  | "IDENTITY_MUTATION"
  | "METADATA_MUTATION"
  | "URI_REPLACEMENT"
  | "HIDDEN_FALLBACK_URI";

type GovernanceResult = {
  readonly label: GovernanceLabel;
  readonly blocking: boolean;
  readonly reasonCode: string;
};

type Metadata = {
  readonly name?: string;
  readonly symbol?: string;
  readonly description?: string;
  readonly decimals?: number;
  readonly image?: string;
  readonly render_type?: string;
  readonly amount_style?: string;
};

type Identity = {
  readonly tokenIdentity: string;
  readonly issuerIdentity: string;
  readonly displayIdentity: string;
  readonly brandingIdentity: string;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const REQUIRED_FIELDS: readonly (keyof Metadata)[] = [
  "name",
  "symbol",
  "description",
  "decimals",
  "image",
  "render_type",
  "amount_style",
];

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function makeResult(label: GovernanceLabel, reasonCode: string): GovernanceResult {
  return {
    label,
    blocking: label !== "METADATA_GOVERNANCE_OK",
    reasonCode,
  };
}

function identityHash(identity: Identity): string {
  return sha256Hex(stableJson(identity));
}

function metadataHash(metadata: Metadata): string {
  return sha256Hex(stableJson(metadata));
}

type GovernanceInput = {
  readonly metadata: Metadata;
  readonly pinnedMetadataHash: string;
  readonly observedContentHash: string;
  readonly currentContentUri: string;
  readonly approvedContentUri: string;
  readonly identity: Identity;
  readonly pinnedIdentityHash: string;
  readonly fallbackUri?: string;
};

function validateRequiredFields(metadata: Metadata): GovernanceResult | null {
  for (const field of REQUIRED_FIELDS) {
    if (metadata[field] === undefined || metadata[field] === "") {
      return makeResult("MISSING_METADATA_FIELD", "missing_metadata_field");
    }
  }

  return null;
}

function validate(input: GovernanceInput): GovernanceResult {
  const requiredFailure = validateRequiredFields(input.metadata);
  if (requiredFailure) return requiredFailure;

  const decimals = input.metadata.decimals;
  if (!Number.isInteger(decimals) || decimals! < 0 || decimals! > 255) {
    return makeResult("INVALID_DECIMALS", "invalid_decimals");
  }

  if (input.observedContentHash !== input.pinnedMetadataHash) {
    return makeResult("HASH_DRIFT", "hash_drift");
  }

  if (metadataHash(input.metadata) !== input.pinnedMetadataHash) {
    return makeResult("METADATA_MUTATION", "metadata_mutation");
  }

  if (identityHash(input.identity) !== input.pinnedIdentityHash) {
    return makeResult("IDENTITY_MUTATION", "identity_mutation");
  }

  if (input.currentContentUri !== input.approvedContentUri) {
    return makeResult("URI_REPLACEMENT", "uri_replacement");
  }

  if (
    input.fallbackUri !== undefined &&
    input.fallbackUri.trim() !== ""
  ) {
    return makeResult("HIDDEN_FALLBACK_URI", "hidden_fallback_uri");
  }

  return makeResult("METADATA_GOVERNANCE_OK", "metadata_governance_ok");
}

const BASE_METADATA: Metadata = {
  name: "Tether USD",
  symbol: "USD₮",
  description: "Tether USD metadata fixture",
  decimals: 6,
  image: "mock://metadata/image.png",
  render_type: "currency",
  amount_style: "n",
};

const BASE_IDENTITY: Identity = {
  tokenIdentity: "USDT",
  issuerIdentity: "Tether",
  displayIdentity: "Tether USD",
  brandingIdentity: "Tether USD",
};

const BASE_INPUT: GovernanceInput = {
  metadata: BASE_METADATA,
  pinnedMetadataHash: metadataHash(BASE_METADATA),
  observedContentHash: metadataHash(BASE_METADATA),
  currentContentUri: "mock://metadata/token-v1.json",
  approvedContentUri: "mock://metadata/token-v1.json",
  identity: BASE_IDENTITY,
  pinnedIdentityHash: identityHash(BASE_IDENTITY),
};

function runCase(name: string, patch: Partial<GovernanceInput>, expected: GovernanceLabel): void {
  const result = validate({ ...BASE_INPUT, ...patch });
  assert(result.label === expected, `${name} expected ${expected} got ${result.label}`);
}

function main(): void {
  runCase("valid governance passes", {}, "METADATA_GOVERNANCE_OK");

  runCase("hash drift fails closed", {
    observedContentHash: sha256Hex("drifted observed content"),
  }, "HASH_DRIFT");

  runCase("metadata mutation fails closed", {
    metadata: { ...BASE_METADATA, description: "mutated" },
  }, "METADATA_MUTATION");

  runCase("missing metadata field fails closed", {
    metadata: { ...BASE_METADATA, symbol: undefined },
  }, "MISSING_METADATA_FIELD");

  runCase("invalid decimals fails closed", {
    metadata: { ...BASE_METADATA, decimals: 999 },
  }, "INVALID_DECIMALS");

  runCase("identity mutation fails closed", {
    identity: {
      ...BASE_IDENTITY,
      brandingIdentity: "Different Brand",
    },
  }, "IDENTITY_MUTATION");

  runCase("URI replacement fails closed", {
    currentContentUri: "mock://metadata/token-v2.json",
  }, "URI_REPLACEMENT");

  runCase("hidden fallback URI fails closed", {
    fallbackUri: "mock://metadata/fallback.json",
  }, "HIDDEN_FALLBACK_URI");

  console.log(`${LABEL} PASS`);
}

main();
