const LABEL = "[h-4-2-recipient-eligibility-policy-smoke]";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`${LABEL} ${message}`);
  }
}

type EligibilityLabel =
  | "ELIGIBLE"
  | "INVALID_ADDRESS"
  | "DUPLICATE_TARGET"
  | "BLOCKLISTED_TARGET"
  | "ALLOWLIST_MISS"
  | "KNOWN_UNSAFE_TARGET"
  | "UNKNOWN_ELIGIBILITY"
  | "AMBIGUOUS_ELIGIBILITY";

type CapabilityLabel =
  | "DECLARED_W5"
  | "DECLARED_V4R2"
  | "FIXTURE_CONFIRMED_W5"
  | "FIXTURE_CONFIRMED_V4R2"
  | "UNKNOWN_ACCOUNT_CAPABILITY"
  | "AMBIGUOUS_ACCOUNT_CAPABILITY"
  | "UNSUPPORTED_ACCOUNT_CAPABILITY"
  | "BLOCKED_BEFORE_TESTNET";

type CapabilityKind = "W5" | "V4R2";
type CapabilitySource = "declared" | "fixture" | "unauthorized";
type EligibilityStatus = "known" | "unknown" | "ambiguous";

type RiskLabel = {
  readonly label: string;
  readonly blocking: boolean;
};

type TargetInput = {
  readonly address: string;
  readonly eligibilityStatus?: EligibilityStatus;
  readonly knownUnsafe?: boolean;
  readonly riskLabel?: RiskLabel;
  readonly capabilityKind?: CapabilityKind;
  readonly capabilitySource?: CapabilitySource;
  readonly capabilityStatus?: "unknown" | "ambiguous" | "unsupported" | "blocked_before_testnet";
};

type Policy = {
  readonly allowlistMode: boolean;
  readonly allowlist: ReadonlySet<string>;
  readonly blocklist: ReadonlySet<string>;
};

type EligibilityEvidence = {
  readonly targetKey: string;
  readonly eligibilityLabel: EligibilityLabel;
  readonly capabilityLabel?: CapabilityLabel;
  readonly riskLabel?: RiskLabel;
  readonly blocking: boolean;
  readonly reasonCode: string;
};

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function isSyntheticValidAddress(address: string): boolean {
  return /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address);
}

function classifyCapability(target: TargetInput): CapabilityLabel | undefined {
  if (target.capabilityStatus === "unknown") return "UNKNOWN_ACCOUNT_CAPABILITY";
  if (target.capabilityStatus === "ambiguous") return "AMBIGUOUS_ACCOUNT_CAPABILITY";
  if (target.capabilityStatus === "unsupported") return "UNSUPPORTED_ACCOUNT_CAPABILITY";
  if (target.capabilityStatus === "blocked_before_testnet") return "BLOCKED_BEFORE_TESTNET";

  if (target.capabilitySource === "declared" && target.capabilityKind === "W5") return "DECLARED_W5";
  if (target.capabilitySource === "declared" && target.capabilityKind === "V4R2") return "DECLARED_V4R2";
  if (target.capabilitySource === "fixture" && target.capabilityKind === "W5") return "FIXTURE_CONFIRMED_W5";
  if (target.capabilitySource === "fixture" && target.capabilityKind === "V4R2") return "FIXTURE_CONFIRMED_V4R2";

  if (target.capabilitySource === "unauthorized") return "UNKNOWN_ACCOUNT_CAPABILITY";

  return undefined;
}

function isBlockingCapability(label: CapabilityLabel | undefined): boolean {
  return (
    label === "UNKNOWN_ACCOUNT_CAPABILITY" ||
    label === "AMBIGUOUS_ACCOUNT_CAPABILITY" ||
    label === "UNSUPPORTED_ACCOUNT_CAPABILITY" ||
    label === "BLOCKED_BEFORE_TESTNET"
  );
}

