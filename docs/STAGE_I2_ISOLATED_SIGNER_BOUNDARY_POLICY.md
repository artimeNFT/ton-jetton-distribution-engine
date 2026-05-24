# Stage I-2 — Isolated Signer Boundary Policy

## Scope

Stage I-2 defines the runtime boundary between Dispatcher intent flow and future signer integration.

I-2 does not perform signing, wallet opening, mnemonic parsing, private key loading, seqno query, RPC execution, message broadcast, Testnet execution, Mainnet access, or DRY_RUN=false execution.

Signer integration remains boundary-only and fail-closed.

## Runtime Boundary Rules

Allowed ingress into signer boundary:

- canonical primitive values only
- unsigned intent snapshot only
- normalized address strings
- decimal-string amounts for I/O
- explicit enum/status values

Forbidden ingress:

- secret material
- private credential material
- seed-derived material
- signature material
- signed payload material
- execution-capable payload material
- provider handles
- wallet handles
- executor handles
- runtime objects

## Required Fail-Closed Cases

I-2 must fail closed on:

- signer persistence attempt
- secret material persistence attempt
- signed payload persistence attempt
- provider handle persistence attempt
- wallet handle persistence attempt
- runtime object ingress
- signer boundary bypass
- unsigned intent mutation
- decisionId mutation
- candidateId mutation
- stateKey mutation

## Gate to Close I-2

I-2 closes only when policy exists, signer-boundary smoke passes, redaction validation passes, and no execution-capable behavior is introduced.

## Additional Forbidden Runtime Ingress

- mutable references
- closures/functions
- live state objects
- RunState objects
- DecisionStore writer objects
- ExecutionContext objects

## WalletPool Secret Boundary Audit

Audit targets:

- Provider secret exposure surfaces
- runtime secret residency surfaces
- persistence ordering surfaces
- asynchronous persistence exposure surfaces
- execution-capable secret propagation surfaces

## Required Findings Classification

I-2 must classify findings into:

- SECRET_EXPOSURE
- PERSISTENCE_ORDERING
- RUNTIME_SECRET_RESIDENCY
- EXECUTION_SURFACE
- INFORMATION_ONLY

Additional fail-closed cases:

- secret material returned through Provider
- secret material persisted into runtime state
- state exposure before persistence completion
- execution-capable secret propagation
