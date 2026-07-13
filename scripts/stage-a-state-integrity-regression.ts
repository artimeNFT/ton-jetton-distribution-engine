import { strict as assert } from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { planBatches, type BatchRecipient } from "../lib/dispatcher/batchPlanner";
import {
  JsonAtomicStateStore,
  StateConflictError,
  createEmptyRunState,
  loadState,
  makeStateKey,
  saveStateAtomic,
  setEntryGuarded,
  type RunState,
  type StateEntry,
} from "../lib/dispatcher/stateStore";
import { createReconciler, ReconcilerError, type AuditLogEntry } from "../lib/dispatcher/reconciler";
import { createWalletPool } from "../lib/dispatcher/walletPool";
import {
  createDispatcher,
  type AuditRecordEvent,
  type AuditRecorder,
  type CampaignConfig,
  type Dispatcher,
  type Provider,
  type RetryPolicy,
} from "../lib/dispatcher/dispatcher";
import { classifyRetry } from "../lib/dispatcher/retryPolicy";
import { DefaultMatchingEngine } from "../lib/matchingEngine";

const NOW = "2026-07-12T12:00:00.000Z";
const OLD = "2026-07-12T11:00:00.000Z";

interface TestResult {
  id: string;
  name: string;
  status: "PASS";
}

const results: TestResult[] = [];

async function test(id: string, name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  results.push({ id, name, status: "PASS" });
  console.log(`[stage-a-active-regression] ${id} PASS — ${name}`);
}

