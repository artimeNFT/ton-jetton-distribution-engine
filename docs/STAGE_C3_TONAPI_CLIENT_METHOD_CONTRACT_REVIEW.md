# STAGE_C3_TONAPI_CLIENT_METHOD_CONTRACT_REVIEW

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

This document defines the method contract for a future TonAPI REST client.

It does not approve implementation.

---

## 2. Verified Method Contract

The future TonAPI REST client must expose two separate read paths:

1. Transfer observation path.
2. Account advisory profile path.

Approved method names:

- readTransferHistory
- readAccountProfile
- readAccountProfilesBulk

Verified candidate endpoints:

- GET /v2/accounts/{account_id}/jettons/history
- GET /v2/blockchain/accounts/{account_id}
- POST /v2/blockchain/accounts/_bulk

The deprecated endpoint GET /v2/accounts/{account_id}/jettons/{jetton_id}/history must not be the primary implementation target.

Transfer history produces observations.

Account profile produces advisory metadata.

These paths must remain separate.

---

## 3. Mandatory ProfileCache

readAccountProfile must be protected by a bounded ProfileCache.

A cache hit must not trigger a provider request.

A cache miss may trigger a provider request only if rate-limit policy allows it.

Required cache controls:

- profileCacheTtlMs
- profileCacheMaxEntries
- deterministic LRU eviction
- no random eviction
- no unbounded Map
- no unbounded profile queue

Eviction rule:

When the cache exceeds profileCacheMaxEntries, the least-recently-used entry must be evicted deterministically.

The cache key must be the canonical account id.

The cache value may contain only advisory profile data and fetch metadata.

The cache must not store API keys, authorization headers, raw provider credentials, or execution state.

---

## 4. Required Configurable Controls

Future implementation must make these values configurable:

- baseUrl
- apiKeyEnvName
- requestTimeoutMs
- maxRequestsPerMinute
- backoffMs
- maxAttempts
- pageLimit
- profileBatchSize
- profileCacheTtlMs
- profileCacheMaxEntries

Stability requirements:

- no unbounded request loop
- no unbounded retry loop
- no unbounded in-memory queue
- no unbounded response accumulation
- no cursor persistence inside the client
- no candidate persistence inside the client

All load management must be deterministic and explainable from configuration.

---

## 5. Advisory Data Rule

Account profile data is advisory only.

The future client may populate:

- accountStatus
- codeHash
- walletTypeHint
- entityLabel

If the verified TonAPI response does not contain code hash, codeHash must be null.

walletTypeHint may be derived only from approved account profile fields.

No advisory field may affect:

- filtering
- candidate identity
- candidate key components
- candidate approval
- target generation
- Dispatcher behavior
- execution behavior

---

## 6. Final Rule

Stage C-3 approves method-contract design only.

No code is approved in this stage.

Implementation may begin only after explicit Clear to Engage.

The implementation prompt must require small commits and no live API smoke in the first code pass.
