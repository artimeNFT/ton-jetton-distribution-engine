# Real Execution Gate Implementation Plan

## Status

This document defines the implementation plan for adding a real-execution gate.

This plan does not approve live execution and does not add signing or broadcasting.

## Target file

Primary target:

- scripts/launchStageA.ts

Secondary target, later only if needed:

- scripts/updateMetadata.ts

## Insertion point

The gate should be evaluated in launchStageA.ts immediately after:

- CAMPAIGN_ID is resolved.
- DRY_RUN is parsed into isDryRun.

The gate must run before:

- fault injection parsing.
- path derivation.
- MintExecutor construction.
- WalletPool construction.
- Dispatcher construction.

## Gate function contract

Proposed helper name:

- validateRealExecutionGate

Inputs:

- campaignId: string
- isDryRun: boolean
- realExecutionEnabledRaw: string | undefined
- confirmRealChainExecutionRaw: string | undefined
- stageBFullCheckRequiredRaw: string | undefined

Behavior:

- If isDryRun is true, return without requiring real-execution env flags.
- If isDryRun is false, require REAL_EXECUTION_ENABLED=true.
- If isDryRun is false, require CONFIRM_REAL_CHAIN_EXECUTION to equal campaignId exactly.
- If isDryRun is false, require STAGE_B_FULL_CHECK_REQUIRED=true.
- If any required value is missing or mismatched, throw before any executor can be built.

Failure mode:

- fail closed.
- no signing.
- no sending.
- no broadcasting.
- no live executor construction.

## First implementation phase

Phase 1 should add only the gate validation structure.

It should not add a live executor.

It should not allow mainnet execution.

Expected behavior after Phase 1:

- DRY_RUN=true continues to work exactly as today.
- DRY_RUN=false without real-execution flags fails with a clear gate error.
- DRY_RUN=false with partial flags fails with a clear gate error.
- DRY_RUN=false with all flags valid may pass gate validation, but should still stop at the current live-executor-not-implemented blocker.

This preserves the current dry-run-only safety posture while making the future gate explicit.

## Required tests

The gate implementation should be tested without signing or broadcasting.

Required cases:

- DRY_RUN=true passes without real-execution env flags.
- DRY_RUN=false and missing REAL_EXECUTION_ENABLED fails.
- DRY_RUN=false and REAL_EXECUTION_ENABLED is not true fails.
- DRY_RUN=false and missing CONFIRM_REAL_CHAIN_EXECUTION fails.
- DRY_RUN=false and CONFIRM_REAL_CHAIN_EXECUTION does not equal campaignId fails.
- DRY_RUN=false and missing STAGE_B_FULL_CHECK_REQUIRED fails.
- DRY_RUN=false and STAGE_B_FULL_CHECK_REQUIRED is not true fails.
- DRY_RUN=false with all gate flags valid reaches the current live-executor-not-implemented blocker.

## Non-goals

This implementation phase must not add:

- live wallet signing.
- live TON broadcast.
- mainnet dispatch.
- production operator funding logic.
- automatic execution from DRY_RUN=false alone.

## Completion criteria

Phase 1 is complete only when:

- TypeScript compilation passes.
- Stage B full check passes.
- Gate tests or equivalent smoke checks cover all required cases.
- Repository status remains clean after validation.
