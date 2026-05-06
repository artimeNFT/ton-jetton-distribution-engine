# Stage B-2 TonAPI Fixture Intake Review

## 1. Status

Design/review document only.

No fixture content is approved by this document.
No TonAPI client is approved.
No extractor is approved.
No live ingestion is approved.
No execution of any kind is approved.

This document defines the intake checklist and review procedure for future
TonAPI fixture samples. It does not approve any fixture file, any directory,
any extractor, or any live connection.

## 2. Purpose

This document defines:

- the TonAPI fixture intake process from submission to approval decision
- the pre-commit review checklist every TonAPI sample must pass
- redaction requirements before any sample may be committed
- the approval decision flow and its named states
- the fixture-first, extractor-later workflow as it applies to TonAPI intake

No TonAPI fixture may be committed until intake review passes. No TonAPI
extractor may be written until approved fixtures are committed.

## 3. Required Source Documents

This document operates within the boundaries established by:

- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` — provider fixture contract
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` — canonical fixture schema
- `docs/STAGE_B2_TONAPI_FIXTURE_REVIEW.md` — TonAPI fixture content review
- `docs/stage-b2-ingestion-completion.md` — B2 ingestion completion boundary

If this document conflicts with any of the above, the stricter safety boundary
wins.

## 4. Intake Artifact Types

The following are the only allowed intake artifacts. All are review artifacts
only and must not trigger execution of any kind.

- **Candidate TonAPI raw sample** — an unmodified payload captured from a live
  TonAPI source, submitted for redaction review before commit.
- **Candidate TonAPI redacted sample** — a raw sample with sensitive fields
  removed and documented, ready for content review.
- **Candidate synthetic TonAPI-shaped sample** — a hand-crafted payload
  mimicking TonAPI wire format, explicitly marked synthetic.
- **Reviewer notes** — free-form review comments attached to a candidate
  fixture during the intake process.
- **Redaction report** — a structured record of which fields were redacted,
  what they contained, and why they were removed.
- **Expected `RawProviderEvent` draft** — a reviewer-drafted mapping of the
  candidate fixture into the neutral `NeutralEventPayload` shape, for design
  review only. Does not implement the extractor.
- **Expected rejection outcome draft** — a reviewer-drafted record of the
  expected `RejectionReasonCode` for a fixture with `expectedOutcome` other
  than `normalize_pass`.

## 5. Proposed Fixture Directory Policy

The following directories are proposed for future fixture storage. They are
proposed only.

- `fixtures/tonapi/raw/`
- `fixtures/tonapi/redacted/`
- `fixtures/tonapi/synthetic/`
- `fixtures/tonapi/expected/`

This document does not create those directories. This document does not approve
any fixture file. These directories may be created only when the first fixture
content review reaches `approved_for_fixture_commit` and the fixture is ready
to be committed.

## 6. Intake Metadata Checklist

A TonAPI sample submitted for review must include all of the following metadata
fields. A submission missing any field is returned to the submitter as
`needs_metadata_fix` before review proceeds.

| Field | Requirement |
|---|---|
| `fixtureId` | Unique, stable identifier. Must not change after assignment. |
| `provider` | Must be `"tonapi"`. |
| `fixtureClass` | One of the six classes in `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 3. |
| `captureSource` | Specific capture method: e.g. `"websocket_stream"`, `"api_poll"`, `"hand_crafted"`. |
| `captureDate` | ISO 8601 date of capture, or `"synthetic"`. |
| `realOrSynthetic` | `"real"` or `"synthetic"`. Must match `fixtureClass`. |
| `redactionStatus` | `"none"`, `"partial"`, or `"full"`. |
| `redactionNotes` | Description of redacted fields. `null` only if `redactionStatus` is `"none"`. |
| `chain` | e.g. `"ton_mainnet"`, `"ton_testnet"`. |
| `network` | `"mainnet"` or `"testnet"`. |
| `tonapiSourceKind` | TonAPI-specific source kind: e.g. `"websocket_events"`, `"rest_actions"`, `"rest_traces"`. |
| `tonapiEndpointOrStreamName` | Specific TonAPI endpoint or stream name the payload originates from. |
| `jettonMaster` | Relevant Jetton Master address in any valid TON representation. |
| `expectedOutcome` | One of the values in `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 10. |
| `reviewStatus` | Current intake decision state per Section 11. |
| `submitterNotes` | Free-form notes from the submitter explaining context, capture method, or known issues. |
| `reviewerNotes` | Free-form notes added by the reviewer during intake. `null` until review begins. |

## 7. Redaction Checklist

The reviewer must verify that the following are absent or fully redacted before
a sample may proceed past `needs_redaction`. Any item present and unredacted is
grounds for immediate return to the submitter.

- API keys or API secrets
- Bearer tokens or authorization headers
- Session cookies or authentication tokens
- Private keys or key material of any kind
- Mnemonics or seed phrases
- Private infrastructure URLs, internal hostnames, or internal IP addresses
- Operator personal or identifying data
- Secrets embedded in headers, URLs, query parameters, or request bodies

