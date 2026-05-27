# Stage I-5.B — Verification Contract Negative Matrix — Design Only

## Scope

Stage I-5.B defines the future negative rejection matrix for the I-5 compiler/verifier boundary.

I-5.B is design-only.

I-5.B does not authorize compiler implementation, parser implementation, verifier implementation, fixture creation, fixture loading, fixture mutation, fixture parsing, reading fixtures from smoke code, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, offline message projection, Cell/TL-B construction, runtime numeric constants, Tact error implementation, or capability exposure.

The only permitted output of I-5.B is this negative matrix specification document.

---

## Baseline

I-5.B starts from locked origin/main after I-5.

Current baseline:

`37a42ada8a84958fccb91ce30473bfe9894839dd`

Locked prior stage:

- I-5 — Compiler / Verifier Specification — `37a42ad`

I-5 defined the compiler/verifier specification as design-only.

I-5 did not authorize implementation, fixture loading, parsing, compilation, projection, runtime integration, signer/provider/RPC/wallet/seqno/network capability, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

---

## Purpose

I-5.B defines future verifier rejection requirements for the ten failure domains inherited from I-4.C and I-5.

Every conceptual verifier rejection must map to a stable static numeric failure code.

Numeric failure codes are specification-only in I-5.B.

I-5.B does not create runtime constants, Tact errors, TypeScript enums, schema fields, or executable failure handlers.

Human-readable failure labels are audit labels only.

Dynamic string errors must not become authoritative failure identity.

---

## Numeric Failure Invariants

Every future verifier rejection must satisfy all of the following invariants:

- every rejection has exactly one numeric code
- every numeric code is stable
- every numeric code is deterministic
- every numeric code is integer-only
- no numeric code is derived from input data
- no numeric code is dynamically generated
- no string value is authoritative failure identity
- human-readable labels are audit-only
- no dynamic string failure construction is allowed
- no user-controlled failure text is allowed

---

## Conceptual Numeric Code Range

I-5.B reserves the following conceptual numeric range for future verifier rejection outcomes:

`51000` through `51099`

This range is documentation-only in I-5.B.

No runtime constant is created.

No Tact error code is created.

No TypeScript enum is created.

No schema field is created.

No executable failure handler is created.

---

## Verification Rejection Matrix

The future verifier rejection matrix is:

- `51001` — input purity / prototype pollution boundary rejection
- `51002` — amount normalization boundary rejection
- `51003` — address canonicalization / duplicate identity boundary rejection
- `51004` — metadata / TEP-64 boundary rejection
- `51005` — Cell / TL-B / message-shape boundary rejection
- `51006` — fee / reserve boundary rejection
- `51007` — transaction phase boundary rejection
- `51008` — Jetton semantic boundary rejection
- `51009` — async / retry / reconciliation boundary rejection
- `51010` — boundary output capability rejection

---

## Matrix Requirements

Each matrix code must satisfy the following contract:

- `51001` rejects unsafe primitive shape, prototype pollution keys, runtime objects, binary payloads, or non-JSON structures.
- `51002` rejects non-decimal amount values, floating-point notation, exponent notation, negative values, unit suffixes, or native BigInt-like representations.
- `51003` rejects mixed-format address identity, duplicate address identity, wallet handles, address objects with methods, embedded derivation authority, or code-hash authority.
- `51004` rejects raw metadata cells, serialized metadata payloads, BOC metadata, Snake payloads, Merkle metadata, metadata mutation instructions, or metadata deployment instructions.
- `51005` rejects Cell, Builder, Slice, BOC, TL-B body, refs/depth/bit-budget fields, projected message bodies, state init payloads, or deployment payloads.

- `51006` rejects gas estimates, fee estimates, forward/action/storage fees, reserve policy, refund policy, send/bounce mode, operator balance, live balance, or wallet balance.
- `51007` rejects compute/action/bounce/storage/credit phase predictions, transaction success/failure predictions, simulator results, pre-execution results, indexer results, wallet scanner results, or chain observation results.
- `51008` rejects Jetton wallet derivation authority, code-hash authority, transfer body projection, notification/excess body projection, query_id routing authority, query_id replay authority, wallet state, balance authority, or ownership proof.
- `51009` rejects retry instruction, reentry instruction, operator reassignment instruction, recovery mutation, bounce tracking instruction, absence tracking instruction, pending submission state, uncertain submission state, chain confirmation state, wallet seqno state, dispatch retry state, or reconciliation override.
- `51010` rejects dispatch intent, unsigned intent, execution candidate, signer input, provider request, wallet request, broadcast payload, signed message, signed BOC, private key material, mnemonic material, runtime handle, or executor handle.

A matrix code must never produce execution-capable output.

---

## Failure Path

Every matrix rejection must map to the same terminal failure path:

`I5B_NEGATIVE_MATRIX_REJECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

The numeric code identifies the rejection domain.

The numeric code does not authorize recovery, retry, reassignment, projection, signing, provider access, wallet access, or broadcast.

---

## Forbidden Failure Behavior

Future verifier rejection behavior must not include:

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
- dynamic string error construction
- unbounded error payload creation
- user-controlled failure text

---

## Explicit Non-Authorization

I-5.B does not authorize:

- fixture creation
- fixture loading
- fixture mutation
- fixture parsing
- fixture reading from smoke code
- fixture wiring into I-3.G
- compiler implementation
- parser implementation
- verifier implementation
- runtime numeric constants
- Tact error implementation
- TypeScript enum implementation
- schema field implementation
- executable failure handler implementation
- runtime adapter work
- `lib/**` changes
- script changes
- test changes
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

I-5.B does not authorize any execution-capable artifact.

Numeric failure codes in I-5.B are specification-only and must not be treated as implemented runtime constants.

---

## Gate To Close I-5.B

I-5.B may close only when:

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

I-5.B defines a verification contract negative matrix only.

I-5.B does not authorize implementation.

I-5.B does not authorize fixture loading.

I-5.B does not authorize runtime numeric constants, Tact error implementation, TypeScript enum implementation, parsing, compilation, projection, runtime integration, signer/provider/RPC/wallet/seqno/network capability, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

Future implementation remains blocked until separately scoped, reviewed, negatively tested, and gated.
