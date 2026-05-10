# STAGE_D8_DECISION_STORE_FREEZE_REVIEW

## 1. Status

Stage D-8 is implemented and frozen as a dry-run Decision Store hardening stage.

Stage D-8 is evidence persistence infrastructure only.

No Dispatcher integration is approved here.

No RunState mutation is approved here.

No targets generation is approved here.

No signing, sending, broadcasting, or execution is in scope.

No live-chain behavior is approved here.

---

## 2. Implemented D-8 Scope

Stage D-8 introduced a minimal Decision Store foundation for CandidateDecisionRecord persistence and recovery.

Implemented scope:

- deterministic JSONL serialization
- record validation before append planning
- duplicate classification
- in-memory index construction
- append preflight
- path preflight
- append plan builder
- append writer shell
- recovery parser
- recovery file reader
- writer/reader/parser roundtrip smoke
- lock pure contract
- lock file reader/writer shell
- lock acquire/release shell
- adversarial fault-injection smoke

The implementation remains dry-run infrastructure only.

---

## 3. Validation and Recovery Guarantees

Stage D-8 validates persisted decision records before append planning.

Recovery is fail-closed.

Locked behavior:

- valid JSONL records rebuild a recovered in-memory index
- blank JSONL lines are ignored
- invalid JSON fails closed
- partial/truncated JSONL lines fail closed
- validation failures fail closed
- conflicting duplicate snapshots fail closed
- recovery reports the physical lineNumber for malformed or conflicting lines
- roundtrip smoke proves recovered records deep-equal original records

Recovery does not mutate files.

Recovery does not repair files.

Recovery does not infer missing content.

---

## 4. Append and Writer Guarantees

Stage D-8 append behavior is plan-driven.

Locked behavior:

- non-proceed plans are rejected by the writer shell
- hard-fail plans are rejected by the writer shell
- rejected plans do not create a decision file
- approved proceed_append plans append serialized JSONL lines
- two approved proceed_append plans preserve deterministic line order
- append/recovery roundtrip preserves the full CandidateDecisionRecord

Stage D-8 does not claim full production-grade atomic append durability.

Future durability work must explicitly address partial append risk, fsync policy, and crash behavior.

---

## 5. Lock Guarantees

Stage D-8 introduced lock infrastructure in isolated layers.

Locked behavior:

- lock records are validated by a pure contract
- empty lockId fails validation
- empty ownerId fails validation
- invalid lock timestamps fail validation
- no existing lock allows shell acquisition
- active lock blocks shell acquisition
- stale lock allows shell overwrite at shell level
- corrupt lock file fails closed
- missing lock file is distinct from unreadable lock file
- owner mismatch blocks release
- ownerId hijack with the same lockId fails closed
- lockId hijack is observable by readback

Stage D-8 does not claim production-grade atomic acquire.

Stage D-8 does not enforce lock ownership before append.

---

## 6. Explicit Non-Scope

Stage D-8 does not implement:

- production-grade atomic acquire
- pre-append ownership verification
- lock enforcement around append writer
- lock release/delete file behavior
- Dispatcher integration
- RunState mutation
- target builder integration
- targets generation
- live provider calls
- private key access
- signing
- sending
- broadcasting
- execution

The Decision Store remains evidence persistence infrastructure only.

---

## 7. Required Smokes

Stage D-8 is protected by:

- scripts/stage-d8-full-smoke.sh
- scripts/stage-b-full-check.sh

The D-8 smoke aggregator is called from the Stage B full check.

The current D-8 smoke set covers:

- serialization
- record validation
- duplicate classification
- in-memory index construction
- append preflight
- path preflight
- append plan
- append writer
- recovery parser
- recovery file reader
- append/recovery roundtrip
- lock contract
- lock file shell
- lock acquire/release shell
- adversarial fault injection

---

## 8. Deferred Work

The following items are intentionally deferred:

- atomic acquire production protocol
- pre-append ownership check
- append durability hardening
- fsync policy
- lock release/delete semantics
- gas-aware decision snapshot
- passive heartbeat
- blacklist integrity gate
- recovery scaling, file rotation, and index snapshots

These items must be addressed in later stages before any real execution path is considered.

---

## 9. Final Rule

Stage D-8 is frozen as dry-run Decision Store infrastructure.

It approves only the implemented Decision Store persistence, recovery, lock-shell, and smoke-test boundaries described in this document.

It does not approve Dispatcher integration.

It does not approve RunState mutation.

It does not approve targets generation.

It does not approve signing, sending, broadcasting, or execution.

The next stage must preserve the D-8 fail-closed invariants.
