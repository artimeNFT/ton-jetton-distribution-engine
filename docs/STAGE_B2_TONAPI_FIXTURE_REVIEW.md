# Stage B-2 TonAPI Fixture Review

## 1. Status

Design/review document only.

No TonAPI code is approved by this document.
No TonAPI API client is approved.
No TonAPI WebSocket client is approved.
No polling is approved.
No extractor is approved.
No live ingestion is approved.
No execution of any kind is approved.

This document defines the TonAPI fixture content review path. It does not
approve any fixture file, any extractor, or any live connection.

## 2. Purpose

This document defines:

- the TonAPI fixture content review path
- acceptable TonAPI sample classes and their constraints
- required metadata fields for every TonAPI fixture
- high-fidelity profiling metadata permitted for analysis context only
- the fixture-first, extractor-later workflow as it applies to TonAPI

No TonAPI extractor may be written until a TonAPI fixture set has been reviewed
and approved under the process defined here and in the referenced documents.

## 3. Current Baseline

This document operates within the boundaries established by:

- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` — provider fixture contract
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` — canonical fixture schema
- `docs/stage-b2-ingestion-completion.md` — B2 ingestion completion boundary

This document does not override any of the above. If this document conflicts
with any of the above, the stricter safety boundary wins.

## 4. Allowed TonAPI Fixture Sources

The following are permitted as static committed fixture sources only:

- TonAPI event sample payloads
- TonAPI trace and event action sample payloads
- TonAPI account state sample payloads for profiling context
- TonAPI Jetton transfer related sample payloads
- Redacted real TonAPI payloads with sensitive fields removed and documented
- Explicitly synthetic TonAPI-shaped payloads hand-crafted to mimic the wire format

All of the above are static, committed files. The following are explicitly
forbidden regardless of framing:

- No live TonAPI connection of any kind
- No API key usage
- No authenticated requests
- No WebSocket connection
- No polling loop
- No runtime payload fetch

## 5. Required TonAPI Fixture Metadata

Every TonAPI fixture file must include all of the following metadata fields.
A fixture missing any required field must not be approved.

