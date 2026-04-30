````markdown
# CURRENT PROJECT STATE
## TON Jetton Distribution Engine

**Last updated:** 2026-04-28  
**Document path:** `docs/CURRENT_PROJECT_STATE.md`

---

## 1. Project Purpose

This project is a TON Jetton Distribution Engine built around Tact smart contracts and a TypeScript dispatcher engine.

The system is designed to distribute Jettons through a deterministic, auditable, entry-centric off-chain execution engine.

The long-term goal is to reach a safe live execution path, but the current phase is strictly dry-run validation.

---

## 2. Current Phase

**Stage A — Dry Run Validation**

Current status:

- No real blockchain execution
- No live MintExecutor
- No Stage B implementation
- No Watcher implementation
- Dispatcher validation only

The active goal is to prove:

- deterministic batching
- state integrity
- Hook & Lock correctness
- wallet pool rotation
- audit correctness
- recovery behavior
- failure handling

---

## 3. Completed Validations

The following dry-run stress tests passed cleanly:

| Run ID | Recipients | Batch Size | Expected Batches | Result |
|---|---:|---:|---:|---|
| `stress_stage_a_10_02` | 10 | 10 | 1 | Passed |
| `stress_stage_a_25_01` | 25 | 10 | 3 | Passed |
| `stress_stage_a_50_01` | 50 | 10 | 5 | Passed |

These runs confirmed:

- `generate-targets.ts` produces unique valid TON addresses
- duplicate recipient collision issue was resolved
- `launchStageA.ts` is the active Composition Root
- `bulkMint.ts` is not used for Stage A dispatcher validation
- `RunState.entries` is populated correctly on success path
- Hook & Lock writes `submitted` before dry-run success transition
- audit CSV rows contain correct decimal string amounts
- state files contain correct decimal string amounts
- operator rotation works across multiple batches
- pacing works through `ENTRY_DELAY_MS` and `BATCH_DELAY_MS`
- final lock state returns to null
- no unexpected skipped/cooldown/failed entries occurred in success-path stress tests

Not yet proven:

- crash recovery
- zombie recovery under forced interruption
- retry/cooldown behavior under injected RPC failure
- operator failover under failure
- hard failure classification
- unknown retry disposition handling

---

## 4. Current Active Engine

Only the following files are part of the active Stage A execution path.

### Entry points

