# Stage I-6.B — Mock-Only Boundary Evaluator Implementation Gate — Design Only

## Scope

Stage I-6.B defines the implementation gate for a possible future mock-only, fixture-free boundary evaluator.

I-6.B is design-only / gate-only.

I-6.B does not authorize implementation, scripts, tests, fixtures, fixture reads, runtime changes, `lib/**` changes, package changes, schema changes, dependency changes, compiler implementation, parser implementation, verifier implementation, Cell/TL-B construction, offline message projection, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, signed message generation, signed BOC generation, broadcast, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

Local Seqno Tracking, Local Seqno Reservation Ledger, seqno drift handling, seqno recovery, wallet sequence coordination, and operator seqno cursors are explicitly out of scope for I-6.B.

The only permitted output of I-6.B is this implementation gate document.

---

## Baseline

I-6.B starts from locked origin/main after I-6.

Current baseline:

`0af747a218462135f6b272ad5a5026e0fabf83c6`

Locked prior stage:

- I-6 — Fixture-Free Verifier Implementation Scope Planning — `0af747a`

---

## Purpose

I-6.B defines the permission gate that must be satisfied before a future mock-only, fixture-free boundary evaluator implementation may even be considered.

I-6.B does not implement the evaluator.

I-6.B does not create smoke tests.

I-6.B does not create fixtures.

I-6.B does not read fixtures.

I-6.B does not modify runtime code.

The purpose is to prevent the I-6 future implementation unit from being interpreted as immediate authorization to write code.

---

## Delta From I-6

I-6 defined the future smallest implementation unit.

I-6.B defines the gate that must approve any later attempt to implement that unit.

I-6 answered: what is the only future unit that may be considered.

I-6.B answers: what must be proven before that future unit may be opened.

I-6.B does not expand the I-6 scope.

I-6.B narrows and governs the I-6 scope.

---

## I-4 Schema Binding Gate

Any future boundary evaluator must remain bound to the locked I-4 fixture schema boundary.

A future evaluator must not expand fixture schema authority.

A future evaluator must not infer new schema fields.

A future evaluator must not mutate schema meaning.

A future evaluator must not reinterpret fixture fields outside the I-4 boundary.

A future evaluator must not accept additional fixture-derived authority without a separately scoped schema gate.

Any future schema expansion requires a separate approved schema-planning stage before evaluator implementation may proceed.

I-6.B does not authorize schema expansion.

---

## Local Seqno And Drift Exclusion

Local Seqno Tracking is explicitly out of scope for I-6.B.

Local Seqno Reservation Ledger is explicitly out of scope for I-6.B.

Seqno drift handling is explicitly out of scope for I-6.B.

Seqno recovery is explicitly out of scope for I-6.B.

Wallet sequence coordination is explicitly out of scope for I-6.B.

Operator seqno cursors are explicitly out of scope for I-6.B.

Increment-on-signature localSeqno behavior is forbidden.

A future mock-only boundary evaluator must not read seqno, model seqno, reserve seqno, update seqno, infer seqno, or coordinate operator sequence state.

Seqno-related work remains a future live/testnet execution recovery design topic and must not enter the mock-only boundary evaluator gate.

---

## Required Future Gate Preconditions

A future mock-only boundary evaluator implementation may be considered only if all of the following are true:

- I-6.B is locked on origin/main
- the future implementation scope is separately approved
- the future implementation remains mock-only
- the future implementation remains fixture-free
- no external fixture loading is introduced
- no runtime/lib capability is introduced
- no signer/provider/RPC/wallet/seqno/network capability is introduced
- no Cell/TL-B construction is introduced
- no execution-capable output is introduced
- no schema expansion occurs without a separate schema gate
- rollback and fail-closed behavior are defined before code
- negative-test coverage is defined before code

---

## Required Future Negative-Test Domains

Any future mock-only boundary evaluator implementation proposal must define negative-test coverage for all I-5.B matrix domains:

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

A missing domain blocks future implementation authorization.

The future tests must remain mock-only and fixture-free.

