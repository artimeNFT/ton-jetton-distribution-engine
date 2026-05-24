# Stage I-1.5 — Testnet Environment Boundary Closure Review

## Scope

Stage I-1 opens Stage I with a Testnet-only environment boundary.

I-1 is policy/static-smoke only. It defines Testnet profile validation, endpoint allowlist behavior, immutable identity constraints, and fail-closed rejection of Mainnet or execution-capable configuration.

I-1 does not perform live RPC calls, signer instantiation, private key loading, mnemonic parsing, wallet opening, seqno query, message signing, message broadcasting, Testnet dispatch, Mainnet access, or DRY_RUN=false execution.

## Locked Controls

I-1 locks deterministic validation for:

- Testnet profile presence
- endpoint allowlist enforcement
- Mainnet endpoint rejection
- unknown profile rejection
- empty endpoint rejection
- signer-disabled configuration
- broadcast-disabled configuration
- wallet-opening-disabled configuration
- secret-material sentinel field rejection without introducing new H-3 secret markers
- immutable decisionId
- immutable candidateId
- immutable stateKey
- immutable recipient address
- immutable token amount

## Caveats

I-1 uses static configuration validation only. It does not fetch live Testnet configuration, open RPC clients, instantiate signers, or perform any on-chain read/write operation.

## Gate Evidence

Closure requires:

- I-1 policy committed
- I-1 smoke PASS
- I-1 negative proof PASS
- stage-i-full PASS
- git diff --check clean
- main validation on same SHA
- GitHub Actions success on same SHA
