# Stage I-4 — External Fixture Boundary Planning — Design Only

## Scope

Stage I-4 defines the planning boundary for possible future use of external fixtures.

I-4 is design-only.

This document does not authorize fixture implementation, fixture loading, fixture mutation, script changes, runtime adapter work, signer integration, provider/RPC access, wallet opening, seqno reads, network access, signing, broadcast, schema migration, Testnet execution, Mainnet execution, DRY_RUN=false, or capability exposure.

The only permitted output of I-4 is this planning document.

---

## Baseline

I-4 starts from locked origin/main after I-3.K.

Current baseline:

`3b34c7ae7a0b8300844fca2f999b39fc76fea4e5`

Locked prior stage:

- I-3.K — I-3 Package Closure / Boundary Release Decision — `3b34c7a`

I-3.K closed the I-3 package as a mock-only boundary validation and promotion package.

I-4 does not reopen I-3.G, I-3.H, I-3.I, I-3.J, or I-3.K.

---

## Fixture Boundary Principle

External fixtures may be considered only as deterministic, static, reviewable input data for future smoke validation.

External fixtures must never become:

- runtime configuration
- signer configuration
- provider configuration
- wallet configuration
- network configuration
- seqno source
- chain-state source
- fee source
- gas source
- secret source
- execution source

Fixtures must not influence real dispatch behavior.

---

## Future Fixture Eligibility

A future fixture may be eligible only if it is:

- static
- deterministic
- committed
- reviewable in diff
- free of secrets
- free of RPC/provider credentials
- free of wallet material
- free of private keys
- free of mnemonics
- free of signed messages
- free of signed BOC data
- free of broadcast payloads
- free of live network endpoints

Any fixture that contains unsafe material must be rejected.

---

## Future Fixture Scope Limits

Future fixture work, if separately approved, must remain limited to mock-only validation.

A future fixture must not:

- change candidate identity
- change decision identity
- change state key derivation
- change recipient identity
- change amount normalization
- change retry behavior
- change operator assignment
- change signer-boundary identity
- create dispatch intent
- create unsigned intent
- create execution candidate
- trigger recovery mutation
- trigger network access

Fixtures may only test deterministic rejection or acceptance behavior in an explicitly approved smoke.

---

## Future Fixture Failure Modes

Any future fixture validation must fail closed on:

- malformed fixture
- missing required field
- unknown field with execution meaning
- duplicate fixture id
- duplicate scenario id
- non-deterministic value
- secret-like material
- signed material
- network endpoint
- provider credential
- wallet material
- runtime object
- function-like value
- mutable state reference
- fixture/schema mismatch
- fixture/evaluator mismatch

Required outcome:

`FIXTURE_BOUNDARY_REJECTED`
→ `SECURITY_TERMINAL`
→ `TERMINAL_FAIL_CLOSED`

---

## Explicit Non-Authorization

I-4 does not authorize:

- creating fixtures
- editing fixtures
- reading fixtures from smoke code
- wiring fixtures into I-3.G
- changing I-3.G focused smoke
- changing Stage I full smoke
- adding scripts
- changing runtime code
- changing `lib/**`
- changing tests
- changing schema
- changing package/dependency files
- signer import
- provider import
- RPC import
- wallet import
- seqno read
- network access
- DRY_RUN=false
- Testnet execution
- Mainnet execution
- capability exposure

---

## Release Decision

I-4 may define the boundary for future fixture planning.

I-4 does not authorize fixture implementation.

I-4 does not authorize fixture loading.

I-4 does not authorize wiring fixtures into any smoke.

I-4 does not authorize runtime adapter work.

I-4 does not authorize capability exposure.

Any future fixture work must be separately scoped, reviewed, negatively tested, and gated.