The future tests must not read files, load fixtures, initialize providers, open wallets, read seqno, construct Cells, construct BOCs, serialize TL-B, sign messages, or expose broadcast payloads.

---

## Required Future Evidence

Before any future mock-only boundary evaluator implementation may be opened, the future proposal must define:

- focused negative smoke requirements
- deterministic input construction requirements
- deterministic output requirements
- rejection evidence shape
- redaction requirements
- no-capability import checks
- no-fixture-read checks
- no-runtime-handle checks
- no-execution-output checks
- rollback plan
- fail-closed plan

The future rejection evidence must remain inert and non-executable.

The future rollback plan must not rely on retry, reassignment, signer re-entry, provider fallback, network fallback, seqno recovery, or message projection fallback.

---

## Corrected Validation Protocol

The validation sequence for future substages is:

1. validate the feature branch
2. verify the diff against `origin/main`
3. fast-forward local `main` only
4. validate local `main`
5. push `main`
6. verify GitHub Actions success on the same SHA

Fast-forwarding local `main` is not a remote release.

Remote release occurs only after local `main` validation and push.

---

## Explicit Non-Authorization

I-6.B does not authorize:

- implementation
- scripts
- tests
- fixtures
- fixture reads
- fixture loading
- fixture parsing
- runtime changes
- `lib/**` changes
- package changes
- schema changes
- dependency changes
- compiler implementation
- parser implementation
- verifier implementation
- boundary evaluator implementation
- runtime numeric constants
- Tact error implementation
- TypeScript enum implementation
- executable failure handler implementation

- Cell construction
- Builder construction
- Slice construction
- BOC construction
- TL-B serialization
- offline message projection
- signer import
- provider import
- RPC import
- wallet import
- TonClient import
- NetworkProvider import
- seqno read
- seqno tracking
- local seqno cursor
- network access
- signing
- signed message generation
- signed BOC generation
- broadcast
- Testnet execution
- Mainnet execution
- DRY_RUN=false
- capability exposure

I-6.B does not authorize any execution-capable artifact.

---

## Stage I Closure Boundary

I-6.B does not close Stage I.

A separate Stage I closure / release decision gate is required before any later stage may treat Stage I as complete.

The future Stage I closure gate must include:

- locked substage list
- locked commit SHA list
- confirmation that no unauthorized implementation was introduced
- confirmation that no signer/provider/RPC/wallet/seqno/network/broadcast capability was opened
- confirmation that DRY_RUN=false remains blocked
- final Stage I full smoke evidence
- final Stage H full smoke evidence
- direct I-3.G focused smoke evidence
- clean `git diff --check`
- main synchronized with origin/main
- GitHub Actions success on the same SHA
- deferred-topic register, including Local Seqno Tracking and seqno drift handling

I-6.B does not authorize Stage I closure.

---

## Gate To Close I-6.B

I-6.B may close only when:

- this document is committed
- changes are docs-only
- no implementation is introduced
- no scripts are created or modified
- no tests are created or modified
- no fixture files are created
- no fixture files are modified
- no fixture reads are introduced
- no runtime or `lib/**` change is introduced
- no package, schema, or dependency change is introduced
- no I-3.G change is introduced
- no Stage I aggregator change is introduced
- local Stage I full smoke passes
- local Stage H full smoke passes
- direct I-3.G focused smoke passes
- `git diff --check` is clean
- local `main` is validated after fast-forward
- origin/main is updated
- GitHub Actions passes on the same SHA

---

## Release Decision

I-6.B defines a mock-only boundary evaluator implementation gate only.

I-6.B does not authorize implementation.

I-6.B does not authorize scripts.

I-6.B does not authorize tests.

I-6.B does not authorize fixtures or fixture reads.

I-6.B does not authorize runtime integration, runtime numeric constants, Tact error implementation, TypeScript enum implementation, Cell/TL-B construction, offline message projection, signer/provider/RPC/wallet/seqno/network capability, Testnet execution, Mainnet execution, DRY_RUN=false, broadcast, or capability exposure.

Future implementation remains blocked until separately scoped, reviewed, negatively tested, and gated.
