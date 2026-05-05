# Stage B-2 Ingestion Completion Note

## Status

Stage B-2 first-pass ingestion is complete as an **offline, fixture-based core only**.

This is not live ingestion.

## What exists

Six implementation files and one smoke script:

- `lib/watcher/ingestionTypes.ts` — shared types, interfaces, and constants
- `lib/watcher/canonicalAddress.ts` — `Address.parse` wrapper and canonical key derivation
- `lib/watcher/eventFilter.ts` — stateless filter and normalizer for neutral fixture events
- `lib/watcher/candidateId.ts` — deterministic, provider-independent candidate key and SHA-256 hash
- `lib/watcher/candidateStore.ts` — single-process append-only JSONL writers, in-memory dedup, cursor persistence, rate cap
- `lib/watcher/commanderState.ts` — read-only Commander safety-state interface, fail-closed
- `scripts/stage-b2-ingestion-smoke.ts` — offline fixture-based smoke exercising the full pipeline

Stage B full-check now includes the Stage B-2 smoke.

The smoke validates:

- fixture event normalization
- amount canonicalization (`"001"` and `"1"` produce the same `candidateId`)
- deterministic `candidateId` construction and SHA-256 hashing
- JSONL candidate staging to `candidates.jsonl`
- dedup store rebuild from `candidates.jsonl` on startup
- duplicate observation event appended to `candidate-events.jsonl`
- rate-cap data-loss event appended to `candidate-events.jsonl` on overflow
- cursor save and load round-trip
- hard rejection of bad amount, missing `txHash`, and wrong Jetton Master
- Commander state file absent → fail-closed passive state

## What does not exist

The following are explicitly absent and out of scope for this pass:

- No WebSocket client
- No API client of any kind
- No provider adapter (TonAPI, TON Center, or other)
- No LiteServer polling
- No Dispatcher integration
- No RunState reads or writes
- No `targets.json` or `targets.generated.json` generation
- No candidate-to-target promotion
- No `decisions.jsonl` writes
- No metadata mutation
- No funding logic
- No signer loading, signing, sending, or broadcasting
- No testnet execution
- No mainnet execution

## Future review topics

The following are not implemented or approved by this note:

- candidate-to-targets builder design
- generated targets review
- Dispatcher dry-run against generated targets
- live provider adapters

Each item requires a separate design review before implementation.
