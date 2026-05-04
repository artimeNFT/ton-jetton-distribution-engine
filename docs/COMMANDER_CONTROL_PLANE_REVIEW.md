# Commander Control Plane Review

## Status

Design/review document only.

No Commander implementation exists in the tracked repository at this checkpoint.

This document does not approve live execution, signer loading, broadcast, testnet execution, or mainnet execution.

## Purpose

The Commander is the future control plane for operator-visible campaign control.

It must coordinate validation, safety state, dry-run orchestration, metadata mutation policy, and emergency-stop state.

It must not become an execution plane.

## Current repository checkpoint

- Current mode: dry-run only.
- Stage B full-check CI is enabled and passing on remote main.
- Stage B-0 watcher is an offline/read-only artifact validator.
- Stage B-1 is regression automation only.
- Real execution gate Phase 1 is guard-only.
- updateMetadata.ts is execution-adjacent and must be treated as a controlled surface.

## Non-negotiable boundary

The Commander must not directly:

- load signing wallets
- sign transactions
- send transactions
- broadcast transactions
- call provider.sender()
- call Blueprint send methods
- bypass Dispatcher/state machine invariants
- mutate RunState outside the approved state store path
- bypass stage-b-full-check
- trigger testnet or mainnet execution

Any future execution action must remain outside Commander until a separate live-executor design is approved.

## Allowed control-plane responsibilities

The Commander may coordinate and display:

- repository status checks
- stage-b-full-check execution status
- watcher report status
- current campaign identity
- current dry-run configuration
- operator-visible readiness checklist
- emergency-stop state
- quiet or lockdown state
- metadata mutation eligibility
- dry-run command preparation
- dry-run command execution only when explicitly requested

The Commander may call validation and reporting scripts.

The Commander may not silently escalate from validation to execution.

## Central emergency stop

The Commander must model emergency stop as a central safety state, not as a cosmetic UI flag.

When emergency stop is active, the system must block:

- dispatch
- retry
- operator rotation actions
- metadata mutation
- candidate promotion
- live executor construction
- signer loading
- signing
- sending
- broadcasting
- testnet execution
- mainnet execution

Emergency stop must be fail-closed.

If the Commander cannot determine whether emergency stop is active, it must behave as if emergency stop is active.

Emergency stop state must be operator-visible in every readiness summary.

## Metadata mutation synchronization

Metadata mutation must be synchronized with Commander safety state.

updateMetadata.ts is execution-adjacent because it wires state, wallet pool, reconciler, dispatcher, audit writer, and calls dispatcher.dispatch.

Therefore, updateMetadata.ts must not remain an independently operated mutation surface in any future live-capable system.

Before any metadata mutation is allowed, the Commander must verify:

- emergency stop is inactive
- lockdown mode is inactive
- quiet mode permits the requested operation
- stage-b-full-check has passed for the current commit
- watcher validation has severity info
- campaignId is explicit and matches all relevant artifacts
- metadata diff is visible to the operator
- dry-run preview has been produced
- operator confirmation is campaign-bound

If any check is missing, stale, ambiguous, or failing, metadata mutation must be blocked.

Metadata mutation must never be allowed as a side effect of a generic command.

## Implementation review gates

Before any Commander implementation is added, the following must be true:

- this control-plane review is approved
- WATCHER_ARCHITECTURE.md is locked or explicitly marked future-only
- stage-b-full-check passes locally
- Stage B Full Check passes in GitHub Actions
- updateMetadata.ts is classified as execution-adjacent
- legacy live-send scripts remain quarantined
- Commander commands are classified as read-only, dry-run, mutation-adjacent, or forbidden

Before any command can become mutation-capable, it requires:

- a separate design document
- explicit operator confirmation
- dry-run preview
- audit intent record
- rollback or recovery procedure
- dedicated tests
- CI coverage

Before any command can become live-execution-capable, it requires a separate live-executor design and is outside the scope of this review.
