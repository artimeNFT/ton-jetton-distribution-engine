# Stage H-1 — Legacy Execution Artifact Quarantine

## Control Boundary

Stage H-1 is a Pre-Live Safety Gate.

Stage H-1 only inventories and classifies legacy execution-capable artifacts.

It does not authorize signing, sending, broadcasting, RPC/provider/on-chain reads, testnet execution, mainnet execution, DRY_RUN=false, destructive deletion, source shredding, or physical quarantine moves without prior review.

## Classification Model

Each artifact must be classified into exactly one category: Safe Dry-Run Fixture, Quarantined Artifact, Manually Reviewed Exception, or Forbidden Live Path.

### Safe Dry-Run Fixture

Risk terms appear only inside deterministic dry-run smoke, negative gate testing, documentation validation, or synthetic non-live behavior.

### Quarantined Artifact

Legacy or execution-capable artifact that contains live-capable primitives and is not part of the approved Stage G dry-run path.

### Manually Reviewed Exception

Execution-adjacent or risky-term-bearing artifact that is guarded, dry-run-only, or required by the approved dry-run pipeline.

### Forbidden Live Path

Reachable path that can sign, send, broadcast, or perform network/on-chain execution without the required future Stage H/I gates.

## Initial Findings

Package-level reachable surfaces requiring review:

- package.json: deploy -> blueprint run deploySecureTether --testnet
- package.json: mint -> blueprint run deployAndMint --testnet

Quarantined Artifact candidates based on scan evidence and existing blocker documentation:

- scripts/deployJettonMaster.ts
- scripts/vaultDistribution.ts
- scripts/batchStatusUpdate.ts
- scripts/bulkMint.ts
- scripts/vaultDistribution_linkTest.ts
- legacy/deployAndMint.ts
- legacy/privacyProtocol.ts
- legacy/matchingEngine.ts
- legacy/liquidityMonitor.ts
- lib/staggered-broadcaster.js

Manually Reviewed Exception candidate:

- scripts/updateMetadata.ts

## Required Proof

H-1 cannot close until:

- all execution-capable artifacts are classified
- package-level legacy commands are reviewed
- reviewed exceptions are documented with rationale
- no reachable legacy execution route exists from approved Stage G dry-run paths
- stage-h-1 smoke passes
- stage-b-full-check passes
- main validation passes
- GitHub Actions succeeds on the same SHA

## Current Status

This document is the H-1 manifest framework and initial inventory record.

It does not quarantine, delete, move, execute, or modify any legacy artifact.

## Reachability Evidence — Package Scripts

`package.json` exposes two Testnet-facing operator commands:

- `deploy`: `blueprint run deploySecureTether --testnet`
- `mint`: `blueprint run deployAndMint --testnet`

Current file search found:

- no `deploySecureTether` script file
- `deployAndMint.ts` only under `legacy/`

Classification: stale package-level command surface requiring review.

No execution was performed. No package script was removed or modified in this step.

## Artifact Classification — scripts/bulkMint.ts

Classification: Quarantined Artifact.

Evidence:

- contains live-capable primitives: TonClient, WalletContractV4, mnemonicToPrivateKey, secretKey, RPC endpoint/API-key handling, and provider.sender().send(...)
- run(provider) calls assertLegacyScriptBlocked() before the legacy live-send flow
- assertLegacyScriptBlocked() throws LEGACY_SCRIPT_BLOCKED and states the script is quarantined pending review before testnet/mainnet execution

Decision:

- keep the file for audit/review
- do not execute it
- do not delete it in this step
- do not treat it as part of the approved Stage G dry-run path

## Artifact Classification — deploy/vault legacy scripts

Classification: Quarantined Artifact.

Files:

- scripts/deployJettonMaster.ts
- scripts/vaultDistribution.ts
- scripts/vaultDistribution_linkTest.ts

Evidence:

- contain Blueprint NetworkProvider entrypoints
- use provider.open(...)
- contain contract send(...) calls
- contain testnet/deploy/mint/distribution semantics
- run(provider) calls assertLegacyScriptBlocked() before the legacy live-send flow

Decision:

- keep the files for audit/review
- do not execute them
- do not delete them in this step
- do not treat them as part of the approved Stage G dry-run path

## Artifact Classification — scripts/batchStatusUpdate.ts

Classification: Quarantined Artifact.

Evidence:

