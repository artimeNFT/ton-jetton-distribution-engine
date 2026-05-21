# Stage H-4B.1 — Budget & Reserve Safety Gate Policy

## Scope

H-4B defines deterministic budget and operator reserve safety policy.

H-4B is Stage H pre-live validation only.

H-4B is static-input-bound.

H-4B is dry-run only.

## Covered Controls

H-4B covers:

- global distribution cap
- batch cap
- recipient cap
- gas ceiling
- deterministic fee policy version
- simulated operator balance
- minTonReserve
- OPERATOR_RESERVE_BREACH
- PLANNED_PAUSED

## Forbidden Methods

H-4B must not use:

- live gas estimation
- live operator balance lookup
- RPC
- provider calls
- wallet opening
- signer objects
- seqno queries
- broadcast paths
- Testnet or Mainnet execution
- DRY_RUN=false
- network congestion matching
- network noise matching
- timing camouflage
- obfuscation
- evasion framing

## Fail-Closed Matrix

H-4B must fail closed for these conditions:

- global cap exceeded -> GLOBAL_CAP_BREACH
- batch cap exceeded -> BATCH_CAP_BREACH
- recipient cap exceeded -> RECIPIENT_CAP_BREACH
- gas ceiling exceeded -> GAS_CEILING_BREACH
- missing fee policy version -> FEE_POLICY_VERSION_MISSING
- unknown budget state -> BUDGET_UNKNOWN
- deterministic planned pause -> PLANNED_PAUSED
- simulated operator balance below minTonReserve -> OPERATOR_RESERVE_BREACH

Any simulated minTonReserve breach must emit OPERATOR_RESERVE_BREACH.

OPERATOR_RESERVE_BREACH is terminal for the affected planning attempt.

OPERATOR_RESERVE_BREACH must not trigger retry, operator reassignment, recovery attempt, dispatch intent exposure, signer access, wallet opening, RPC, provider access, or broadcast.

## Invariants

H-4B must remain deterministic.

H-4B must remain static-input-bound.

All budget and reserve values must be explicit inputs.

Amounts must be represented as decimal strings for I/O.

Runtime arithmetic must use bigint-compatible integer semantics.

Budget and reserve checks must not depend on wall-clock time.

Budget and reserve checks must not depend on network state.

Fee policy version must be recorded.

Budget policy version must be recorded.

H-4B must not change decisionId, candidateId, stateKey, recipient, amount, batchId, or operator identity.

H-4B must not expose dispatch intent when any budget or reserve check fails closed.

## Baseline

Baseline: origin/main = 185341f Add Stage H4 recipient eligibility closure review.

Existing Stage F fee and gas work is prior dispatcher-layer fee context.

Stage F fee and gas work does not replace this Stage H budget and reserve safety gate.

## Required Smoke

H-4B validation must prove:

- global cap breach fails closed
- batch cap breach fails closed
- recipient cap breach fails closed
- gas ceiling breach fails closed
- missing fee policy version fails closed
- unknown budget state fails closed
- deterministic planned pause emits PLANNED_PAUSED
- simulated minTonReserve breach emits OPERATOR_RESERVE_BREACH
- OPERATOR_RESERVE_BREACH does not retry
- OPERATOR_RESERVE_BREACH does not reassign operator
- OPERATOR_RESERVE_BREACH does not expose dispatch intent
- no live gas estimation
- no live operator balance lookup
- no RPC, provider, wallet opening, signer, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false path

## Evidence Requirements

Every H-4B decision must be audit-visible.

Evidence must include:

- budget policy version
- fee policy version
- global cap
- batch cap
- recipient cap
- gas ceiling
- simulated operator balance
- minTonReserve
- decision label
- reason code
- blocking status

Evidence must not include raw secrets, mnemonic material, private keys, signatures, signed payloads, provider credentials, RPC tokens, wallet handles, signer handles, executor handles, or broadcast payloads.

## Allowed Inputs

H-4B may use only deterministic authorized inputs:

- tracked policy documents
- tracked config files
- tracked dry-run fixtures
- explicit dry-run test vectors
- simulated operator balance values
- declared budget caps
- declared gas ceiling
- declared minTonReserve
- declared budget policy version
- declared fee policy version

## Risks

H-4B must control these risks:

- budget bypass
- cap bypass
- gas ceiling bypass
- operator reserve breach
- retry after reserve breach
- operator reassignment after reserve breach
- dispatch intent exposure after reserve breach
- missing budget policy version
- missing fee policy version
- non-deterministic budget calculation
- live balance dependency
- live gas dependency
- network congestion matching
- network noise matching
- obfuscation or evasion framing

## Forbidden Changes

H-4B must not introduce:

- production budget enforcement
- production reserve enforcement
- runtime operator balance lookup
- live gas estimation
- RPC or provider integration
- wallet opening
- signer integration
- seqno query
- broadcast capability
- Testnet or Mainnet execution
- DRY_RUN=false execution
- network congestion matching
- network noise matching
- timing camouflage
- obfuscation logic
- evasion logic

## Gate to Close H-4B.1

H-4B.1 may close only when:

- this policy document is committed
- no production code is changed
- no production budget or reserve enforcement is introduced
- no runtime operator balance lookup is introduced
- no live gas estimation is introduced
- no signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution is introduced
- OPERATOR_RESERVE_BREACH is documented as terminal for simulated minTonReserve breach
- H-3 guard passes
- stage-h-full-smoke passes
- stage-g-full-smoke passes
- stage-f-full-smoke passes
- stage-b-full-check passes
- GitHub Actions succeeds on the same pushed SHA
