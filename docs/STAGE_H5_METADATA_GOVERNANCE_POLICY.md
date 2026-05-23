# Stage H-5.1 — Metadata Governance & Finality Policy

## Scope

Stage H is pre-live dry-run safety.

H-5 defines metadata governance, lineage, finality and identity controls.

H-5 does not authorize runtime metadata mutation.

## Allowed

- metadata hash pinning
- metadata lineage tracking
- TEP-64 structure validation
- identity binding validation
- rollback intent tracking
- deterministic approval windows
- audit-visible evidence

## Forbidden

- URI fetch
- gateway lookup
- IPFS access
- RPC/provider access
- wallet opening
- signer access
- metadata mutation
- broadcast
- Testnet
- Mainnet
- DRY_RUN=false

## Identity Contract

Identity must remain logically stable.

No identity hopping is allowed.

Identity mutation requires a new metadata intent.

Identity must not silently change while metadata remains constant.

Metadata must not silently change while identity remains constant.

Identity binding must be deterministic and audit-visible.

## Metadata Lineage Contract

Metadata lineage must remain audit-visible.

Required lineage fields:

- metadataIntentId
- contentUri
- contentHash
- metadataIntentApprovedAt
- metadataEffectiveAfter
- rollbackIntentId
- approvalEvidenceRef

The contentHash must pin the approved contentUri payload.

Hash drift must fail closed.

Rollback lineage must reference an approved prior intent.

## TEP-64 Policy

Metadata must be static-input-bound in Stage H.

Metadata validation may inspect tracked JSON fixtures only.

Required fields:

- name
- symbol
- description
- decimals
- image
- render_type
- amount_style

Decimals must be explicit.

Decimals must not be hardcoded to 9.

Decimals must be validated as an integer within an approved policy range.

## Required Smoke

Future H-5 smoke must prove fail-closed behavior for:

- hash drift
- missing metadata field
- invalid decimals
- identity mutation with pinned metadata
- metadata mutation with pinned identity
- URI replacement under same identity
- hidden fallback URI

## Gate to Close H-5.1

H-5.1 may close only when this policy document is committed and no runtime/live metadata behavior is added.