| Field | Description |
|---|---|
| `fixtureId` | Unique identifier for this fixture. Stable across revisions. |
| `provider` | Must be `"tonapi"`. |
| `fixtureClass` | One of the six classes defined in `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 3. |
| `captureSource` | How the payload was obtained: e.g. `"websocket_stream"`, `"api_poll"`, `"hand_crafted"`. |
| `captureDate` | ISO 8601 date of capture, or `"synthetic"` for hand-crafted fixtures. |
| `realOrSynthetic` | `"real"` or `"synthetic"`. Must match `fixtureClass`. |
| `redactionStatus` | `"none"`, `"partial"`, or `"full"`. |
| `redactionNotes` | Description of redacted fields. `null` if `redactionStatus` is `"none"`. |
| `chain` | Chain identifier: e.g. `"ton_mainnet"`, `"ton_testnet"`. |
| `network` | `"mainnet"` or `"testnet"`. |
| `tonapiSourceKind` | TonAPI-specific stream or endpoint kind: e.g. `"websocket_events"`, `"rest_actions"`, `"rest_traces"`. |
| `tonapiEndpointOrStreamName` | The specific TonAPI endpoint or stream name the payload originates from. |
| `jettonMaster` | The Jetton Master address relevant to this fixture, in any valid TON address representation. |
| `expectedOutcome` | One of the values defined in `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 10. |
| `reviewStatus` | One of the values defined in `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 11. |

## 6. TonAPI Raw Payload Handling

The following rules apply to all raw TonAPI payloads without exception:

- Raw TonAPI payloads are stored in fixture files for fixture review and
  offline test purposes only. They are never used as live event sources.
- TonAPI-specific fields must not enter `candidateId` construction.
  `candidateId` depends only on fields present in `NeutralEventPayload`.
- TonAPI-specific fields must not directly create candidate records. Candidate
  creation always goes through `filterAndNormalize` acting on a
  `NeutralEventPayload`.
- TonAPI-specific fields may only be transformed into `RawProviderEvent` by a
  future TonAPI extractor, and that extractor may only be written after a
  TonAPI fixture set is approved.
- TonAPI payload shape must be preserved enough to support extractor design,
  but must be redacted of all secrets and personal operator data before commit.

## 7. Neutral `RawProviderEvent` Mapping Expectation

Approved TonAPI fixtures of class `neutral_raw_provider_event` or
`normalized_event_expectation` must define the expected mapping into the
neutral shape. The mapping targets the following fields exactly, per the
`NeutralEventPayload` shape in `lib/watcher/ingestionTypes.ts`:

- `provider` — `"tonapi"`
- `receivedAt` — ISO 8601 wall-clock time the event was observed
- `payload.eventType` — must map to `"jetton_transfer"`
- `payload.sourceAddress` — nullable; absent source is not a rejection
- `payload.destinationAddress` — required non-empty string
- `payload.jettonMaster` — required non-empty string
- `payload.amount` — raw decimal string, validated to `/^\d+$/` and positive
- `payload.txHash` — required non-empty string; absent is a hard reject
- `payload.traceId` — nullable
- `payload.actionIndex` — nullable non-negative integer
- `payload.messageHash` — nullable
- `payload.lt` — required non-negative decimal integer string
- `payload.eventTimestamp` — nullable; invalid values become null, not a reject
- `payload.finality` — must map to `"confirmed"` or `"finalized"`

This document does not implement the mapper. Mapping expectations defined in
fixtures are review targets only. The TonAPI extractor that performs this
mapping requires separate implementation approval after fixture approval.

## 8. High-Fidelity Profiling Metadata

TonAPI fixtures may include optional read-only profiling metadata for analysis
and review context. All such metadata is advisory only and carries no
operational weight.

Allowed nullable advisory fields in TonAPI fixture profiling metadata:

| Field | Description |
|---|---|
| `accountStatus` | On-chain account status at time of capture: e.g. `"active"`, `"uninit"`. |
| `contractCodeHash` | SHA-256 of deployed contract code. |
| `walletTypeHint` | Heuristic wallet type: e.g. `"v4"`, `"w5"`. Hint only. |
| `walletVersionHint` | Specific wallet version hint if available. Hint only. |
| `interfacesDetected` | List of detected contract interfaces from TonAPI response. Advisory only. |
| `knownContractFamily` | Contract family classification: e.g. `"jetton_wallet"`, `"nft_item"`. Hint only. |
| `entityLabel` | Known entity label from a static registry: e.g. `"exchange_hot_wallet"`. Hint only. |
| `classificationConfidence` | Confidence descriptor: e.g. `"high"`, `"low"`. Advisory only. |
| `classificationSource` | Source of classification: e.g. `"local_registry"`, `"tonapi_interfaces"`. |
| `classificationMethod` | Method used: e.g. `"code_hash_lookup"`, `"interface_detection"`. |
| `profileObservedAt` | ISO 8601 timestamp when the profile data was captured. |
| `profileSourcePayloadRef` | Reference to the fixture file or payload that produced this profile. |

The following rules apply to all profiling metadata without exception:

- Profiling metadata is advisory only. It has no operational effect.
- Profiling must not trigger execution of any kind.
- Profiling must not promote candidates to targets.
- Profiling must not generate or write to any targets file.
- Profiling must not read or write `RunState`.
- Profiling must not mutate campaign metadata.
- Profiling must not fund operators or move balances.
- Profiling must not rank or prioritize recipients by wallet wealth or balance.
- Profiling must not auto-exclude or auto-include recipients based on profile data.
- Profiling must not change Dispatcher behavior in any way.

## 9. Economic Noise Suppression Metadata

Amount thresholds and signal-quality indicators may appear in TonAPI fixture
metadata as noise-suppression review context only. They document why a fixture
represents a dust, low-signal, or spam event for review purposes.

Allowed concepts in TonAPI fixture metadata:

| Concept | Permitted use |
|---|---|
| `dustThreshold` | Documents the minimum amount considered non-dust for review purposes. |
| `minimumEventAmount` | Documents a fixture's relevance floor for offline test design. |
| `lowSignalRejectionExpectation` | Describes why a fixture is expected to be filtered as noise. |
| `noiseSuppressionRationale` | Human-readable explanation for why a fixture represents spam or noise. |
| `spamPatternHint` | Advisory note describing a suspected spam or bot pattern. |
| `fixtureRelevanceNote` | Explanation of why this fixture is relevant to the test suite. |

The following are unconditionally forbidden in TonAPI fixture metadata and in
any system behavior derived from fixture review:

- High-value target scoring or prioritization
- Wallet wealth ranking of any kind
- Balance-based targeting or filtering
- Preferential treatment of high-balance wallets
- Amount entropy analysis intended to mask behavior
- Behavior masking of any kind
- Delivery optimization based on recipient profile
- Provider evasion techniques of any kind

## 10. Sensitive Data and Redaction Rules

TonAPI fixtures must not contain any of the following. A fixture containing
any item below must not be committed and must not be approved:

- API keys or API secrets
- Bearer tokens or authorization headers
- Session cookies or authentication tokens
- Private keys or key material
- Mnemonics or seed phrases
- Personal or identifying operator data
- Private infrastructure URLs, internal hostnames, or internal IP addresses
- Secrets embedded in headers, URLs, query parameters, or request bodies

If a real TonAPI sample contains any of the above, it must be fully redacted
before it is committed. The redaction must be documented in `redactionNotes`
with a description of each redacted field and its reason.

## 11. Required TonAPI Fixture Review Checks

Before any TonAPI fixture may be assigned
`reviewStatus: "approved_for_extractor_design"`, all of the following checks
must pass:

- Fixture metadata is complete: all fields in Section 5 are present and valid.
- Sensitive fields are absent or fully redacted per Section 10.
- `realOrSynthetic` is clearly and accurately marked.
- `tonapiSourceKind` and `tonapiEndpointOrStreamName` are specific and accurate.
- `expectedOutcome` maps to an existing `filterAndNormalize` outcome defined in
  `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 10.
