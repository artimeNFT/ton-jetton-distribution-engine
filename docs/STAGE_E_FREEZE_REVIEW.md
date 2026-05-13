# STAGE_E_FREEZE_REVIEW

## 1. Status

Stage E is implemented and frozen as a dry-run DecisionStore integrity, lock ownership, atomic acquire, fault-injection, and heartbeat coexistence boundary.

Stage E approves local deterministic validation and file-shell boundary checks only.

No Dispatcher integration is approved here.

No RunState integration is approved here.

No live execution is approved here.

No signing, broadcasting, provider access, or blockchain execution is approved here.

No production mainnet readiness is implied by this freeze.

---

## 2. Implemented Stage E Scope

Implemented scope:

- E-1 Decision Store ownership check contract
- E-2 append writer ownership enforcement boundary
- E-3 atomic acquire protocol contract
- E-4 atomic acquire file shell / compare-and-write boundary
- E-5 lock fault injection and hijack resistance smoke
- E-6 DecisionStore / Heartbeat coexistence smoke
- Stage E smoke aggregation through `scripts/stage-e-full-smoke.sh`
- Stage B full check integration through `scripts/stage-b-full-check.sh`

Stage E remains dry-run integrity infrastructure.

---

## 3. E-1 Decision Store Ownership Check Contract

Implemented file:

- `lib/watcher/decisionStoreOwnership.ts`

Smoke:

- `scripts/e-1-decision-store-ownership-check-contract-smoke.ts`

Locked behavior:

- ownership validation is pure and deterministic
- ownership requires an existing valid lock
- expected ownerId must be a non-empty string
- expected lockId must be a non-empty string
- nowMs must be a safe non-negative integer
- existing lock must pass lock validation
- ownerId mismatch fails closed
- lockId mismatch fails closed
- expired lock fails closed
- invalid lock record fails closed with lockReason where applicable

Non-scope:

- no filesystem I/O
- no append operation
- no lock acquisition
- no lock release
- no Dispatcher integration
- no RunState integration

---

## 4. E-2 Append Writer Lock Enforcement

Implemented file:

- `lib/watcher/decisionStoreWriter.ts`

Smoke:

- `scripts/e-2-decision-store-append-writer-lock-enforcement-smoke.ts`

Locked behavior:

- legacy `appendApprovedDecisionStorePlan(...)` remains available for D-8 compatibility
- new `appendApprovedDecisionStorePlanWithOwnership(...)` enforces ownership before write
- append is allowed only for an approved `proceed_append` plan
- ownership is checked immediately before mkdir/appendFile
- missing lock fails closed
- wrong ownerId fails closed
- wrong lockId fails closed
- expired lock fails closed
- invalid lock fails closed
- rejected ownership paths do not create or mutate the target file

Non-scope:

- no Dispatcher callsite migration
- no RunState integration
- no production lock lifecycle orchestration

---

## 5. E-3 Atomic Acquire Contract / Protocol

Implemented file:

- `lib/watcher/decisionStoreAtomicAcquire.ts`

Smoke:

- `scripts/e-3-decision-store-atomic-acquire-contract-smoke.ts`

Locked behavior:

- contract is pure and deterministic
- no existing lock permits `create_if_missing`
- active existing lock rejects with `active_lock`
- stale existing lock permits `replace_if_matches_existing_stale_lock`
- stale takeover plan includes exact `expectedExistingLock` compare precondition
- requested lock acquired in the future fails closed
- requested lock already expired fails closed
- invalid requested lock fails closed
- invalid existing lock fails closed
- invalid input and invalid nowMs fail closed

Important limitation:

- E-3 is protocol only; it does not perform filesystem compare-and-swap.

---

## 6. E-4 Atomic Acquire File Shell / Compare-and-Write Boundary

Implemented file:

- `lib/watcher/decisionStoreAtomicAcquireFile.ts`

Smoke:

- `scripts/e-4-decision-store-atomic-acquire-file-shell-smoke.ts`

Locked behavior:

