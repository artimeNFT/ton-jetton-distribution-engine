# STAGE_B2_TONAPI_SYNTHETIC_MISSING_TXHASH_001_REVIEW

## 1. Status

- Design/review document only.
- Synthetic rejection fixture content review only.
- No fixture JSON file created by this document.
- No TonAPI client approved.
- No extractor approved.
- No live ingestion approved.
- No execution approved.

---

## 2. Required Source Documents

- `docs/STAGE_B2_PROVIDER_FIXTURE_CONTRACT.md`
- `docs/STAGE_B2_FIXTURE_SCHEMA_REVIEW.md`
- `docs/STAGE_B2_TONAPI_FIXTURE_REVIEW.md`
- `docs/STAGE_B2_TONAPI_FIXTURE_INTAKE.md`
- `docs/STAGE_B2_TONAPI_SYNTHETIC_FIXTURE_001_REVIEW.md`
- `docs/stage-b2-ingestion-completion.md`

If any of these documents conflict, the stricter safety boundary wins.

---

## 3. Review Decision

| Field | Value |
|---|---|
| fixtureId | `tonapi_synth_missing_txhash_001` |
| provider | `tonapi` |
| fixtureClass | `synthetic_provider_sample` |
| realOrSynthetic | `synthetic` |
| reviewStatus | `approved_for_fixture_commit` |
| expectedOutcome | `reject_missing_tx_hash` |
| codeLevelReason | `MISSING_TX_HASH` |

This approval covers only the future commit of the synthetic rejection fixture files listed in Section 11. It does not approve extractor implementation, live ingestion, or real provider sample handling.

---

## 4. Proposed Fixture Metadata

| Field | Value |
|---|---|
| fixtureId | `tonapi_synth_missing_txhash_001` |
| provider | `tonapi` |
| fixtureClass | `synthetic_provider_sample` |
| captureSource | `hand_crafted` |
| captureDate | `synthetic` |
| realOrSynthetic | `synthetic` |
| redactionStatus | `none` |
| redactionNotes | `null` |
| chain | `ton_mainnet` |
| network | `mainnet` |
| tonapiSourceKind | `websocket_events` |
| tonapiEndpointOrStreamName | `tonapi_websocket_events` |
| jettonMaster | `0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv` |
| expectedOutcome | `reject_missing_tx_hash` |
| codeLevelReason | `MISSING_TX_HASH` |
| reviewStatus | `approved_for_fixture_commit` |
| submitterNotes | Synthetic fixture hand-crafted to represent a TonAPI WebSocket Jetton transfer payload with a missing txHash. All addresses, hashes, and amounts are placeholder values. No secrets, no real operator data. |
| reviewerNotes | Synthetic content verified. No sensitive data present. Metadata complete. Rejection condition is empty `base_transactions[0].hash`. Approved for fixture commit only. No extractor implementation approved. |

---

## 5. Proposed Synthetic TonAPI-Shaped Payload

```json
{
  "event_id": "synth-event-00000000000000000002",
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
          "hash": "",
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

The rejection condition is the empty string value of `base_transactions[0].hash`. All other fields are structurally valid. No secrets, API keys, cookies, authorization headers, private infrastructure URLs, or operator data are present.

---

## 6. Expected RawProviderEvent Rejection Draft

A future TonAPI extractor would produce the following neutral RawProviderEvent before normalization:

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
    "txHash": "",
    "traceId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "actionIndex": 0,
    "messageHash": null,
    "lt": "47000000000001",
    "eventTimestamp": "2023-11-14T22:13:20.000Z",
    "finality": "confirmed"
  }
}
```

---

## 7. Expected Rejection Result

```json
{
  "fixtureId": "tonapi_synth_missing_txhash_001",
  "expectedOutcome": "reject_missing_tx_hash",
  "pass": false,
  "codeLevelReason": "MISSING_TX_HASH"
}
```

This must map directly to `filterAndNormalize` returning `pass: false` with reason `MISSING_TX_HASH`. The empty string `txHash` is not a valid transaction hash and must be treated as absent. No normalized event is produced on this path.

---

## 8. Profiling Metadata Review

Profiling metadata may be omitted for this rejection fixture, or included only as advisory null values.

- Profiling is advisory only.
- Profiling does not trigger execution.
- Profiling does not promote candidates.
- Profiling does not generate targets.
- Profiling does not write RunState.
- Profiling does not auto-include or auto-exclude users.
- Profiling does not change Dispatcher behavior.
- Profiling does not rank or target users by wealth.

---

## 9. Economic Noise Suppression Metadata Review

Review-only advisory values:

| Field | Value |
|---|---|
| dustThreshold | `"10000"` |
| minimumEventAmount | `"10000"` |
| lowSignalRejectionExpectation | `false` |
| noiseSuppressionRationale | Rejection is caused by missing txHash, not amount or dust logic. |
| spamPatternHint | `null` |
| fixtureRelevanceNote | Validates deterministic missing txHash rejection path. |

The amount `1000000` is well above the dust threshold. Rejection on this fixture is driven solely by the empty `txHash`, not by any economic signal.

- No high-value target scoring.
- No wallet wealth ranking.
- No balance-based targeting.
- No amount entropy.
- No behavior masking.
- No delivery optimization.
- No provider evasion.

---

## 10. Redaction Review

This fixture is synthetic and contains none of the following:

- API keys
- Bearer tokens
- Cookies
- Authorization headers
- Private keys
- Mnemonics
- Private infrastructure URLs
- Internal hostnames or IP addresses
- Operator personal data
- Secrets in headers, URLs, query parameters, or request/response bodies

All addresses, hashes, and amounts are placeholder values with no connection to real operator infrastructure.

---

## 11. Future Fixture Commit Target

The following fixture files are approved for future commit. They do not exist yet and must not be created by this document:

- `fixtures/tonapi/synthetic/tonapi_synth_missing_txhash_001.json`
- `fixtures/tonapi/expected/tonapi_synth_missing_txhash_001.rejection.json`

Directory creation and fixture JSON commit must happen in a separate commit after this review is merged. No directories or files are to be created as part of this review.

---

## 12. Forbidden Behaviors

The following are explicitly forbidden at this stage:

- TonAPI API client
- TonAPI WebSocket client
- TonAPI polling
- Authenticated TonAPI requests
- Extractor implementation
- Dispatcher calls
- RunState reads or writes
- Targets writes
- Candidate-to-target promotion
- Metadata mutation
- Funding logic
- Signing
- Sending
- Broadcasting
- Testnet execution
- Mainnet execution
- Synthetic traffic
- Random timing
- Behavior masking

---

## 13. Final Rule

- This review approves only the future commit of the synthetic rejection fixture files listed in Section 11.
- It does not approve extractor implementation.
- It does not approve live TonAPI ingestion.
- It does not approve real provider sample handling.
