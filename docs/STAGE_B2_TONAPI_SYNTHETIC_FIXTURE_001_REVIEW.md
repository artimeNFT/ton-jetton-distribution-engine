# Stage B-2 TonAPI Synthetic Fixture 001 Review

## 1. Status

Design/review document only.

Synthetic fixture content review only.

No fixture JSON file is created by this document.
No TonAPI client is approved.
No extractor is approved.
No live ingestion is approved.
No execution of any kind is approved.

This document reviews proposed synthetic fixture content inline and records the
intake decision. The fixture files listed in Section 10 may be committed in a
separate commit after this review is merged.

## 2. Required Source Documents

This document operates within the boundaries established by:

- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md` — provider fixture contract
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md` — canonical fixture schema
- `docs/STAGE_B2_TONAPI_FIXTURE_REVIEW.md` — TonAPI fixture content review
- `docs/STAGE_B2_TONAPI_FIXTURE_INTAKE.md` — TonAPI fixture intake review
- `docs/stage-b2-ingestion-completion.md` — B2 ingestion completion boundary

If this document conflicts with any of the above, the stricter safety boundary
wins.

## 3. Review Decision

| Field | Value |
|---|---|
| `fixtureId` | `tonapi_synth_jetton_transfer_001` |
| `provider` | `tonapi` |
| `fixtureClass` | `synthetic_provider_sample` |
| `realOrSynthetic` | `synthetic` |
| `reviewStatus` | `approved_for_fixture_commit` |
| `expectedOutcome` | `normalize_pass` |

This approval authorizes future commit of the fixture files listed in Section
10 only. It does not approve extractor implementation. It does not approve live
TonAPI ingestion. It does not approve real provider sample handling.

## 4. Proposed Fixture Metadata

| Field | Value |
|---|---|
| `fixtureId` | `tonapi_synth_jetton_transfer_001` |
| `provider` | `tonapi` |
| `fixtureClass` | `synthetic_provider_sample` |
| `captureSource` | `hand_crafted` |
| `captureDate` | `synthetic` |
| `realOrSynthetic` | `synthetic` |
| `redactionStatus` | `none` |
| `redactionNotes` | `null` |
| `chain` | `ton_mainnet` |
| `network` | `mainnet` |
| `tonapiSourceKind` | `websocket_events` |
| `tonapiEndpointOrStreamName` | `tonapi_websocket_events` |
| `jettonMaster` | `0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv` |
| `expectedOutcome` | `normalize_pass` |
| `reviewStatus` | `approved_for_fixture_commit` |
| `submitterNotes` | `Synthetic fixture hand-crafted to represent a well-formed TonAPI WebSocket Jetton transfer action payload. All addresses, hashes, and amounts are placeholder values. No secrets, no real operator data.` |
| `reviewerNotes` | `Synthetic content verified. No sensitive data present. Metadata complete. Payload shape sufficient for future extractor design. Profiling and noise suppression metadata advisory only. Approved for fixture commit.` |

## 5. Proposed Synthetic TonAPI-Shaped Payload

This is a synthetic TonAPI-shaped payload hand-crafted to resemble a Jetton
transfer action event as delivered via the TonAPI WebSocket stream. All
transaction hashes and trace IDs are placeholder values. Addresses are
smoke-tested valid TON values. Sender is omitted (null) because absent source
is permitted and not a rejection. No secrets, API keys, tokens, or real
operator data are present.

```json
{
  "event_id": "synth-event-00000000000000000001",
  "timestamp": 1700000000,
  "actions": [
    {
      "type": "JettonTransfer",
      "status": "ok",
      "JettonTransfer": {
        "sender": null,
        "recipient": {
          "address": "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl"
        },
        "jetton": {
          "address": "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv"
        },
        "amount": "1000000",
        "comment": null
      },
      "base_transactions": [
        {
          "hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "lt": "47000000000001",
          "utime": 1700000000
        }
      ],
      "trace_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "action_index": 0,
      "message_hash": null
    }
  ]
}
```

## 6. Expected `RawProviderEvent` Draft

The following is the expected neutral `RawProviderEvent` that a future TonAPI
extractor should produce from the synthetic payload in Section 5. This is a
review target only. It does not implement the extractor. `sourceAddress` is
`null` because the sender is absent in the payload; absent source is not a
rejection.

