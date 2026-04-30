// scripts/batchStatusUpdate.ts
// ════════════════════════════════════════════════════════════════
//  Enterprise Asset — Regulatory Compliance Status Sync  v2.2.0
//  Tact 1.6.x  ·  @ton/blueprint  ·  File-Driven Edition
//
//  Architecture decisions:
//    • File-driven SYNC_QUEUE — reads from targets.json at runtime.
//    • Robust BigInt deserialisation via post-parse mapping.
//    • Pure TypeScript batching — no on-chain BatchDispatcher.
//    • Chunks of 10, hard 7-second inter-chunk cooldown.
//    • Per-send retry: up to 3 attempts with 3 s back-off.
//    • Payload aligned 1:1 to MasterUpdateWalletStatus in messages.tact
//      (op 0xde1a9b2c — ONLY query_id:uint64 + new_status:uint8).
//    • Wallet address resolved via master.getGetWalletAddress() on-chain
//      getter, not assumed locally.
// ════════════════════════════════════════════════════════════════

import { readFile }         from 'node:fs/promises';
import { resolve }          from 'node:path';
import { Address, toNano }  from '@ton/core';
import { NetworkProvider }  from '@ton/blueprint';
import { JettonMaster } from '../build/JettonMaster/JettonMaster_JettonMaster';

// ─── Status constants (mirror constants.tact) ───────────────────
const STATUS_VERIFIED = 1n;
const STATUS_FROZEN   = 2n;   // Regulatory Hold / Pending KYC

const VALID_STATUSES = new Set<bigint>([STATUS_VERIFIED, STATUS_FROZEN]);

// ─── Batching & resilience knobs ────────────────────────────────
const CHUNK_SIZE              = 10;
const INTER_CHUNK_DELAY_MS    = 7_000;
const RETRY_ATTEMPTS          = 3;
const RETRY_DELAY_MS          = 3_000;
const GAS_PER_WALLET          = toNano('0.05');

// Seqno confirmation polling
const SEQNO_POLL_ATTEMPTS     = 40;
const SEQNO_POLL_INTERVAL_MS  = 1_500;  // 40 × 1.5 s = 60 s max wait

// ─── targets.json schema ────────────────────────────────────────

/**
 * Raw shape of each entry as it arrives from JSON.parse().
 * `status` is a number on disk; we map it to BigInt in parseTargetsFile().
 */
interface RawComplianceRecord {
    address:    string;
    status:     number;   // 1 = STATUS_VERIFIED, 2 = STATUS_FROZEN
    errorCode?: number;   // audit log only — NOT sent on-chain
    message?:   string;   // audit log only — NOT sent on-chain
}

interface RawTargetsFile {
    records: RawComplianceRecord[];
}

/**
 * Normalised record used throughout the script.
 * All numeric fields that map to Tact contract values are BigInt.
 */
interface ComplianceRecord {
    address:   string;
    status:    bigint;
    errorCode: bigint;
    message:   string;
}

// ─── Payload type — exact 1:1 match to messages.tact §2 ─────────
//
//  message(0xde1a9b2c) MasterUpdateWalletStatus {
//      query_id:   Int as uint64;
//      new_status: Int as uint8;
//  }
//
//  CRITICAL: no other fields may be added here. Any extras shift the
//  TL-B bit layout and the wallet will throw ERR_INVALID_PAYLOAD.

interface MasterUpdateWalletStatusPayload {
    $$type:     'MasterUpdateWalletStatus';
    query_id:   bigint;   // uint64
    new_status: bigint;   // uint8 — STATUS_VERIFIED(1) or STATUS_FROZEN(2)
}

// ─── Validated, ready-to-send record ────────────────────────────

interface PreparedUpdate {
    record:       ComplianceRecord;
    ownerAddress: Address;
    queryId:      bigint;
}

// ════════════════════════════════════════════════════════════════
//  File-driven SYNC_QUEUE loader
// ════════════════════════════════════════════════════════════════

/**
 * Reads and validates targets.json from the script's directory.
 *
 * Expected file format:
 * ```json
 * {
 *   "records": [
 *     {
 *       "address":   "EQD...",
 *       "status":    2,
 *       "errorCode": 1001,
 *       "message":   "Regulatory hold: Routine compliance review required."
 *     },
 *     {
 *       "address":   "EQD...",
 *       "status":    1,
 *       "errorCode": 0,
 *       "message":   "Compliance verified: KYC Tier 1 approved."
 *     }
 *   ]
 * }
 * ```
 *
 * `status` must be the integer value of the desired compliance state:
 *   1 → STATUS_VERIFIED
 *   2 → STATUS_FROZEN (Regulatory Hold)
 *
 * `errorCode` and `message` are local audit metadata and are never
 * included in the on-chain MasterUpdateWalletStatus payload.
 *
 * @throws {Error} if the file is missing, malformed, or contains no records.
 */
