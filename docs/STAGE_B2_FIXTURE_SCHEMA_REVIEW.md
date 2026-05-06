# Stage B-2 Fixture Schema Review

## 1. Status

Design/review document only.

No code is approved by this document.
No fixture files are approved by this document.
No provider extractor is approved.
No live ingestion is approved.
No execution of any kind is approved.

This document defines the schema and workflow that future fixture files must
follow. Fixture content is reviewed separately, per provider, under the process
defined in `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md`.

## 2. Purpose

This document defines:

- the structure each fixture file must follow
- the metadata fields every fixture must carry
- how raw provider payloads are handled and stored
- what the expected neutral `RawProviderEvent` output looks like
- the fixture-first, extractor-later workflow: no extractor may be written
  before the fixture it covers is approved

A fixture is a reviewed, committed, static file. It is never a live connection,
a dynamically fetched payload, or a synthesized runtime object. All offline
tests operate against committed fixture files only.

## 3. Fixture Classes

Each fixture file must declare one of the following classes in its metadata.

`provider_raw_sample`
: A real, unmodified payload captured directly from a live provider stream.
  May require redaction before commit. Must be marked with redaction status.

`provider_redacted_sample`
: A real provider payload with sensitive fields removed or anonymized.
  The redaction must be documented. The payload shape is otherwise authentic.

`synthetic_provider_sample`
: A hand-crafted payload that mimics a provider's wire format without being
  captured from a live source. Must be explicitly marked synthetic. Useful for
  edge-case and rejection tests where real captures are impractical.

`neutral_raw_provider_event`
: A fixture representing the expected `RawProviderEvent` output after a
  provider-specific extractor maps a raw payload into the neutral shape.
  Used to verify extractor output without running the extractor live.

`normalized_event_expectation`
: A fixture representing the expected `NormalizedEvent` output after
  `filterAndNormalize` processes a `neutral_raw_provider_event`. Used to verify
  the filter pipeline deterministically against known inputs.

`rejection_expectation`
: A fixture representing an input expected to be rejected by `filterAndNormalize`,
  along with the expected `RejectionReasonCode`. Used to verify hard-reject paths.

## 4. Required Fixture Metadata

Every fixture file must include the following metadata fields. A fixture missing
any required field must not be approved.

| Field | Description |
|---|---|
| `fixtureId` | Unique identifier for this fixture. Stable across revisions. |
| `provider` | Provider name: e.g. `"tonapi"`, `"toncenter"`, `"liteclient"`, `"synthetic"`. |
| `fixtureClass` | One of the six classes defined in Section 3. |
| `captureSource` | How the payload was obtained: e.g. `"websocket_stream"`, `"sse_stream"`, `"api_poll"`, `"hand_crafted"`. |
| `captureDate` | ISO 8601 date of capture, or `"synthetic"` for hand-crafted fixtures. |
| `realOrSynthetic` | `"real"` or `"synthetic"`. Must match `fixtureClass`. |
| `redactionStatus` | `"none"` (not redacted), `"partial"` (some fields removed), `"full"` (payload fully anonymized). |
| `redactionNotes` | Description of what was redacted and why. `null` if `redactionStatus` is `"none"`. |
| `chain` | Chain identifier: e.g. `"ton_mainnet"`, `"ton_testnet"`. |
| `network` | `"mainnet"` or `"testnet"`. |
| `jettonMaster` | The Jetton Master address relevant to this fixture, in any valid TON address representation. |
| `expectedOutcome` | One of the values defined in Section 10. |
| `reviewStatus` | One of the values defined in Section 11. |

## 5. Sensitive Data Rules

Fixtures must not contain any of the following. A fixture containing any item
below must not be committed and must not be approved:

- Private keys or key material of any kind
- Mnemonics or seed phrases
- API keys or API secrets
- Bearer tokens or authorization headers
- Session cookies or authentication tokens
- Personal or identifying operator data
- Private infrastructure URLs, internal hostnames, or internal IP addresses
- Secrets embedded in query parameters, path segments, or HTTP headers

