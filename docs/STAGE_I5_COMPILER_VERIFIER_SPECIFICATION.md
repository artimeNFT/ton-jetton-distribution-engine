# Stage I-5 — Compiler / Verifier Specification — Design Only

## Scope

Stage I-5 defines the future conceptual compiler/verifier boundary for inert fixture data.

I-5 is design-only.

In I-5, the term compiler means a future conceptual verification boundary only.

I-5 does not authorize compiler implementation, parser implementation, verifier implementation, fixture creation, fixture loading, fixture mutation, reading fixtures from smoke code, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, offline message projection, Cell/TL-B construction, or capability exposure.

The only permitted output of I-5 is this specification document.

---

## Baseline

I-5 starts from locked origin/main after I-4.C.

Current baseline:

`d9e50d227c6909109f45010246393e098312a05b`

Locked prior stage:

- I-4.C — Fixture Schema Closure / Implementation Gate Review — `d9e50d2`

I-4.C closed the fixture boundary and schema planning package for planning purposes only.

I-4.C did not authorize fixture implementation, fixture loading, runtime integration, I-5 compiler implementation, offline message projection, or capability exposure.

---

## Purpose

I-5 defines the future conceptual boundary for validating inert JSON fixture data into execution-incapable verification records.

The future verifier must remain evidence-only.

The future verifier must not create:

- dispatch intent
- unsigned intent
- execution candidate
- signer input
- provider request
- wallet request
- message body
- Cell
- BOC
- TL-B body
- broadcast payload

I-5 does not authorize parsing, compilation, projection, runtime integration, or execution behavior.

---

## Threat Model

The future verifier must defend against:

- prototype pollution
- amount semantic drift
- address duplication
- address mutation
- metadata / TEP-64 ambiguity
- Cell injection
- TL-B injection
- message-shape injection
- fee / reserve authority leakage
- compute phase prediction drift
- action phase prediction drift
- bounce phase prediction drift
- Jetton semantic authority leakage
- retry mutation
- reconciliation mutation
- boundary output capability creep

Every threat must fail closed before any execution-capable artifact can exist.

---

## Input Boundary

The future verifier may only receive inert JSON fixture data after a future implementation stage explicitly authorizes fixture loading.

I-5 does not authorize fixture loading.

I-5 does not authorize fixture parsing.

I-5 does not authorize fixture file creation.

Input must remain conceptually limited to:

- plain JSON data
- deterministic values
- primitive-only structures
- schema-bounded arrays
- schema-bounded objects
- decimal-string amount fields
- inert address-string candidates

Input must not include:

- Cell
- Builder
- Slice
- BOC
- TL-B body
- runtime object
- function
- class instance
- signer material
- provider material
- wallet handle
- network endpoint
- execution state

---

## Verification Boundary

The future verifier may evaluate fixture data only as inert evidence input.

The future verifier must not create execution-capable records.

The future verifier must not create or expose:

- runtime handle
- signer handle
- provider handle
- wallet handle
- broadcaster handle
- dispatcher handle
- network client
- RPC client
- seqno reader
- Cell builder
- TL-B serializer
- message projector

---

## Output Boundary

Allowed future output is limited to an inert verification proof artifact.

The output must be evidence-only.

The output must not be accepted as executable input by any dispatcher, signer, provider, wallet, broadcaster, runtime adapter, or recovery path.

Forbidden output classes:

- dispatch intent
- unsigned intent
- execution candidate
- signer input
- provider request
- wallet request
- broadcast payload
- signed message
- signed BOC
- Cell
- BOC
- TL-B body
- message body
- state init payload
- deployment payload

---

## Future Negative-Test Enforcement Model

Any future implementation proposal must define negative tests before code.

The future test matrix must cover all domains inherited from I-4.C:

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

A missing negative-test domain blocks implementation authorization.

---

## Failure Model

Every verification boundary violation must fail closed.

Required failure path:

`I5_VERIFICATION_BOUNDARY_REJECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

The future verifier must not attempt:

- repair
- retry
- reentry
- operator reassignment
- signer re-entry
- new intent creation
- message projection fallback
- provider fallback
- network fallback
- metadata mutation fallback

A rejected verification path must remain non-executable.

---

## Explicit Non-Authorization

I-5 does not authorize:

- fixture creation
- fixture loading
- fixture mutation
- fixture parsing
- fixture reading from smoke code
- fixture wiring into I-3.G
- compiler implementation
- parser implementation
- verifier implementation
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
- offline message projection implementation
- Cell construction
- TL-B serialization
- capability exposure

I-5 does not authorize any execution-capable artifact.

---

## Gate To Close I-5

I-5 may close only when:

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

I-5 defines a compiler/verifier specification only.

I-5 does not authorize implementation.

I-5 does not authorize fixture loading.

I-5 does not authorize parsing, compilation, projection, runtime integration, signer/provider/RPC/wallet/seqno/network capability, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

Future implementation remains blocked until separately scoped, reviewed, negatively tested, and gated.
