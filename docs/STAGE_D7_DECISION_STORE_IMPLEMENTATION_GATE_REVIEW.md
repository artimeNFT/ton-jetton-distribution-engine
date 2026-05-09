# STAGE_D7_DECISION_STORE_IMPLEMENTATION_GATE_REVIEW

## 1. Status

Stage D-7 is docs-only.

No decision store implementation is approved here.

No persistence implementation is approved here.

No file writing implementation is approved here.

No lock implementation is approved here.

No recovery implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is in scope.

---

## 2. Future D-8 Minimum Implementation Scope

A future D-8 implementation may introduce only a minimal Decision Store module.

Allowed D-8 scope:

- write adapter for CandidateDecisionRecord
- validation-before-write using D-4 validator
- append-only JSONL record append
- deterministic path resolution
- duplicate detection by decisionId
- identical duplicate no-op behavior
- conflicting duplicate fail-closed behavior
- recovery scan helper
- offline smoke tests only

D-8 must not introduce decision engine rules, target builder behavior, Dispatcher integration, RunState mutation, signing, sending, broadcasting, or execution.

---

## 3. Validation-Before-Write Gate

A future Decision Store must never write an unvalidated record.

Required order:

1. receive CandidateDecisionRecord
2. validate record shape and integrity
3. verify full snapshot presence
4. verify decisionId consistency
5. check duplicate state
6. append atomically only if all checks pass

If validation fails, the store must return a typed failure and write nothing.

Throwing is not the primary control path.

---

## 4. Atomic Append and Duplicate Gate

A future append must be atomic at record level.

Required duplicate behavior:

- same decisionId + identical content => return existing/duplicate-ok result
- same decisionId + different content => fail closed
- new decisionId + valid record => append complete JSONL line
- partial write risk => fail closed
- malformed committed line during recovery => fail closed

No mutation, overwrite, delete, or compaction is approved.

---

## 5. Required D-8 Smokes

A future D-8 implementation must include offline smokes for:

- valid record append
- validation failure writes nothing
- identical duplicate returns duplicate-ok
- conflicting duplicate fails closed
- recovery rebuilds index from JSONL
- malformed line recovery fails closed
- truncated line recovery fails closed
- path traversal rejection
- no Dispatcher, RunState, targets, signing, sending, broadcasting, or execution imports

---

## 6. Explicit Non-Scope for D-8

D-8 must not implement:

- decision engine rules
- candidate selection policy
- budget allocation engine
- target builder
- targets generation
- adapter into existing distribution scripts
- Dispatcher invocation
- RunState mutation
- audit CSV writer integration
- live provider calls
- cursor advancement
- signing
- sending
- broadcasting
- execution

The Decision Store is evidence persistence only.

---

## 7. Final Rule

Stage D-7 approves Decision Store implementation gate review only.

No decision store implementation is approved here.

No persistence implementation is approved here.

No file writing implementation is approved here.

No lock implementation is approved here.

No recovery implementation is approved here.

No adapter implementation is approved here.

No target builder implementation is approved here.

No targets generation is approved here.

No Dispatcher invocation is approved here.

No RunState mutation is approved here.

No signing, sending, broadcasting, or execution is approved here.

The next step requires explicit approval.
