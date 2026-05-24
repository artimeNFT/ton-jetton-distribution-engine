const LABEL = "[i-1-testnet-environment-boundary-smoke]";

type NetworkProfileName = "testnet";

interface NetworkProfile {
  readonly name: string;
  readonly endpoint: string;
  readonly allowedEndpoints: readonly string[];
  readonly dryRun: true;
  readonly broadcastAllowed: false;
  readonly signerAllowed: false;
  readonly walletOpeningAllowed: false;
  readonly decisionId?: string;
  readonly candidateId?: string;
  readonly stateKey?: string;
  readonly recipientAddress?: string;
  readonly amount?: string;
  readonly mnemonic?: string;
  readonly privateKey?: string;
  readonly secretKey?: string;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`${LABEL} ${message}`);
}

const TESTNET_ENDPOINTS = [
  "https://testnet.toncenter.com/api/v2/jsonRPC",
  "https://testnet.tonapi.io",
] as const;

const FORBIDDEN_ENDPOINTS = [
  "https://toncenter.com/api/v2/jsonRPC",
  "https://tonapi.io",
] as const;

function isApprovedTestnetEndpoint(endpoint: string): boolean {
  return TESTNET_ENDPOINTS.includes(endpoint as typeof TESTNET_ENDPOINTS[number]);
}

function isForbiddenEndpoint(endpoint: string): boolean {
  return FORBIDDEN_ENDPOINTS.includes(endpoint as typeof FORBIDDEN_ENDPOINTS[number]);
}

function validateProfile(profile: NetworkProfile): void {
  assert(profile.name === "testnet", "unknown network profile rejected");
  assert(profile.endpoint.trim() !== "", "empty endpoint rejected");
  assert(!isForbiddenEndpoint(profile.endpoint), "mainnet endpoint rejected");
  assert(isApprovedTestnetEndpoint(profile.endpoint), "endpoint not allowlisted");
  assert(profile.dryRun === true, "dryRun must remain true in I-1");
  assert(profile.broadcastAllowed === false, "broadcast must be forbidden in I-1");
  assert(profile.signerAllowed === false, "signer must be forbidden in I-1");
  assert(profile.walletOpeningAllowed === false, "wallet opening must be forbidden in I-1");

  assert(profile.mnemonic === undefined, "mnemonic field forbidden in I-1");
  assert(profile.privateKey === undefined, "privateKey field forbidden in I-1");
  assert(profile.secretKey === undefined, "secretKey field forbidden in I-1");

  assert(profile.decisionId === undefined, "decisionId mutation forbidden in I-1 profile");
  assert(profile.candidateId === undefined, "candidateId mutation forbidden in I-1 profile");
  assert(profile.stateKey === undefined, "stateKey mutation forbidden in I-1 profile");
  assert(profile.recipientAddress === undefined, "recipient mutation forbidden in I-1 profile");
  assert(profile.amount === undefined, "amount mutation forbidden in I-1 profile");
}

function expectFailure(name: string, profile: NetworkProfile): void {
  try {
    validateProfile(profile);
    throw new Error(`${LABEL} expected failure did not occur: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      !message.includes("expected failure did not occur"),
      `negative case unexpectedly passed: ${name}`
    );
  }
}

const VALID_TESTNET_PROFILE: NetworkProfile = {
  name: "testnet",
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
  allowedEndpoints: TESTNET_ENDPOINTS,
  dryRun: true,
  broadcastAllowed: false,
  signerAllowed: false,
  walletOpeningAllowed: false,
};

function main(): void {
  validateProfile(VALID_TESTNET_PROFILE);

  expectFailure("mainnet endpoint rejected", {
    ...VALID_TESTNET_PROFILE,
    endpoint: "https://toncenter.com/api/v2/jsonRPC",
  });

  expectFailure("empty endpoint rejected", {
    ...VALID_TESTNET_PROFILE,
    endpoint: "",
  });

  expectFailure("unknown profile rejected", {
    ...VALID_TESTNET_PROFILE,
    name: "mainnet",
  });

  expectFailure("signer rejected", {
    ...VALID_TESTNET_PROFILE,
    signerAllowed: true as false,
  });

  expectFailure("broadcast rejected", {
    ...VALID_TESTNET_PROFILE,
    broadcastAllowed: true as false,
  });

  expectFailure("wallet opening rejected", {
    ...VALID_TESTNET_PROFILE,
    walletOpeningAllowed: true as false,
  });

  expectFailure("mnemonic rejected", {
    ...VALID_TESTNET_PROFILE,
    mnemonic: "dummy mnemonic must not be accepted",
  });

  expectFailure("privateKey rejected", {
    ...VALID_TESTNET_PROFILE,
    privateKey: "dummy private key must not be accepted",
  });

  expectFailure("decisionId mutation rejected", {
    ...VALID_TESTNET_PROFILE,
    decisionId: "must-not-be-set",
  });

  expectFailure("stateKey mutation rejected", {
    ...VALID_TESTNET_PROFILE,
    stateKey: "must-not-be-set",
  });

  expectFailure("recipient mutation rejected", {
    ...VALID_TESTNET_PROFILE,
    recipientAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
  });

  expectFailure("amount mutation rejected", {
    ...VALID_TESTNET_PROFILE,
    amount: "1000000000",
  });

  console.log(`${LABEL} PASS`);
}

main();
