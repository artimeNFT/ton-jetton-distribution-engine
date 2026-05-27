# Stage I-6 — Fixture-Free Verifier Implementation Scope Planning — Design Only

## Scope

Stage I-6 defines the future smallest implementation unit for verifier work.

I-6 is scope-planning only.

I-6 does not authorize verifier implementation, compiler implementation, parser implementation, fixture creation, fixture loading, fixture mutation, fixture parsing, reading fixtures from smoke code, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, offline message projection, Cell/TL-B construction, runtime numeric constants, Tact error implementation, TypeScript enum implementation, executable failure handlers, or capability exposure.

The only permitted output of I-6 is this future implementation scope planning document.

---

## Baseline

I-6 starts from locked origin/main after I-5.C.

Current baseline:

`42b5b8da716597758cd4016a20ce5531c4eee690`

Locked prior stage:

- I-5.C — Verification Boundary Closure / Implementation Gate Review — `42b5b8d`

---

## Purpose

I-6 defines the smallest future verifier implementation unit without authorizing implementation.

The purpose is to prevent uncontrolled scope expansion before any verifier code exists.

I-6 must keep the verifier future-work boundary fixture-free.

I-6 must not introduce fixture loading, fixture parsing, fixture validation code, compiler code, parser code, runtime adapters, or execution-capable outputs.

The future implementation unit, if later authorized, must be limited to a pure boundary evaluator shape and must remain isolated from signer, provider, wallet, network, seqno, broadcast, and runtime execution paths.

---

## Future Smallest Implementation Unit

The future smallest implementation unit may be considered only after I-6 is closed and locked.

The future unit may be scoped as a mock-only, fixture-free boundary evaluator.

The future unit must not load external fixture files.

The future unit must not parse fixture files.

The future unit must not read from `fixtures/**`.

The future unit must not depend on signer, provider, wallet, RPC, seqno, network, broadcast, Cell, Builder, Slice, BOC, or TL-B libraries.

The future unit must not create dispatch intents, unsigned intents, execution candidates, signer inputs, provider requests, wallet requests, message bodies, Cells, BOCs, TL-B bodies, or broadcast payloads.

---

## Future Boundary Evaluator Shape

The future boundary evaluator, if separately authorized later, must be pure and fixture-free.

The future evaluator may only accept in-memory, explicitly constructed mock inputs from its own future negative smoke.

The future evaluator must not read files.

The future evaluator must not access environment variables.

The future evaluator must not access process state.

The future evaluator must not access clocks, randomness, network, filesystem fixture paths, signer state, wallet state, provider state, or chain state.

The future evaluator output must be inert rejection evidence only.

The future evaluator output must not be execution-capable.

---

## Forbidden Future Imports And Capabilities

Any future implementation unit must reject these capability classes at scope review:

- signer imports
- provider imports
- RPC imports
- wallet imports
- TonClient imports
- NetworkProvider imports
- mnemonic imports
- private key imports
- Cell imports
- Builder imports
- Slice imports
- BOC construction imports
- TL-B serializer imports
- filesystem fixture loading imports
- environment secret imports
- clock-based decision imports
- randomness imports
- broadcast helpers
- deployment helpers

The future unit must remain capability-free.

---

## Required Future Negative Test Preconditions

Before any future implementation unit may be authorized, the proposal must define negative tests for all I-5.B matrix domains:

1. input purity / prototype pollution
2. amount normalization
3. address canonicalization / duplicate identity
4. metadata / TEP-64 boundary
5. Cell / TL-B / message-shape boundary
6. fee / reserve boundary
7. transaction phase boundary
8. Jetton semantic boundary
9. async / retry / reconciliation boundary
10. boundary output capability boundary

A future implementation proposal missing any domain remains blocked.

---

## Required Future Evidence And Rollback Preconditions

Before any future implementation unit may be authorized, the proposal must define:

- focused negative smoke requirements
- expected rejection evidence shape
- deterministic output requirements
- redaction requirements
- no-capability import checks
- no-fixture-read checks
- no-runtime-handle checks
- no-execution-output checks
- rollback plan
- fail-closed plan

The rollback plan must not rely on retry, reassignment, signer re-entry, provider fallback, network fallback, or message projection fallback.

The fail-closed plan must prove that rejection evidence remains non-executable.

---

## Future Implementation Non-Authorization

I-6 does not authorize:

- verifier implementation
- compiler implementation
- parser implementation
- fixture creation
- fixture loading
- fixture mutation
- fixture parsing
- fixture reading from smoke code
- fixture wiring into I-3.G
- changes to I-3.G focused smoke
- changes to Stage I full smoke
- runtime adapter work
- `lib/**` changes
- script changes
- test changes
- schema migration
- package or dependency changes

- runtime numeric constants
- Tact error implementation
- TypeScript enum implementation
- executable failure handler implementation
- signer import
- provider import
- RPC import
- wallet import
- seqno read
- network access
- signing
- signed message generation
- signed BOC generation
- broadcast
- DRY_RUN=false
- Testnet execution
- Mainnet execution
- offline message projection implementation
- Cell construction
- TL-B serialization
- capability exposure

I-6 does not authorize any execution-capable artifact.

---

## Gate To Close I-6

I-6 may close only when:

- this document is committed
- changes are docs-only
- no fixture files are created
- no fixture files are modified
- no smoke reads fixtures
- no I-3.G change is introduced
- no Stage I aggregator change is introduced
- local Stage I full smoke passes
- local Stage H full smoke passes
- direct I-3.G focused smoke passes
- `git diff --check` is clean
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Release Decision

I-6 defines fixture-free verifier implementation scope planning only.

I-6 does not authorize implementation.

I-6 does not authorize fixture loading.

I-6 does not authorize verifier implementation, compiler implementation, parser implementation, runtime integration, runtime numeric constants, Tact error implementation, TypeScript enum implementation, offline message projection, Cell/TL-B construction, signer/provider/RPC/wallet/seqno/network capability, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

Future implementation remains blocked until separately scoped, reviewed, negatively tested, and gated.