Any real provider payload that contains the above must be redacted before it is
committed. The redaction must be documented in `redactionNotes`.

## 6. Raw Provider Payload Rules

Raw provider payloads captured from live sources are stored in fixture files
for review and offline test purposes only. The following rules apply without
exception:

- Raw payload storage is for fixture review only. A committed raw payload is
  static data; it is never used as a live event source.
- Raw provider-specific fields must not enter `candidateId` construction.
  `candidateId` depends only on fields present in `NeutralEventPayload`.
- Raw provider-specific fields must not directly create candidate records.
  Candidate creation always goes through `filterAndNormalize` acting on a
  `NeutralEventPayload`.
- Raw provider-specific fields may only be mapped into `RawProviderEvent` by
  a provider-specific extractor, and that extractor may only be written after
  the fixture set covering that provider is approved.

## 7. Neutral `RawProviderEvent` Expectation

For fixture classes `neutral_raw_provider_event` and `normalized_event_expectation`,
the fixture may include the expected neutral output. The expected output covers
the following fields exactly, matching the `NeutralEventPayload` shape in
`lib/watcher/ingestionTypes.ts`:

- `provider` — provider identifier string
- `receivedAt` — ISO 8601 wall-clock time
- `payload.eventType` — must be `"jetton_transfer"` to pass the filter
- `payload.sourceAddress` — nullable; absent source is not a rejection
- `payload.destinationAddress` — required non-empty string
- `payload.jettonMaster` — required non-empty string
- `payload.amount` — raw decimal string; validated to `/^\d+$/` and positive
- `payload.txHash` — required non-empty string; absent is a hard reject
- `payload.traceId` — nullable
- `payload.actionIndex` — nullable non-negative integer
- `payload.messageHash` — nullable
- `payload.lt` — required non-negative decimal integer string
- `payload.eventTimestamp` — nullable; invalid values become null, not a reject
- `payload.finality` — must be `"confirmed"` or `"finalized"`

No additional fields beyond these are part of the neutral contract.

## 8. Advisory Profiling Metadata

Profiling data may appear in fixture files as optional, read-only metadata for
review context. It is advisory only and must never influence candidate promotion,
targets generation, or execution decisions.

Allowed nullable advisory fields in fixture metadata:

| Field | Description |
|---|---|
| `accountStatus` | On-chain account status at time of capture: e.g. `"active"`, `"uninit"`. |
| `codeHash` | SHA-256 of deployed contract code, for wallet type identification. |
| `walletTypeHint` | Heuristic wallet classification: e.g. `"v4"`, `"w5"`. Hint only. |
| `entityLabel` | Known entity label from a static registry: e.g. `"exchange_hot_wallet"`. Hint only. |
| `classificationConfidence` | Optional confidence descriptor: e.g. `"high"`, `"low"`. Advisory only. |
| `classificationSource` | Source of the classification: e.g. `"local_registry"`, `"code_hash_lookup"`. |

The following rules apply to all profiling metadata without exception:

- Profiling must not trigger execution of any kind.
- Profiling must not promote candidates to targets.
- Profiling must not write to any targets file.
- Profiling must not mutate campaign metadata.
- Profiling must not fund operators or move balances.
- Profiling must not rank or prioritize recipients by wallet wealth or balance.

## 9. Economic Noise Suppression Metadata

Amount thresholds and signal-quality indicators may appear in fixture metadata
as noise-suppression review context only. They document why a fixture represents
a dust, low-signal, or spam event. They are never used for targeting decisions.

Allowed concepts in fixture metadata:

| Concept | Permitted use |
|---|---|
| `dustThreshold` | Documents the minimum amount considered non-dust for review purposes. |
| `minimumEventAmount` | Documents a fixture's relevance floor for offline test design. |
| `lowSignalRejectionExpectation` | Describes why a fixture is expected to be filtered as noise. |
| `noiseSuppressionRationale` | Human-readable explanation for why a fixture represents spam or noise. |

