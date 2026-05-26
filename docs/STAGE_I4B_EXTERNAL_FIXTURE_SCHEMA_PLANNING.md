# Stage I-4.B — External Fixture Schema Planning — Design Only

## Scope

Stage I-4.B defines the future schema boundary for external fixtures.

I-4.B is design-only.

This document does not authorize fixture implementation, fixture loading, fixture mutation, reading fixtures from smoke code, wiring fixtures into I-3.G, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

The only permitted output of I-4.B is this schema planning document.

---

## Baseline

I-4.B starts from locked origin/main after I-4.

Current baseline:

`89904a3aa8a05c0552357f74bd3269e9350c4bf9`

Locked prior stage:

- I-4 — External Fixture Boundary Planning — `89904a3`

I-4 allowed fixture boundary planning only.

I-4 did not authorize fixture implementation, fixture loading, fixture mutation, or fixture use inside any smoke.

---

## General Schema Purpose

External fixtures must be inert, static, plain JSON data only.

Fixtures are not:

- Unsigned Intent DTOs
- execution proofs
- transaction execution projections
- runtime configuration states
- authoritative ledger metrics
- serialized cell structures
- serialized message structures
- signer inputs
- provider requests
- broadcast payloads

Fixtures may represent future test data snapshots before validation.

Fixtures must not become execution-capable artifacts.

---

## Zero-Trust Input Purity Gate

### [INVARIANT-1] Input Purity Boundaries

Allowed JSON value classes:

- string
- boolean
- integer-safe number, only where explicitly allowed
- null, only where explicitly allowed
- array, only where explicitly schema-bounded
- object, only where explicitly schema-bounded
- decimal-safe numeric string, only for amount-like fields

Forbidden structures:

- class instance
- closure
- function
- Date object
- Map
- Set
- Buffer
- Uint8Array
- ArrayBuffer
- BigInt literal
- binary payload
- Cell
- Builder
- Slice
- BOC
- mutable runtime reference

Prototype pollution protection:

Structural verification must reject any object key named:

- `__proto__`
- `constructor`
- `prototype`

Required outcome:

`FIXTURE_PROTOTYPE_POLLUTION_KEY`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Amount Normalization Gate

### [INVARIANT-2] Amount Normalization Constraints

Fixture amount fields must be strict decimal strings only.

Prohibited amount forms:

- floating-point notation
- exponent notation
- comma separators
- underscore separators
- leading plus signs
- negative values
- negative zero
- hexadecimal notation
- binary notation
- octal notation
- implicit unit suffixes
- empty string
- whitespace-padded string

Future validators may parse decimal strings into normalized smallest-unit bigint values after schema validation.

The static fixture must not hold, define, serialize, or emulate native BigInt values.

Runtime BigInt conversion remains future validation behavior only.

Fixture amount text is not authoritative execution state.

Required outcome:

`AMOUNT_NOT_DECIMAL_STRING`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Address Canonicalization Gate

### [INVARIANT-3] Address Canonicalization Constraints

Fixture address fields must be plain strings only.

Fixture address strings are inert input candidates only.

Fixture address strings do not hold authority over canonical address identity.

Future validation may derive a canonical address identity candidate such as:

`<workchain>:<rawHashHex32>`

where `rawHashHex32` is the lowercase 32-byte account hash.

I-4.B does not authorize changing existing stateKey, idempotency key, recipient identity, or RunState identity rules.

User-friendly base64 address strings may be accepted only as inert input candidates for future canonicalization.

User-friendly display flags, bounceable flags, testnet flags, and formatting differences must not create duplicate recipient identity.

Forbidden address-like structures:

- wallet handle
- signer handle
- provider handle
- address object with methods
- mixed-format equivalence assertion
- embedded wallet derivation proof
- embedded code hash authority
- seqno-bearing wallet state

Required outcome:

`FIXTURE_ADDRESS_CANONICALIZATION_REQUIRED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Metadata / TEP-64 Boundary Gate

### [INVARIANT-4] Metadata Boundary Constraints

Fixture metadata-like fields are inert schema inputs only.

Fixtures must not contain or define:

- raw TEP-64 cells
- serialized metadata cells
- BOC metadata payloads
- Snake cell payloads
- Merkle metadata structures
- dynamic metadata serialization
- metadata mutation instructions
- metadata rollback instructions
- metadata deployment instructions
- indexer parsing assumptions as execution rules

URI-like fields, if allowed in a future schema, must be plain bounded strings only.

Hash-like fields, if allowed in a future schema, must be plain bounded lowercase hex strings only.

Fixture metadata fields must not become authoritative token metadata.

Metadata finality and mutation policy remain governed by prior Stage H metadata governance controls.

Required outcome:

`FIXTURE_METADATA_BOUNDARY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Cell / TL-B / Message-Shape Boundary Gate

### [INVARIANT-5] Cell And Message-Shape Boundary Constraints

Fixtures must not contain raw or projected TON cell material.

Fixtures must not contain or define:

- Cell
- Builder
- Slice
- BOC
- base64 BOC
- hex BOC
- TL-B body
- projected Jetton transfer body
- projected internal message body
- projected external message body

- refs
- bit-length budget
- cell depth budget
- message mode
- send mode
- bounce mode
- state init payload
- deployment payload

Any future message-shape projection belongs to a later separately scoped design stage.

I-4.B does not authorize offline message projection, TL-B serialization, cell construction, or compiler behavior.

Required outcome:

`FIXTURE_EXECUTION_PROJECTION_REJECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Fee / Reserve Boundary Gate

### [INVARIANT-6] Fee And Reserve Boundary Constraints

Fixtures must not contain authoritative fee, gas, reserve, or value-flow data.

Fixtures must not contain or define:

- gas estimate
- live gas estimate
- fee estimate
- forward fee
- action fee
- storage fee
- storage reserve
- storage delta
- deployment cost class
- init deployment cost
- reserve policy
- refund policy

- send mode
- bounce mode
- value flow instruction
- remaining value instruction
- operator balance
- live balance
- wallet balance

Fee and reserve envelope modeling belongs to a later separately scoped design stage.

I-4.B does not authorize gas estimation, fee modeling, reserve modeling, wallet balance lookup, or value-flow behavior.

Required outcome:

`FIXTURE_FEE_RESERVE_BOUNDARY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Transaction Phase Boundary Gate

### [INVARIANT-7] Transaction Phase Boundary Constraints

Fixtures must not contain authoritative transaction-phase expectations.

Fixtures must not contain or define:

- compute phase outcome
- action phase outcome
- bounce phase outcome
- storage phase outcome
- credit phase outcome
- transaction success prediction
- transaction failure prediction
- simulator result
- pre-execution result
- wallet scanner result
- indexer result
- chain observation result

Fixture data must not be used to predict or enforce TVM transaction-phase behavior.

Transaction phase modeling belongs to a later separately scoped design stage.

I-4.B does not authorize simulator integration, pre-execution integration, wallet scanner integration, indexer integration, or chain-state observation.

Required outcome:

`FIXTURE_TRANSACTION_PHASE_BOUNDARY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Jetton Semantic Boundary Gate

### [INVARIANT-8] Jetton Semantic Boundary Constraints

Fixtures must not contain authoritative Jetton execution semantics.

Fixtures must not contain or define:

- Jetton wallet derivation authority
- Jetton wallet code hash authority
- Jetton master code hash authority
- transfer body projection
- transfer notification body projection
- excess body projection
- query_id routing authority
- query_id replay authority
- wallet deployment authority
- wallet state authority
- balance authority
- ownership proof

Jetton semantic validation belongs to a later separately scoped design stage.

I-4.B does not authorize Jetton wallet derivation, code-hash verification, message construction, query_id routing, or balance validation.

Required outcome:

`FIXTURE_JETTON_SEMANTIC_BOUNDARY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Async / Retry / Reconciliation Boundary Gate

### [INVARIANT-9] Async And Reconciliation Boundary Constraints

Fixtures must not contain authoritative async, retry, bounce, or reconciliation instructions.

Fixtures must not contain or define:

- retry instruction
- reentry instruction
- operator reassignment instruction
- recovery mutation
- bounce tracking instruction
- absence tracking instruction
- pending submission state
- uncertain submission state
- chain confirmation state
- wallet seqno state
- dispatch retry state
- reconciliation override

Async, retry, and reconciliation behavior belongs to existing/future state-machine validation stages, not fixture schema.

I-4.B does not authorize retry, reentry, operator reassignment, bounce tracking, absence tracking, recovery mutation, or chain confirmation logic.

Required outcome:

`FIXTURE_ASYNC_RECONCILIATION_BOUNDARY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Boundary Output Gate

### [INVARIANT-10] Boundary Output Constraints

Future fixture validation output may only be an inert proof artifact.

Fixture validation output must not contain or create:

- dispatch intent
- unsigned intent
- execution candidate
- signer input
- provider request
- wallet request
- broadcast payload
- signed message
- signed BOC
- private key material
- mnemonic material
- runtime handle
- executor handle

Boundary output must remain evidence-only.

Boundary output must not be accepted by any dispatcher, signer, provider, wallet, broadcaster, or runtime adapter as executable input.

I-4.B does not authorize proof-artifact implementation.

Required outcome:

`FIXTURE_BOUNDARY_OUTPUT_CAPABILITY_VIOLATION`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Consolidated Fail-Closed Outcomes

Any unsafe fixture schema condition must fail closed before fixture use is possible.

Required failure mappings:

- `FIXTURE_UNSAFE_FIELD`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_PROTOTYPE_POLLUTION_KEY`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_SEMANTIC_COLLAPSE_RISK`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `AMOUNT_NOT_DECIMAL_STRING`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_ADDRESS_CANONICALIZATION_REQUIRED`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_EXECUTION_PROJECTION_REJECTED`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_METADATA_BOUNDARY_VIOLATION`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_FEE_RESERVE_BOUNDARY_VIOLATION`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_TRANSACTION_PHASE_BOUNDARY_VIOLATION`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

- `FIXTURE_BOUNDARY_OUTPUT_CAPABILITY_VIOLATION`
  → `SECURITY_TERMINAL`
  → `TERMINAL_FAIL_CLOSED`

---

## Explicit Non-Authorization

I-4.B does not authorize:

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

I-4.B does not authorize any execution-capable artifact.

---

## Gate To Close I-4.B

I-4.B may close only when:

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

I-4.B defines external fixture schema planning only.

I-4.B does not authorize fixture implementation.

I-4.B does not authorize fixture loading.

I-4.B does not authorize any runtime, signer, provider, RPC, wallet, seqno, network, broadcast, Testnet, Mainnet, or DRY_RUN=false capability.

I-5 remains blocked until separately scoped, reviewed, negatively tested, and gated.
