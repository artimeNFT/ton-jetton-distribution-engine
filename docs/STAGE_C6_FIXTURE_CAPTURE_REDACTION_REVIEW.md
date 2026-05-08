# STAGE_C6_FIXTURE_CAPTURE_REDACTION_REVIEW

## 1. Status

Stage C-6 is design/review only.

No fixture capture implementation is approved here.

No live TonAPI calls are approved here.

No API keys, authorization headers, secrets, or raw credentials may be written to disk.

No live ingestion, Dispatcher, RunState, targets, signing, sending, broadcasting, or execution is in scope.

This document defines the future fixture capture and redaction boundary.

---

## 2. Fixture Categories

Future fixture capture must include more than successful responses.

Required fixture categories:

- success_transfer_history
- empty_transfer_history
- partial_transfer_history
- malformed_transfer_history
- account_profile_success
- account_profile_missing_code_hash
- account_profile_missing_wallet_type
- bulk_profile_partial
- provider_429
- provider_5xx
- provider_unknown_field_added
- provider_required_field_missing

Purpose:

- preserve known-good response shapes
- detect schema drift early
- prove the client fails closed on malformed data
- prove optional advisory fields remain nullable
- prevent silent blindness when provider fields change

---

## 3. Redaction Policy

Fixture capture must redact before writing to disk.

Forbidden in fixtures:

- API keys
- authorization headers
- cookies
- bearer tokens
- full request headers
- raw environment variables
- private operator identifiers
- local filesystem paths
- machine usernames
- stack traces containing secrets
- any live credential material

Allowed in fixtures:

- endpoint path
- sanitized query parameters
- HTTP status code
- provider response body after redaction
- capture timestamp
- redaction version
- fixture category
- schema hash or shape summary

Redaction must be deterministic.

Redaction must happen before audit/log write.

If redaction cannot complete, fixture capture must fail closed and write nothing.

---

## 4. Future Capture Contract

A future capture tool may write fixtures only after explicit approval.

Required capture metadata:

- fixtureId
- fixtureCategory
- provider
- endpointPath
- sanitizedQuery
- httpStatus
- capturedAt
- redactionVersion
- schemaShapeHash
- sourceStage
- notes

Required file behavior:

- write to a temporary file first
- fsync or equivalent durability step where available
- atomic rename to final fixture path
- never overwrite an existing fixture unless explicitly requested
- deterministic filename from fixtureId and category

Recommended path pattern:

- fixtures/tonapi/<category>/<fixtureId>.json

Fixture IDs must not contain API keys, wallet secrets, local usernames, or machine identifiers.

---

## 5. Review Gates

Before implementation, review:

- fixture schema
- redaction tests
- fixture categories
- output directory
- overwrite policy
- secret scanning
- data drift comparison
- CI inclusion strategy

A future implementation must prove offline:

- API keys are redacted
- Authorization headers are redacted
- empty responses are preserved
- partial responses are preserved
- malformed responses fail closed
- required field removal is detected
- unknown field additions are preserved

---

## 6. Final Rule

Stage C-6 approves design only.

No capture implementation is approved here.

No live provider call is approved here.

The next implementation step requires explicit approval.
