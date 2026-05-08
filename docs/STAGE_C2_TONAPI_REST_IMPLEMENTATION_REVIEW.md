# STAGE_C2_TONAPI_REST_IMPLEMENTATION_REVIEW

## 1. Status

- Design/review only.
- No implementation.
- No `lib/watcher/tonapiClient.ts`.
- No API calls.
- No API key usage.
- No polling loop.
- No live ingestion.
- No Dispatcher.
- No RunState.
- No targets.
- No signing, sending, broadcasting, or execution.

This document verifies the TonAPI REST implementation boundary before code.

It does not approve implementation.

---

## 2. Verified TonAPI REST Facts

Verified sources:

- TonAPI REST documentation exposes mainnet and testnet REST base URLs.
- TonAPI has an OpenAPI/Swagger specification.
- The exact endpoint GET /jetton/transfers was not found in the verified OpenAPI specification.
- The verified candidate endpoint for Jetton transfer history is GET /v2/jettons/{jetton_id}/accounts/{account_id}/history.

Known query parameters from the verified OpenAPI shape:

- before_lt
- limit
- start_date
- end_date

Stage C-2 must not implement a client until the exact endpoint and parameter contract are accepted.

---

## 3. Environment Variable Boundary

The future implementation may use this environment variable name:

- TONAPI_API_KEY

Rules:

- Missing key fails closed before any request.
- The key must not be logged.
- The key must not be written to fixtures.
- The key must not be read from repository config files.

---

## 4. Response and Advisory Data Finding

The verified Jetton transfer history endpoint is treated as an observation source.

At this review point, the transfer-history response must not be assumed to include contract code hash.

Advisory data such as code hash or wallet type may require a separate read-only profiling endpoint or a separate fixture-approved source.

Future implementation must keep these paths separate:

- transfer observation path
- advisory profiling path

No candidate identity, filtering, or execution behavior may depend on advisory profiling.

---

## 5. Proposed Implementation Boundary

Future code may define:

- TonapiRestClientConfig
- TonapiRetryPolicy
- TonapiReadCursor
- TonapiReadRequest
- TonapiReadResult
- TonapiRestClient

Required policy controls:

- baseUrl
- apiKeyEnvName
- maxRequestsPerMinute
- requestTimeoutMs
- backoffMs
- maxAttempts
- pageLimit

The future client must return RawProviderEvent[] only.

It must not persist candidates, candidate events, or cursors.

Cursor persistence remains outside the client and requires orchestrator success.

---

## 6. Final Rule

Stage C-2 approves implementation planning only.

No code is approved in this stage.

No TonAPI REST client may be implemented until the user explicitly says:

Clear to Engage

After that approval, implementation must be split into small commits.
