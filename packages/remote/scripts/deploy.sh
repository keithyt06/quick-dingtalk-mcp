#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — interactive deploy.
# Reads config/i18n.json for prompt strings (zh/en); language auto-detected from $LANG.
# shellcheck disable=SC2005,SC2016
set -euo pipefail

DRY_RUN=0
ONLY_OAUTH=0
LANG_KEY=zh
[[ "${LANG:-}" =~ en ]] && LANG_KEY=en

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --only-oauth) ONLY_OAUTH=1 ;;
    --en) LANG_KEY=en ;;
    --zh) LANG_KEY=zh ;;
    --help|-h)
      echo "Usage: deploy.sh [--dry-run] [--only-oauth] [--en|--zh]"
      echo ""
      echo "  --only-oauth   Only deploy OAuthStack (skip Runtime + WAF)."
      echo "                 Use this for first-time deploy to get the CloudFront domain"
      echo "                 before registering OAuth callback URL with DingTalk."
      echo "  --dry-run      Print actions without running."
      exit 0
      ;;
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
  DINGTALK_APP_SECRET="${DINGTALK_APP_SECRET:-PLACEHOLDER_SECRET}"
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

# Generate + write HMAC key + AppSecret to SSM as SecureString.
# CloudFormation's AWS::SSM::Parameter can only create String/StringList, so the
# stack seeds these two as String placeholders (value REPLACE_AT_DEPLOY). You
# cannot change a parameter's Type with `put --overwrite` (AWS rejects it), so we
# delete the String placeholder and recreate it as SecureString.
HMAC_KEY=$(openssl rand -hex 32)
for ssm_pair in \
  "/qdm-remote/QdmRemoteOAuth/hmac-key=$HMAC_KEY" \
  "/qdm-remote/QdmRemoteOAuth/dingtalk-app-secret=$DINGTALK_APP_SECRET"; do
  ssm_name="${ssm_pair%%=*}"; ssm_val="${ssm_pair#*=}"
  run aws ssm delete-parameter --region us-east-1 --name "$ssm_name" 2>/dev/null || true
  run aws ssm put-parameter --region us-east-1 --name "$ssm_name" --value "$ssm_val" --type SecureString
done

if [ "$DRY_RUN" -eq 1 ]; then
  OAUTH_BASE_URL="https://placeholder"
else
  OAUTH_BASE_URL=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`OAuthBaseUrl`].OutputValue' --output text 2>/dev/null || echo "https://placeholder")
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
  echo "       aws ssm put-parameter --overwrite --region us-east-1 --type SecureString \\"
  echo "         --name /qdm-remote/QdmRemoteOAuth/dingtalk-app-secret --value <real-secret>"
  echo "  6. Update Lambda env DINGTALK_APP_ID (or redeploy with -c dingtalkAppId=<real>):"
  echo "       npx cdk deploy QdmRemoteOAuth -c dingtalkAppId=<real-app-key>"
  echo "  7. Generate the real HMAC signing key (one-time):"
  echo "       aws ssm put-parameter --overwrite --region us-east-1 --type SecureString \\"
  echo "         --name /qdm-remote/QdmRemoteOAuth/hmac-key \\"
  echo "         --value \"\$(openssl rand -hex 32)\""
  echo "  8. Open in browser to start OAuth: $OAUTH_BASE_URL/authorize"
  echo
  echo "  When you're ready for full deploy (Runtime + WAF), re-run deploy.sh"
  echo "  WITHOUT --only-oauth."
  echo "================================================================="
  exit 0
fi

echo "$(i18n deploy.deploying_runtime)"
cdk_deploy deploy QdmRemoteRuntime \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  -c oauthBaseUrl="$OAUTH_BASE_URL" \
  --require-approval never

