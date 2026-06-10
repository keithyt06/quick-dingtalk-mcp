#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — interactive deploy.
# Reads config/i18n.json for prompt strings (zh/en); language auto-detected from $LANG.
# shellcheck disable=SC2005,SC2016
set -euo pipefail

DRY_RUN=0
ONLY_OAUTH=0
ROTATE_HMAC=0
LANG_KEY=zh
[[ "${LANG:-}" =~ en ]] && LANG_KEY=en

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --only-oauth) ONLY_OAUTH=1 ;;
    --rotate-hmac) ROTATE_HMAC=1 ;;
    --en) LANG_KEY=en ;;
    --zh) LANG_KEY=zh ;;
    --help|-h)
      echo "Usage: deploy.sh [--dry-run] [--only-oauth] [--rotate-hmac] [--en|--zh]"
      echo ""
      echo "  --only-oauth   Only deploy OAuthStack (skip Runtime + WAF)."
      echo "                 Use this for first-time deploy to get the CloudFront domain"
      echo "                 before registering OAuth callback URL with DingTalk."
      echo "  --rotate-hmac  Force-rotate the HMAC signing key. EVERY issued user token"
      echo "                 becomes invalid (all users must re-authorize). Only use when"
      echo "                 you suspect the key leaked. Re-running deploy.sh WITHOUT this"
      echo "                 flag preserves the existing key (idempotent re-deploy)."
      echo "  --dry-run      Print actions without running."
      exit 0
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"

# Deploy region: AWS_REGION (or CDK_DEFAULT_REGION) wins; default us-east-1.
# AgentCore Runtime must be available in the chosen region — check with
#   aws bedrock-agentcore-control list-agent-runtimes --region <region>
# The optional WAF stack ALWAYS deploys to us-east-1 regardless (CloudFront-scope
# WebACLs are an AWS hard constraint), see infra/bin/app.ts.
REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-us-east-1}}"
export AWS_REGION="$REGION" CDK_DEFAULT_REGION="$REGION"

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
echo "$(i18n deploy.prompt_region) $REGION"

if [ "$DRY_RUN" -eq 1 ]; then
  DINGTALK_APP_ID="dry-run-app-id"
  DINGTALK_APP_SECRET="dry-run-secret"
  ALARM_WEBHOOK=""
  PRESET="standard"
  ENABLE_WAF="N"
elif [ "$ONLY_OAUTH" -eq 1 ]; then
  # First-time OAuth-only deploy: caller doesn't have CF domain yet, so they
  # haven't registered DingTalk app's callback URL yet, so AppKey/Secret are
  # often unknown too. Accept placeholders; user fills via SSM put-parameter
  # after seeing the deploy summary.
  echo "[--only-oauth] Skipping interactive prompts. Using placeholders."
  echo "[--only-oauth] After deploy, get the CloudFront domain, register the OAuth"
  echo "[--only-oauth] callback URL at https://open.dingtalk.com, then write real"
  echo "[--only-oauth] credentials via:"
  echo "[--only-oauth]   aws ssm put-parameter --overwrite --type SecureString \\"
  echo "[--only-oauth]     --name /qdm-remote/QdmRemoteOAuth/dingtalk-app-secret \\"
  echo "[--only-oauth]     --value <real-secret>"
  DINGTALK_APP_ID="${DINGTALK_APP_ID:-PLACEHOLDER_APP_ID}"
  # Empty secret = "keep whatever is in SSM" (see idempotent SSM section below),
  # so re-running --only-oauth never clobbers a real secret with a placeholder.
  DINGTALK_APP_SECRET="${DINGTALK_APP_SECRET:-}"
  ALARM_WEBHOOK=""
  PRESET="standard"
  ENABLE_WAF="N"
else
  # Re-deploy convenience: every prompt can be pre-answered via env var
  # (DINGTALK_APP_ID / DINGTALK_APP_SECRET / ALARM_WEBHOOK / PRESET / ENABLE_WAF),
  # and AppKey defaults to the value already deployed on the live stack, so an
  # update deploy is mostly hitting Enter. AppSecret may be left EMPTY to keep
  # the secret already stored in SSM.
  SHIM_ARN=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`TokenRefreshShimArn`].OutputValue' --output text 2>/dev/null || true)
  EXISTING_APP_ID=""
  if [ -n "$SHIM_ARN" ] && [ "$SHIM_ARN" != "None" ]; then
    EXISTING_APP_ID=$(aws lambda get-function-configuration --region "$REGION" --function-name "$SHIM_ARN" \
      --query 'Environment.Variables.DINGTALK_APP_ID' --output text 2>/dev/null || true)
    { [ "$EXISTING_APP_ID" = "None" ] || [ "$EXISTING_APP_ID" = "PLACEHOLDER_APP_ID" ]; } && EXISTING_APP_ID=""
  fi
  if [ -z "${DINGTALK_APP_ID:-}" ]; then
    if [ -n "$EXISTING_APP_ID" ]; then
      read -rp "$(i18n deploy.prompt_dingtalk_app_id) [$EXISTING_APP_ID] " DINGTALK_APP_ID
      DINGTALK_APP_ID="${DINGTALK_APP_ID:-$EXISTING_APP_ID}"
    else
      read -rp "$(i18n deploy.prompt_dingtalk_app_id) " DINGTALK_APP_ID
    fi
  fi
  if [ -z "${DINGTALK_APP_SECRET:-}" ]; then
    read -rsp "$(i18n deploy.prompt_dingtalk_app_secret) " DINGTALK_APP_SECRET; echo
  fi
  if [ -z "${ALARM_WEBHOOK+x}" ]; then
    read -rp "$(i18n deploy.prompt_alarm_webhook) " ALARM_WEBHOOK
  fi
  ALARM_WEBHOOK="${ALARM_WEBHOOK:-}"
  if [ -z "${PRESET:-}" ]; then
    read -rp "$(i18n deploy.prompt_alarm_preset) " PRESET
  fi
  PRESET="${PRESET:-standard}"
  if [ -z "${ENABLE_WAF:-}" ]; then
    read -rp "$(i18n deploy.prompt_enable_waf) " ENABLE_WAF
  fi
  ENABLE_WAF="${ENABLE_WAF:-N}"
