# Stage H-6.1 — Metadata Mutation Rollback Protocol Policy

## Scope

Stage H-6 is pre-live dry-run safety.

H-6 defines a design/simulation-only rollback protocol for metadata mutation recovery.

H-6 does not authorize runtime rollback or live metadata mutation.

## Control Plane Invariant

Rollback validation must be static, deterministic and audit-visible.

Rollback must bind rollbackIntentId to the original approved contentHash.

Rollback must not depend on network state, wall-clock state, provider behavior, or mutable runtime metadata.

## Required Rollback Evidence

Rollback intent must include:

- rollbackIntentId
- originalContentHash
- rollbackTargetHash
- lineageReferenceId
- administrativeApprovalId
- rollbackReasonCode
- evidenceReferenceId

## Forbidden Behavior

H-6 must not perform:

- RPC/provider access
- URI fetch or gateway lookup
- signer access
- wallet opening
- metadata mutation
- broadcast
- Testnet/Mainnet execution
- DRY_RUN=false

## Risks

H-6 must control:

- rollback to unapproved metadata
- rollback without administrative approval
- rollback to non-original contentHash
- broken rollback lineage
- silent metadata switching
- hidden fallback rollback
- runtime mutation disguised as rollback

## Required Smoke

Future H-6 smoke must prove:

- missing rollback intent fails closed
- rollback hash mismatch fails closed
- rollback lineage mismatch fails closed
- missing administrative approval fails closed
- hidden fallback rollback fails closed
- valid static rollback intent passes

## Gate to Close H-6.1

H-6.1 closes only when the policy document is committed and no runtime/live rollback behavior is added.
