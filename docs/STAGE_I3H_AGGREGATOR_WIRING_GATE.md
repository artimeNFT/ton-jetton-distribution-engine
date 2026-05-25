# Stage I-3.H — Aggregator Wiring Gate / Focused Smoke Promotion Review — Design Only

## Scope

Stage I-3.H defines the gate for any future promotion of the I-3.G focused smoke into the Stage I full aggregator.

I-3.H is Design-Only / Gate-Only.

This document does not authorize code changes, script changes, aggregator wiring, runtime adapter work, signer integration, signer import, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, or DRY_RUN=false.

The only permitted output of I-3.H is this gate document.

---

## Baseline

I-3.H starts from locked origin/main after I-3.G.

Current baseline:

`c173eb54e7c37f13521be2f9c950a3f424b648f0`

Locked prior package:

- I-3.F — Mock-Only Boundary Evaluator Implementation Gate — `026993f`
- I-3.G — Mock-Only Boundary Evaluator Smoke Construction — `c173eb5`

I-3.G added one focused smoke only:

`scripts/i-3-g-mock-only-boundary-evaluator-smoke.ts`

I-3.G did not modify:

- `scripts/stage-i-full-smoke.sh`
- `scripts/stage-h-full-smoke.sh`
- `lib/**`
- runtime code
- schema files
- package/dependency files

---

## Purpose

The purpose of I-3.H is to define when a future substage may wire the I-3.G focused smoke into the Stage I full aggregator.

This stage does not perform the wiring.

Future wiring target, if separately approved later:

`scripts/stage-i-full-smoke.sh`

Focused smoke target:

`scripts/i-3-g-mock-only-boundary-evaluator-smoke.ts`

---

## Promotion Principle

Aggregator promotion is allowed only after the focused smoke is already:

- reviewed
- committed
- merged to main
- pushed to origin/main
- validated locally
- validated by same-SHA GitHub Actions success

This was achieved by I-3.G.

I-3.H itself still does not authorize the physical aggregator change.

A separate implementation substage must explicitly approve the one-line aggregator wiring.

---

## Future Wiring Preconditions

A future aggregator-wiring substage may be considered only if all of the following are true:

- current branch starts from clean `origin/main`
- I-3.G focused smoke exists at the approved path
- focused I-3.G smoke passes directly with existing `ts-node` runner
- Stage I full smoke passes before wiring
- Stage H full smoke passes before wiring
- `git diff --check` is clean before wiring
- no untracked `Zone.Identifier` files exist
- proposed diff touches only `scripts/stage-i-full-smoke.sh`
- no package/dependency changes are introduced
- no runtime/lib/schema/testnet/mainnet files are touched
- no signer/provider/RPC/wallet/seqno/network imports are introduced
- no DRY_RUN=false path is introduced
- no capability exposure is introduced

---

## Required Future Aggregator Shape

If separately approved later, the future change to `scripts/stage-i-full-smoke.sh` must be minimal.

Expected future insertion shape:

    echo "[stage-i-full] I-3.G Mock-only boundary evaluator smoke"
    npx ts-node scripts/i-3-g-mock-only-boundary-evaluator-smoke.ts

The future wiring must not inline evaluator logic into the aggregator.

The future wiring must not:

- add new shell functions
- add environment flags
- add network checks
- add provider/RPC checks
- add signer checks
- add wallet checks
- add seqno checks
- add conditional execution based on DRY_RUN=false
- alter existing I-1 or I-2.4 smoke behavior
- bypass TypeScript check

---

## Required Future Validation After Wiring

A future wiring substage must prove all of the following after the change:

- `./scripts/stage-i-full-smoke.sh` passes
- `./scripts/stage-h-full-smoke.sh` passes
- direct focused smoke still passes:
  `npx ts-node scripts/i-3-g-mock-only-boundary-evaluator-smoke.ts`
- `git diff --check` is clean
- diff is limited to `scripts/stage-i-full-smoke.sh`
- GitHub Actions passes on the same SHA after merge to main

The Stage I full smoke output must include:

- TypeScript check
- I-1 Testnet environment boundary smoke
- I-2.4 Boundary behavioral smoke
- I-3.G Mock-only boundary evaluator smoke
- final `[stage-i-full] PASS`

---

## No Capability Exposure Rule

Future aggregator wiring must remain smoke orchestration only.

It must not introduce:

- signer capability
- provider capability
- RPC capability
- wallet capability
- seqno read
- chain-state read
- network access
- live gas estimate
- live fee estimate
- secret loading
- private key handling
- mnemonic handling
- signing
- signed BOC generation
- broadcast
- Testnet execution
- Mainnet execution
- DRY_RUN=false

Any proposed wiring that introduces or enables one of these must be rejected.

Required rejection outcome:

`AGGREGATOR_WIRING_CAPABILITY_EXPOSURE`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Forbidden Changes In I-3.H

I-3.H does not authorize:

- editing `scripts/stage-i-full-smoke.sh`
- editing `scripts/stage-h-full-smoke.sh`
- adding scripts
- changing I-3.G focused smoke
- changing runtime code
- changing `lib/**`

- changing tests
- changing schema
- changing package/dependency files
- aggregator wiring
- signer import
- provider import
- RPC import
- wallet import
- seqno read
- TonClient
- NetworkProvider
- wallet opening
- private key handling
- mnemonic handling
- seed handling

- signing
- signed message generation
- signed BOC generation
- broadcast
- DRY_RUN=false
- Testnet execution
- Mainnet execution
- network access
- capability exposure

---

## Gate To Close I-3.H

I-3.H may close only when:

- this document is committed
- changes are docs-only
- local Stage I full smoke passes
- local Stage H full smoke passes
- focused I-3.G smoke passes directly
- `git diff --check` is clean
- main fast-forward validation passes
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Release Decision

I-3.H may define the future aggregator-wiring gate.

I-3.H does not authorize aggregator wiring.

I-3.H does not authorize implementation.

I-3.H does not authorize tests or scripts.

I-3.H does not authorize runtime adapter work.

I-3.H does not authorize capability exposure.

A future substage must separately approve the actual `scripts/stage-i-full-smoke.sh` wiring before any shell script is changed.