fi

ENABLE_WAF_FLAG=false
[[ "$ENABLE_WAF" =~ ^[yY] ]] && ENABLE_WAF_FLAG=true

cd "$ROOT/packages/remote"
run npm install
run npm run build:lambda

# cdk.json lives in packages/remote/infra, so all `cdk` invocations run from
# there (in a subshell to keep this script's cwd at packages/remote for the
# SSM / boto3 steps that follow). build:lambda above produced infra/bin/
# app.bundle.cjs, which cdk.json's `app` points at.
cdk_deploy() { ( cd "$ROOT/packages/remote/infra" && run npx cdk "$@" ); }

echo "$(i18n deploy.deploying_oauth)"
cdk_deploy deploy QdmRemoteOAuth \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  --require-approval never

# Write HMAC key + AppSecret to SSM as SecureString — IDEMPOTENTLY.
# CloudFormation's AWS::SSM::Parameter can only create String/StringList, so the
# stack seeds these two as String placeholders (value REPLACE_AT_DEPLOY). You
# cannot change a parameter's Type with `put --overwrite` (AWS rejects it), so we
# delete the String placeholder and recreate it as SecureString.
#
# Idempotency rules (so re-running deploy.sh is always safe):
# - hmac-key: generated ONCE on first deploy. Re-deploys preserve it — rotating
#   it invalidates every issued user token (mass logout). Rotate only with
#   --rotate-hmac.
# - dingtalk-app-secret: written only when a non-empty secret was provided
#   (prompt or env). Empty input = keep what's already in SSM.
ssm_current() {
  aws ssm get-parameter --region "$REGION" --name "$1" --with-decryption \
    --query 'Parameter.Value' --output text 2>/dev/null || echo ""
}
ssm_write_secure() {
  run aws ssm delete-parameter --region "$REGION" --name "$1" 2>/dev/null || true
  run aws ssm put-parameter --region "$REGION" --name "$1" --value "$2" --type SecureString
}

HMAC_PARAM=/qdm-remote/QdmRemoteOAuth/hmac-key
CUR_HMAC=""
[ "$DRY_RUN" -eq 0 ] && CUR_HMAC=$(ssm_current "$HMAC_PARAM")
if [ "$ROTATE_HMAC" -eq 1 ] || [ -z "$CUR_HMAC" ] || [ "$CUR_HMAC" = "REPLACE_AT_DEPLOY" ]; then
  [ "$ROTATE_HMAC" -eq 1 ] && echo "!! --rotate-hmac: rotating HMAC key — ALL user tokens are now invalid."
  ssm_write_secure "$HMAC_PARAM" "$(openssl rand -hex 32)"
else
  echo "HMAC key already provisioned — preserved (use --rotate-hmac to force rotation)."
fi

SECRET_PARAM=/qdm-remote/QdmRemoteOAuth/dingtalk-app-secret
if [ -n "$DINGTALK_APP_SECRET" ]; then
  ssm_write_secure "$SECRET_PARAM" "$DINGTALK_APP_SECRET"
else
  CUR_SECRET=$(ssm_current "$SECRET_PARAM")
  if [ -z "$CUR_SECRET" ] || [ "$CUR_SECRET" = "REPLACE_AT_DEPLOY" ]; then
    echo "WARN: no AppSecret provided and none stored yet — OAuth will fail until you run:" >&2
    echo "  aws ssm put-parameter --overwrite --region $REGION --type SecureString \\" >&2
    echo "    --name $SECRET_PARAM --value <real-secret>" >&2
  else
    echo "AppSecret input empty — keeping the secret already stored in SSM."
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  OAUTH_BASE_URL="https://placeholder"
  STATE_TABLE="placeholder-state-table"
