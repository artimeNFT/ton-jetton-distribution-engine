# Stage H-3.7 — Secret Boundary Closure Review / Remaining Caveats Register

## Scope

H-3.7 is a document-only closure review for the Stage H-3 secrets and signer-boundary work.

This stage does not change production code.

This stage does not remediate secret handling.

This stage does not read .env values.

This stage does not introduce signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution.

## Baseline

Baseline: origin/main = 933a1c4 Add Stage H3 aggregator negative proof smoke.

H-3.1 through H-3.6 are locked on origin/main.

## Locked H-3 Controls

### H-3.1 — Secrets / Signer Boundary Policy

Locked policy boundaries for secret material, signed payload material, forbidden persistence surfaces, .env handling, logging, audit rows, generated artifacts, and fail-closed requirements.

### H-3.2 — Static Secret Marker Inventory / Skeleton

Locked deterministic tracked-file ingestion through `git ls-files`, file classification, marker inventory, and skeleton reporting.

### H-3.3 — Secret Marker Classification

Locked classification for all 16 `POTENTIAL_BLOCKING` findings emitted by the H-3.2 skeleton.

### H-3.4 — Classification Binding / Allowlist Contract

Locked fail-closed binding requiring every `POTENTIAL_BLOCKING` marker to exist as a heading in the H-3.3 classification document.

### H-3.5 — Wire H-3 Smoke into Stage H Full

Locked H-3 secret marker smoke into `scripts/stage-h-full-smoke.sh`.

### H-3.6 — Stage H Aggregator Negative Gate Proof

Locked negative proof that `stage-h-full-smoke.sh` fails when a required classification heading is missing and passes again after restore.

## Current Enforcement State

Current H-3 enforcement state:

- `classificationBindingMode=true`
- `secretBlockingMode=false`
- `unknownTrackedFiles=[]`
- `unknownOccurrenceFiles=[]`
- classified `POTENTIAL_BLOCKING` markers are allowed to remain
- unclassified `POTENTIAL_BLOCKING` markers fail closed
- `stage-h-full-smoke.sh` now includes H-3 secret marker smoke

Stage H now blocks unknown or unclassified secret-marker drift, but does not yet block all classified marker occurrences.

## Remaining Caveats Before Signer / Testnet

### data/operators.json::envMnemonicKey

Status: CONFIG_SECRET_CAVEAT.

The operator registry contains environment-variable key references for operator mnemonic lookup.

This is not a raw mnemonic leak based on H-3.3 key-only review.

Before signer or Testnet work, this surface must be isolated, replaced, or governed by an explicit signer-safe configuration contract.

### lib/dispatcher/walletPool.ts::mnemonic

Status: ACTIVE_SOURCE_BLOCKER_BEFORE_TESTNET.

The active wallet pool still contains mnemonic-resolution semantics.

This is acceptable only while Stage H remains dry-run/pre-live safety work.

Before signer or Testnet work, mnemonic handling must be remediated, isolated behind a signer boundary, or replaced with a non-secret operator identity contract.

### secretBlockingMode=false

Status: intentional H-3 residual caveat.

H-3 enforces classification binding, not full marker blocking.

Classified markers may remain, but unknown or unclassified markers fail closed through `stage-h-full-smoke.sh`.

A future stage must decide whether to enable full blocking, replace active mnemonic surfaces, or move signer-sensitive logic behind a separate audited boundary.

## Closure Position

H-3 may close as a secrets policy, inventory, classification, and guard-binding stage.

H-3 does not make the project signer-ready.

H-3 does not make the project Testnet-ready.

H-3 does not approve any live execution path.

The correct next-stage interpretation is:

- Stage H can continue pre-live safety work.
- Signer/Testnet work remains blocked until the remaining caveats are explicitly resolved or isolated.
- Any new secret marker must be classified before Stage H full can pass.

## Gate to Close H-3.7

H-3.7 may close only when:

- this closure review is committed
- no production code is changed
- no remediation is introduced
- no .env values are read
- no signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution is introduced
- H-3 aggregator negative proof passes
- stage-h-full-smoke passes
- stage-g-full-smoke passes
- stage-f-full-smoke passes
- stage-b-full-check passes
- GitHub Actions succeeds on the same pushed SHA
