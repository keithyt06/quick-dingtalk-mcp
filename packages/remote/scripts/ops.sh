#!/usr/bin/env bash
# shellcheck disable=SC2005,SC2016,SC2059
set -euo pipefail
SUB="${1:-}"
shift || true

LANG_KEY=zh; [[ "${LANG:-}" =~ en ]] && LANG_KEY=en
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"
i18n() { jq -r ".$1.\"$LANG_KEY\" // .$1.en" "$I18N"; }

case "$SUB" in
  status)
    aws cloudformation describe-stacks --region us-east-1 \
      --query 'Stacks[?starts_with(StackName,`QdmRemote`)].[StackName,StackStatus]' --output table
    ;;
  list-users)
    echo "$(i18n ops.list_users_header)"
    aws secretsmanager list-secrets --region us-east-1 \
      --filters Key=name,Values=quick-dingtalk-mcp/users/ \
      --query 'SecretList[].Name' --output text | tr '\t' '\n' | sed 's|quick-dingtalk-mcp/users/||'
    ;;
  revoke)
    USER_ID="${1:?usage: ops.sh revoke <userId>}"
    PROMPT=$(printf "$(i18n ops.revoke_confirm)" "$USER_ID")
    read -rp "$PROMPT " ANS
    [[ "$ANS" =~ ^[yY] ]] || { echo "abort"; exit 0; }
    aws secretsmanager delete-secret --region us-east-1 \
      --secret-id "quick-dingtalk-mcp/users/$USER_ID"
    printf "$(i18n ops.revoke_done)\n" "quick-dingtalk-mcp/users/$USER_ID"
    ;;
  refresh)
    echo "$(i18n ops.refresh_now)"
    LAMBDA_ARN=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 \
      --query 'Stacks[0].Outputs[?OutputKey==`TokenRefreshShimArn`].OutputValue' --output text)
    aws lambda invoke --region us-east-1 --function-name "$LAMBDA_ARN" \
      --payload '{"source":"aws.events"}' --cli-binary-format raw-in-base64-out /tmp/refresh-out.json
    cat /tmp/refresh-out.json
    ;;
  logs)
    LAMBDA="${1:?usage: ops.sh logs <token-refresh-shim|mcp-middleware|alarm-webhook>}"
    echo "$(i18n ops.logs_tail)"
    aws logs tail "/aws/lambda/QdmRemoteOAuth-$LAMBDA*" --follow --region us-east-1
    ;;
  *)
    echo "Usage: ops.sh <status|list-users|revoke <uid>|refresh|logs <lambda>>" >&2
    exit 1
    ;;
esac