else
  OAUTH_BASE_URL=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`OAuthBaseUrl`].OutputValue' --output text 2>/dev/null || echo "https://placeholder")
  STATE_TABLE=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`OAuthStateTableName`].OutputValue' --output text 2>/dev/null || echo "")
fi

# Pre-register the fixed OAuth client `quick` (idempotent upsert into the
# OAuthStateTable). Quick's "User authentication" form requires a hand-entered
# Client ID and never runs DCR, so this record must exist for the wizard to
# pass /authorize validation. Previously written by hand — a table rebuild
# silently dropped it; now every deploy re-asserts it.
# The item carries NO `ttl` attribute, so neither DynamoDB TTL nor the in-code
# expiry check ever expires it.
# Override the callback allowlist via QUICK_REDIRECT_URIS (comma-separated)
# if your Quick endpoint uses a different QuickSight region/domain.
QUICK_REDIRECT_URIS="${QUICK_REDIRECT_URIS:-https://us-east-1.quicksight.aws.amazon.com/sn/oauthcallback}"
if [ -n "$STATE_TABLE" ] && [ "$STATE_TABLE" != "None" ]; then
  QUICK_CLIENT_PAYLOAD=$(jq -cn --arg uris "$QUICK_REDIRECT_URIS" \
    '{redirectUris: ($uris | split(",") | map(gsub("^\\s+|\\s+$"; ""))), authMethod: "client_secret_basic", clientName: "Amazon Quick"}')
  QUICK_CLIENT_ITEM=$(jq -cn --arg p "$QUICK_CLIENT_PAYLOAD" '{state: {S: "client#quick"}, payload: {S: $p}}')
  echo "Pre-registering OAuth client 'quick' (table: $STATE_TABLE, redirect URIs: $QUICK_REDIRECT_URIS)"
  run aws dynamodb put-item --region "$REGION" --table-name "$STATE_TABLE" --item "$QUICK_CLIENT_ITEM"
else
  echo "WARN: OAuthStateTableName stack output not found — skipping client#quick pre-registration." >&2
  echo "      (Redeploy QdmRemoteOAuth to get the output, then re-run deploy.sh.)" >&2
fi

if [ "$ONLY_OAUTH" -eq 1 ]; then
  echo
  echo "================================================================="
  echo "  OAuthStack deployed (--only-oauth mode)"
  echo "================================================================="
  echo
  echo "  CloudFront base URL:  $OAUTH_BASE_URL"
  echo "  Callback URL (give to DingTalk Open Platform):"
  echo "      $OAUTH_BASE_URL/callback"
  echo
  echo "Next steps:"
  echo "  1. Go to https://open.dingtalk.com/"
  echo "  2. Edit your app -> 安全设置 -> 服务器出口 IP / 回调地址"
  echo "  3. Add: $OAUTH_BASE_URL/callback"
  echo "  4. Copy the AppKey + AppSecret from the app detail page"
  echo "  5. Write real values into SSM (SecureString):"
  echo "       aws ssm put-parameter --overwrite --region $REGION --type SecureString \\"
  echo "         --name /qdm-remote/QdmRemoteOAuth/dingtalk-app-secret --value <real-secret>"
  echo "  6. Update Lambda env DINGTALK_APP_ID (or redeploy with -c dingtalkAppId=<real>):"
  echo "       npx cdk deploy QdmRemoteOAuth -c dingtalkAppId=<real-app-key>"
  echo "  7. Generate the real HMAC signing key (one-time):"
  echo "       aws ssm put-parameter --overwrite --region $REGION --type SecureString \\"
  echo "         --name /qdm-remote/QdmRemoteOAuth/hmac-key \\"
  echo "         --value \"\$(openssl rand -hex 32)\""
  echo "  8. Open in browser to start OAuth: $OAUTH_BASE_URL/authorize"
  echo
  echo "  When you're ready for full deploy (Runtime + WAF), re-run deploy.sh"
  echo "  WITHOUT --only-oauth."
  echo "================================================================="
  exit 0
fi

# RuntimeStack now contains the AgentCore Runtime itself
# (AWS::BedrockAgentCore::Runtime) plus an SSM parameter carrying its ARN that
# mcp-middleware reads at cold start. The old boto3 create-agent-runtime +
# Lambda-env-patch side channel is gone — CDK is the whole deployment.
echo "$(i18n deploy.deploying_runtime)"
cdk_deploy deploy QdmRemoteRuntime \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  -c oauthBaseUrl="$OAUTH_BASE_URL" \
  --require-approval never

if [ "$ENABLE_WAF_FLAG" = "true" ]; then
  echo "$(i18n deploy.deploying_waf)"
  cdk_deploy deploy QdmRemoteWaf \
    -c enableWaf=true \
    -c alarmPreset="$PRESET" \
    --require-approval never
fi

echo
echo "=== $(i18n deploy.done) ==="
echo "$(i18n deploy.summary_oauth_url): $OAUTH_BASE_URL/authorize"
echo "$(i18n deploy.summary_mcp_endpoint): $OAUTH_BASE_URL/mcp"
