# Stage H-7.1 — Compilation, Type Safety & Wrapper Verification Policy

## Scope

Stage H-7 is pre-live dry-run safety.

H-7 verifies compilation, TypeScript type safety, generated wrappers, and static serialization surfaces.

H-7 does not authorize live execution, signing, RPC/provider access, wallet opening, broadcast, Testnet, Mainnet, or DRY_RUN=false.

## Locked Invariants

H-7 requires:

- Tact 1.6.13 compatibility
- generated wrapper usage only
- no stale wrapper imports
- no manual wrapper shadowing
- npx tsc --noEmit must pass

- build artifacts must originate from generated Tact 1.6.13 outputs
- TEP-64 metadata surface validation
- TEP-74 transfer semantic validation
- TEP-89 wallet discovery validation
- BigInt runtime-only, decimal string I/O only

## Forbidden Behavior

H-7 must not perform:

- RPC/provider access
- signer access
- wallet opening
- metadata mutation
- broadcast
- Testnet/Mainnet execution
- DRY_RUN=false
- manual wrapper generation
- stale tact_* imports
- wrappers that bypass generated build output

## Gate to Close H-7.1

H-7.1 closes only when this policy document is committed and no runtime/live behavior is added.
