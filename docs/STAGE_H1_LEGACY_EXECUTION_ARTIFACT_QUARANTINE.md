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
