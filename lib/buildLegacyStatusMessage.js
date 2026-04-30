"use strict";
/**
 * @file buildLegacyStatusMessage.ts
 * @description Utility to encode string messages into a TON-compatible text comment Cell.
 *
 * TON Text Comment Standard:
 *   - Cell begins with a 32-bit prefix of 0x00000000
 *   - Followed by the UTF-8 string payload
 *   - Overflow is chained via reference cells (snake-cell encoding)
 *
 * @module scripts/buildLegacyStatusMessage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyStatusMessageError = void 0;
exports.buildLegacyStatusMessage = buildLegacyStatusMessage;
const core_1 = require("@ton/core");
// ─── Constants ───────────────────────────────────────────────────────────────
/** Standard TON text comment op-code prefix (32 bits, value = 0). */
const TEXT_COMMENT_PREFIX = 0x00000000;
/**
 * Maximum bytes that fit in a single Cell after the 4-byte prefix.
 * A Cell holds up to 1023 bits = 127 bytes + 7 bits.
 * We use 127 bytes per segment to stay strictly within bounds.
 */
const MAX_BYTES_PER_CELL = 127;
/** Error thrown when message encoding fails a structural constraint. */
class LegacyStatusMessageError extends Error {
    constructor(message) {
        super(message);
        this.name = "LegacyStatusMessageError";
    }
}
exports.LegacyStatusMessageError = LegacyStatusMessageError;
// ─── Implementation ───────────────────────────────────────────────────────────
/**
 * Encodes a plain-text string into a TON text-comment Cell.
 *
 * @param message - The UTF-8 string to encode. Must be non-empty.
 * @returns A {@link LegacyStatusMessageResult} containing the encoded Cell and metadata.
 * @throws {@link LegacyStatusMessageError} if the message is empty or structurally invalid.
 *
 * @example
 * ```ts
 * import { buildLegacyStatusMessage } from "./buildLegacyStatusMessage";
 *
 * const { cell } = buildLegacyStatusMessage("Hello, TON!");
 * // Pass `cell` as forwardPayload in a jetton transfer.
 * ```
 */
function buildLegacyStatusMessage(message) {
    if (!message || message.length === 0) {
        throw new LegacyStatusMessageError("Message must be a non-empty string.");
    }
    const utf8Bytes = Buffer.from(message, "utf8");
    const totalBytes = utf8Bytes.byteLength;
    // Split into segments that fit within per-cell byte limits.
    const segments = chunkBuffer(utf8Bytes, MAX_BYTES_PER_CELL);
    const chainDepth = Math.max(0, segments.length - 1);
    // Build the chain from the last segment backwards (tail-recursive style).
    // The first cell carries the 32-bit prefix; subsequent cells do not.
    const rootCell = buildCellChain(segments, 0, true);
    return {
        cell: rootCell,
        byteLength: totalBytes,
        chainDepth,
    };
}
// ─── Private Helpers ──────────────────────────────────────────────────────────
/**
 * Recursively builds a snake-cell chain from byte segments.
 *
 * @param segments   - Ordered array of byte buffers (one per cell).
 * @param index      - Current segment index.
 * @param isRoot     - Whether this is the root cell (carries the op-code prefix).
 */
function buildCellChain(segments, index, isRoot) {
    const builder = (0, core_1.beginCell)();
    if (isRoot) {
        // Write the 32-bit text comment prefix (0x00000000).
        builder.storeUint(TEXT_COMMENT_PREFIX, 32);
    }
    // Write this segment's bytes.
    builder.storeBuffer(segments[index]);
    // If there are remaining segments, attach them as a reference cell.
    if (index + 1 < segments.length) {
        const tailCell = buildCellChain(segments, index + 1, false);
        builder.storeRef(tailCell);
    }
    return builder.endCell();
}
/**
 * Splits a Buffer into fixed-size chunks.
 *
 * @param buf       - Source buffer to split.
 * @param chunkSize - Maximum bytes per chunk.
 */
function chunkBuffer(buf, chunkSize) {
    const chunks = [];
    for (let offset = 0; offset < buf.length; offset += chunkSize) {
        chunks.push(buf.subarray(offset, offset + chunkSize));
    }
    return chunks;
}
