# Stage H-2 — Network Boundary & Execution Guarding Closure

## Scope

Stage H-2 validates offline, deterministic execution-boundary controls before any future signer, provider, RPC, on-chain read, broadcast, Testnet, Mainnet, or DRY_RUN=false capability may be introduced.

Stage H-2 is simulation-only and does not authorize execution.

## Locked Controls

### H-2.1 — Network Boundary Guarding Smoke

Validated fail-closed controls:

- administrative halt
- boundary disabled
- dry-run required
- expected chain ID / observed chain ID mismatch
- campaign confirmation mismatch
- dry-run proof invalid
- missing required inputs
- pre-signer hard stop prevents loader invocation
- static forbidden import guard for network/signer surfaces

### H-2.2 — CI Proof and Approval Expiry Gate

Validated fail-closed controls:

- expected commit required
- CI workflow must be Stage B Full Check
- CI status must be completed
- CI conclusion must be success
- CI commit must match expected commit
- approval ID required
- approval now timestamp required
- approval expiry timestamp required
- approval timestamps must be safe integers
- expired approval fails closed

### H-2.3 — Alternate Script Bypass Scan

Validated fail-closed controls:

- npm run start is disabled during Stage H
- npm run deploy is disabled during Stage H
- npm run mint is disabled during Stage H
- package scripts must not invoke blueprint run
- package scripts must not invoke --testnet
- package scripts must not invoke deploySecureTether or deployAndMint
- stage aggregators must not reference legacy execution surfaces

## Explicit Non-Goals

Stage H-2 does not implement:

- signer
- mnemonic handling
- private-key handling
- provider client
- RPC client
- on-chain read
- broadcast
- Testnet execution
- Mainnet execution
- DRY_RUN=false execution path
- network connectivity checks
- proxy/IP/OPSEC routing logic

## Gate Status

Stage H-2 may close only after:

- stage-h-full-smoke.sh PASS
- stage-g-full-smoke.sh PASS
- stage-f-full-smoke.sh PASS
- stage-b-full-check.sh PASS
- git diff --check clean
- branch validation PASS
- main validation PASS
- push to origin/main
- GitHub Actions completed success on the same SHA
