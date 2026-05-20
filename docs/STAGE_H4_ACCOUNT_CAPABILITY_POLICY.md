# Stage H-4.1 — Account Capability & Recipient Eligibility Policy

## Scope

H-4 defines deterministic, input-bound recipient eligibility and account capability policy.

This policy covers:

- recipient eligibility
- invalid address rejection
- duplicate target rejection
- allowlist and blocklist enforcement
- authorized compliance or risk labels
- static account capability classification, including W5 and v4R2 labels when provided by authorized input

H-4 does not perform live account discovery.

H-4 does not perform behavioral profiling.

H-4 does not probe recipient accounts.

## Control Baseline Alignment

The original H-4 control baseline is Recipient Risk & Eligibility Policy.

The W5/v4R2 capability lane is included only as a static account-capability classification layer inside recipient eligibility.

Account capability classification must never become live profiling, anti-forensics, evasion, hidden discovery, or network probing.

## Allowed Inputs

H-4 may use only deterministic authorized inputs:

- tracked target files
- tracked operator or config files
- tracked allowlists
- tracked blocklists
- tracked fixtures
- explicit dry-run test vectors
- authorized compliance or risk labels if already present in input
- declared W5 or v4R2 capability labels if already present in authorized input

## Forbidden Methods

H-4 must not use:

- RPC
- TonClient
- NetworkProvider
- on-chain reads
- get-method calls
- seqno queries
- wallet opening
- signer objects
- provider credentials
- broadcast paths
- Testnet or Mainnet execution
- DRY_RUN=false
- live recipient probing
- behavioral profiling
- anti-forensics framing
- evasion logic
- bot-detection-for-bypass logic
- hidden discovery

## Risks

H-4 must control these risks:

- bypass logic
- eligibility drift without audit
- unsafe recipient admission
- duplicate target admission
- invalid address admission
- allowlist or blocklist bypass
- ambiguous W5 or v4R2 capability classification
- account capability inferred from unauthorized input
- anti-forensics framing
- invasive profiling
- live target probing
- hidden discovery

## Invariants

H-4 must remain static-input only.

Eligibility and capability classification must be deterministic.

Unknown recipient eligibility must fail closed.

Unknown account capability must fail closed.

Ambiguous W5 or v4R2 classification must fail closed.

Conflicting authorized inputs must fail closed.

Missing evidence must fail closed.

H-4 must not change `decisionId`, `candidateId`, `stateKey`, `recipient`, `amount`, or `batchId`.

H-4 must not expose dispatch intent, signer handle, executor handle, wallet runtime object, or provider handle.

## Recipient Eligibility Labels

H-4 recipient eligibility may use these labels:

- ELIGIBLE
- INVALID_ADDRESS
- DUPLICATE_TARGET
- BLOCKLISTED_TARGET
- ALLOWLIST_MISS
- KNOWN_UNSAFE_TARGET
- UNKNOWN_ELIGIBILITY
- AMBIGUOUS_ELIGIBILITY

Only `ELIGIBLE` may continue.

All other eligibility labels are blocking unless a later policy explicitly defines a stricter terminal disposition.

Risk labels are recorded as audit-visible annotations. A risk label is blocking only when an authorized input explicitly classifies it as blocking.

## Account Capability Labels

H-4 account capability may use these labels:

- DECLARED_W5
- DECLARED_V4R2
- FIXTURE_CONFIRMED_W5
- FIXTURE_CONFIRMED_V4R2
- UNKNOWN_ACCOUNT_CAPABILITY
- AMBIGUOUS_ACCOUNT_CAPABILITY
- UNSUPPORTED_ACCOUNT_CAPABILITY
- BLOCKED_BEFORE_TESTNET

W5/v4R2 labels are valid only when derived from authorized static input.

Unknown, ambiguous, unsupported, or Testnet-blocked capability labels fail closed.

## Required Smoke

H-4 validation must prove:

- invalid address rejected
- duplicate target rejected
- blocklisted target rejected
- allowlist mode enforced
- risk label recorded if present
- unknown eligibility fails closed
- ambiguous eligibility fails closed
- unknown account capability fails closed
- ambiguous W5/v4R2 capability fails closed
- W5/v4R2 labels are accepted only from authorized static input
- no live probing
- no network, RPC, provider, wallet opening, signer, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false path

## Evidence Requirements

Every H-4 eligibility or capability decision must be audit-visible.

Evidence must include:

- recipient address or target key
- eligibility label
- account capability label if present
- risk label if present
- source type
- source reference
- blocking status
- reason code

Evidence must not include raw secrets, mnemonic material, private keys, signatures, signed payloads, provider credentials, RPC tokens, wallet handles, signer handles, executor handles, or broadcast payloads.

## Forbidden Changes

H-4 must not introduce:

- anti-forensics logic
- evasion logic
- bot-detection-for-bypass logic
- invasive profiling
- hidden discovery
- network probing
- live target probing
- signer integration
- wallet opening
- RPC or provider integration
- broadcast capability
- Testnet or Mainnet execution
- DRY_RUN=false execution

## Gate to Close H-4.1

H-4.1 may close only when:

- this policy document is committed
- no production code is changed
- no recipient eligibility implementation is introduced
- no signer, RPC, provider, wallet opening, seqno query, broadcast, Testnet, Mainnet, or DRY_RUN=false execution is introduced
- H-3 guard passes
- H-3 aggregator negative proof passes
- stage-h-full-smoke passes
- stage-g-full-smoke passes
- stage-f-full-smoke passes
- stage-b-full-check passes
- GitHub Actions succeeds on the same pushed SHA
