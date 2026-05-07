# STAGE_B2_CANDIDATE_ADVISORY_PROFILE_INTEGRATION_REVIEW

## 1. Status

- Design/review only.
- No type changes.
- No candidateStore changes.
- No candidateId changes.
- No eventFilter changes.
- No extractor changes.
- No tests.
- No CI changes.
- No Dispatcher.
- No RunState.
- No targets.
- No execution.

---

## 2. Required Source Documents

- `docs/STAGE_B2_ADVISORY_PROFILE_DESIGN_REVIEW.md`
- `docs/STAGE_B2_TONAPI_EXTRACTOR_DESIGN_REVIEW.md`
- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md`
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md`
- `docs/stage-b2-ingestion-completion.md`

If any of these documents conflict, the stricter safety boundary wins.

---

## 3. Existing Candidate Profile Model

The following types exist and must not be changed by this document:

| Type | Field | Notes |
|---|---|---|
| `AddressProfile` | `accountStatus: string \| null` | Advisory account state |
| `AddressProfile` | `codeHash: string \| null` | Advisory code hash |
| `AddressProfile` | `walletType: string \| null` | Advisory wallet classification |
| `AddressProfile` | `entityLabel: string \| null` | Advisory label |
| `CandidateProfile` | `destination: AddressProfile` | Destination address profile |
| `CandidateProfile` | `source: AddressProfile` | Source address profile |
| `CandidateRecord` | `profileStatus: ProfileStatus` | Resolved/unresolved/partial state |
| `CandidateRecord` | `profile: CandidateProfile` | Advisory profile payload |
| `CandidateRecord` | `decision: "pending"` | Must remain pending |

---

## 4. Proposed Future Mapping

Future implementation must map `NormalizedEvent.advisoryProfile` into `CandidateRecord.profile` as follows.

**Destination mapping:**

| Source | Target |
|---|---|
| `advisoryProfile.destination.walletTypeHint` | `CandidateRecord.profile.destination.walletType` |
| `advisoryProfile.destination.codeHash` | `CandidateRecord.profile.destination.codeHash` |
| `advisoryProfile.destination.accountStatus` | `CandidateRecord.profile.destination.accountStatus` |
| `advisoryProfile.destination.entityLabel` | `CandidateRecord.profile.destination.entityLabel` |

**Source mapping:**

`advisoryProfile.source` maps to `CandidateRecord.profile.source` using the same field mapping as destination above.

If `advisoryProfile.source` is null or absent, all `CandidateRecord.profile.source` fields remain null.

**Field naming note:** `CandidateProfile.walletType` must not be renamed to `walletTypeHint` in this step. Any such type rename is out of scope and requires a separate future review.

---

## 5. Default Behavior

**If `NormalizedEvent.advisoryProfile` is null or absent:**

- `CandidateRecord.profileStatus` remains `"unresolved"`.
- All `CandidateRecord.profile.destination` fields are null.
- All `CandidateRecord.profile.source` fields are null.
- `CandidateRecord.decision` remains `"pending"`.

**If `advisoryProfile` is present:**

- `CandidateRecord.profile` may receive advisory field values.
- `CandidateRecord.profileStatus` may become `"partial"` only if at least one advisory field is non-null.
- `CandidateRecord.profileStatus` must not become `"resolved"` from advisory-only metadata unless a later dedicated profiling-resolution review explicitly approves it.
- `CandidateRecord.decision` remains `"pending"` regardless.

---

## 6. Candidate Identity Boundary

- Advisory profile must not affect `candidateId`.
- Advisory profile must not affect `candidateKeyComponents`.
- `walletTypeHint` and `walletType` must not be added to the candidate key.
- `codeHash` must not be added to the candidate key.
- `accountStatus` must not be added to the candidate key.
- `entityLabel` must not be added to the candidate key.
- The same normalized event carrying different advisory profile metadata must produce the same `candidateId`.
- Candidate identity remains based only on existing key components: `traceId`, `txHash`, `lt`, `actionIndex`, `messageHash`, `jettonMasterCanonicalKey`, `destinationCanonicalKey`, and `amount`.

---

## 7. Candidate Decision Boundary

- `CandidateRecord.decision` must remain `"pending"`.
- Advisory profile must not auto-approve candidates.
- Advisory profile must not auto-reject candidates.
- Advisory profile must not auto-include candidates.
- Advisory profile must not auto-exclude candidates.
- Advisory profile must not promote candidates to targets.
- Advisory profile must not affect campaign execution.

---

## 8. Pipeline Boundary

- No Dispatcher calls.
- No RunState reads or writes.
- No targets reads or writes.
- No candidate-to-target promotion.
- No signer loading.
- No signing.
- No sending.
- No broadcasting.
- No testnet execution.
- No mainnet execution.

---

## 9. Determinism Requirements

- No randomness.
- No `Date.now` or current-time calls.
- No network.
- No filesystem writes outside the normal future candidate record write path.
- Same `NormalizedEvent` with the same `advisoryProfile` must produce the same `CandidateRecord` profile.
- Same `NormalizedEvent` with different `advisoryProfile` must preserve `candidateId` and `candidateKeyComponents` unchanged.

---

## 10. Future Implementation Gates

Future work must be split into separate commits in the following order:

1. `CandidateRecord` advisory profile integration implementation.
2. Candidate smoke coverage for profile mapping.
3. Full-check confirmation.
4. Later profiling-resolution review if `profileStatus: "resolved"` is ever needed.

No implementation, test, or CI change may be included in the same commit as this design review document.

---

## 11. Final Rule

- This document approves only a future design-aligned `CandidateRecord` advisory profile mapping.
- It does not approve changing `candidateId`.
- It does not approve changing `candidateKeyComponents`.
- It does not approve Dispatcher integration.
- It does not approve RunState changes.
- It does not approve targets.
- It does not approve execution.
- It does not approve using advisory profile for candidate decisions.
