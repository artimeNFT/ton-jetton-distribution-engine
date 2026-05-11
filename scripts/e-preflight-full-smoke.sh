#!/usr/bin/env bash
set -euo pipefail

echo "[e-preflight-full] TypeScript check"
npx tsc --noEmit

echo "[e-preflight-full] E-Preflight.1 blacklist integrity checksum smoke"
npx ts-node scripts/e-preflight-1-blacklist-integrity-checksum-smoke.ts

echo "[e-preflight-full] E-Preflight.2 optional blacklist signature verification smoke"
npx ts-node scripts/e-preflight-2-blacklist-signature-verification-smoke.ts

echo "[e-preflight-full] PASS"
