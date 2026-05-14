# Stage F-9 Architectural Boundary Freeze Review

## F-9 Freeze Scope

F-9 freezes the architectural boundaries of Stage F.

This review does not add execution capability.
It does not change Dispatcher runtime behavior.
It does not introduce signing, sending, broadcasting, RPC execution, metadata mutation, or on-chain state interaction.

The purpose of this document is to record:

- what Stage F has locked
- which Stage F contracts are validated
- which capabilities remain explicitly forbidden
- which concerns are deferred to Stage G/H/I
- whether any Stage F critical debts remain open

## Locked Stage F Commits

The Stage F boundary freeze is based on the following locked commits:

    77ab96a Add administrative halt interception boundary
    f8460d1 Add deterministic gas safety margin policy
    688b808 Add retry policy disposition smoke
    e0a2db4 Add dispatcher fault injection smoke
    c27d84d Add operational health probe lane simulation
    ebaeb31 Add asset fee policy resolver
    d1f00ef Add heartbeat policy writer integration smoke
    521b438 Add heartbeat append policy boundary
    95e2f70 Add cross-store consistency contract

Each commit was merged through the project gate flow:
smoke validation, Stage F full smoke, Stage B full check, main validation, push, and GitHub Actions success on the same SHA.

## Dry-Run Sterility Boundary

Stage F remains dry-run sterile.

The following capabilities are explicitly outside Stage F:

- no signing
- no sending
- no broadcasting
- no DRY_RUN=false execution
- no live execution
- no Jetton Master mutation
- no metadata mutation
- no Pinata/IPFS write
- no private keys
- no production RPC execution
- no live gas estimation
- no signer integration
- no on-chain seqno/account-sequence validation

Any future execution-capable dispatch intent must remain blocked until the relevant Stage G/H/I gates are satisfied.

## Locked Stage F Contracts

Stage F locks the following dispatcher-side contracts:

- F-1 DecisionStore to RunState adapter contract
- F-2 RunState plan apply contract
- F-3 RunState apply file shell and state-before-action boundary
- F-4 Dispatcher dry-run intake boundary
- F-5 Dispatcher dry-run transition plan
- F-5 retry policy disposition coverage
- F-5.1 asset fee policy resolver
- F-5.2 deterministic gas safety margin policy
- F-6 cross-store consistency contract
- F-6 heartbeat append boundary policy
- F-6 heartbeat policy to writer integration
- F-7A dispatcher fault injection smoke
- F-7B operational health probe lane simulation
- F-8 administrative halt interception boundary

RunState remains the single execution source of truth.

DecisionStore remains an evidence trail and does not become an execution source.

No dispatch transition is valid unless it is derived from validated RunState state and Stage F dry-run boundaries.

## G/H/I Deferred Concerns

The following concerns are explicitly deferred outside Stage F.

### Metadata Governance

Stage F does not perform metadata mutation.

Stage F does not:

- update Jetton Master contentUri
- write to Pinata/IPFS
- perform metadata broadcast
- rely on wallet or gateway indexing state

Metadata propagation delay policy is deferred to H-5/H-6 governance and finality work.

The future policy must cover:

- metadataIntentApprovedAt
- metadataEffectiveAfter
- minimumPropagationDelayMs
- contentUri checksum or hash
- rollback intent
- approval evidence

### Account Seqno / Account Sequence

Stage F does not integrate a signer and does not perform live seqno validation.

The account sequence contract is deferred to:

- G-3 Signing Sandbox Design Only
- I-2 Testnet Signer Integration
- I-3 Pre-Emission Validation Sequence
- I-5 Testnet Failure Recovery

Any future execution-capable dispatch intent must fail closed on mismatch between:

- RunState
- operator runtime state
- signer-reported seqno
- latest observed chain state
- pending or uncertain submission state

## F-5 Alignment

F-5 retry policy coverage is locked.

The following retry dispositions and categories are explicitly validated:

- retry_same_identity
- rotate_identity
- fail_batch
- stop_campaign
- unknown to fail_batch
- fatal to stop_campaign

F-5.2 deterministic gas safety margin is locked.

The gas safety margin contract is:

- config-only
- deterministic for identical input
- audit-visible
- cap-bound by gasCeilingNano
- isolated from decisionId, candidateId, stateKey, recipient, and amount
- free of live gas estimation

## F-7 Alignment

F-7A dispatcher fault injection is locked.

F-7B operational health probe lane is locked and isolated from business RunState entries.

Provider and RPC timeout coverage is documented as a cross-proof:

- F-7B validates synthetic provider/RPC timeout simulation without network access
- F-5 retry policy validates timeout and transient RPC retry classification
- F-9 does not reopen F-7A to duplicate this coverage

## F-8 Alignment

F-8 administrative halt interception is locked.

Administrative Halt remains sourced from Stage E / Orchestrator.

Stage F only proves that Dispatcher-side boundaries respect the halt signal.

Stage F does not create a new Halt authority.

When active, Administrative Halt blocks progression at these boundaries:

- before_intake
- after_runstate_plan
- before_dry_run_transition
- before_dispatch_intent_exposure

## Open Debts and Deferred Items

No critical Stage F debt remains open.

The following items are explicitly deferred and are not Stage F blockers:

- Metadata propagation delay policy is deferred to H-5/H-6.
- Metadata mutation and contentUri update are deferred to Testnet/Mainnet gates.
- Signer integration is deferred to G/I stages.
- Live seqno/account sequence verification is deferred to G/I stages.
- Execution-capable dispatch intent exposure remains blocked until future gates.
- Provider/RPC timeout is accepted as cross-proof through F-7B and F-5.

## Stage F Close Gate

Stage F may be treated as closed only after the following gate is satisfied on the same final SHA:

- npx tsc --noEmit PASS
- Stage F full smoke PASS
- Stage B full check PASS
- git diff --check PASS
- branch validation PASS
- fast-forward merge to main
- main validation PASS
- push origin main
- GitHub Actions success on the same SHA

No Stage F closure is valid without CI success on the same commit that was pushed to origin/main.

## Freeze Decision

Stage F is eligible for architectural freeze.

The Dispatcher integration layer remains dry-run sterile.

No execution capability was introduced.

No critical Stage F debt remains open.

Stage G may begin only after this F-9 document passes the full close gate and is merged to origin/main with GitHub Actions success on the same SHA.
