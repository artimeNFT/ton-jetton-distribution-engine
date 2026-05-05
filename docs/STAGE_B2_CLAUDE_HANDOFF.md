# Stage B-2 Claude Handoff

## Status

Implementation guidance only.

Do not write ingestion code until this handoff and STAGE_B2_INGESTION_LOCK.md are approved as the active implementation boundary.

## Required source documents

Claude must follow:

- docs/STAGE_B2_INGESTION_LOCK.md
- docs/WATCHER_ARCHITECTURE.md
- docs/COMMANDER_CONTROL_PLANE_REVIEW.md
- docs/STAGE_B_WATCHER_DESIGN.md

If these documents conflict, the stricter safety boundary wins.

## Implementation scope

Allowed future work:

- read-only provider ingestion skeleton
- event normalization types
- deterministic filtering logic
- candidate record type definitions
- candidate event type definitions
- dedupe interface design
- provider health reporting
- Commander state read/check interface

Not allowed:

- Dispatcher execution trigger
- targets.json generation
- RunState mutation
- metadata mutation
- funding logic
- signing
- sending
- broadcasting
- testnet execution
- mainnet execution

## Hard stop conditions

Claude must stop and request review if implementation requires:

- changing Dispatcher behavior
- changing RunState schema
- writing to targets files
- adding execution side effects
- adding random timing
- adding synthetic traffic
- adding funding movement
- adding metadata mutation
- reading private keys or mnemonics
- touching live-chain APIs for broadcast

When unsure, Claude must prefer a docs-only proposal over code.