If any of the above are found, the fixture is assigned `needs_redaction`, the
reviewer documents the finding in `reviewerNotes`, and the sample is returned
to the submitter with a redaction report.

## 8. TonAPI Content Review Checklist

After redaction passes, the reviewer must verify all of the following before
the fixture may advance to `approved_for_fixture_commit`.

- Payload is clearly and accurately marked as real or synthetic.
- Payload capture source is documented and specific.
- Payload shape is preserved sufficiently to support extractor design.
- All sensitive data is absent per the redaction checklist in Section 7.
- `jettonMaster` relevance is documented and accurate.
- `expectedOutcome` maps to an existing outcome in
  `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` Section 10.
- Any profiling metadata present is marked advisory only with no operational
  implication.
- Any noise suppression metadata present is marked review-only with no
  operational implication.
- No target promotion, candidate promotion, or execution implication exists
  anywhere in the fixture file or its metadata.

## 9. High-Fidelity Profiling Intake Checklist

If the fixture submission includes profiling metadata, the reviewer must verify
each of the following. Any profiling field that implies operational use must
be removed before approval.

- `accountStatus` is nullable and advisory only.
- `contractCodeHash` is nullable and advisory only.
- `walletTypeHint` is nullable and advisory only.
- `walletVersionHint` is nullable and advisory only.
- `interfacesDetected` is nullable and advisory only.
- `knownContractFamily` is nullable and advisory only.
- `entityLabel` is nullable and advisory only.
- `classificationConfidence` is nullable and advisory only.
- `classificationSource` is nullable and advisory only.
- `classificationMethod` is nullable and advisory only.
- Profiling does not trigger execution of any kind.
- Profiling does not promote candidates to targets.
- Profiling does not generate or write to any targets file.
- Profiling does not auto-include or auto-exclude recipients.
- Profiling does not change Dispatcher behavior.
- Profiling does not rank or target recipients by wallet wealth or balance.

## 10. Economic Noise Suppression Intake Checklist

If the fixture submission includes noise suppression metadata, the reviewer
must verify that each field is review metadata only, carrying no operational
weight.

- `dustThreshold` is review metadata only.
- `minimumEventAmount` is review metadata only.
- `lowSignalRejectionExpectation` is review metadata only.
- `noiseSuppressionRationale` is review metadata only.
- `spamPatternHint` is review metadata only.
- `fixtureRelevanceNote` is review metadata only.

The following are unconditionally forbidden and must cause immediate rejection
of any fixture submission that implies them:

- High-value target scoring or prioritization
- Wallet wealth ranking of any kind
- Balance-based targeting or filtering
- Preferential treatment of high-balance wallets
- Amount entropy analysis intended to mask behavior
- Behavior masking of any kind
- Delivery optimization based on recipient profile
- Provider evasion techniques of any kind

## 11. Review Decision States

A TonAPI fixture submission moves through the following states during intake.

| State | Meaning |
|---|---|
| `intake_received` | Submission has been received and is queued for review. No checks have been performed yet. |
| `needs_redaction` | Reviewer found sensitive data. Submission is returned to submitter with a redaction report. |
| `needs_metadata_fix` | Submission is missing required metadata fields or contains inconsistent values. Returned to submitter. |
| `approved_for_fixture_commit` | All intake checklists passed. Fixture may be committed to the repository. |
| `rejected` | Submission fails a policy requirement that cannot be resolved by redaction or metadata fix: wrong shape, unresolvable content issue, or forbidden behavior implied. Must not be used. |

`approved_for_fixture_commit` authorizes fixture commit only. It does not
approve extractor implementation. Extractor design review is a separate step
that begins only after fixtures are committed.

## 12. Approval Path

The full approval path from submission to extractor design is:

1. **Intake review** — submission received, metadata checklist verified per
   Section 6, state set to `intake_received`.
2. **Redaction review** — sensitive data check per Section 7. If issues found,
   state set to `needs_redaction` and submission returned. Repeats until clean.
3. **Metadata and schema review** — content checklist per Section 8, profiling
   checklist per Section 9, noise suppression checklist per Section 10. If
   issues found, state set to `needs_metadata_fix` and returned. Repeats until
   clean.
4. **Fixture commit approval** — all checklists passed, state set to
   `approved_for_fixture_commit`. Fixture may be committed to the repository
   under the proposed directory structure in Section 5.
5. **Extractor design review** — begins only after fixtures are committed.
   Governed by `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` Section 6 and
   `docs/STAGE_B2_TONAPI_FIXTURE_REVIEW.md` Section 13. Separate approval
   required.

## 13. Forbidden Behaviors

The following are forbidden at this stage and must remain forbidden in any
system behavior derived from TonAPI fixture intake:

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

## 14. Final Rule

No TonAPI fixture may be committed until intake review passes all checklists
in this document and the fixture reaches `approved_for_fixture_commit`.

No TonAPI extractor may be written until approved fixtures are committed to the
repository.

Fixture review and extractor implementation review must remain separate steps.
They must not be combined into a single review.