function evaluateTarget(
  target: TargetInput,
  policy: Policy,
  seen: Set<string>
): EligibilityEvidence {
  const targetKey = normalizeAddress(target.address);
  const capabilityLabel = classifyCapability(target);

  if (!isSyntheticValidAddress(target.address)) {
    return { targetKey, eligibilityLabel: "INVALID_ADDRESS", capabilityLabel, blocking: true, reasonCode: "invalid_address" };
  }

  if (seen.has(targetKey)) {
    return { targetKey, eligibilityLabel: "DUPLICATE_TARGET", capabilityLabel, blocking: true, reasonCode: "duplicate_target" };
  }

  seen.add(targetKey);

  if (target.eligibilityStatus === "unknown") {
    return { targetKey, eligibilityLabel: "UNKNOWN_ELIGIBILITY", capabilityLabel, blocking: true, reasonCode: "unknown_eligibility" };
  }

  if (target.eligibilityStatus === "ambiguous") {
    return { targetKey, eligibilityLabel: "AMBIGUOUS_ELIGIBILITY", capabilityLabel, blocking: true, reasonCode: "ambiguous_eligibility" };
  }

  if (policy.blocklist.has(targetKey)) {
    return { targetKey, eligibilityLabel: "BLOCKLISTED_TARGET", capabilityLabel, blocking: true, reasonCode: "blocklisted_target" };
  }

  if (target.knownUnsafe === true) {
    return { targetKey, eligibilityLabel: "KNOWN_UNSAFE_TARGET", capabilityLabel, blocking: true, reasonCode: "known_unsafe_target" };
  }

  if (policy.allowlistMode && !policy.allowlist.has(targetKey)) {
    return { targetKey, eligibilityLabel: "ALLOWLIST_MISS", capabilityLabel, blocking: true, reasonCode: "allowlist_miss" };
  }

  if (isBlockingCapability(capabilityLabel)) {
    return { targetKey, eligibilityLabel: "ELIGIBLE", capabilityLabel, blocking: true, reasonCode: "account_capability_blocked" };
  }

  if (target.riskLabel?.blocking === true) {
    return { targetKey, eligibilityLabel: "KNOWN_UNSAFE_TARGET", capabilityLabel, riskLabel: target.riskLabel, blocking: true, reasonCode: "blocking_risk_label" };
  }

  return { targetKey, eligibilityLabel: "ELIGIBLE", capabilityLabel, riskLabel: target.riskLabel, blocking: false, reasonCode: "eligible" };
}

const A1 = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const A2 = "EQBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const A3 = "EQCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const A4 = "UQ".padEnd(48, "D");

const policy: Policy = {
  allowlistMode: true,
  allowlist: new Set([normalizeAddress(A1), normalizeAddress(A2)]),
  blocklist: new Set([normalizeAddress(A3)]),
};

function runCase(
  name: string,
  target: TargetInput,
  expected: Partial<EligibilityEvidence>,
  seedSeen?: readonly string[]
): EligibilityEvidence {
  const seen = new Set((seedSeen ?? []).map(normalizeAddress));
  const result = evaluateTarget(target, policy, seen);

  for (const [key, value] of Object.entries(expected)) {
    assert(
      result[key as keyof EligibilityEvidence] === value,
      `${name} expected ${key}=${String(value)} got ${String(result[key as keyof EligibilityEvidence])}`
    );
  }

  return result;
}