function validEntry(input: Partial<StateEntry> & Pick<StateEntry, "batchId" | "recipientAddress">): StateEntry {
  const status = input.status ?? "planned";
  const submitted = status === "submitted";
  const terminal = ["success", "hard_failure", "skipped", "cancelled"].includes(status);
  return {
    batchId: input.batchId,
    recipientAddress: input.recipientAddress,
    recipientIndex: input.recipientIndex ?? 0,
    amount: input.amount ?? "1",
    status,
    attemptNumber: input.attemptNumber ?? (status === "planned" ? 0 : 1),
    operatorId: input.operatorId ?? (submitted || terminal ? "op-a" : null),
    operatorLabel: input.operatorLabel ?? (submitted || terminal ? "Operator A" : null),
    txHash: input.txHash ?? (status === "success" ? "tx-existing" : null),
    networkRef: input.networkRef ?? null,
    createdAt: input.createdAt ?? OLD,
    updatedAt: input.updatedAt ?? OLD,
    submittedAt: input.submittedAt ?? (submitted || terminal ? OLD : null),
    finalizedAt: input.finalizedAt ?? (terminal ? OLD : null),
    cooldownUntil: input.cooldownUntil ?? (status === "cooldown" ? NOW : null),
    lastErrorCode: input.lastErrorCode ?? null,
    lastError: input.lastError ?? null,
    lastDecision: input.lastDecision ?? "none",
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

function provider(): Provider {
  return {
    id: "op-a",
    label: "Operator A",
    maxBatchSize: 100,
    maxTxPerHour: 1_000_000,
  };
}

function campaign(campaignId: string, recipients: BatchRecipient[]): CampaignConfig {
  return {
    campaignId,
    metadataFilePath: "/unused/metadata.json",
    recipients,
    batchSize: 100,
  };
}

function baseDispatcher(input: {
  stateDir: string;
  auditRecorder: AuditRecorder;
  walletPool?: {
    getNextAvailableProvider(now: number, selectionKey?: string): Promise<Provider | null> | Provider | null;
    markSuccess(id: string, now: number): Promise<void> | void;
    markFailure(id: string, info: { reason: string; now: number; cooldownUntil?: string | null; failedUntil?: string | null }): Promise<void> | void;
  };
  forceExecutorInDryRun?: boolean;
  executorThrows?: boolean;
  executorErrorMessage?: string;
  onBroadcast?: () => void;
  retryPolicy?: RetryPolicy;
}): Dispatcher {
  return createDispatcher({
    stateDir: input.stateDir,
    reconciler: {
      async reconcileCampaign(): Promise<void> {},
      async verifyMetadataPreflight() {
        return {
          name: "Token",
          symbol: "TKN",
          description: "test",
          image: "https://example.invalid/token.png",
          decimals: 9,
          contentVersion: 1,
        };
      },
    },
    executor: {
      async broadcast() {
        input.onBroadcast?.();
        if (input.executorThrows) {
          throw new Error(input.executorErrorMessage ?? "injected executor failure");
        }
        return { txHash: "tx-test", networkRef: null };
      },
    },
    walletPool: input.walletPool ?? {
      async getNextAvailableProvider() { return provider(); },
      async markSuccess() {},
      async markFailure() {},
    },
    retryPolicy: input.retryPolicy ?? {
      classify() {
        return {
          disposition: "fail_batch" as const,
          reasonCode: "injected_failure",
          reason: "injected failure",
        };
      },
    },
    auditRecorder: input.auditRecorder,
    matchingEngine: new DefaultMatchingEngine(),
    dryRun: true,
    forceExecutorInDryRun: input.forceExecutorInDryRun ?? false,
    entryDelayMs: 0,
    batchDelayMs: 0,
  });
}

async function expectReject(promise: Promise<unknown>, pattern: RegExp): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
    return error;
  }
  assert.fail(`Expected rejection matching ${pattern}`);
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ton-stage-a-active-regression-"));

  await test("A", "normalized duplicate rejected before batching", () => {
    const recipients: BatchRecipient[] = [
      { address: " EQ_DUP ", amount: 1n },
      { address: "eq_dup", amount: 2n },
    ];
    assert.throws(
      () => planBatches(recipients, { campaignId: "dup-a", batchSize: 100 }),
      /Duplicate recipient after trim\(\)\.toLowerCase\(\)/
    );
  });

  await test("B", "duplicate across would-be batches rejected at campaign preflight", () => {
    const recipients: BatchRecipient[] = [
      { address: "EQ_ONE", amount: 1n },
      { address: "eq_one ", amount: 2n },
    ];
    assert.throws(
      () => planBatches(recipients, { campaignId: "dup-b", batchSize: 1 }),
      /Duplicate recipient/
    );
  });

  await test("C", "malformed RunState entry fails closed", async () => {
    const dir = path.join(root, "c");
    await fs.mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "c.state.json");
    const raw = createEmptyRunState("c", NOW) as unknown as Record<string, unknown>;
    (raw["entries"] as Record<string, unknown>)["bad"] = "not-an-entry";
    await fs.writeFile(statePath, JSON.stringify(raw), "utf8");
    await expectReject(loadState(statePath, "c"), /entries\["bad"\] must be an object/);
  });

  await test("D", "RunState key/content mismatch fails closed", async () => {
    const dir = path.join(root, "d");
    await fs.mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "d.state.json");
    const raw = createEmptyRunState("d", NOW);
    raw.entries["wrong-key"] = validEntry({ batchId: "d-batch-1", recipientAddress: "EQ_D" });
    await fs.writeFile(statePath, JSON.stringify(raw), "utf8");
    await expectReject(loadState(statePath, "d"), /key\/content mismatch/);
  });

  await test("E", "stale eligibility cannot overwrite a conflicting terminal state", async () => {
    const dir = path.join(root, "e");
    await fs.mkdir(dir, { recursive: true });
    const campaignId = "e";
    const statePath = path.join(dir, `${campaignId}.state.json`);
    const store = new JsonAtomicStateStore(statePath, campaignId);
    const key = makeStateKey(`${campaignId}-batch-1`, "EQ_E");
    const state = createEmptyRunState(campaignId, NOW);
    state.entries[key] = validEntry({ batchId: `${campaignId}-batch-1`, recipientAddress: "EQ_E" });
    await saveStateAtomic(statePath, state);

    const dispatcher = baseDispatcher({
      stateDir: dir,
      auditRecorder: { async write() {} },
      walletPool: {
        async getNextAvailableProvider() {
          await store.update((draft) => {
            const current = draft.entries[key]!;
            setEntryGuarded(draft, key, { allowedStatuses: ["planned"], expectedAttemptNumber: 0 }, {
              ...current,
              status: "success",
              attemptNumber: 1,
              operatorId: "op-a",
              operatorLabel: "Operator A",
              submittedAt: NOW,
              finalizedAt: NOW,
              updatedAt: NOW,
              txHash: "tx-concurrent",
            });
          });
          return provider();
        },
        async markSuccess() {},
        async markFailure() {},
      },
    });

    await expectReject(dispatcher.dispatch(campaign(campaignId, [{ address: "EQ_E", amount: 1n }])), /Guarded submission rejected/);
    const final = await store.read();
    assert.equal(final.entries[key]!.status, "success");
    assert.equal(final.entries[key]!.txHash, "tx-concurrent");
    assert.equal(final.lock.activeBatchId, null);
  });

  await test("F", "competing guarded updates resolve deterministically", async () => {
    const dir = path.join(root, "f");
    await fs.mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "f.state.json");
    const store = new JsonAtomicStateStore(statePath, "f");
    const key = makeStateKey("f-batch-1", "EQ_F");
    const state = createEmptyRunState("f", NOW);
    state.entries[key] = validEntry({ batchId: "f-batch-1", recipientAddress: "EQ_F" });
    await saveStateAtomic(statePath, state);

    const transition = (operatorId: string) => store.update((draft) => {
      const current = draft.entries[key]!;
      setEntryGuarded(draft, key, { allowedStatuses: ["planned"], expectedAttemptNumber: 0 }, {
        ...current,
        status: "submitted",
        attemptNumber: 1,
        operatorId,
        operatorLabel: operatorId,
        submittedAt: NOW,
        updatedAt: NOW,
      });
    });

    const settled = await Promise.allSettled([transition("op-first"), transition("op-second")]);
    assert.equal(settled[0]!.status, "fulfilled");
    assert.equal(settled[1]!.status, "rejected");
    assert.ok((settled[1] as PromiseRejectedResult).reason instanceof StateConflictError);
    assert.equal((await store.read()).entries[key]!.operatorId, "op-first");
  });

  await test("G", "unexpected batch failure clears authoritative run lock", async () => {
    const dir = path.join(root, "g");
    await fs.mkdir(dir, { recursive: true });
    const dispatcher = baseDispatcher({
      stateDir: dir,
      auditRecorder: {
        async write(event: AuditRecordEvent) {
          if (event.type === "batch_success") throw new Error("audit unavailable");
        },
      },
    });
    await expectReject(dispatcher.dispatch(campaign("g", [{ address: "EQ_G", amount: 1n }])), /audit unavailable/);
    const state = await loadState(path.join(dir, "g.state.json"), "g");
    assert.equal(state.lock.activeBatchId, null);
    assert.equal(state.meta.status, "running");
  });

  await test("B04-1", "uncertain submission remains non-eligible and cannot rebroadcast", async () => {
    const dir = path.join(root, "b04-1");
    await fs.mkdir(dir, { recursive: true });
    let broadcastCount = 0;
    const dispatcher = baseDispatcher({
      stateDir: dir,
      forceExecutorInDryRun: true,
      executorThrows: true,
      executorErrorMessage: "transaction broadcasted but could not confirm",
      onBroadcast: () => { broadcastCount++; },
      retryPolicy: {
        classify(input) {
          const decision = classifyRetry(input.error, {
            attempt: input.attemptNumber,
            maxAttempts: 3,
            campaignId: input.campaignId,
          });
          return {
            disposition: decision.disposition,
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            cooldownUntil: decision.cooldownUntil,
            failedUntil: decision.failedUntil,
          };
        },
      },
      auditRecorder: { async write() {} },
    });

    const config = campaign("b04-1", [{ address: "EQ_B04", amount: 1n }]);
    const first = await dispatcher.dispatch(config);
    assert.equal(first.stoppedEarly, true);
    assert.equal(broadcastCount, 1);

    const statePath = path.join(dir, "b04-1.state.json");
    const afterFirst = await loadState(statePath, "b04-1");
    const entry = Object.values(afterFirst.entries)[0]!;
    assert.equal(entry.status, "submitted");
    assert.equal(entry.lastErrorCode, "uncertain_submission");
    assert.equal(entry.lastDecision, "stop_campaign");
    assert.equal(afterFirst.meta.status, "stopped");

    const second = await dispatcher.dispatch(config);
    assert.equal(second.stoppedEarly, false);
    assert.equal(broadcastCount, 1);
    const afterSecond = await loadState(statePath, "b04-1");
    assert.equal(Object.values(afterSecond.entries)[0]!.status, "submitted");
    assert.notEqual(afterSecond.meta.status, "completed");
  });

  await test("H", "invalid submitted timestamp is held and never replanned", async () => {
    const dir = path.join(root, "h");
    await fs.mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "h.state.json");
    const state = createEmptyRunState("h", NOW);
    const key = makeStateKey("h-batch-1", "EQ_H");
    state.entries[key] = validEntry({
      batchId: "h-batch-1",
      recipientAddress: "EQ_H",
      status: "submitted",
      updatedAt: "not-a-time",
      submittedAt: "not-a-time",
    });
    await fs.writeFile(statePath, JSON.stringify(state), "utf8");
    const reconciler = createReconciler({
      stateDir: dir,
      auditWriter: { async readTerminalEntries() { return []; } },
      zombieTimeoutMs: 1,
    });
    const error = await expectReject(reconciler.reconcileCampaign({ campaignId: "h", now: Date.parse(NOW) }), /cannot load state/);
    assert.ok(error instanceof ReconcilerError);
    const unchanged = JSON.parse(await fs.readFile(statePath, "utf8")) as RunState;
    assert.equal(unchanged.entries[key]!.status, "submitted");
  });

  await test("I", "recovery is evidence-bound and uses guarded atomic transition", async () => {
    const dir = path.join(root, "i");
    await fs.mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "i.state.json");
    const key = makeStateKey("i-batch-1", "EQ_I");
    const state = createEmptyRunState("i", NOW);
    state.entries[key] = validEntry({ batchId: "i-batch-1", recipientAddress: "EQ_I", status: "submitted" });
    await saveStateAtomic(statePath, state);
    const evidence: AuditLogEntry = {
      batchId: "i-batch-1",
      recipientAddress: "EQ_I",
      attemptNumber: 1,
      operatorId: "op-a",
      outcome: "success",
      recordedAt: NOW,
      txHash: "tx-evidence",
    };
    const reconciler = createReconciler({
      stateDir: dir,
      auditWriter: { async readTerminalEntries() { return [evidence]; } },
      zombieTimeoutMs: 1,
    });
    await reconciler.reconcileCampaign({ campaignId: "i", now: Date.parse(NOW) });
    const recovered = await loadState(statePath, "i");
    assert.equal(recovered.entries[key]!.status, "success");
    assert.equal(recovered.entries[key]!.txHash, "tx-evidence");

    const conflictDir = path.join(root, "i-conflict");
    await fs.mkdir(conflictDir, { recursive: true });
    const conflictPath = path.join(conflictDir, "ic.state.json");
    const conflictStore = new JsonAtomicStateStore(conflictPath, "ic");
    const conflictKey = makeStateKey("ic-batch-1", "EQ_IC");
    const conflictState = createEmptyRunState("ic", NOW);
    conflictState.entries[conflictKey] = validEntry({ batchId: "ic-batch-1", recipientAddress: "EQ_IC", status: "submitted" });
    await saveStateAtomic(conflictPath, conflictState);
    const conflictReconciler = createReconciler({
      stateDir: conflictDir,
      auditWriter: {
        async readTerminalEntries() {
          await conflictStore.update((draft) => {
            const current = draft.entries[conflictKey]!;
            setEntryGuarded(draft, conflictKey, { allowedStatuses: ["submitted"], expectedAttemptNumber: 1, expectedOperatorId: "op-a" }, {
              ...current,
              status: "hard_failure",
              finalizedAt: NOW,
              updatedAt: NOW,
              lastErrorCode: "concurrent_terminal",
              lastError: "concurrent terminal result",
              lastDecision: "fail_batch",
            });
          });
          return [{
            batchId: "ic-batch-1",
            recipientAddress: "EQ_IC",
            attemptNumber: 1,
            operatorId: "op-a",
            outcome: "success" as const,
            recordedAt: NOW,
          }];
        },
      },
      zombieTimeoutMs: 1,
    });
    await expectReject(conflictReconciler.reconcileCampaign({ campaignId: "ic", now: Date.parse(NOW) }), /Evidence-bound recovery failed/);
    assert.equal((await conflictStore.read()).entries[conflictKey]!.status, "hard_failure");

    const staleDir = path.join(root, "i-stale-attempt");
    await fs.mkdir(staleDir, { recursive: true });
    const stalePath = path.join(staleDir, "is.state.json");
    const staleKey = makeStateKey("is-batch-1", "EQ_IS");
    const staleState = createEmptyRunState("is", NOW);
    staleState.entries[staleKey] = validEntry({
      batchId: "is-batch-1",
      recipientAddress: "EQ_IS",
      status: "submitted",
      attemptNumber: 2,
      operatorId: "op-b",
      operatorLabel: "Operator B",
      submittedAt: NOW,
      updatedAt: NOW,
    });
    await saveStateAtomic(stalePath, staleState);
    const staleReconciler = createReconciler({
      stateDir: staleDir,
      auditWriter: {
        async readTerminalEntries() {
          return [{
            batchId: "is-batch-1",
            recipientAddress: "EQ_IS",
            attemptNumber: 1,
            operatorId: "op-a",
            outcome: "success" as const,
            recordedAt: NOW,
            txHash: "tx-from-attempt-1",
          }];
        },
      },
      zombieTimeoutMs: 1,
    });
    await expectReject(
      staleReconciler.reconcileCampaign({ campaignId: "is", now: Date.parse(NOW) + 10 }),
      /does not match the current submitted attempt/
    );
    const staleAfter = await loadState(stalePath, "is");
    assert.equal(staleAfter.entries[staleKey]!.status, "submitted");
    assert.equal(staleAfter.entries[staleKey]!.attemptNumber, 2);
    assert.equal(staleAfter.entries[staleKey]!.operatorId, "op-b");
    assert.equal(staleAfter.entries[staleKey]!.txHash, null);

    const predatedDir = path.join(root, "i-predated");
    await fs.mkdir(predatedDir, { recursive: true });
    const predatedPath = path.join(predatedDir, "ip.state.json");
    const predatedKey = makeStateKey("ip-batch-1", "EQ_IP");
    const predatedState = createEmptyRunState("ip", NOW);
    predatedState.entries[predatedKey] = validEntry({
      batchId: "ip-batch-1",
      recipientAddress: "EQ_IP",
      status: "submitted",
      submittedAt: NOW,
      updatedAt: NOW,
    });
    await saveStateAtomic(predatedPath, predatedState);
    const predatedReconciler = createReconciler({
      stateDir: predatedDir,
      auditWriter: {
        async readTerminalEntries() {
          return [{
            batchId: "ip-batch-1",
            recipientAddress: "EQ_IP",
            attemptNumber: 1,
            operatorId: "op-a",
            outcome: "success" as const,
            recordedAt: OLD,
            txHash: "tx-too-old",
          }];
        },
      },
      zombieTimeoutMs: 1,
    });
    await expectReject(
      predatedReconciler.reconcileCampaign({ campaignId: "ip", now: Date.parse(NOW) + 10 }),
      /pre-submission recordedAt/
    );
    assert.equal((await loadState(predatedPath, "ip")).entries[predatedKey]!.status, "submitted");

    const missingIdentityDir = path.join(root, "i-missing-identity");
    await fs.mkdir(missingIdentityDir, { recursive: true });
    const missingIdentityPath = path.join(missingIdentityDir, "im.state.json");
    const missingIdentityKey = makeStateKey("im-batch-1", "EQ_IM");
    const missingIdentityState = createEmptyRunState("im", NOW);
    missingIdentityState.entries[missingIdentityKey] = validEntry({
      batchId: "im-batch-1",
      recipientAddress: "EQ_IM",
      status: "submitted",
    });
    await saveStateAtomic(missingIdentityPath, missingIdentityState);
    const missingIdentityReconciler = createReconciler({
      stateDir: missingIdentityDir,
      auditWriter: {
        async readTerminalEntries() {
          return [{
            batchId: "im-batch-1",
            recipientAddress: "EQ_IM",
            outcome: "success",
            recordedAt: NOW,
          } as AuditLogEntry];
        },
      },
      zombieTimeoutMs: 1,
    });
    await expectReject(
      missingIdentityReconciler.reconcileCampaign({ campaignId: "im", now: Date.parse(NOW) + 10 }),
      /lacks a valid attemptNumber/
    );
    assert.equal(
      (await loadState(missingIdentityPath, "im")).entries[missingIdentityKey]!.status,
      "submitted"
    );
  });

  await test("J", "operator assignment is deterministic across process-style restart and persisted before return", async () => {
    const dir = path.join(root, "j");
    await fs.mkdir(dir, { recursive: true });
    const operatorsPath = path.join(dir, "operators.json");
    await fs.writeFile(operatorsPath, JSON.stringify([
      { id: "op-a", label: "A", enabled: true, envMnemonicKey: "TEST_OP_A", walletVersion: "v4", subwalletNumber: 0, minTonReserve: "1", maxBatchSize: 10, maxTxPerHour: 100 },
      { id: "op-b", label: "B", enabled: true, envMnemonicKey: "TEST_OP_B", walletVersion: "v4", subwalletNumber: 1, minTonReserve: "1", maxBatchSize: 10, maxTxPerHour: 100 },
    ]), "utf8");
    process.env["TEST_OP_A"] = "one two three";
    process.env["TEST_OP_B"] = "four five six";
    const store = new JsonAtomicStateStore(path.join(dir, "j.state.json"), "j");
    const pool1 = await createWalletPool({ operatorsFilePath: operatorsPath, stateStore: store });
    const selected1 = await pool1.getNextAvailableProvider(Date.parse(NOW), "j::batch-1");
    assert.ok(selected1);
    const afterFirst = await store.read();
    assert.ok(afterFirst.operators[selected1!.id]!.lastSelectedAt);
    const pool2 = await createWalletPool({ operatorsFilePath: operatorsPath, stateStore: store });
    const selected2 = await pool2.getNextAvailableProvider(Date.parse(NOW) + 1, "j::batch-1");
    assert.equal(selected2!.id, selected1!.id);
  });

  await test("K", "launchStageA rejects JSON numeric amount", async () => {
    const NodeModule = require("module") as { _load: (...args: unknown[]) => unknown };
    const originalLoad = NodeModule._load;
    NodeModule._load = function(request: unknown, ...args: unknown[]): unknown {
      if (request === "dotenv") return { config() { return {}; } };
      if (request === "@ton/core") return { Address: { parse() { return {}; } } };
      return originalLoad.call(this, request, ...args);
    };
    let launch: typeof import("./launchStageA");
    try {
      launch = require("./launchStageA") as typeof import("./launchStageA");
    } finally {
      NodeModule._load = originalLoad;
    }
    const dir = path.join(root, "k");
    await fs.mkdir(dir, { recursive: true });
    const targets = path.join(dir, "targets.json");
    await fs.writeFile(targets, JSON.stringify([{ address: "EQ_K", amount: 1 }]), "utf8");
    await expectReject(launch.loadRecipients(targets), /JSON numeric amounts are forbidden/);
    process.env["CAMPAIGN_ID"] = "k-launch";
    process.env["TARGETS_PATH"] = targets;
    process.env["STATE_PATH"] = path.join(dir, "ignored.state.json");
    process.env["REPORT_DIR"] = path.join(dir, "reports");
    process.env["BATCH_SIZE"] = "1";
    process.env["DRY_RUN"] = "true";
    await expectReject(
      launch.run({} as never),
      /JSON numeric amounts are forbidden/
    );
    await assert.rejects(
      fs.access(path.join(dir, "k-launch.state.json")),
      /ENOENT/
    );
    assert.equal(launch.convertAmountToBigInt("100", 0), 100n);
    assert.throws(() => launch.convertAmountToBigInt("100n", 0), /invalid amount string/);
  });

  await test("L", "required audit failure is visible and false completion is prevented", async () => {
    for (const mode of ["batch_success", "batch_failure"] as const) {
      const dir = path.join(root, `l-${mode}`);
      await fs.mkdir(dir, { recursive: true });
      const events: string[] = [];
      const dispatcher = baseDispatcher({
        stateDir: dir,
        forceExecutorInDryRun: mode === "batch_failure",
        executorThrows: mode === "batch_failure",
        auditRecorder: {
          async write(event) {
            events.push(event.type);
            if (event.type === mode) throw new Error(`required ${mode} audit failed`);
          },
        },
      });
      await expectReject(
        dispatcher.dispatch(campaign(`l-${mode}`, [{ address: `EQ_L_${mode}`, amount: 1n }])),
        new RegExp(`required ${mode} audit failed`)
      );
      assert.ok(events.includes(mode));
      const state = await loadState(path.join(dir, `l-${mode}.state.json`), `l-${mode}`);
      const onlyEntry = Object.values(state.entries)[0]!;
      assert.equal(onlyEntry.status, "submitted");
      assert.notEqual(state.meta.status, "completed");
      assert.equal(state.lock.activeBatchId, null);
    }
  });

  await test("M", "CI required check invokes active-path regression", async () => {
    const ciScript = await fs.readFile(path.resolve("scripts/stage-b-full-check.sh"), "utf8");
    assert.match(ciScript, /stage-a-state-integrity-regression\.ts/);
  });

  console.log(JSON.stringify({ suite: "stage-a-state-integrity-regression", status: "PASS", results }, null, 2));
}

main().catch((error) => {
  console.error("[stage-a-active-regression] FAIL", error);
  process.exitCode = 1;
});
