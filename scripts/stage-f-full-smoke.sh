#!/usr/bin/env bash
set -euo pipefail

echo "[stage-f-full] TypeScript check"
npx tsc --noEmit

echo "[stage-f-full] F-1 DecisionStore RunState adapter contract smoke"
npx ts-node scripts/f-1-decisionstore-runstate-adapter-contract-smoke.ts

echo "[stage-f-full] F-2 RunState plan apply contract smoke"
npx ts-node scripts/f-2-runstate-plan-apply-contract-smoke.ts

echo "[stage-f-full] F-3 RunState apply file shell smoke"
npx ts-node scripts/f-3-runstate-apply-file-shell-smoke.ts

echo "[stage-f-full] F-4 Dispatcher dry-run intake boundary smoke"
npx ts-node scripts/f-4-dispatcher-dry-run-intake-boundary-smoke.ts

echo "[stage-f-full] F-5 Dispatcher dry-run transition plan smoke"
npx ts-node scripts/f-5-dispatcher-dry-run-transition-plan-smoke.ts

echo "[stage-f-full] F-5 Retry policy disposition smoke"
npx ts-node scripts/f-5-retry-policy-disposition-smoke.ts

echo "[stage-f-full] F-5.2 Gas safety margin policy smoke"
npx ts-node scripts/f-5-2-gas-safety-margin-policy-smoke.ts

echo "[stage-f-full] F-5 Asset fee policy resolver smoke"
npx ts-node scripts/f-5-asset-fee-policy-resolver-smoke.ts

echo "[stage-f-full] F-6 Cross-store consistency contract smoke"
npx ts-node scripts/f-6-cross-store-consistency-contract-smoke.ts

echo "[stage-f-full] F-6 Heartbeat append policy smoke"
npx ts-node scripts/f-6-heartbeat-append-policy-smoke.ts

echo "[stage-f-full] F-6 Heartbeat policy writer integration smoke"
npx ts-node scripts/f-6-heartbeat-policy-writer-integration-smoke.ts

echo "[stage-f-full] F-7A Dispatcher fault injection smoke"
npx ts-node scripts/f-7a-dispatcher-fault-injection-smoke.ts

echo "[stage-f-full] F-7B Operational health probe lane smoke"
npx ts-node scripts/f-7-operational-health-probe-lane-smoke.ts

echo "[stage-f-full] F-8 Administrative halt interception smoke"
npx ts-node scripts/f-8-administrative-halt-interception-smoke.ts

echo "[stage-f-full] PASS"
