# Stage H-4.5 — Recipient Eligibility Closure Review / Caveats Register

## Scope

H-4.5 is a document-only closure review for Stage H-4 recipient eligibility and account capability policy work.

This stage does not change production code.

This stage does not introduce runtime recipient eligibility implementation.

This stage does not introduce target parsing, allowlist loading, blocklist loading, account discovery, signer integration, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution.

## Baseline

Baseline: origin/main = 11e328a Add Stage H4 recipient eligibility negative proof.

H-4.1 through H-4.4 are locked on origin/main.

## Locked H-4 Controls

### H-4.1 — Account Capability & Recipient Eligibility Policy

Locked the H-4 policy boundary: deterministic, input-bound recipient eligibility and static account capability classification.

### H-4.2 — Recipient Eligibility Policy Smoke

Locked a dry-run smoke proving invalid address rejection, duplicate rejection, blocklist rejection, allowlist enforcement, risk label recording, unknown and ambiguous eligibility fail-closed behavior, static W5/v4R2 handling, and capability fail-closed behavior.

### H-4.3 — Stage H Full Wiring

Locked H-4.2 into `scripts/stage-h-full-smoke.sh`.

### H-4.4 — Aggregator Negative Proof

Locked proof that `stage-h-full-smoke.sh` fails when H-4.2 is broken and passes again after restore.

## Current Enforcement State

Current H-4 enforcement state:

- H-4 policy is documented.
- H-4 recipient eligibility smoke exists.
- H-4 smoke is wired into `stage-h-full-smoke.sh`.
- H-4 aggregator negative proof exists.
- Invalid address, duplicate target, blocklisted target, allowlist miss, unknown eligibility, and ambiguous eligibility fail closed in smoke.
- Risk labels are recorded when present.
- W5/v4R2 capability labels are accepted only from authorized static input in smoke.
- Unknown, ambiguous, unsupported, unauthorized, or Testnet-blocked account capability fails closed in smoke.
- `stage-h-full-smoke.sh` fails if the H-4.2 smoke is intentionally broken.

## Remaining Caveats Before Runtime / Signer / Testnet

### Runtime Eligibility Implementation

Status: NOT_IMPLEMENTED.

H-4 defines and validates policy behavior through dry-run smoke only.

A future stage must implement runtime recipient eligibility only after defining deterministic input loading, evidence emission, and fail-closed integration boundaries.

### Allowlist / Blocklist Loader

Status: NOT_IMPLEMENTED.

H-4 does not introduce allowlist or blocklist file loading.

A future implementation must prove deterministic parsing, duplicate handling, malformed input rejection, and audit-visible source references.

### Real Account Capability Classification

Status: NOT_IMPLEMENTED.

H-4 does not perform real W5/v4R2 discovery.

Any future account capability classifier must remain authorized-input-bound unless a later stage explicitly opens a safe network design gate.

### Signer / Testnet Readiness

Status: BLOCKED.

H-4 does not make the project signer-ready.

H-4 does not make the project Testnet-ready.

## Closure Position

H-4 may close as a recipient eligibility and static account capability policy stage.

H-4 locks policy, smoke validation, Stage H full wiring, and aggregator negative proof.

H-4 does not approve runtime eligibility enforcement.

H-4 does not approve live account discovery.

H-4 does not approve signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution.

The correct next-stage interpretation is:

- Stage H can continue pre-live safety work.
- Runtime eligibility implementation remains blocked until explicitly scoped.
- Signer and Testnet work remain blocked until all prior safety gates are closed.

## Gate to Close H-4.5

H-4.5 may close only when:

- this closure review is committed
- no production code is changed
- no runtime eligibility implementation is introduced
- no target parser, allowlist loader, or blocklist loader is introduced
- no account discovery, signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution is introduced
- H-4 negative proof passes
- stage-h-full-smoke passes
- stage-g-full-smoke passes
- stage-f-full-smoke passes
- stage-b-full-check passes
- GitHub Actions succeeds on the same pushed SHA
