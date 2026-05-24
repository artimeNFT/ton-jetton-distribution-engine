# Stage I-1 — Testnet Environment Boundary & Barrier Policy

## Scope

Stage I-1 opens Stage I as a Testnet-only environment boundary.

I-1 defines logical network profiles, endpoint allowlist rules, immutable identity constraints, and fail-closed rejection of Mainnet or unknown network configuration.

I-1 does not perform live RPC calls, signer instantiation, private key loading, mnemonic parsing, wallet opening, seqno query, message signing, message broadcasting, Testnet dispatch, Mainnet access, or DRY_RUN=false execution.

## Immutable Identity Invariant

Network profile selection, Testnet configuration, on-chain observation, RPC metadata, gas policy, or endpoint mapping must not mutate:

- decisionId
- candidateId
- stateKey
- recipient address
- token amount

## Allowed I-1 Inputs

I-1 may define static, non-secret configuration objects for:

- network profile name
- endpoint string
- endpoint allowlist
- dry-run mode
- broadcast permission flag fixed to false
- signer permission flag fixed to false

## Required Fail-Closed Cases

I-1 must fail closed on:

- Mainnet endpoint
- empty endpoint
- unknown network profile
- missing Testnet profile
- signer permission enabled
- mnemonic/privateKey/secretKey fields present
- wallet opening enabled
- broadcast enabled
- mutation of decisionId
- mutation of candidateId
- mutation of stateKey
- mutation of recipient address
- mutation of token amount

## Gate to Close I-1

I-1 closes only when policy exists, fail-closed smoke passes, and no execution-capable behavior is introduced.