- create-if-missing uses exclusive file creation via `writeFile(..., { flag: "wx" })`
- active lock fails closed
- stale lock is replaced only after re-read and exact comparison to `expectedExistingLock`
- stale takeover writes through temp path and rename
- corrupt lock fails closed
- invalid lock shape fails closed
- invalid path/input fails closed
- plan rejections are mapped to `plan_*` reasons
- successful stale takeover leaves no temp file behind

Important limitation:

- E-4 is a compare-and-write file shell boundary. It does not claim universal production-grade filesystem CAS across all filesystems or deployment environments.

---

## 7. E-5 Lock Fault Injection / Hijack Resistance

Smoke:

- `scripts/e-5-decision-store-lock-fault-injection-hijack-resistance-smoke.ts`

Locked behavior verified:

- ownerId hijack against active lock is rejected
- lockId hijack against active lock is rejected
- corrupt lock file fails closed without mutation
- invalid lock shape fails closed without mutation
- stale takeover succeeds and replaces exactly the stale lock
- re-acquire of already active requested lock is rejected
- create conflict / pre-created active lock does not overwrite existing content
- invalid requested lock does not create a file
- invalid nowMs does not create a file
- no temp file remains after successful stale takeover

Known untested race:

- `stale_lock_changed` internal race requires a dedicated race injection hook and is intentionally not asserted in E-5.

---

## 8. E-6 DecisionStore / Heartbeat Coexistence Boundary

Smoke:

- `scripts/e-6-decision-store-heartbeat-coexistence-smoke.ts`

Existing heartbeat files used:

- `lib/watcher/passiveHeartbeat.ts`
- `lib/watcher/passiveHeartbeatWriter.ts`

Locked behavior verified:

- default heartbeat path is `data/heartbeat/heartbeats.jsonl`
- heartbeat path is separate from `data/decision-store/decisions.jsonl`
- heartbeat writer rejects DecisionStore path
- DecisionStore recovery failure does not block heartbeat write
- heartbeat path failure does not mutate DecisionStore
- heartbeat append does not create DecisionStore
- multiple heartbeat records remain valid JSONL and isolated from DecisionStore

Non-scope:

- no heartbeat scheduler
- no production health loop
- no Dispatcher health integration

---

## 9. Stage E Smoke Aggregation

Stage E is protected by:

- `scripts/stage-e-full-smoke.sh`

Stage E smoke aggregation covers:

- E-1 Decision Store ownership check contract
- E-2 Append Writer lock enforcement
- E-3 Atomic acquire contract
- E-4 Atomic acquire file shell
- E-5 Lock fault injection / hijack resistance
- E-6 DecisionStore / Heartbeat coexistence

Stage B full check invokes Stage E through:

- `scripts/stage-b-full-check.sh`

A Stage E change is not frozen unless:

- `scripts/stage-e-full-smoke.sh` passes locally
- `scripts/stage-b-full-check.sh` passes locally
- main is pushed
- GitHub Actions Stage B Full Check completes successfully on the same SHA

---

## 10. Explicit Non-Scope

Stage E does not approve or implement:

- Dispatcher integration
- RunState integration
- live blockchain execution
- signing
- broadcasting
- provider/network calls
- private key access
- production mainnet readiness
- target generation
- real operator execution loop
- production-grade distributed lock service
- universal filesystem CAS guarantee
- lock release/delete production lifecycle
- race hook for internal stale_lock_changed injection
- full administrative orchestration
- audit CSV integration for execution
- gas funding
- operator wallet funding flows
- dynamic dispatch delays
- amount entropy
- wallet code-hash classification

---

## 11. Final Rule

Stage E is frozen as dry-run DecisionStore integrity and lock-boundary infrastructure.

The stage proves that local ownership checks, append enforcement, atomic acquire protocol planning, compare-and-write shell behavior, fault-injection resistance, and heartbeat coexistence boundaries are implemented and covered by smoke tests.

This freeze does not approve live execution, Dispatcher integration, RunState mutation, signing, broadcasting, or mainnet readiness.

Any future integration must preserve all Stage E fail-closed invariants.
