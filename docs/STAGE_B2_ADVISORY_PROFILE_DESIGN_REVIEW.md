# STAGE_B2_ADVISORY_PROFILE_DESIGN_REVIEW

## 1. Status

- Design/review document only.
- No type changes.
- No extractor changes.
- No filter changes.
- No candidate record changes.
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
- `docs/STAGE_B2_TONAPI_EXTRACTOR_DESIGN_REVIEW.md`
- `docs/stage-b2-ingestion-completion.md`

If any of these documents conflict, the stricter safety boundary wins.

---

## 3. Design Decision

| Field | Value |
|---|---|
| reviewStatus | `approved_for_future_advisory_profile_type_contract` |
| scope | advisory metadata pass-through only |
| filter criterion | no |
| candidate identity component | no |
| execution input | no |
| target-selection input | no |

Advisory profile metadata is pass-through only. It must never be used to decide whether an event passes or fails normalization. It must never affect `candidateId` generation. It must never affect execution behavior.

---

## 4. Proposed Future Schema

Design contract only. Not implementation code.

```typescript
export interface AdvisoryAddressProfile {
  readonly walletTypeHint: string | null;
  readonly codeHash: string | null;
  readonly accountStatus: string | null;
  readonly entityLabel: string | null;
}

export interface AdvisoryProfile {
  readonly source: AdvisoryAddressProfile | null;
  readonly destination: AdvisoryAddressProfile | null;
}
```

Field semantics:

- `walletTypeHint` is an advisory classification hint only. It must not influence normalization, candidate identity, or execution.
- `codeHash` is an advisory analytics and classification input only. It must not influence normalization, candidate identity, or execution.
- `accountStatus` is optional advisory account state. It must not gate pass/fail decisions.
- `entityLabel` is an optional advisory label only. It must not influence any pipeline decision.

---

## 5. Proposed Future Type Placement

Future type changes must be reviewed separately. They may include:

- `RawProviderEvent.advisoryProfile?: AdvisoryProfile | null`
- `NormalizedEvent.advisoryProfile?: AdvisoryProfile | null`
- `CandidateRecord.profile` may later be populated from `NormalizedEvent.advisoryProfile` only after a separate candidate-record integration review.

This document does not implement any of those type changes.

---

## 6. Extractor Pass-Through Design

- A future extractor may read fixture or provider profiling metadata.
- A future extractor may map it into `RawProviderEvent.advisoryProfile`.
- The extractor must not derive `txHash`, `lt`, `traceId`, `actionIndex`, `amount`, `destinationAddress`, `sourceAddress`, or `finality` from `advisoryProfile`.
- The extractor must not synthesize `walletTypeHint` or `codeHash` when the source data does not supply them.
- Missing profile metadata must result in null profile fields, not invented values.
- Extractor output must remain fully deterministic.

---

## 7. filterAndNormalize Pass-Through Design

- `filterAndNormalize` may pass `advisoryProfile` through unchanged from `RawProviderEvent` to `NormalizedEvent`.
- `filterAndNormalize` must not use `advisoryProfile` for pass/fail determination.
- `filterAndNormalize` must not reject based on `walletTypeHint`, `codeHash`, `accountStatus`, or `entityLabel`.
- `filterAndNormalize` must not alter canonical address checks based on `advisoryProfile`.
- `filterAndNormalize` must not alter amount checks based on `advisoryProfile`.
- `filterAndNormalize` must not alter finality checks based on `advisoryProfile`.
- `filterAndNormalize` must not alter `txHash`, `lt`, `traceId`, or `actionIndex` behavior based on `advisoryProfile`.

---

## 8. Candidate Identity Boundary

- `advisoryProfile` must not affect `candidateId`.
- `advisoryProfile` must not affect `candidateKeyComponents`.
- `walletTypeHint` must not be added to the candidate key.
- `codeHash` must not be added to the candidate key.
- The same on-chain event carrying different advisory metadata must produce the same `candidateId`.
- Candidate identity remains based on existing causality and key fields only: `traceId`, `txHash`, `lt`, `actionIndex`, `messageHash`, `jettonMasterCanonicalKey`, `destinationCanonicalKey`, and `amount`.

---

## 9. CandidateRecord Future Integration

- Future candidate record integration must happen in a separate review and commit.
- `CandidateRecord.profile` may later receive advisory profile metadata.
- If profile metadata is absent or unresolved, null defaults must remain valid.
- `CandidateRecord.decision` must remain `pending` regardless of advisory profile content.
- Advisory profile must not auto-approve, auto-reject, auto-include, auto-exclude, or promote candidates.

---

## 10. Determinism Requirements

- No randomness.
- No current time calls.
- No network.
- No filesystem writes.
- No mutable global state.
- Same input event with the same advisory metadata must produce the same output.
- Same event with missing advisory metadata must normalize identically except the profile field is null or absent.

---

## 11. Economic and Safety Boundaries

- No high-value target scoring.
- No wallet wealth ranking.
- No balance-based targeting.
- No delivery optimization.
- No behavior masking.
- No provider evasion.
- No target promotion.
- No execution implication.
- No funding logic.

---

## 12. Forbidden Behaviors

The following are explicitly forbidden:

- TonAPI API client
- TonAPI WebSocket client
- TonAPI polling
- Authenticated TonAPI requests
- Provider retry loop
- Extractor fetching profile data
- Dispatcher calls
- RunState reads or writes
- Targets reads or writes
- Candidate-to-target promotion
- Candidate store writes at this stage
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

## 13. Future Implementation Gates

Future work must be split into separate commits in the following order:

1. Advisory profile type contract (`AdvisoryAddressProfile`, `AdvisoryProfile` interfaces).
2. Extractor `advisoryProfile` pass-through from fixture profiling metadata.
3. `filterAndNormalize` pass-through of `advisoryProfile`.
4. Fixture smoke coverage for advisory profile pass-through.
5. `CandidateRecord` profile integration review.
6. `CandidateRecord` profile integration implementation.
7. Full-check integration if required.

No implementation, test, or CI change may be included in the same commit as this design review document.

---

## 14. Final Rule

- This document approves only future design-aligned advisory profile pass-through work.
- It does not approve live profile fetching.
- It does not approve provider clients.
- It does not approve Dispatcher integration.
- It does not approve target generation.
- It does not approve execution.
- It does not approve using advisory profile for candidate identity or filtering decisions.