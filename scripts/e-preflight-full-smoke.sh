#!/usr/bin/env bash
set -euo pipefail

echo "[e-preflight-full] E-Preflight.7 forbidden-pattern check"
REPLAY_NONCE_SRC="lib/watcher/blacklistReplayNonce.ts"
FORBIDDEN_PATTERNS=(
  "Date\.now"
  "Math\.random"
  'from "fs"'
  'from "node:fs"'
  'from "crypto"'
  'from "node:crypto"'
  'from "net"'
  'from "node:net"'
  "dispatcher"
  "RunState"
  "decisionStoreWriter"
  "appendApprovedDecisionStorePlan"
)
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if grep -nE "$pattern" "$REPLAY_NONCE_SRC"; then
    echo "[e-preflight-full] FAIL: forbidden pattern found in $REPLAY_NONCE_SRC: $pattern"
    exit 1
  fi
done

echo "[e-preflight-full] TypeScript check"
npx tsc --noEmit

echo "[e-preflight-full] E-Preflight.1 blacklist integrity checksum smoke"
npx ts-node scripts/e-preflight-1-blacklist-integrity-checksum-smoke.ts

echo "[e-preflight-full] E-Preflight.2 optional blacklist signature verification smoke"
npx ts-node scripts/e-preflight-2-blacklist-signature-verification-smoke.ts

echo "[e-preflight-full] E-Preflight.3 signature config loader smoke"
npx ts-node scripts/e-preflight-3-signature-config-loader-smoke.ts

echo "[e-preflight-full] E-Preflight.4 signed envelope contract smoke"
npx ts-node scripts/e-preflight-4-signed-envelope-contract-smoke.ts

echo "[e-preflight-full] E-Preflight.5 envelope signature verification smoke"
npx ts-node scripts/e-preflight-5-envelope-signature-verification-smoke.ts

echo "[e-preflight-full] E-Preflight.6 envelope freshness policy smoke"
npx ts-node scripts/e-preflight-6-envelope-freshness-policy-smoke.ts

echo "[e-preflight-full] E-Preflight.7 replay nonce contract smoke"
npx ts-node scripts/e-preflight-7-replay-nonce-contract-smoke.ts

echo "[e-preflight-full] E-Preflight.Orchestrator preflight aggregation smoke"
npx ts-node scripts/e-preflight-orchestrator-smoke.ts

echo "[e-preflight-full] PASS"
