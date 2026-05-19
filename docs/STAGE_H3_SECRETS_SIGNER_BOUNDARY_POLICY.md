# Stage H-3 — Secrets / Signer Boundary Policy

## Scope

Stage H-3 defines the secrets, signer-boundary, redaction, and static leak-prevention policy required before any later signer or Testnet work may be considered.

H-3 is policy and static validation only.

H-3 does not implement a signer.
H-3 does not parse mnemonics for signing.
H-3 does not open wallets.
H-3 does not query seqno.
H-3 does not connect to RPC.
H-3 does not perform Testnet or Mainnet reads.
H-3 does not broadcast.
H-3 does not enable DRY_RUN=false.

## Baseline

Baseline: origin/main = dd8ac63 Add Stage HX historical integrity audit.

H-X closed and locked historical integrity audit findings before H-3 opened.

## Stage Mode

Required mode:

- DRY_RUN=true only
- no live signer
- no live wallet opening
- no mnemonic-to-key conversion for execution
- no private key loading
- no RPC provider
- no TonClient / NetworkProvider live execution path
- no seqno query
- no on-chain read
- no signed payload creation
- no broadcast
- no Testnet
- no Mainnet
- no DRY_RUN=false

## Non-Goals

H-3 must not prove heap safety.

H-3 must not claim runtime memory secrecy for a future live signer.

H-3 must not execute secret-bearing code paths.

H-3 must not read, print, hash, persist, or compare real .env secret values.

H-3 must not introduce signer integration, wallet integration, provider integration, RPC integration, or broadcast integration.

## Primary Objectives

H-3 defines and validates:

- zero-leak policy for secrets and signed payload material
- redaction policy for logs, state, audit, reports, and evidence
- forbidden fields for RunState, DecisionStore, audit rows, structured logs, evidence, build output, and intents
- static secret-marker scanning rules
- .env key-name-only classification
- ignored/generated artifact leak checks
- operator identity registry policy using non-secret primitive identifiers
- signer boundary fail-closed requirements for later stages

## Secret Material Definition

The following are secret or secret-adjacent and must never appear in committed source, logs, RunState, DecisionStore, audit rows, reports, build artifacts, or evidence documents as raw values:

- mnemonic
- seed
- seedPhrase
- privateKey
- secretKey
- decryptedKeyMaterial
- raw env secret values
- RPC token
- API token
- provider credential
- wallet session handle
- signer handle
- executor handle containing signer access

## Signed Payload Definition

The following are execution-capable or execution-adjacent payloads and must not exist in H-3 artifacts:

- signature
- rawSignature
- signedMessage
- signedBoc
- signedBOC
- bocToBroadcast
- broadcast payload
- serialized signed transaction
- external message ready for broadcast
- live wallet handle
- live provider handle

## Allowed Redaction Labels

Only redacted labels may be used in logs, reports, docs, and evidence when referring to sensitive material.

Allowed labels:

- [REDACTED_SECRET]
- [REDACTED_SIGNATURE]
- [REDACTED_SIGNED_BOC]
- [REDACTED_PROVIDER_CREDENTIAL]
- [REDACTED_RPC_TOKEN]

Raw secret values are never allowed as evidence.

## Forbidden Persistence Surfaces

Secret material and signed payload material must not be persisted to:

- RunState
- RunState.entries
- RunState.operators
- DecisionStore
- decisions.jsonl
- heartbeats.jsonl
- audit CSV
- structured logs
- console output
- reports/
- build/
- .tmp/
- docs/
- test fixtures
- generated artifacts
- CI logs

## .env Handling Policy

.env and .env.* files are local ignored sensitive artifacts.

H-3 may inspect .env key names only.

H-3 must not print .env values.

H-3 must not hash .env values into evidence.

H-3 must not compare .env values against committed files.

H-3 must not copy .env values into temporary files, docs, logs, reports, or test fixtures.

Allowed evidence:

- .env is ignored
- .env.* is ignored
- key names exist
- values were not read into audit evidence

## Static Secret Marker Policy

H-3 static scanning may search tracked files for secret-related markers.

Marker presence is not automatically a failure.

Allowed marker contexts:

- policy documents defining forbidden fields
- smoke tests asserting forbidden fields
- quarantined legacy files already classified by H-X
- dry-run guards that block real execution
- comments describing redaction policy

Failure contexts:

- new secret persistence
- new secret logging
- new secret serialization
- new signed payload fields
- new provider credential fields in persisted artifacts
- new RPC token fields in persisted artifacts
- new signer handles in intents, state, or evidence
- new DRY_RUN=false live execution path
- new wallet opening path
- new mnemonic-to-key execution path
- new broadcast path