```text
scripts/launchStageA.ts
scripts/generate-targets.ts
````

### Dispatcher engine

```text
lib/dispatcher/dispatcher.ts
lib/dispatcher/stateStore.ts
lib/dispatcher/walletPool.ts
lib/dispatcher/retryPolicy.ts
lib/dispatcher/reconciler.ts
lib/dispatcher/auditWriter.ts
lib/dispatcher/batchPlanner.ts
lib/dispatcher/amountAllocator.ts
lib/matchingEngine.ts
```

### Active data/config

```text
data/operators.json
data/token-metadata.json
data/targets.json
data/targets.10.json
data/targets.25.json
data/targets.50.json
```

### Contracts

```text
contracts/messages.tact
contracts/JettonMaster.tact
contracts/JettonWallet.tact
```

Contracts are present but are not being modified during the current phase.

---

## 5. Current Project Tree Snapshot

```text
TonProject/
├─ contracts/
│  ├─ messages.tact
│  ├─ JettonMaster.tact
│  └─ JettonWallet.tact
│
├─ data/
│  ├─ targets.json
│  ├─ targets.10.json
│  ├─ targets.25.json
│  ├─ targets.50.json
│  ├─ token-metadata.json
│  └─ operators.json
│
├─ docs/
│  ├─ WATCHER_ARCHITECTURE.md
│  └─ CURRENT_PROJECT_STATE.md
│
├─ lib/
│  ├─ buildLegacyStatusMessage.js
│  ├─ staggered-broadcaster.js
│  ├─ getWalletAddress.js
│  ├─ messageRegistry.ts
│  ├─ messageRegistry.js
│  ├─ deploy_helpers.tact
│  ├─ gas-oracle.ts
│  ├─ matchingEngine.ts
│  └─ dispatcher/
│     ├─ dispatcher.ts
│     ├─ stateStore.ts
│     ├─ walletPool.ts
│     ├─ retryPolicy.ts
│     ├─ reconciler.ts
│     ├─ auditWriter.ts
│     ├─ batchPlanner.ts
│     └─ amountAllocator.ts
│
├─ scripts/
│  ├─ launchStageA.ts
│  ├─ generate-targets.ts
│  ├─ deployJettonMaster.ts
│  ├─ updateMetadata.ts
│  ├─ vaultDistribution.ts
│  ├─ vaultDistribution_linkTest.ts
│  ├─ bulkMint.ts
│  ├─ batchStatusUpdate.ts
│  └─ gasEstimator.ts
│
├─ legacy/
├─ reports/
├─ build/
├─ temp/
├─ tests/
├─ .env
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ tact.config.json
├─ jest.config.ts
├─ jest.setup.ts
├─ .gitignore
├─ .prettierrc
└─ .prettierignore
```

---

## 6. Current Invariants

These invariants are non-negotiable.

### State integrity

* `RunState.entries` is the only execution source of truth.
* No execution decision may be driven by campaign-level arrays.
* State must be persisted before any execution attempt.
* Hook & Lock rule: each recipient entry must be written as `submitted` before broadcast.

### Idempotency

State key format:

```text
<batchId>::<recipientAddress.toLowerCase()>
```

Important implication:

* duplicate addresses inside the same batch cause key collision
* generated targets must be unique unless the state key model is intentionally changed

### Amount normalization

* runtime amount = `bigint`
* JSON / CSV / state amount = decimal string
* no `1000000000n` in JSON
* no numeric amount in CSV/state

### Execution scope

* Stage A is dry-run only
* no live blockchain execution
* no live MintExecutor
* no Stage B Watcher execution
* no Dispatcher redesign

---

## 7. Current Operators

Current intended operator model:

* `operator-01` active
* `operator-02` active
* `operator-03` disabled/reserved

Operator mnemonics live only in `.env`.

`data/operators.json` may be tracked only if it contains environment variable names such as:

```json
"envMnemonicKey": "OPERATOR_01_MNEMONIC"
```

It must never contain real mnemonics.

---

## 8. Current Git / Secret Policy

GitHub is for source code only.

Do not commit:

```text
.env
.env.*
mnemonics
API keys
*.state.json
run_state.json
reports/
*.csv
node_modules/
build/
temp/
data/candidates/
data/dedup.db
data/targets.generated.json
data/targets.*.json
```

Safe to track:

```text
contracts/
lib/
scripts/
docs/
tests/
data/token-metadata.json
data/operators.json if it contains no secrets
data/targets.json if it is a clean baseline fixture
package.json
package-lock.json
tsconfig.json
tact.config.json
jest.config.ts
jest.setup.ts
.gitignore
.prettierrc
.prettierignore
```

Generated stress targets can be regenerated through:

```text
scripts/generate-targets.ts
```

---

## 9. Migration Plan

Before continuing the project, migrate to the new machine.

Required order:

1. Prepare old machine

   * confirm Git status
   * confirm secrets are not tracked
   * back up `.env`, mnemonics, API keys manually
   * back up full project folder as safety copy

2. Set up new machine

   * Windows 11
   * WSL2 Ubuntu
   * VS Code on Windows connected to WSL
   * Node LTS via NVM inside WSL
   * Python inside WSL
   * Git SSH key for GitHub
   * Docker Desktop with WSL backend later if needed

3. Clone project into WSL

```text
~/projects/TonProject
```

Do not work from:

```text
C:\Users\...
/mnt/c/...
```

4. Restore `.env` manually

5. Run sanity checks

```bash
npm install
npx tsc --noEmit
npx blueprint --help
npx blueprint run launchStageA
```

The last command must run with:

```env
DRY_RUN=true
```

Migration is not considered complete until `launchStageA` completes a clean dry run on the new machine.

---

## 10. Next Planned Steps After Migration

After the new machine passes sanity check, continue with Fault Matrix.

Run these in order:

1. `fault_stage_a_invalid_target_01`
2. `fault_stage_a_crash_recovery_01`
3. `fault_stage_a_rpc_transient_01`
4. `fault_stage_a_operator_failover_01`
5. `fault_stage_a_hard_failure_01`

Only after all five pass:

6. `stress_stage_a_100_01`

Only after `stress_stage_a_100_01` passes:

7. Stage A freeze

Only after Stage A freeze:

8. Stage B begins

---

## 11. Fault Matrix Plan

### 1. Invalid Target

Campaign:

```env
CAMPAIGN_ID=fault_stage_a_invalid_target_01
TARGETS_PATH=./data/targets.fault.invalid.10.json
DRY_RUN=true
```

Expected behavior:

* fail early
* clear validation error
* no `batch_in_flight`
* no `batch_success`
* no partial execution

### 2. Crash Recovery

Campaign:

```env
CAMPAIGN_ID=fault_stage_a_crash_recovery_01
TARGETS_PATH=./data/targets.10.json
DRY_RUN=true
```

Procedure:

* run `launchStageA`
* stop manually with `Ctrl+C` after 2–4 successes
* do not delete state
* rerun same campaign

Expected behavior:

* recovery succeeds
* no stuck lock
* no duplicate success
* no permanent zombie
* clean completion

### 3. RPC Transient

Purpose:

* validate retry/cooldown behavior on temporary provider/RPC failure

Expected behavior:

* no false success
* retry decision is correct
* state records last error
* lock clears
* rerun/resume is deterministic

### 4. Operator Failover

Purpose:

* validate wallet pool behavior when an operator is unavailable or failed

Expected behavior:

* failing operator is marked accordingly
* next operator is selected
* no infinite reselection loop

### 5. Hard Failure

Purpose:

* validate terminal failure behavior

Expected behavior:

* affected entry becomes hard failure or equivalent terminal status
* no infinite retry loop
* audit and state agree

---

## 12. Stage B / Watcher Status

Watcher is Stage B, not Stage A.

Current status:

```text
docs/WATCHER_ARCHITECTURE.md
```

is approved as Stage B0 Design Spec.

No code is allowed yet.

The Watcher must remain:

* passive ingestion only
* no Dispatcher calls
* no RunState writes
* no broadcast
* pending candidates only
* candidate queue before targets
* no auto-execution

Stage B plan:

1. B0 — architecture spec complete
2. B1 — offline parser from recorded provider event fixtures
3. B2 — live Watcher to candidate queue
4. B3 — candidate-to-targets builder
5. B4 — Dispatcher dry run from generated targets
6. Stage C — optional live executor later

---

## 13. Do Not Touch Now

Do not modify:

```text
contracts/
dispatcher architecture
stateStore schema
walletPool architecture
retryPolicy architecture
pacing logic
metadata/UI/payload experiments
bulkMint path
Watcher implementation
Live executor
```

Do not start:

```text
watcher.ts
Stage B implementation
Stage C live execution
stress_stage_a_100_01 before Fault Matrix
```

---

## 14. Final Current Operating Plan

```text
1. Finish machine migration
2. Run full sanity check
3. Run Fault Matrix 1–5
4. Run stress_stage_a_100_01
5. Freeze Stage A
6. Begin Stage B with Watcher B1 offline parser
7. Only much later: live executor / mainnet readiness
```

This is the active plan.

```

---

# פסק דין על התשובה של קלוד

הוא בכיוון נכון, אבל **חייב לתקן את הטעויות שציינתי** לפני שזה יהיה מסמך מצב אמיתי.

הכי חשוב:
- לא לכתוב שכבר בדקנו Fault Matrix
- לא לכתוב שכבר הוכחנו retry classifications
- לא לכתוב batch size שגוי
- לא לכתוב stress-100 batch-size-1

הגרסה שנתתי כאן היא הגרסה שאני ממליץ לשמור.
```
