"use strict";
// staggered-broadcaster.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.staggeredBroadcast = staggeredBroadcast;
/**
 * Execute `tasks` via `handler` at a controlled rate with jitter.
 * Order is randomized to avoid on-chain address-sequence patterns.
 *
 * @param tasks      - list of work items (shuffled internally)
 * @param handler    - async function that sends one transaction; must throw on failure
 * @param options    - rate and jitter controls
 */
async function staggeredBroadcast(tasks, handler, options) {
    const { targetTxPerHour, jitterFactor = 0.3, maxConcurrency = 1, onProgress, } = options;
    // Base inter-tx delay in ms derived from throughput target
    const baseDelayMs = (3_600_000 / targetTxPerHour);
    // Shuffle order — Fisher-Yates
    const shuffled = [...tasks];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const results = [];
    let completed = 0;
    // Process with controlled concurrency using a semaphore-style queue
    const inFlight = new Set();
    for (const task of shuffled) {
        // Wait if at concurrency limit
        while (inFlight.size >= maxConcurrency) {
            await Promise.race(inFlight);
        }
        const work = (async () => {
            const sentAt = Date.now();
            let success = true;
            let error;
            try {
                await handler(task);
            }
            catch (err) {
                success = false;
                error = err.message;
            }
            const result = { task, success, error, sentAt };
            results.push(result);
            completed++;
            onProgress?.(completed, shuffled.length, result);
        })();
        inFlight.add(work);
        work.finally(() => inFlight.delete(work));
        // Apply jittered delay before scheduling the next task
        const jitteredDelay = applyJitter(baseDelayMs, jitterFactor);
        await sleep(jitteredDelay);
    }
    // Drain remaining in-flight work
    await Promise.allSettled(inFlight);
    return results;
}
/**
 * Returns a delay in ms with symmetric ±jitter% variance.
 * Uses a beta-like distribution (average of two uniforms) for
 * a more natural bell-curve spread vs. a flat uniform.
 */
function applyJitter(baseMs, factor) {
    const u1 = Math.random();
    const u2 = Math.random();
    const normalized = (u1 + u2) / 2; // Irwin-Hall approx of normal, clamped 0–1
    const delta = (normalized - 0.5) * 2 * factor * baseMs;
    return Math.max(500, baseMs + delta); // never wait less than 500ms
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