- Any profiling metadata present is marked advisory and carries no operational
  implication.
- No target promotion, candidate promotion, or execution implication exists
  anywhere in the fixture file.

## 12. Forbidden Behaviors

The following are forbidden at this stage and must remain forbidden in any
system behavior derived from TonAPI fixture review:

- No TonAPI API client of any kind
- No TonAPI WebSocket client
- No TonAPI polling loop
- No authenticated TonAPI requests
- No extractor implementation
- No Dispatcher calls
- No RunState reads or writes
- No targets file writes
- No candidate-to-target promotion
- No metadata mutation
- No funding logic
- No signing
- No sending
- No broadcasting
- No testnet execution
- No mainnet execution
- No synthetic traffic injection
- No random timing
- No behavior masking

## 13. Approval Rule

This document does not approve any TonAPI fixture content. Three separate
approvals are required before a TonAPI extractor may be written and merged:

1. **TonAPI fixture review approval** (this document): locks the fixture
   content path, metadata requirements, and review checks for TonAPI. Does not
   approve any fixture file.
2. **TonAPI fixture content approval**: each TonAPI fixture set is reviewed
   separately. Fixtures must carry
   `reviewStatus: "approved_for_extractor_design"` before the TonAPI extractor
   may be written.
3. **TonAPI extractor implementation approval**: the extractor is reviewed
   separately, after fixture approval, against the constraints in
   `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` Section 6.

Fixture review and extractor implementation review must not be combined into a
single step.