# Read RuntimeStack outputs (ImageUri + RuntimeRoleArn) and create AgentCore
# Runtime via boto3 (no CFN resource type for AgentCore exists yet).
if [ "$DRY_RUN" -eq 0 ]; then
  IMAGE_URI=$(aws cloudformation describe-stacks --stack-name QdmRemoteRuntime --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`ImageUri`].OutputValue' --output text)
  RUNTIME_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name QdmRemoteRuntime --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`RuntimeRoleArn`].OutputValue' --output text)
  echo "Creating/updating AgentCore Runtime (boto3, no CFN equivalent yet)..."
  RUNTIME_ARN=$(python3 <<PYEOF
import boto3, sys
c = boto3.client('bedrock-agentcore-control', region_name='us-east-1')
config = {
  'agentRuntimeArtifact': {'containerConfiguration': {'containerUri': '$IMAGE_URI'}},
  'roleArn': '$RUNTIME_ROLE_ARN',
  'networkConfiguration': {'networkMode': 'PUBLIC'},
  'protocolConfiguration': {'serverProtocol': 'HTTP'},
  # AgentCore HTTP contract REQUIRES the container to listen on 0.0.0.0:8080.
  # PORT=8000 (anything else) => the platform health-checks/invokes 8080, gets
  # nothing, and every call returns 502.
  'environmentVariables': {
    'OAUTH_BASE_URL': '$OAUTH_BASE_URL',
    'INJECT_STRATEGY': 'd2',   # dws auth login --token (verified); d1 is a stub.
    'MAX_CONCURRENT': '10',
    'PORT': '8080',
    'DINGTALK_DWS_AGENTCODE': 'quick-dingtalk-mcp',
    'DWS_DISABLE_KEYCHAIN': '1',
  },
  # AgentCore strips ALL inbound request headers by default. mcp-middleware
  # passes per-user identity via these custom headers; without the allowlist the
  # container never sees them and returns 401.
  'requestHeaderConfiguration': {
    'requestHeaderAllowlist': ['x-user-id', 'x-user-access-token', 'x-incr-auth-token'],
  },
}
try:
  resp = c.create_agent_runtime(agentRuntimeName='qdm_remote', description='quick-dingtalk-mcp Remote', **config)
  print(resp['agentRuntimeArn'])
except Exception as e:
  if 'Conflict' in str(e) or 'already exists' in str(e).lower():
    for r in c.list_agent_runtimes().get('agentRuntimes', []):
      if r.get('agentRuntimeName') == 'qdm_remote':
        rid = r['agentRuntimeId']
        c.update_agent_runtime(agentRuntimeId=rid, **config)
        print(r['agentRuntimeArn'])
        sys.exit(0)
    print(f'ERROR: conflict but cannot find existing runtime: {e}', file=sys.stderr)
    sys.exit(1)
  print(f'ERROR: {e}', file=sys.stderr)
  sys.exit(1)
PYEOF
)
  if [ -z "$RUNTIME_ARN" ] || [[ "$RUNTIME_ARN" == ERROR* ]]; then
    echo "Runtime create/update failed: $RUNTIME_ARN" >&2
    exit 1
  fi
  echo "Runtime ARN: $RUNTIME_ARN"

  # The mcp-middleware Lambda was deployed (with OAuthStack) BEFORE the Runtime
  # existed, so its AGENTCORE_RUNTIME_URL env is still the REPLACE_AT_DEPLOY
  # placeholder. Build the invoke URL (ARN url-encoded as a single path segment)
  # and patch it in now, preserving every other env var.
  ENCODED_ARN=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$RUNTIME_ARN")
  INVOKE_URL="https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT"
  MW_FN=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`McpMiddlewareArn`].OutputValue' --output text)
  echo "Patching AGENTCORE_RUNTIME_URL into mcp-middleware ($MW_FN)..."
  python3 - "$MW_FN" "$INVOKE_URL" <<'PYENV'
import boto3, sys
fn, url = sys.argv[1], sys.argv[2]
lc = boto3.client('lambda', region_name='us-east-1')
env = lc.get_function_configuration(FunctionName=fn).get('Environment', {}).get('Variables', {})
env['AGENTCORE_RUNTIME_URL'] = url
lc.update_function_configuration(FunctionName=fn, Environment={'Variables': env})
print('  AGENTCORE_RUNTIME_URL set.')
PYENV
fi

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
