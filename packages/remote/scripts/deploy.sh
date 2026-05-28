#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — interactive deploy.
# Reads config/i18n.json for prompt strings (zh/en); language auto-detected from $LANG.
# shellcheck disable=SC2005,SC2016
set -euo pipefail

DRY_RUN=0
LANG_KEY=zh
[[ "${LANG:-}" =~ en ]] && LANG_KEY=en

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --en) LANG_KEY=en ;;
    --zh) LANG_KEY=zh ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"

i18n() {
  local path="$1"
  jq -r ".$path.\"$LANG_KEY\" // .$path.en" "$I18N"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

echo "=== $(i18n deploy.title) ==="
echo "$(i18n deploy.prompt_region) us-east-1"

if [ "$DRY_RUN" -eq 1 ]; then
  DINGTALK_APP_ID="dry-run-app-id"
  DINGTALK_APP_SECRET="dry-run-secret"
  ALARM_WEBHOOK=""
  PRESET="standard"
  ENABLE_WAF="N"
else
  read -rp "$(i18n deploy.prompt_dingtalk_app_id) " DINGTALK_APP_ID
  read -rsp "$(i18n deploy.prompt_dingtalk_app_secret) " DINGTALK_APP_SECRET; echo
  read -rp "$(i18n deploy.prompt_alarm_webhook) " ALARM_WEBHOOK
  ALARM_WEBHOOK="${ALARM_WEBHOOK:-}"
  read -rp "$(i18n deploy.prompt_alarm_preset) " PRESET
  PRESET="${PRESET:-standard}"
  read -rp "$(i18n deploy.prompt_enable_waf) " ENABLE_WAF
  ENABLE_WAF="${ENABLE_WAF:-N}"
fi

ENABLE_WAF_FLAG=false
[[ "$ENABLE_WAF" =~ ^[yY] ]] && ENABLE_WAF_FLAG=true

cd "$ROOT/packages/remote"
run npm install
run npm run build:lambda

echo "$(i18n deploy.deploying_oauth)"
run npx cdk deploy QdmRemoteOAuth \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  --require-approval never

# Generate + write HMAC key + AppSecret to SSM
HMAC_KEY=$(openssl rand -hex 32)
run aws ssm put-parameter --region us-east-1 --name "/qdm-remote/QdmRemoteOAuth/hmac-key" --value "$HMAC_KEY" --type SecureString --overwrite
run aws ssm put-parameter --region us-east-1 --name "/qdm-remote/QdmRemoteOAuth/dingtalk-app-secret" --value "$DINGTALK_APP_SECRET" --type SecureString --overwrite

if [ "$DRY_RUN" -eq 1 ]; then
  OAUTH_BASE_URL="https://placeholder"
else
  OAUTH_BASE_URL=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`OAuthBaseUrl`].OutputValue' --output text 2>/dev/null || echo "https://placeholder")
fi

echo "$(i18n deploy.deploying_runtime)"
run npx cdk deploy QdmRemoteRuntime \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  -c oauthBaseUrl="$OAUTH_BASE_URL" \
  --require-approval never

if [ "$ENABLE_WAF_FLAG" = "true" ]; then
  echo "$(i18n deploy.deploying_waf)"
  run npx cdk deploy QdmRemoteWaf \
    -c enableWaf=true \
    -c alarmPreset="$PRESET" \
    --require-approval never
fi

echo
echo "=== $(i18n deploy.done) ==="
echo "$(i18n deploy.summary_oauth_url): $OAUTH_BASE_URL/authorize"
echo "$(i18n deploy.summary_mcp_endpoint): $OAUTH_BASE_URL/mcp"
