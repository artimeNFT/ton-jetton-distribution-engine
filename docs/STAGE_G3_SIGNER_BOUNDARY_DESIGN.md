# Stage G-3 — Signer Boundary Design — Design Only

## Scope

G-3 defines the future signer boundary for later Testnet/Mainnet stages.

This stage is design-only.

G-3 does not implement signing.
G-3 does not call a signer.
G-3 does not read on-chain state.
G-3 does not query seqno.
G-3 does not create execution-capable dispatch intents.

The purpose of this document is to define future invariants for:

- unsigned intent shape
- approval boundary
- revocation boundary
- zero-leak policy
- future seqno/account-sequence fail-closed checks
- forbidden fields in logs, RunState, DecisionStore evidence, CSV, and structured audit

## Forbidden Changes

G-3 must not introduce any execution capability.

Forbidden in G-3:

- no signer implementation
- no private keys
- no mnemonics
- no raw environment secrets
- no signing call
- no signed message
- no raw signature
- no signed BOC
- no provider credentials
- no RPC tokens
- no RPC/network call
- no on-chain state read
- no live seqno/account-sequence check
- no broadcast
- no executor handle
- no DRY_RUN=false path
- no Dispatcher live-path mutation

## Zero-Leak Policy

Future signer integration must be zero-leak by default.

The following values must never be written to logs, RunState, DecisionStore evidence, CSV, structured audit, crash reports, or smoke outputs:

- privateKey
- mnemonic
- raw environment secrets
- signedMessage
- raw signature
- signed BOC
- provider credentials
- RPC tokens
- executor handle
- signer session material

Any future boundary that observes these fields must fail closed and redact before persistence.

G-3 only records this requirement. It does not implement signer storage, signer calls, or redaction code.

## Unsigned Intent Boundary

A future unsigned intent may describe a proposed action, but it must be execution-incapable.

An unsigned intent must not contain:

- signedMessage
- signature
- privateKey
- mnemonic
- rpcEndpoint
- broadcast flag
- executor handle
- provider credentials
- RPC tokens
- signed BOC

An unsigned intent is only an approval candidate.

It is not a transaction.
It is not a signed payload.
It is not a broadcast request.
It is not sufficient to execute on-chain behavior.

Any future component that attempts to treat an unsigned intent as execution-capable must fail closed.

## Unsigned Intent Data Model

The future unsigned intent is an execution-incapable approval artifact.

It may contain only logical, dry-run-derived intent metadata required for future review and approval.

Allowed identity and traceability fields:

- intentId
- campaignId
- batchId
- stateKey
- recipientAddress
- recipientCanonicalKey
- jettonMasterCanonicalKey
- decisionId
- candidateId
- runStateEntryRef
- decisionEvidenceRef
- auditEvidenceRef

The unsigned intent must be reproducible from RunState and DecisionStore evidence.

### Ingress Boundary Data Model

The unsigned intent ingress boundary must accept only strict primitive normalized values.

Allowed value classes:

- canonical strings
- decimal strings for bigint amounts
- ISO timestamp strings
- bounded integers where explicitly defined
- booleans
- enum literals
- references or hashes to evidence artifacts

Runtime normalization may use bigint internally.

Unsigned intent persistence, audit, and I/O must represent amounts as decimal strings.

The ingress boundary must reject:

- complex runtime objects
- RunState objects
- DecisionStore record objects
- provider runtime state
- signer state
- wallet or client instances
- functions or closures
- class instances
- mutable execution context objects

The unsigned intent must remain isolated from runtime ExecutionContext.

### Primitive Snapshot Constraint

UnsignedIntent may contain only canonical primitive values.

Allowed value classes:

- string
- boolean
- integer-safe numeric enums
- decimal-string amounts for I/O
- canonical address strings
- explicit enum or status strings

Normalized bigint is allowed only inside runtime after parsing and validation.

UnsignedIntent persistence, audit, and I/O must use decimal strings for amounts.

UnsignedIntent must not contain live or mutable runtime state.

Forbidden value classes:

- runtime objects
- provider handles
- wallet handles
- signer handles
- class instances
- closures or functions
- mutable references
- ExecutionContext objects
- RunState objects
- DecisionStore writer objects
- Date objects
- Map or Set instances
- Buffers containing signed or binary payloads

No live state may cross into the signer boundary.

UnsignedIntent must remain a primitive, canonical, logically frozen snapshot.

## Forbidden Intent Fields

An unsigned transaction intent must never contain:

- privateKey
- mnemonic
- seed
- seedPhrase
- secretKey
- decryptedKeyMaterial
- signature
- rawSignature
- signedMessage
- signedBoc
- signedBOC
- bocToBroadcast
- rpcEndpoint
- providerUrl
- providerCredentials
- rpcToken
- broadcast
- send
- executor
- executorHandle
- walletHandle
- signerHandle

The unsigned intent may describe intent.

It must not carry signing material, signed payloads, broadcast handles, provider reachability, wallet handles, signer handles, or executor handles.

Any future unsigned intent containing one of these fields must be rejected before persistence.

## Log and Evidence Redaction Policy

Future signer boundary outputs must be redacted before persistence.

This applies to:

- logs
- RunState
- DecisionStore
- CSV
- evidence artifacts
- crash dumps
- debug output

Forbidden raw values must never be persisted.

Forbidden raw values include:

- private keys
- mnemonics
- seed material
- raw environment secrets
- RPC tokens
- provider credentials
- raw signatures
- signed messages
- signed BOC
- decrypted key material
- wallet session handles
- signer session handles
- broadcast payloads

If any such value is observed by a future boundary, the boundary must fail closed before writing logs, RunState, DecisionStore, CSV, or evidence artifacts.

Allowed redaction labels:

- [REDACTED_SECRET]
- [REDACTED_SIGNATURE]
- [REDACTED_SIGNED_BOC]
- [REDACTED_PROVIDER_CREDENTIAL]

Redaction labels may appear in logs or evidence only to indicate that a forbidden value was removed.

A redaction label must not preserve enough information to reconstruct the original secret, signature, signed payload, provider credential, or token.

## Intent Approval Protocol

A future unsigned intent must not become eligible for signer-boundary intake unless it has explicit approval evidence.

Approval must be based on immutable references to:

- RunState entry
- DecisionStore evidence
- campaign identifier
- batch identifier
- stateKey
- recipient
- amount
- fee policy reference
- gas safety margin policy reference
- operator assignment reference, if applicable

Approval must be deterministic and replayable from evidence.

Approval must not depend on live provider state, signer state, wallet state, RPC state, or wall-clock randomness.

Approval must fail closed if:

- RunState reference is missing
- DecisionStore evidence is missing
- stateKey does not match the RunState entry
- recipient does not match the approved entry
- amount does not match the approved entry
- campaignId does not match
- batchId does not match
- approval evidence is stale
- approval evidence is ambiguous
- approval references a revoked intent

Approval does not sign.

Approval does not broadcast.

Approval only marks an unsigned intent as eligible for a future signer-boundary review.

## Intent Revocation Protocol

A future unsigned intent may be revoked before any network exposure.

Revocation must be fail-closed.

A revoked intent must not be eligible for:

- signer-boundary intake
- signing
- broadcast
- retry
- recovery resume
- operator reassignment
- execution-capable dispatch exposure

Revocation must be recorded as a terminal state or as a hard fail-closed state until a new decision is produced.

Retry and recovery must never revive a revoked intent.

If recovery finds a revoked intent, recovery must stop before signer-boundary intake.

If retry logic observes a revoked intent, retry must be rejected.

If a revoked intent is still needed, the system must require a new decision and a new unsigned intent derived from current evidence.

A revoked intent must remain auditable and must not be deleted to hide the revocation history.

## Signer-Boundary State Machine

Future signer-boundary intake must use explicit states.

Allowed design states:

- draft_unsigned_intent
- pending_approval
- approved_for_future_signer_review
- revoked
- rejected_fail_closed
- expired
- superseded_by_new_decision

Only approved_for_future_signer_review may proceed to a future signer-boundary validation step.

Even that state is not execution-capable by itself.

No G-3 state signs, broadcasts, opens a wallet, queries seqno, or contacts a provider.

