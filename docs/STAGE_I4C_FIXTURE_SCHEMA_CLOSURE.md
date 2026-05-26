# Stage I-4.C — Fixture Schema Closure / Implementation Gate Review — Design Only

## Scope

Stage I-4.C closes the I-4 fixture boundary and schema planning package.

I-4.C is review-only / closure-only / gate-only.

This document does not authorize fixture implementation, fixture loading, fixture mutation, reading fixtures from smoke code, wiring fixtures into I-3.G, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, I-5 compiler implementation, offline message projection, or capability exposure.

The only permitted output of I-4.C is this closure and future implementation gate document.

---

## Baseline

I-4.C starts from locked origin/main after I-4.B.

Current baseline:

`3e6fe37d7d41ea8ea5890b388a36b30e38d0487a`

Locked prior stages:

- I-4 — External Fixture Boundary Planning — `89904a3`
- I-4.B — External Fixture Schema Planning — `3e6fe37`

---

## Closure Summary

I-4 defined the external fixture boundary planning rules.

I-4.B defined the external fixture schema planning rules and locked ten defensive schema gates:

- Input Purity Gate
- Amount Normalization Gate
- Address Canonicalization Gate
- Metadata / TEP-64 Boundary Gate
- Cell / TL-B / Message-Shape Boundary Gate
- Fee / Reserve Boundary Gate
- Transaction Phase Boundary Gate
- Jetton Semantic Boundary Gate
- Async / Retry / Reconciliation Boundary Gate
- Boundary Output Gate

No actual fixture implementation exists.

No fixture loading is authorized.

No fixture is read by any smoke.

No runtime or execution-capable artifact was introduced.

---

## Future Implementation Gate Preconditions

Future fixture implementation may be considered only if all of the following are true:

- I-4, I-4.B, and I-4.C are locked on origin/main
- Stage I full smoke passes
- Stage H full smoke passes
- direct I-3.G focused smoke passes
- same-SHA GitHub Actions success exists
- implementation scope is separately approved
- negative test matrix is defined before code
- review confirms no capability exposure
- rollback / fail-closed plan is defined before code

---

## Required Future Negative Test Domains

Any future fixture implementation proposal must define negative tests before implementation.

Required negative test domains:

1. Input purity / prototype pollution
2. Amount normalization
3. Address canonicalization / duplicate identity
4. Metadata / TEP-64 boundary
5. Cell / TL-B / message-shape boundary
6. Fee / reserve boundary
7. Transaction phase boundary
8. Jetton semantic boundary
9. Async / retry / reconciliation boundary
10. Boundary output capability boundary

A missing negative test domain blocks implementation authorization.

---

## TVM / Cell Boundary Gate Criteria

Future implementation tests must reject:

- raw Cell
- raw Builder
- raw Slice
- raw BOC
- base64 BOC
- hex BOC
- TL-B body
- refs field
- cell depth field
- bit budget field
- projected transfer body
- projected internal message body
- projected external message body
- state init payload
- deployment payload

Any accepted fixture implementation must prove that fixture data cannot become cell material or message material.

---

## Compute / Action Phase Drift Gate Criteria

Future implementation tests must reject fixture fields that claim authoritative transaction-phase behavior.

Future tests must reject:

- compute phase prediction
- action phase prediction
- bounce phase prediction
- storage phase prediction
- credit phase prediction
- transaction success prediction
- transaction failure prediction
- simulator result
- pre-execution result
- indexer result
- wallet scanner result
- chain observation result

Fixture data must not be used to predict, enforce, or repair TVM phase behavior.

---

## Address Duplication Gate Criteria

Future implementation tests must reject fixture fields that can create duplicate recipient identity.

Future tests must reject:

- mixed-format identity assertion
- user-friendly/raw address equivalence assertion
- duplicate address identity under different display formats
- bounceable/non-bounceable duplicate identity
- testnet/mainnet flag identity confusion
- wallet handle address form
- address object with methods
- embedded derivation authority
- embedded code-hash authority
- seqno-bearing wallet identity

Future fixture implementation must not change existing stateKey, idempotency key, recipient identity, or RunState identity rules.

---

## Future Implementation Non-Authorization

I-4.C does not authorize:

- fixture creation
- fixture loading
- fixture mutation
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
- I-5 compiler implementation
- offline message projection implementation
- capability exposure

I-4.C does not authorize any execution-capable artifact.

---

## Gate To Close I-4.C

I-4.C may close only when:

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

I-4 fixture planning package is closed for planning purposes only.

Future fixture implementation remains blocked until separately scoped, reviewed, negatively tested, and gated.

I-4.C does not authorize fixture implementation, fixture loading, runtime integration, I-5 compiler implementation, offline message projection, or capability exposure.