async function loadSyncQueue(): Promise<ComplianceRecord[]> {
    const targetsPath = resolve(process.cwd(), 'data', 'targets.json');

    let raw: string;
    try {
        raw = await readFile(targetsPath, 'utf-8');
    } catch (err) {
        throw new Error(
            `Failed to read targets.json at ${targetsPath}: ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `targets.json contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    return parseTargetsFile(parsed, targetsPath);
}

/**
 * Validates the parsed JSON structure and converts all numeric status /
 * errorCode values to BigInt.
 *
 * Mapping:
 *   record.status    (number)  → ComplianceRecord.status    (bigint)
 *   record.errorCode (number?) → ComplianceRecord.errorCode (bigint, default 0n)
 *
 * @throws {Error} on structural violations.
 */
function parseTargetsFile(parsed: unknown, sourcePath: string): ComplianceRecord[] {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(
            `targets.json root must be a JSON object with a "records" array. Path: ${sourcePath}`
        );
    }

    const obj = parsed as Record<string, unknown>;

    if (!Array.isArray(obj['records'])) {
        throw new Error(
            `targets.json must have a top-level "records" array. Path: ${sourcePath}`
        );
    }

    const records = obj['records'] as unknown[];

    if (records.length === 0) {
        throw new Error(`targets.json "records" array is empty. Add at least one entry.`);
    }

    return records.map((item, index): ComplianceRecord => {
        if (typeof item !== 'object' || item === null) {
            throw new Error(`records[${index}] must be an object.`);
        }

        const r = item as Record<string, unknown>;

        // address — required string
        if (typeof r['address'] !== 'string' || r['address'].trim() === '') {
            throw new Error(`records[${index}].address must be a non-empty string.`);
        }

        // status — required number; must be 1 or 2
        if (typeof r['status'] !== 'number' || !Number.isInteger(r['status'])) {
            throw new Error(
                `records[${index}].status must be an integer (1=VERIFIED, 2=FROZEN). ` +
                `Got: ${JSON.stringify(r['status'])}`
            );
        }
        const statusBigInt = BigInt(r['status'] as number);
        if (!VALID_STATUSES.has(statusBigInt)) {
            throw new Error(
                `records[${index}].status value ${r['status']} is not recognised. ` +
                `Valid values: 1 (VERIFIED), 2 (FROZEN).`
            );
        }

        // errorCode — optional number, defaults to 0
        const rawErrorCode = r['errorCode'];
        let errorCode = 0n;
        if (rawErrorCode !== undefined) {
            if (typeof rawErrorCode !== 'number' || !Number.isInteger(rawErrorCode)) {
                throw new Error(
                    `records[${index}].errorCode must be an integer when provided. ` +
                    `Got: ${JSON.stringify(rawErrorCode)}`
                );
            }
            errorCode = BigInt(rawErrorCode as number);
        }

        // message — optional string, defaults to empty
        const rawMessage = r['message'];
        let message = '';
        if (rawMessage !== undefined) {
            if (typeof rawMessage !== 'string') {
                throw new Error(
                    `records[${index}].message must be a string when provided.`
                );
            }
            message = rawMessage;
        }

        return {
            address:   (r['address'] as string).trim(),
            status:    statusBigInt,
            errorCode,
            message,
        };
    });
}

// ════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Monotonically increasing queryId from wall-clock + per-item offset.
 * Fits safely in uint64 for the foreseeable future.
 */
function makeQueryId(offset: number): bigint {
    return BigInt(Date.now()) + BigInt(offset);
}

/**
 * Polls the sender's seqno until it advances past `seqnoBefore`,
 * confirming the submitted transaction was accepted on-chain.
 */
async function waitForSeqnoAdvance(
    provider:      NetworkProvider,
    senderAddress: Address,
    seqnoBefore:   number,
): Promise<void> {
    for (let i = 0; i < SEQNO_POLL_ATTEMPTS; i++) {
        await delay(SEQNO_POLL_INTERVAL_MS);

        try {
            // NetworkProvider.sender() wraps a WalletContractV4.
            // getSeqno() is available on the opened contract but not exposed
            // by the Blueprint sender type — cast required.
            const next: number = await (
                provider.sender() as unknown as { getSeqno(): Promise<number> }
            ).getSeqno();

            if (next > seqnoBefore) {
                console.log(`   ✔ Confirmed: seqno ${seqnoBefore} → ${next}`);
                return;
            }
        } catch {
            // Fallback: any change in account state lt indicates inclusion.
            const state = await provider.provider(senderAddress).getState();
            if (state.last !== null) {
                console.log(`   ✔ Confirmed via account state (poll ${i + 1})`);
                return;
            }
        }
    }

    throw new Error(
        `Seqno stuck at ${seqnoBefore} after ` +
        `${(SEQNO_POLL_ATTEMPTS * SEQNO_POLL_INTERVAL_MS) / 1_000} s. ` +
        `Verify the transaction manually on the TON explorer.`
    );
}

/**
 * Sends a single MasterUpdateWalletStatus message and waits for on-chain
 * confirmation. Wraps the full round-trip in a retry loop.
 *
 * @param master         Opened JettonMaster contract
 * @param provider       Blueprint NetworkProvider
 * @param senderAddress  Admin wallet address (for seqno polling)
 * @param payload        Serialised MasterUpdateWalletStatus payload
 * @param label          Log prefix string, e.g. "[3/10]"
 */
async function sendWithRetry(
    master:        ReturnType<typeof JettonMaster.fromAddress> extends infer T ? import('@ton/core').OpenedContract<T extends object ? T : never> : never,
    provider:      NetworkProvider,
    senderAddress: Address,
    payload:       MasterUpdateWalletStatusPayload,
    label:         string,
): Promise<'success' | 'failed'> {
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const seqnoBefore: number = await (
                provider.sender() as unknown as { getSeqno(): Promise<number> }
            ).getSeqno().catch(() => 0);

            // Blueprint-generated send — routes to the JettonMaster
            // receive(msg: MasterUpdateWalletStatus) handler.
            await (master as any).send(
                provider.sender(),
                { value: GAS_PER_WALLET },
                payload,
            );

            console.log(`${label} 📤 Submitted (attempt ${attempt}). Awaiting confirmation…`);
            await waitForSeqnoAdvance(provider, senderAddress, seqnoBefore);
            return 'success';

        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`${label} ⚠️  Attempt ${attempt}/${RETRY_ATTEMPTS} failed: ${reason}`);

            if (attempt < RETRY_ATTEMPTS) {
                console.log(`${label} ⏳ Retrying in ${RETRY_DELAY_MS / 1_000} s…`);
                await delay(RETRY_DELAY_MS);
            }
        }
    }

    console.error(`${label} ❌ All ${RETRY_ATTEMPTS} attempts exhausted — skipping.`);
    return 'failed';
}

