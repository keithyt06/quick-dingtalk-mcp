#!/usr/bin/env bash
# Plan 2 e2e: dry-run + mock paths only — no real DingTalk calls.
# For real e2e see Plan 3.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "[1/4] shared tests"
node --test packages/shared/__tests__/

echo "[2/4] remote lambda + docker tests"
node --test --experimental-strip-types \
  packages/remote/lambda/shared/hmac.test.ts \
  packages/remote/lambda/shared/sigv4.test.ts \
  packages/remote/lambda/shared/sm-client.test.ts \
  packages/remote/lambda/token-refresh-shim/index.test.ts \
  packages/remote/lambda/mcp-middleware/index.test.ts \
  packages/remote/lambda/alarm-webhook/index.test.ts
node --test \
  packages/remote/docker/__tests__/inject-token.test.mjs \
  packages/remote/docker/__tests__/server.test.mjs

echo "[3/4] remote infra synth tests"
node --test --experimental-strip-types packages/remote/infra/__tests__/synth.test.ts

echo "[4/4] cdk synth --all (dry)"
cd packages/remote
npm run build:lambda
npx cdk synth --all --quiet \
  -c alarmPreset=standard \
  -c alarmWebhookUrl="" \
  -c dingtalkAppId=fake \
  -c oauthBaseUrl=https://placeholder >/dev/null

echo "All e2e checks green."