## Operator Identity Registry Policy

Operator registry data used before Testnet must use primitive non-secret identifiers only.

Allowed operator identity fields:

- operatorId
- walletLabel
- address
- enabled flag
- maxBatchSize
- cooldown policy
- failure counters
- non-secret operational metadata

Forbidden operator registry fields:

- mnemonic
- privateKey
- secretKey
- seed
- seedPhrase
- decryptedKeyMaterial
- signerHandle
- walletHandle
- providerCredential
- rpcToken

If mnemonic environment references exist for legacy dry-run compatibility, they remain an H-3 blocker/caveat until a later secrets policy gate explicitly remediates or replaces them.

## Intent Boundary Policy

Any future signer-boundary intent must be unsigned and execution-incapable.

Unsigned intent may include only canonical primitive values:

- string
- boolean
- integer-safe numeric enum
- decimal-string amount
- canonical address string
- explicit enum/status string
- non-secret metadata hash or identifier

Unsigned intent must not include:

- mnemonic
- privateKey
- secretKey
- seed
- decryptedKeyMaterial
- signature
- signedMessage
- signedBoc
- bocToBroadcast
- rpcEndpoint
- providerCredential
- rpcToken
- signerHandle
- walletHandle
- executorHandle
- function
- closure
- class instance
- mutable runtime object

## Logging Policy

Logs may contain operational metadata only.

Allowed log fields:

- campaignId
- batchId
- stateKey
- recipientAddress
- amount as decimal string
- operatorId
- walletLabel
- attemptNumber
- dryRun boolean
- non-secret status
- non-secret reasonCode
- redaction labels

Forbidden log fields:

- mnemonic
- privateKey
- secretKey
- seed phrase
- decrypted key material
- raw signature
- signed message
- signed BOC
- RPC token
- provider credential
- wallet handle
- signer handle

## Audit Policy

Audit rows must remain non-secret and deterministic.

Allowed audit content:

- campaignId
- batchId
- stateKey
- recipientAddress
- amount decimal string
- status
- attempt count
- walletLabel
- synthetic dry-run txHash
- non-secret error classification

Forbidden audit content:

- secret material
- signed payload material
- provider credentials
- RPC tokens
- raw environment values
- wallet/session handles

## Build / Report / Generated Artifact Policy

Generated artifacts are not source of truth.

H-3 must verify that tracked build/report/tmp artifacts are absent unless explicitly approved.

build/, reports/, and .tmp/ must not contain committed secret material.

Local ignored generated artifacts may be scanned only for marker presence, not for real secret value comparison.

## Fail-Closed Requirements

H-3 checks must fail closed on:

- committed raw secret material
- committed signed payload material
- secret markers in persisted state schemas unless explicitly allowed as policy/test text
- secret markers in audit schemas unless explicitly allowed as policy/test text
- secret markers in log schemas unless explicitly allowed as policy/test text
- tracked build/report/tmp artifact leakage
- .env or .env.* tracked by git
- DRY_RUN=false path introduced
- signer/RPC/broadcast path introduced
- unsigned intent model containing execution-capable fields
- mnemonic-to-key conversion path introduced
- wallet opening path introduced
- provider credential persistence introduced
- raw .env value read into evidence

## H-3 Smoke Guard Requirements

The H-3 smoke guard must validate that this document exists and includes:

- DRY_RUN=true only
- no signer
- no RPC
- no broadcast
- no Testnet/Mainnet
- no DRY_RUN=false
- no .env value reads
- redaction labels
- forbidden persistence surfaces
- unsigned intent forbidden fields
- operator registry forbidden fields
- fail-closed requirements

The smoke guard must not read real .env values.

The smoke guard must not contact network services.

The smoke guard must not execute signer, wallet, provider, or broadcast code.

## Gate to Close H-3.1

H-3.1 may close only when:

- this policy document is committed
- no execution-capable code is added
- no signer/RPC/broadcast imports are added
- no .env values are read into evidence
- git diff --check is clean
- stage-h-full-smoke passes
- stage-g-full-smoke passes
- stage-f-full-smoke passes
- stage-b-full-check passes
- main is fast-forward merged
- GitHub Actions succeeds on the same pushed SHA

## Current H-3.1 Status

H-3.1 is policy-document only.

H-3.1 does not yet implement the H-3 smoke guard.

H-3.1 does not approve signer integration.

H-3.1 does not approve Testnet.

H-3.1 does not approve Mainnet.