// ════════════════════════════════════════════════════════════════
//  Entry point
// ════════════════════════════════════════════════════════════════

export async function run(provider: NetworkProvider): Promise<void> {

    // ── 1. Load & validate SYNC_QUEUE from targets.json ──────────
    console.log(`📂 Loading compliance records from targets.json…`);
    const syncQueue = await loadSyncQueue();
    console.log(`   ✔ Loaded ${syncQueue.length} record(s).\n`);

    // ── 2. Environment validation ────────────────────────────────
    const masterRaw = process.env['JETTON_MASTER'];
    if (!masterRaw) {
        throw new Error('JETTON_MASTER is not set in your environment / .env file.');
    }
    if (syncQueue.length > 100) {
        throw new Error('Batch size exceeds the safety cap of 100 updates.');
    }

    const senderAddress = provider.sender().address;
    if (!senderAddress) {
        throw new Error('Sender address is unavailable. Is your wallet connected?');
    }

    const masterAddress = Address.parse(masterRaw);
    const master        = provider.open(JettonMaster.fromAddress(masterAddress));

    // ── 3. Pre-flight balance check ──────────────────────────────
    const totalRequired = GAS_PER_WALLET * BigInt(syncQueue.length) + toNano('0.1');
    const senderState   = await provider.provider(senderAddress).getState();

    if (senderState.balance < totalRequired) {
        throw new Error(
            `Insufficient balance. ` +
            `Available: ${Number(senderState.balance) / 1e9} TON, ` +
            `Required: ~${Number(totalRequired) / 1e9} TON for ${syncQueue.length} update(s).`
        );
    }

    console.log(`✅ Balance check passed (${Number(senderState.balance) / 1e9} TON available)`);
    console.log(`📋 ${syncQueue.length} record(s) in queue — chunk size: ${CHUNK_SIZE}\n`);

    // ── 4. Validate & prepare all records upfront ────────────────
    //  Address parsing is done here so we fail fast before any transactions.
    const prepared: PreparedUpdate[] = [];

    for (let i = 0; i < syncQueue.length; i++) {
        const record = syncQueue[i]!;

        let ownerAddress: Address;
        try {
            ownerAddress = Address.parse(record.address);
        } catch {
            console.warn(
                `⚠️  [${i + 1}/${syncQueue.length}] Skipping: cannot parse address "${record.address}".`
            );
            continue;
        }

        prepared.push({ record, ownerAddress, queryId: makeQueryId(i) });
    }

    if (prepared.length === 0) {
        console.log('❌ No valid updates prepared. Exiting.');
        return;
    }

    console.log(`🚀 Sending ${prepared.length} update(s) in chunks of ${CHUNK_SIZE}…\n`);

    // ── 5. Chunk & process ───────────────────────────────────────
    let successCount = 0;
    let failCount    = 0;

    const chunks: PreparedUpdate[][] = [];
    for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
        chunks.push(prepared.slice(i, i + CHUNK_SIZE));
    }

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk     = chunks[chunkIdx]!;
        const chunkBase = chunkIdx * CHUNK_SIZE;

        console.log(`━━━ Chunk ${chunkIdx + 1}/${chunks.length} (${chunk.length} update(s)) ━━━`);

        for (let localIdx = 0; localIdx < chunk.length; localIdx++) {
            const { record, ownerAddress, queryId } = chunk[localIdx]!;
            const globalIdx = chunkBase + localIdx;
            const label     = `[${globalIdx + 1}/${prepared.length}]`;

            // ── 5a. Derive target JettonWallet address on-chain ──
            //  Uses the JettonMaster getter to guarantee address derivation
            //  is 100% consistent with the contract's own logic.
            let walletAddress: Address;
            try {
                walletAddress = await master.getGetWalletAddress(ownerAddress);
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                console.error(
                    `${label} ❌ Wallet derivation failed for ${record.address}: ${reason}`
                );
                failCount++;
                continue;
            }

            // ── 5b. Local audit log ──────────────────────────────
            //  errorCode and message are compliance metadata only.
            //  They are intentionally NOT part of the on-chain payload.
            const statusLabel = record.status === STATUS_FROZEN
                ? 'REGULATORY_HOLD'
                : 'VERIFIED';

            console.log(`${label} Owner    : ${ownerAddress.toString()}`);
            console.log(`${label} Wallet   : ${walletAddress.toString()}`);
            console.log(`${label} Status   : ${statusLabel} (${record.status})`);
            console.log(`${label} ErrorCode: ${record.errorCode}`);  // audit only
            console.log(`${label} Message  : ${record.message}`);    // audit only
            console.log(`${label} queryId  : ${queryId}`);

            // ── 5c. Build on-chain payload ───────────────────────
            //
            //  CRITICAL — payload MUST match messages.tact §2 exactly:
            //
            //    message(0xde1a9b2c) MasterUpdateWalletStatus {
            //        query_id:   Int as uint64;   ← only these two fields
            //        new_status: Int as uint8;    ← exist in the struct
            //    }
            //
            //  Any extra fields (version, errorCode, statusMessage, etc.)
            //  will shift the TL-B bit layout and cause the wallet to throw
            //  ERR_INVALID_PAYLOAD or silently corrupt its state.
            const payload: MasterUpdateWalletStatusPayload = {
                $$type:     'MasterUpdateWalletStatus',
                query_id:   queryId,
                new_status: record.status,   // already BigInt from parseTargetsFile()
            };

            // ── 5d. Send with retry ──────────────────────────────
            const outcome = await sendWithRetry(
                master as any,
                provider,
                senderAddress,
                payload,
                label,
            );

            if (outcome === 'success') {
                successCount++;
            } else {
                failCount++;
            }

            console.log('');
        }

        // ── Inter-chunk cooldown (skip after the final chunk) ────
        if (chunkIdx < chunks.length - 1) {
            console.log(
                `⏸  Chunk ${chunkIdx + 1} complete. ` +
                `Cooling down for ${INTER_CHUNK_DELAY_MS / 1_000} s to prevent RPC throttling…\n`
            );
            await delay(INTER_CHUNK_DELAY_MS);
        }
    }

    // ── 6. Final summary ─────────────────────────────────────────
    console.log('════════════════════════════════════════════════');
    console.log(`✅ Batch complete: ${successCount}/${prepared.length} update(s) confirmed.`);
    if (failCount > 0) {
        console.log(`⚠️  ${failCount} update(s) failed — review logs above.`);
        process.exitCode = 1;
    }
    console.log('════════════════════════════════════════════════');
}