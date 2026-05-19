# Stage H-3.3 — Secret Marker Classification

## Scope

Stage H-3.3 classifies the `POTENTIAL_BLOCKING` findings emitted by the H-3.2 secret-marker skeleton.

This stage is classification-only.

H-3.3 does not enforce marker blocking.

H-3.3 does not remove, edit, or remediate any marker.

H-3.3 does not read .env values.

H-3.3 does not introduce signer, RPC, wallet opening, seqno query, Testnet, Mainnet, broadcast, or DRY_RUN=false execution.

## Baseline

Baseline: origin/main = 583aba4 Add Stage H3 secret marker skeleton.

H-3.2 skeleton output:

- unknownTrackedFiles = []
- unknownOccurrenceFiles = []
- skeletonMode = true
- enforcementMode = false
- POTENTIAL_BLOCKING = 16

## Classification Labels

### APPROVED_TEST_SENTINEL

Marker appears only inside a deterministic test/smoke sentinel, dummy fixture, or controlled negative case.

This does not approve production secret handling.

### APPROVED_GATE_NEGATIVE_CASE

Marker appears only inside a gate smoke that proves fail-closed behavior.

This does not approve live execution.

### APPROVED_POLICY_GUARD

Marker appears only as a forbidden-field name, policy guard, scanner marker, or canonical-output exclusion check.

This does not approve storing or using the marker as secret material.

### CONFIG_SECRET_CAVEAT

Marker appears in configuration as a secret-reference key or environment-variable reference.

This is not a raw secret leak, but it remains a blocker/caveat before signer or Testnet work.

### ACTIVE_SOURCE_BLOCKER_BEFORE_TESTNET

Marker appears in active source and represents future signer/secrets risk.

This may remain during dry-run stages but must be remediated, isolated, or explicitly gated before signer/Testnet work.

### LEGACY_DRY_RUN_EXCEPTION

Marker appears in legacy or transitional dry-run gate code that explicitly blocks live execution.

This does not approve live execution and must remain blocked until a future stage replaces or retires it.

## Potential Blocking Marker Classifications

### data/operators.json::mnemonic

Classification: CONFIG_SECRET_CAVEAT.

Evidence: key-only review found `envMnemonicKey` in operator entries. No raw mnemonic value was printed or copied into evidence.

Disposition: not a raw secret leak, but remains a blocker/caveat before signer or Testnet work.

### lib/dispatcher/administrativeHaltInterception.ts::privateKey

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears inside the administrative halt forbidden-field guard.

Disposition: allowed as forbidden-field text only.

### lib/dispatcher/administrativeHaltInterception.ts::signedMessage

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears inside the administrative halt forbidden-field guard.

Disposition: allowed as forbidden-field text only.

### lib/dispatcher/walletPool.ts::mnemonic

Classification: ACTIVE_SOURCE_BLOCKER_BEFORE_TESTNET.

Evidence: active dispatcher-side wallet pool resolves mnemonic references for eligible operators.

Disposition: acceptable only as dry-run-era caveat; must be remediated, isolated, or explicitly gated before signer/Testnet work.

### scripts/e-preflight-orchestrator-smoke.ts::privateKey

Classification: APPROVED_TEST_SENTINEL.

Evidence: marker appears in an E-Preflight cryptographic smoke using an ephemeral keypair for signature verification testing.

Disposition: allowed as deterministic test-only sentinel; not approved for production signer handling.

### scripts/f-8-administrative-halt-interception-smoke.ts::signedMessage

Classification: APPROVED_TEST_SENTINEL.

Evidence: marker appears as a forbidden signed-payload field inside an administrative halt negative smoke.

Disposition: allowed as negative test input only.

### scripts/g-2-deterministic-execution-context-audit-smoke.ts::privateKey

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears in a deterministic audit smoke that verifies forbidden secret fields do not enter canonical execution context.

Disposition: allowed as forbidden-field exclusion text only.

### scripts/g-2-deterministic-execution-context-audit-smoke.ts::signedMessage

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears in a deterministic audit smoke that verifies forbidden signed-payload fields do not enter canonical execution context.

Disposition: allowed as forbidden-field exclusion text only.

### scripts/h-1-legacy-execution-artifact-quarantine-smoke.ts::DRY_RUN=false

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears inside a quarantine smoke that verifies legacy execution artifacts remain documented and blocked.

Disposition: allowed as quarantine-policy text only.

### scripts/h-2-network-boundary-guarding-smoke.ts::mnemonic

Classification: APPROVED_POLICY_GUARD.

Evidence: marker appears inside a network-boundary smoke forbidden-marker list.

Disposition: allowed as boundary-guard marker text only.

### scripts/launchStageA.ts::DRY_RUN=false

Classification: LEGACY_DRY_RUN_EXCEPTION.

Evidence: marker appears in legacy Stage A launcher comments and gate errors that explicitly require live execution gates.

Disposition: not approved for Stage H execution; must remain blocked before Testnet/Mainnet.

### scripts/stage-b-gate-smoke.sh::mnemonic

Classification: APPROVED_TEST_SENTINEL.

Evidence: marker appears in Stage B gate smoke dummy mnemonic testing vectors.

Disposition: allowed as sterile test sentinel only.

### scripts/stage-b-real-gate-smoke.sh::DRY_RUN=false

Classification: APPROVED_GATE_NEGATIVE_CASE.

Evidence: marker appears in real-execution gate smoke that verifies live execution remains blocked even under explicit DRY_RUN=false input.

Disposition: allowed as fail-closed gate test only.

### scripts/stage-b-update-metadata-gate-smoke.sh::DRY_RUN=false

Classification: APPROVED_GATE_NEGATIVE_CASE.

Evidence: marker appears in updateMetadata gate smoke that verifies metadata mutation remains blocked under DRY_RUN=false without approved gates.

Disposition: allowed as fail-closed gate test only.

### scripts/stage-b2-tonapi-fixture-smoke.ts::mnemonic

Classification: APPROVED_TEST_SENTINEL.

Evidence: marker appears in TonAPI fixture smoke as sterile sentinel text.

Disposition: allowed as test-only marker; not approved as raw secret material.

### scripts/updateMetadata.ts::DRY_RUN=false

Classification: LEGACY_DRY_RUN_EXCEPTION.

Evidence: marker appears in updateMetadata comments and guard code that explicitly blocks live execution until approved future gates exist.

Disposition: not approved for Stage H execution; must remain blocked before metadata mutation, Testnet, or Mainnet.

## Classification Summary

The 16 H-3.2 `POTENTIAL_BLOCKING` findings are classified as:

- APPROVED_TEST_SENTINEL: 4
- APPROVED_GATE_NEGATIVE_CASE: 2
- APPROVED_POLICY_GUARD: 6
- CONFIG_SECRET_CAVEAT: 1
- ACTIVE_SOURCE_BLOCKER_BEFORE_TESTNET: 1
- LEGACY_DRY_RUN_EXCEPTION: 2

No finding is reclassified as an approved production secret path.

No finding approves signer integration, wallet opening, RPC, broadcast, Testnet, Mainnet, or DRY_RUN=false execution.

No raw secret value was copied into this classification evidence.
