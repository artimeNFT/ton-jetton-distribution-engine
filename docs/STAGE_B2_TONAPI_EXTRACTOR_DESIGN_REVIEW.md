# STAGE_B2_TONAPI_EXTRACTOR_DESIGN_REVIEW

## 1. Status

- Design/review document only.
- No extractor implementation.
- No TonAPI client.
- No live ingestion.
- No WebSocket, API, or polling.
- No Dispatcher.
- No RunState.
- No targets.
- No execution.

---

## 2. Required Source Documents

- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md`
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md`
- `docs/STAGE_B2_TONAPI_FIXTURE_REVIEW.md`
- `docs/STAGE_B2_TONAPI_FIXTURE_INTAKE.md`
- `docs/STAGE_B2_TONAPI_SYNTHETIC_FIXTURE_001_REVIEW.md`
- `docs/STAGE_B2_TONAPI_SYNTHETIC_MISSING_TXHASH_001_REVIEW.md`
- `docs/stage-b2-ingestion-completion.md`

If any of these documents conflict, the stricter safety boundary wins.

---

## 3. Design Decision

| Field | Value |
|---|---|
| reviewStatus | `approved_for_future_offline_extractor_implementation` |
| scope | fixture-input-only pure mapper |
| input | already-loaded TonAPI-shaped JSON object |
| output | `RawProviderEvent` |
| network | none |
| filesystem writes | none |
| candidate writes | none |
| RunState writes | none |
| target writes | none |
| Dispatcher calls | none |
| execution | none |

This approval is for future implementation of an offline pure extractor only. It is not approval for a TonAPI client, live ingestion, or any form of provider connectivity.

---

## 4. Causality-First Extraction Requirements

Each `actions[i]` item in the TonAPI-shaped payload must be treated as a distinct candidate event if it is a `JettonTransfer` action. Actions must not be merged, collapsed, or reordered.

Required causality fields to preserve per action:

| Field | Role |
|---|---|
| `traceId` | Links the transfer to the broader TON trace. |
| `txHash` | Identifies the base transaction. |
| `lt` | Provides blockchain logical ordering. |
| `actionIndex` | Disambiguates multiple actions within the same trace. |
| `messageHash` | Auxiliary identifier; may be null. |
| `eventTimestamp` | Provider-observed event time. |
| `finality` | Provider finality state; must be preserved as-is. |

- No synthetic identifiers.
- No fallback txHash.
- No fallback from `trace_id`, `event_id`, or `message_hash` into `txHash`.
- No action collapsing.
- No random IDs.
- No generated txHash.
- No inferred `lt`.
- No inferred `actionIndex`.
- No execution implication.

---

## 5. Field Mapping Table

| RawProviderEvent field | Source in TonAPI-shaped input |
|---|---|
| `provider` | Hard-coded `"tonapi"` |
| `receivedAt` | Extractor input `receivedAt` argument |
| `payload.eventType` | `"jetton_transfer"` when action type is `JettonTransfer` |
| `payload.sourceAddress` | `action.JettonTransfer.sender.address`, or `null` when sender is null or absent |
| `payload.destinationAddress` | `action.JettonTransfer.recipient.address` |
| `payload.jettonMaster` | `action.JettonTransfer.jetton.address` |
| `payload.amount` | `action.JettonTransfer.amount` |
| `payload.txHash` | `action.base_transactions[0].hash` |
| `payload.traceId` | `action.trace_id` |
| `payload.actionIndex` | `action.action_index` |
| `payload.messageHash` | `action.message_hash`, or `null` if absent |
| `payload.lt` | `action.base_transactions[0].lt` |
| `payload.eventTimestamp` | `action.base_transactions[0].utime` converted to ISO 8601, or event-level `timestamp` converted to ISO 8601 if `utime` is absent |
| `payload.finality` | Explicit provider finality field if present; otherwise fixture/configured offline default only when explicitly reviewed. Do not infer finality from `action.status = "ok"`. |

**Finality rule:** `action.status = "ok"` may indicate action success only. It must not be used as a substitute for provider finality.

---

## 6. txHash Extraction Rule

**Hard rule:** `txHash` must come only from `action.base_transactions[0].hash`.

- Do not use `trace_id` as `txHash`.
- Do not use `event_id` as `txHash`.
- Do not use `message_hash` as `txHash`.
- Do not hash the payload to invent a `txHash`.
- Do not use `action_index` as `txHash`.
- Do not fallback to any other field.

If `base_transactions[0].hash` is missing, null, empty, or non-string, the future RawProviderEvent must carry `txHash: ""` or fail extraction according to the implementation review. Normalization must then reject it with reason `MISSING_TX_HASH`. There is no recovery path from a missing `txHash`.

---

## 7. lt Extraction Rule

**Hard rule:** `lt` must come from `action.base_transactions[0].lt`.

- `lt` must be preserved as a decimal string.
- Do not convert `lt` to a JavaScript number.
- Do not infer `lt` from timestamp.
- Do not fallback to `action_index` or trace data.
- A missing or invalid `lt` must map to normalization rejection `MISSING_LT`.

---

## 8. actionIndex Extraction Rule

**Hard rule:** `actionIndex` must come from `action.action_index`.