function main(): void {
  runCase("invalid address rejected", { address: "bad-address" }, {
    eligibilityLabel: "INVALID_ADDRESS",
    blocking: true,
    reasonCode: "invalid_address",
  });

  runCase("duplicate target rejected", { address: A1 }, {
    eligibilityLabel: "DUPLICATE_TARGET",
    blocking: true,
    reasonCode: "duplicate_target",
  }, [A1]);

  runCase("blocklisted target rejected", { address: A3 }, {
    eligibilityLabel: "BLOCKLISTED_TARGET",
    blocking: true,
    reasonCode: "blocklisted_target",
  });

  runCase("allowlist mode enforced", { address: A4 }, {
    eligibilityLabel: "ALLOWLIST_MISS",
    blocking: true,
    reasonCode: "allowlist_miss",
  });

  runCase("unknown eligibility fails closed", { address: A1, eligibilityStatus: "unknown" }, {
    eligibilityLabel: "UNKNOWN_ELIGIBILITY",
    blocking: true,
    reasonCode: "unknown_eligibility",
  });

  runCase("ambiguous eligibility fails closed", { address: A1, eligibilityStatus: "ambiguous" }, {
    eligibilityLabel: "AMBIGUOUS_ELIGIBILITY",
    blocking: true,
    reasonCode: "ambiguous_eligibility",
  });

  runCase("known unsafe target rejected", { address: A1, knownUnsafe: true }, {
    eligibilityLabel: "KNOWN_UNSAFE_TARGET",
    blocking: true,
    reasonCode: "known_unsafe_target",
  });

  const riskRecorded = runCase("risk label recorded if present", {
    address: A1,
    riskLabel: { label: "review_required", blocking: false },
  }, {
    eligibilityLabel: "ELIGIBLE",
    blocking: false,
    reasonCode: "eligible",
  });

  assert(riskRecorded.riskLabel?.label === "review_required", "risk label was not recorded");

  runCase("declared W5 accepted from authorized static input", {
    address: A1,
    capabilityKind: "W5",
    capabilitySource: "declared",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "DECLARED_W5",
    blocking: false,
    reasonCode: "eligible",
  });

  runCase("fixture v4R2 accepted from authorized static input", {
    address: A2,
    capabilityKind: "V4R2",
    capabilitySource: "fixture",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "FIXTURE_CONFIRMED_V4R2",
    blocking: false,
    reasonCode: "eligible",
  });

  runCase("unauthorized capability source fails closed", {
    address: A1,
    capabilityKind: "W5",
    capabilitySource: "unauthorized",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "UNKNOWN_ACCOUNT_CAPABILITY",
    blocking: true,
    reasonCode: "account_capability_blocked",
  });

  runCase("unknown account capability fails closed", {
    address: A1,
    capabilityStatus: "unknown",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "UNKNOWN_ACCOUNT_CAPABILITY",
    blocking: true,
    reasonCode: "account_capability_blocked",
  });

  runCase("ambiguous account capability fails closed", {
    address: A1,
    capabilityStatus: "ambiguous",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "AMBIGUOUS_ACCOUNT_CAPABILITY",
    blocking: true,
    reasonCode: "account_capability_blocked",
  });

  runCase("unsupported account capability fails closed", {
    address: A1,
    capabilityStatus: "unsupported",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "UNSUPPORTED_ACCOUNT_CAPABILITY",
    blocking: true,
    reasonCode: "account_capability_blocked",
  });

  runCase("blocked before Testnet capability fails closed", {
    address: A1,
    capabilityStatus: "blocked_before_testnet",
  }, {
    eligibilityLabel: "ELIGIBLE",
    capabilityLabel: "BLOCKED_BEFORE_TESTNET",
    blocking: true,
    reasonCode: "account_capability_blocked",
  });

  console.log(`${LABEL} invalidAddressRejected=true`);
  console.log(`${LABEL} duplicateTargetRejected=true`);
  console.log(`${LABEL} blocklistedTargetRejected=true`);
  console.log(`${LABEL} allowlistModeEnforced=true`);
  console.log(`${LABEL} riskLabelRecorded=true`);
  console.log(`${LABEL} unknownEligibilityFailsClosed=true`);
  console.log(`${LABEL} ambiguousEligibilityFailsClosed=true`);
  console.log(`${LABEL} accountCapabilityStaticOnly=true`);
  console.log(`${LABEL} accountCapabilityFailsClosed=true`);
  console.log(`${LABEL} liveProbing=false`);
  console.log(`${LABEL} PASS`);
}

main();