- contains Blueprint NetworkProvider usage
- reads sender sequence/state through getSeqno() and provider.provider(...).getState()
- contains master.send(...) live-capable path
- uses provider.open(...)
- run(provider) calls assertLegacyScriptBlocked() before the legacy live-send flow

Decision:

- keep the file for audit/review
- do not execute it
- do not delete it in this step
- do not treat it as part of the approved Stage G dry-run path

## Reachability Evidence — Stage Aggregators

Current stage aggregator scan found no approved Stage F/G/H aggregator path invoking:

- scripts/bulkMint.ts
- scripts/deployJettonMaster.ts
- scripts/vaultDistribution.ts
- scripts/vaultDistribution_linkTest.ts
- scripts/batchStatusUpdate.ts
- legacy/deployAndMint.ts

Observed approved or guarded aggregator references:

- launchStageA is referenced by Stage B gate smokes
- updateMetadata is referenced by the Stage B update-metadata gate smoke
- stage-h-full invokes only the H-1 quarantine smoke

Classification impact:

- legacy live-capable artifacts remain Quarantined Artifacts, not deletion candidates
- launchStageA remains the approved dry-run composition path
- updateMetadata remains a Manually Reviewed Exception candidate

## Local Sensitive Artifact Surface

Local untracked or ignored-sensitive artifacts exist outside the tracked source tree.

Observed names-only categories:

- .env and .env backup files
- root *.state.json RunState artifacts
- reports/*.csv audit/report artifacts
- .tmp directory

Classification: Local Sensitive Artifact Surface requiring review.

Decision:

- do not read secret contents during H-1 inventory
- do not delete blindly
- do not commit local env/state/report artifacts
- classify retention, archival, or cleanup policy in a later explicit remediation step

## Local Sensitive Artifact Git Protection

Git ignore protection was verified for local sensitive artifact classes:

- .env
- .env.* backups
- root *.state.json RunState artifacts
- reports/*.csv audit/report artifacts
- .tmp local directory

Classification impact:

- local env/state/report/tmp artifacts are not tracked source artifacts
- they must not be committed
- they must not be read for content during H-1 inventory
- they must not be deleted blindly

## Artifact Classification — legacy/* and staggered broadcaster

Classification: Quarantined / Forbidden Live Path candidates requiring remediation review.

Unblocked legacy live-capable artifacts:

- legacy/deployAndMint.ts
- legacy/privacyProtocol.ts
- legacy/matchingEngine.ts

Evidence:

- legacy/deployAndMint.ts contains TonClient, hardcoded testnet endpoint/API-key handling, WALLET_MNEMONIC, mnemonicToPrivateKey, secretKey, deploy/mint flow, and no self-block was observed
- legacy/privacyProtocol.ts contains TonClient, testnet endpoint, WALLET_MNEMONIC, mnemonicToPrivateKey, secretKey, metadata/content mutation semantics, and no self-block was observed
- legacy/matchingEngine.ts contains provider.sender().send(...) and mutation/notification semantics, and no self-block was observed

Live-read legacy artifact:

- legacy/liquidityMonitor.ts: NetworkProvider/provider.open read surface; no send path observed in the scanned evidence

Execution-adjacent helper:

- lib/staggered-broadcaster.js: exposes staggeredBroadcast(tasks, handler, options), where handler is documented as sending one transaction

Decision:

- do not execute these files
- do not delete them in this step
- do not treat them as part of the approved Stage G dry-run path
- require explicit remediation review before any Stage I/Testnet work

## Artifact Classification — scripts/updateMetadata.ts

Classification: Manually Reviewed Exception with deterministic-artifact caveat.

Evidence:

- execution-adjacent composition/root surface
- uses DryRunExecutor synthetic broadcast only
- DRY_RUN=false is blocked after the real-execution gate because no live MintExecutor exists
- no signing, sending, or broadcasting is available in Phase 1
- hands off to dispatcher.dispatch(campaignConfig)

Caveat:

- DryRunExecutor synthetic txHash currently includes Date.now(), which is not suitable for deterministic replay artifacts
- this is not a network/broadcast risk, but it remains a deterministic-audit concern before any future live-capable path

Decision:

- keep as a reviewed exception candidate
- do not treat it as a legacy live-send artifact
- do not execute with DRY_RUN=false
- require deterministic synthetic txHash review before future execution-capable stages
