# STAGE_E_PREFLIGHT_FREEZE_REVIEW

## 1. Status

Stage E-Preflight is implemented and frozen as a dry-run blacklist preflight validation chain.

Stage E-Preflight approves local deterministic validation only.

No Dispatcher integration is approved here.

No DecisionStore mutation is approved here.

No RunState mutation is approved here.

No targets generation is approved here.

No provider or network access is approved here.

No private key access is approved here.

No signing, sending, broadcasting, or execution is in scope.

No live-chain behavior is approved here.

---

## 2. Implemented E-Preflight Scope

Stage E-Preflight introduced a complete local blacklist preflight validation chain.

Implemented scope:

- blacklist checksum integrity validation
- optional signature config loading
- optional public-key signature verification
- signed envelope payload contract
- canonical signed envelope payload serialization
- envelope freshness policy validation
- signer-bound replay nonce validation
- domain-separated replay key construction
- blacklist preflight orchestrator aggregation
- Administrative Halt hook as injected input
- traceability preservation for lt and traceId
- E-Preflight smoke aggregation through scripts/e-preflight-full-smoke.sh

The implementation remains dry-run validation infrastructure only.

---

## 3. Validation Chain Guarantees

The frozen validation chain is:

1. Administrative Halt
2. input and traceability validation
3. signed envelope validation
4. blacklist checksum integrity validation
5. canonical envelope payload construction
6. public-key signature verification
7. freshness policy validation
8. signer-bound replay nonce validation
9. final deterministic freshness re-check
10. accepted atomic result

Locked behavior:

- Administrative Halt rejects immediately before downstream validators are required
- invalid input fails closed
- invalid traceability fails closed
- lt must be a decimal string
- traceId must be null or a non-empty string
- malformed envelope fails closed
- checksum mismatch fails closed
- invalid or unsupported signature configuration fails closed when present
- invalid signature fails closed
- expired envelope fails closed
- envelope valid too far in the future fails closed
- duplicate signer-bound nonce fails closed
- accepted result includes validated metadata only

No partial approval state is produced.

---

## 4. Replay / Nonce Guarantees

Replay protection is signer-bound and domain-separated.

Locked behavior:

- replay key is derived from domain + signerPublicKeyHex + nonce
- signerPublicKeyHex is normalized to lowercase
- nonce must be lowercase 64-character hex
- same signer + same nonce is rejected as duplicate
- same nonce under a different signer produces a different replay key
- missing nonce fails closed
- invalid nonce fails closed
- missing signer fails closed
- invalid signer fails closed
- invalid registry fails closed
- throwing registry fails closed
- non-boolean registry result fails closed

This stage does not implement persistent NonceStore storage.

The nonce registry is injected as a validation boundary only.

---

## 5. Orchestrator Guarantees

The blacklist preflight orchestrator returns one atomic result.

Locked behavior:

- accepted result contains ok=true and action=accepted
- rejected result contains ok=false, action=rejected, and a typed reason
- traceability is preserved in accepted results
- traceability is attached to rejected results after traceability validation succeeds
- rejected results before traceability validation return traceability=null
- accepted metadata includes envelopeVersion
- accepted metadata includes payloadKind
- accepted metadata includes signerPublicKeyHex
- accepted metadata includes checksum
- accepted metadata includes nonce
- accepted metadata includes replayKey
- accepted metadata includes priority=null

The orchestrator uses injected nowIso.

The orchestrator uses injected administrativeHalt.

The orchestrator does not read process.env.

The orchestrator does not perform I/O.

The orchestrator does not mutate external state.

---

## 6. Administrative Halt Boundary

Administrative Halt is implemented as an injected boolean input to the orchestrator.

Locked behavior:

- administrativeHalt must be boolean
- administrativeHalt=true rejects immediately
- administrative_halt is a typed rejection reason
- Administrative Halt does not require valid envelope, signature, freshness, or nonce inputs
- Administrative Halt does not trigger Dispatcher behavior
- Administrative Halt does not mutate state

This stage does not implement the external ENV or config loader for Administrative Halt.

A future stage may provide a wrapper that reads ENV or config and injects administrativeHalt into the pure orchestrator.

---

## 7. Explicit Non-Scope

Stage E-Preflight does not implement:

- persistent NonceStore
- DecisionStore ownership checks
- DecisionStore append lock enforcement
- production-grade atomic acquire
- lock release/delete semantics
- Dispatcher integration
- RunState integration
- targets generation
- live provider calls
- private key access
- signing
- sending
- broadcasting
- execution
- ENV/config loader for Administrative Halt
- operator funding
- dynamic dispatch delay
- amount entropy
- gas funding
- wallet code-hash classification

---

## 8. Required Smokes

Stage E-Preflight is protected by:

- scripts/e-preflight-full-smoke.sh
- scripts/stage-b-full-check.sh

The E-Preflight smoke aggregator covers:

- E-Preflight.1 blacklist integrity checksum
- E-Preflight.2 optional blacklist signature verification
- E-Preflight.3 signature config loader
- E-Preflight.4 signed envelope contract
- E-Preflight.5 envelope signature verification
- E-Preflight.6 envelope freshness policy
- E-Preflight.7 replay nonce contract
- E-Preflight.Orchestrator preflight aggregation

The Stage B full check invokes the E-Preflight smoke aggregator.

A stage is not frozen unless Stage B Full Check passes on main and GitHub Actions completes successfully on the same SHA.

---

## 9. Deferred Work

The following items are intentionally deferred:

- persistent NonceStore implementation
- Administrative Halt ENV/config loader
- DecisionStore ownership check contract
- append writer lock enforcement
- production-grade atomic acquire
- release/delete lock semantics
- lock hijack fault injection
- Dispatcher dry-run integration
- RunState consistency integration
- audit alignment across Dispatcher, DecisionStore, CSV, logs, and heartbeat
- deterministic dispatch spacing plan
- signed or audited amount entropy policy
- wallet code-hash classification
- operator reserve and funding reconciliation policy

These must be addressed in later stages before any execution path is considered.

---

## 10. Final Rule

Stage E-Preflight is frozen as dry-run blacklist preflight validation infrastructure.

It approves only the implemented local validation, replay protection, and orchestrator aggregation boundaries described in this document.

It does not approve Dispatcher integration.

It does not approve DecisionStore mutation.

It does not approve RunState mutation.

It does not approve targets generation.

It does not approve signing, sending, broadcasting, or execution.

The next stage must preserve the E-Preflight fail-closed invariants.
