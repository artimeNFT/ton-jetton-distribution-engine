# STAGE_D6_DECISION_STORE_SCHEMA_PATH_CONTRACT_REVIEW

## 1. Status

Stage D-6 is docs-only.

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

## 2. Store Path Contract

A future Decision Store path must be explicit and deterministic.

Recommended logical path:

- data/decision-store/decisions.jsonl

The path must not be derived from untrusted input.

The path must not include:

- private keys
- operator labels
- wallet addresses as directories
- provider API keys
- environment dumps
- user-provided relative path traversal

A future implementation must reject paths containing:

- ..
- absolute paths unless explicitly approved
- shell metacharacters
- empty path segments

---

## 3. Storage Format Contract

The recommended future storage format is JSONL.

Each line must contain exactly one complete CandidateDecisionRecord.

JSONL is preferred over a single mutable JSON array because append-only behavior is easier to enforce and recover.

A record line must be:

- valid JSON
- single-line only
- complete CandidateDecisionRecord
- newline-terminated
- independently parseable

The store must not persist partial objects.

---

## 4. Atomic Write Contract

A future append must be atomic at the record level.

Required future behavior:

- serialize complete CandidateDecisionRecord
- validate serialized JSON
- write through a temporary path or append-safe mechanism
- fsync or equivalent durability step if available
- commit only complete newline-terminated record
- fail closed on partial write risk

A failed write must not leave a visible committed record.

A partially written record must be detected by recovery and treated as malformed.

---

## 5. Lock Behavior Contract

A future Decision Store must define write-lock behavior before implementation.

Required lock rules:

- one writer at a time
- no concurrent append without lock
- stale lock detection
- explicit lock owner metadata
- fail closed if lock cannot be acquired
- fail closed if lock state is ambiguous

The lock must protect only decision-store writes.

It must not authorize targets, Dispatcher, RunState, signing, sending, broadcasting, or execution.

---

## 6. Duplicate Index Strategy

A future Decision Store must build an index by decisionId.

Index source of truth:

- persisted CandidateDecisionRecord lines only

Index must detect:

- first occurrence of decisionId
- identical duplicate record
- conflicting duplicate record
- malformed record
- truncated record

Identical duplicates may be counted and ignored.

Conflicting duplicates must fail closed.

The index must not be the source of truth.

---

## 7. Recovery Scan Contract

Future recovery must scan the JSONL store from the beginning.

Recovery must reconstruct:

- valid record count
- unique decisionId count
- identical duplicate count
- conflicting duplicate count
- malformed line count
- truncated line count
- latest decisionRunId observed

Recovery must fail closed if:

- any conflicting duplicate exists
- any truncated committed line exists
- required D-4 fields are missing
- record validation fails

---

## 8. Required Future Smokes Before Implementation

Before Decision Store implementation is approved, define smokes for:

- path traversal rejection
- JSONL one-record-per-line behavior
- malformed line recovery fail-closed
- truncated line recovery fail-closed
- identical duplicate handling
- conflicting duplicate fail-closed
- lock acquisition failure fail-closed
- atomic write no-partial-record guarantee
- recovery index rebuilt from persisted records only

---

## 9. Final Rule

Stage D-6 approves Decision Store schema and path contract review only.

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
