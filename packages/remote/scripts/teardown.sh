#!/usr/bin/env bash
# shellcheck disable=SC2005
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
i18n() { jq -r ".$1.\"$LANG_KEY\" // .$1.en" "$I18N"; }
run() { if [ "$DRY_RUN" -eq 1 ]; then echo "[dry-run] $*"; else "$@"; fi; }

if [ "$DRY_RUN" -eq 0 ]; then
  read -rp "$(i18n teardown.warning) " ANS
  [[ "$ANS" =~ ^[yY] ]] || { echo "abort"; exit 0; }
fi

cd "$ROOT/packages/remote"
run npx cdk destroy QdmRemoteWaf --force || true
run npx cdk destroy QdmRemoteRuntime --force
run npx cdk destroy QdmRemoteOAuth --force

echo "$(i18n teardown.preserved_secrets_note)"