State transitions must be monotonic and fail-closed.

Valid future transitions:

- draft_unsigned_intent -> pending_approval
- pending_approval -> approved_for_future_signer_review
- pending_approval -> rejected_fail_closed
- pending_approval -> revoked
- approved_for_future_signer_review -> revoked
- approved_for_future_signer_review -> expired
- approved_for_future_signer_review -> superseded_by_new_decision

Invalid transitions:

- revoked -> approved_for_future_signer_review
- revoked -> pending_approval
- rejected_fail_closed -> approved_for_future_signer_review
- expired -> approved_for_future_signer_review

A terminal or fail-closed state may only be superseded by a new decision and a new unsigned intent.

## Future Seqno and Operator-State Fail-Closed Logic

G-3 does not implement seqno checks.

G-3 does not query signer state.

G-3 does not read on-chain state.

Future signer-boundary validation must fail closed on mismatch between:

- RunState
- operator runtime state
- signer-reported seqno
- latest observed chain state
- pending or uncertain submission state

A mismatch must never be treated as a warning.

A mismatch must block signer-boundary progression before signing, broadcast, or execution-capable dispatch exposure.

The future verification contract must require:

- approved unsigned intent
- non-revoked intent status
- matching RunState entry
- matching operator assignment
- matching signer-reported account sequence
- no pending uncertain submission for the same stateKey
- no newer decision superseding the intent
- no active administrative halt

If any required input is missing, stale, ambiguous, or contradictory, the signer boundary must reject fail-closed.

This section is a future invariant only.

It does not authorize implementation in G-3.

## Evidence Requirements

Every future unsigned intent must be traceable to evidence.

Required evidence references:

- RunState entry reference
- DecisionStore decision reference
- candidateId
- decisionId
- campaignId
- batchId
- stateKey
- recipientAddress
- amount
- approval evidence reference
- revocation evidence reference, if revoked
- fee policy reference
- gas safety margin policy reference

Evidence references must be immutable, replayable, and audit-visible.

Evidence must not include:

- private keys
- mnemonics
- seed material
- raw signatures
- signed messages
- signed BOC
- RPC tokens
- provider credentials
- wallet handles
- signer handles
- executor handles
- broadcast payloads

Evidence proves why an intent exists.

Evidence must not carry material that can sign, send, or broadcast.

## Recovery Behavior Before Network Exposure

Recovery before network exposure must be fail-closed.

Recovery may resume only from persisted evidence and RunState.

Recovery must reject if:

- unsigned intent is revoked
- unsigned intent is expired
- unsigned intent is superseded
- approval evidence is missing
- approval evidence is stale
- RunState entry is missing
- RunState entry does not match the intent
- DecisionStore evidence is missing
- administrative halt is active
- any required signer-boundary input is ambiguous

Recovery must not recreate execution-capable material.

Recovery must not infer signer state, wallet state, RPC state, or seqno.

Recovery must not create a broadcast payload.

Recovery must not revive a revoked intent.

## Explicit Non-Goals

G-3 does not authorize implementation of:

- signer integration
- signing calls
- private key handling
- mnemonic handling
- wallet opening
- seqno query
- RPC call
- provider client
- broadcast
- executor
- testnet credentials
- live dispatch
- DRY_RUN=false

G-3 is only a boundary design document under Roadmap V2.2.

Any implementation must be introduced only in a later approved stage and must pass its own gate.

## Documentation Validation and Gate to Close

G-3 may close only after documentation validation proves:

- this document exists
- the document uses the exact Roadmap V2.2 stage name
- no implementation code path was introduced
- no signer imports were introduced
- no RPC or provider imports were introduced
- no private key or mnemonic examples were introduced
- no broadcast or executor implementation was introduced
- forbidden intent fields are explicitly listed
- revocation is terminal or fail-closed
- zero-leak policy covers logs, RunState, DecisionStore, CSV, and evidence artifacts
- stage-g-full-smoke.sh passes
- stage-b-full-check.sh passes
- main validation passes
- GitHub Actions succeeds on the same SHA

G-3 remains design-only until a later approved stage explicitly authorizes implementation.
