# Stage B-2 Provider Fixture Contract

## 1. Status

Design/review document only.

No provider-specific extractor code is approved by this document.
No WebSocket client is approved.
No API client or polling loop is approved.
No LiteServer polling is approved.
No execution of any kind is approved.

Provider-specific extractor code cannot be written until real provider sample
payloads are collected, reviewed, and committed as fixtures. This rule is
absolute and applies to every provider independently.

## 2. Purpose

This document defines:

- how future provider payload samples are accepted into the repository
- how provider payloads must map into the neutral `RawProviderEvent` shape
- the gate that must be passed before any provider-specific extractor is written

The Stage B-2 boundary is preserved: the Watcher is an observation and staging
layer only. This document does not expand that boundary.

## 3. Current Baseline

Stage B-2 has an offline, fixture-based ingestion core. It consists of:

- `lib/watcher/ingestionTypes.ts`
- `lib/watcher/canonicalAddress.ts`
- `lib/watcher/eventFilter.ts`
- `lib/watcher/candidateId.ts`
- `lib/watcher/candidateStore.ts`
- `lib/watcher/commanderState.ts`
- `scripts/stage-b2-ingestion-smoke.ts`

The smoke script is CI-covered through `stage-b-full-check.sh`.

No live provider ingestion exists. No WebSocket, SSE, API polling, or
LiteServer client exists. The only provider value currently exercised by CI is
`"fixture"`. Provider-specific values are future-only and require fixture
approval first.

## 4. Provider Sample Acceptance Rules

Before any provider-specific extractor may be written, the following conditions
must all be satisfied for that provider:

- Samples must be real captured provider payloads, or explicitly marked as
  synthetic fixtures. The distinction must be stated clearly in each fixture file.
- Samples must be stored and committed as fixture files before extractor code
  is written. Writing extractor code against an imagined or undocumented payload
  shape is not permitted.
- Every fixture file must identify, at minimum:
  - provider name (e.g. TonAPI, TON Center)
  - capture source (e.g. WebSocket stream, SSE stream, polling endpoint)
  - capture date
  - redaction status (whether any fields have been redacted or anonymized)
  - whether the payload is real or synthetic
- Samples must not include private keys, mnemonics, secrets, API keys, bearer
  tokens, session cookies, or any personal or operator-identifying data.
- Samples must not be used to trigger execution of any kind.

## 5. Neutral Event Contract

All provider payloads, regardless of source, must normalize into `RawProviderEvent`
as defined in `lib/watcher/ingestionTypes.ts`. The neutral shape is:

- `provider`: identifies the source but is never included in `candidateId`
- `receivedAt`: ISO 8601 wall-clock time the event was observed
- `payload`: a `NeutralEventPayload` — protocol-neutral, pre-validated fields

The following rules are non-negotiable:

- `RawProviderEvent` must remain provider-neutral. Provider-specific wire fields
  must not leak into the neutral shape.
- Provider-specific fields may be retained only in fixture metadata files, not
  in `candidateId` construction.
- `candidateId` must stay provider-independent. The same on-chain event observed
  from two different providers must produce the same `candidateId`.

## 6. Extractor Approval Gate

No extractor may be written for a provider until that provider's fixtures are
approved. Approval is per-provider and independent.

| Provider | Fixture approval required before extractor |
|---|---|
| TonAPI | Yes — no TonAPI extractor until TonAPI fixtures are approved |
| TON Center | Yes — no TON Center extractor until TON Center fixtures are approved |
| LiteServer / block polling | Yes — no LiteServer extractor until LiteServer fixtures are approved |

Once fixtures are approved, the extractor is subject to the following hard
constraints:

- An extractor may only transform a provider-specific payload into a
  `RawProviderEvent` with `payload: NeutralEventPayload`.
- An extractor must not write candidate records directly.
- An extractor must not call or trigger the Dispatcher.
- An extractor must not read or write `RunState`.
- An extractor must not write `targets.json` or any targets file.
- An extractor must not promote candidates.
- An extractor must not mutate metadata.

## 7. Forbidden Behaviors

The following are forbidden at this stage and in any extractor written under
this contract:

- No live provider client of any kind
- No WebSocket client
- No SSE client
- No API polling loop
- No LiteServer polling
- No signing
- No sending
- No broadcasting
- No metadata mutation
- No funding logic
- No candidate-to-target promotion
- No behavior masking
- No synthetic traffic injection
- No random timing

## 8. Required Future Tests

When a provider extractor is eventually approved and implemented, the following
tests are required before it may be merged:

- Fixture parse test: extractor correctly parses each approved fixture file
- Fixture normalization test: each parsed fixture produces a valid `NormalizedEvent`
  via `filterAndNormalize`
- Provider-independent `candidateId` equivalence test: the same on-chain event
  from two different provider fixtures produces identical `candidateId` values
- Rejection tests: malformed, truncated, and invalid provider payloads are
  rejected with the correct `RejectionReasonCode`
- No-write tests: extractor does not write to `RunState` or any targets file
- Commander passive/fail-closed behavior is retained end-to-end with the
  extractor in the pipeline

## 9. Approval Rule

Each provider requires two separate approvals before its extractor may be merged:

1. **Fixture approval**: fixture files are reviewed and approved as a standalone
   step. No extractor code is written before this approval.
2. **Implementation approval**: the extractor implementation is reviewed
   separately, after fixture approval, against the constraints in Section 6.

A combined fixture-and-implementation review in a single step is not permitted.