- `0` is a valid `actionIndex`. Do not apply truthy checks that treat `0` as missing.
- If `action_index` is absent, the implementation review must decide whether to reject extraction or encode a null/degraded value. It must not invent a value.
- `actionIndex` is required for disambiguating multiple `JettonTransfer` actions within the same trace. Omitting or guessing it breaks candidate identity.

---

## 9. traceId Handling

- `traceId` must come from `action.trace_id`.
- It links the event to the broader TON trace.
- If missing, do not invent it.
- A missing `traceId` must be treated as causality degraded.
- `traceId` in RawProviderEvent may be null only if the RawProviderEvent type explicitly permits it; otherwise the future implementation review must define a pre-extraction rejection path before implementation proceeds.
- A missing `traceId` must never be substituted into `txHash`.

---

## 10. messageHash Handling

- `messageHash` comes from `action.message_hash`.
- It may be null. Null `messageHash` is allowed.
- It is auxiliary and must not replace `txHash` under any circumstance.

---

## 11. Null and Missing-Field Handling

| Condition | Handling |
|---|---|
| `sender` is null | `sourceAddress: null`; allowed |
| `message_hash` is null | `messageHash: null`; allowed |
| `txHash` is null or empty | Normalization rejects: `MISSING_TX_HASH` |
| `lt` is null or invalid | Normalization rejects: `MISSING_LT` |
| `action_index` is `0` | Valid; must not be treated as missing |
| `action_index` is absent | No synthetic value; implementation review required |
| `trace_id` is missing | Causality degraded; no synthetic value |
| `recipient` is missing | Normalization rejects: `MISSING_DESTINATION` |
| `jetton.address` does not match canonical master | Normalization rejects: `MASTER_MISMATCH` |
| `amount` is non-integer string | Normalization rejects: `AMOUNT_NON_INTEGER` |
| `amount` is zero | Normalization rejects: `AMOUNT_NON_POSITIVE` |
| Action type is not `JettonTransfer` | Ignored or rejected per fixture schema; no Jetton transfer RawProviderEvent emitted |
| `action.status = "ok"` | Indicates action success only; must not be used as a substitute for provider finality |

---

## 12. Multi-Action Handling

- Iterate over `actions[]` in input order.
- Emit at most one `RawProviderEvent` per `JettonTransfer` action.
- Do not merge multiple `JettonTransfer` actions.
- Do not collapse multiple actions that share the same `traceId`.
- Candidate identity downstream relies on `txHash`, `lt`, `actionIndex`, `jettonMaster`, `destinationAddress`, and `amount` per existing `candidateId` logic.
- Output order must be deterministic and must follow input action order.

---

## 13. Profiling Metadata Boundary

`walletTypeHint` and related profiling values are optional advisory metadata only.

- Profiling may come from provider account metadata, code hash, interface hints, or fixture `profilingMetadata`.
- Profiling must not be included in the core `RawProviderEvent` unless a future type review explicitly adds it.
- Profiling must not affect normalization pass/fail.
- Profiling must not affect `candidateId`.
- Profiling must not trigger execution.
- Profiling must not promote candidates.
- Profiling must not generate targets.
- Profiling must not write RunState.
- Profiling must not auto-include or auto-exclude users.
- Profiling must not change Dispatcher behavior.
- Profiling must not rank or target users by wealth.

---

## 14. Economic Noise Boundary

- The extractor must not perform economic targeting.
- The extractor must not rank high-value wallets.
- The extractor must not rank by wallet wealth.
- The extractor must not apply delivery optimization.
- The extractor must not perform behavior masking.
- The extractor must not perform provider evasion.
- Any dust or noise logic belongs to review-only validation or later explicitly reviewed filters, not to live extractor side effects.

---

## 15. Determinism Requirements

- No randomness.
- No calls to current time, except via an explicit `receivedAt` argument if a future implementation review approves it.
- No network.
- No filesystem writes.
- No mutable global state.
- Same input must produce same output.
- Output ordering must follow input ordering.

---

## 16. Forbidden Behaviors

The following are explicitly forbidden:

- TonAPI API client
- TonAPI WebSocket client
- TonAPI polling
- Authenticated TonAPI requests
- LiteServer client
- Provider retry loop
- Extractor fetching data
- Dispatcher calls
- RunState reads or writes
- Targets reads or writes
- Candidate-to-target promotion
- Candidate store writes
- Metadata mutation
- Funding logic
- Signer loading
- Signing
- Sending
- Broadcasting
- Testnet execution
- Mainnet execution
- Synthetic traffic
- Random timing
- Behavior masking

---

## 17. Future Implementation Gates

Future implementation must happen in a separate commit only after this design review is merged.

Future implementation must include:

- Pure extractor module only.
- Fixture-input-only tests.
- Happy-path fixture test covering `tonapi_synth_jetton_transfer_001`.
- Missing-txHash fixture test covering `tonapi_synth_missing_txhash_001`.
- No-network test assertion.
- Deterministic output test.
- Full-check integration in a separate subsequent commit.

No implementation, test, or CI change may be included in the same commit as this design review document.

---

## 18. Final Rule

- This document approves only future design-aligned offline extractor implementation.
- It does not approve live TonAPI ingestion.
- It does not approve any provider client.
- It does not approve Dispatcher integration.
- It does not approve candidate promotion.
- It does not approve targets generation.
- It does not approve execution.