The following are unconditionally forbidden in fixture metadata and in any
system behavior derived from fixture review:

- High-value target scoring or prioritization
- Wallet wealth ranking of any kind
- Balance-based targeting or filtering
- Preferential treatment of high-balance wallets
- Amount entropy analysis intended to mask behavior
- Behavior masking of any kind

## 10. Expected Outcomes

Every fixture must declare one `expectedOutcome` value from the following list.
The value documents what `filterAndNormalize` is expected to return when
processing the fixture.

`expectedOutcome` is a fixture-level label. Rejection labels must map directly to the code-level `RejectionReasonCode` returned by `filterAndNormalize`.

| Value | Code-level outcome | Meaning |
|---|---|---|
| `normalize_pass` | `pass: true` | Fixture is expected to produce a valid `NormalizedEvent`. |
| `reject_unknown_event_shape` | `UNKNOWN_EVENT_SHAPE` | Payload does not conform to `NeutralEventPayload` shape. |
| `reject_unsupported_event_type` | `UNSUPPORTED_EVENT_TYPE` | `eventType` is not `"jetton_transfer"`. |
| `reject_invalid_address` | `INVALID_ADDRESS` | Any present address field fails `Address.parse`. |
| `reject_missing_destination` | `MISSING_DESTINATION` | `destinationAddress` is absent or empty. |
| `reject_master_mismatch` | `MASTER_MISMATCH` | Jetton Master canonical key does not match configured key. |
| `reject_missing_tx_hash` | `MISSING_TX_HASH` | `txHash` is absent or empty. |
| `reject_missing_lt` | `MISSING_LT` | `lt` is absent or not a non-negative decimal integer string. |
| `reject_amount_non_integer` | `AMOUNT_NON_INTEGER` | `amount` does not match `/^\d+$/`. |
| `reject_amount_non_positive` | `AMOUNT_NON_POSITIVE` | `amount` parses to zero or negative. |
| `reject_finality_invalid` | `FINALITY_INVALID` | `finality` is not `"confirmed"` or `"finalized"`. |

## 11. Review Statuses

Every fixture must carry one `reviewStatus` value from the following list.
Only fixtures with `reviewStatus: "approved_for_extractor_design"` may be
referenced when writing a provider extractor.

| Value | Meaning |
|---|---|
| `draft` | Fixture is under construction. Not reviewed. Must not be used in tests. |
| `needs_redaction` | Fixture contains sensitive data that must be removed before review can proceed. |
| `approved_for_extractor_design` | Fixture has been reviewed, is free of sensitive data, and may be used as a reference when designing the corresponding extractor. |
| `rejected` | Fixture was reviewed and rejected: wrong shape, unresolvable redaction issue, or policy violation. Must not be used. |

## 12. Forbidden Behaviors

The following are forbidden at this stage and must remain forbidden in any
system behavior derived from fixture review:

- No live provider client of any kind
- No WebSocket client
- No SSE client
- No API polling loop
- No LiteServer polling
- No Dispatcher calls
- No RunState reads or writes
- No targets file writes
- No metadata mutation
- No funding logic
- No signing, sending, or broadcasting
- No candidate-to-target promotion
- No synthetic traffic injection
- No random timing
- No behavior masking

## 13. Approval Rule

This schema review does not approve any fixture content. Three separate
approvals are required before a provider extractor may be written and merged:

1. **Fixture schema approval** (this document): locks the structure, metadata
   fields, and workflow. Does not approve any fixture file.
2. **Fixture content approval**: each real provider fixture set is reviewed
   separately. Fixtures must carry `reviewStatus: "approved_for_extractor_design"`
   before the extractor that covers them may be written.
3. **Extractor implementation approval**: the extractor is reviewed separately,
   after fixture approval, against the constraints in
   `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` Section 6.

No two of these steps may be combined into a single review.