```json
{
  "provider": "tonapi",
  "receivedAt": "2023-11-14T22:13:20.000Z",
  "payload": {
    "eventType": "jetton_transfer",
    "sourceAddress": null,
    "destinationAddress": "0QC73QalKxi5vYfRjcVY2Ycn_W5XHr2eyMPVeQ1NnuB7YMFl",
    "jettonMaster": "0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv",
    "amount": "1000000",
    "txHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "traceId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "actionIndex": 0,
    "messageHash": null,
    "lt": "47000000000001",
    "eventTimestamp": "2023-11-14T22:13:20.000Z",
    "finality": "confirmed"
  }
}
```

## 7. High-Fidelity Profiling Metadata Review

The following is the synthetic advisory profiling metadata proposed for this
fixture. All fields are nullable and advisory only.

```json
{
  "accountStatus": "active",
  "contractCodeHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "walletTypeHint": "v4",
  "walletVersionHint": "v4r2",
  "interfacesDetected": ["wallet"],
  "knownContractFamily": "wallet_v4",
  "entityLabel": null,
  "classificationConfidence": "high",
  "classificationSource": "local_registry",
  "classificationMethod": "code_hash_lookup",
  "profileObservedAt": "2023-11-14T22:13:20.000Z",
  "profileSourcePayloadRef": "tonapi_synth_jetton_transfer_001"
}
```

The following rules apply to all profiling metadata in this fixture and in any
system behavior derived from it:

- Profiling metadata is advisory only. It has no operational effect.
- Profiling does not trigger execution of any kind.
- Profiling does not promote candidates to targets.
- Profiling does not generate or write to any targets file.
- Profiling does not read or write `RunState`.
- Profiling does not auto-include or auto-exclude recipients.
- Profiling does not change Dispatcher behavior in any way.
- Profiling does not rank or target recipients by wallet wealth or balance.

## 8. Economic Noise Suppression Metadata Review

The following is the synthetic noise suppression metadata proposed for this
fixture. All fields are review metadata only.

```json
{
  "dustThreshold": "10000",
  "minimumEventAmount": "10000",
  "lowSignalRejectionExpectation": false,
  "noiseSuppressionRationale": "Amount 1000000 is well above dust threshold. Fixture represents a normal-signal transfer event.",
  "spamPatternHint": null,
  "fixtureRelevanceNote": "Represents a standard passing Jetton transfer event for normalize_pass pipeline validation."
}
```

The following rules apply to all noise suppression metadata in this fixture:

- Noise suppression metadata is review-only. It has no operational effect.
- No high-value target scoring or prioritization.
- No wallet wealth ranking of any kind.
- No balance-based targeting or filtering.
- No amount entropy analysis intended to mask behavior.
- No behavior masking of any kind.
- No delivery optimization based on recipient profile.
- No provider evasion techniques of any kind.

## 9. Redaction Review

This fixture is synthetic. The reviewer confirms it contains none of the
following:

- API keys or API secrets
- Bearer tokens or authorization headers
- Session cookies or authentication tokens
- Private keys or key material
- Mnemonics or seed phrases
- Private infrastructure URLs, internal hostnames, or internal IP addresses
- Operator personal or identifying data
- Secrets embedded in headers, URLs, query parameters, or request bodies

All addresses, transaction hashes, trace IDs, and amounts are explicitly
synthetic placeholder values with no connection to real operator infrastructure
or real on-chain activity. `redactionStatus` is `"none"` because no real data
was ever present to redact.

## 10. Future Fixture Commit Target

The following fixture files are proposed for future commit. They must not be
created by this document. Directory creation and fixture JSON commit must
happen in a separate commit after this review is merged.

- `fixtures/tonapi/synthetic/tonapi_synth_jetton_transfer_001.json`
- `fixtures/tonapi/expected/tonapi_synth_jetton_transfer_001.raw-provider-event.json`

The content of these files must exactly match the proposed payload and expected
`RawProviderEvent` draft defined in Sections 5 and 6 respectively, plus the
fixture metadata from Section 4.

## 11. Forbidden Behaviors

The following are forbidden at this stage and must remain forbidden in any
system behavior derived from this fixture review:

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

## 12. Final Rule

This review approves only the future commit of the synthetic fixture files
listed in Section 10.

It does not approve extractor implementation.

It does not approve live TonAPI ingestion.

It does not approve real provider sample handling.