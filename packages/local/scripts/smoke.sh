#!/usr/bin/env bash
# Smoke test: verifies dws is installed + every wrapper command produces the
# expected dws invocation, using --dry-run so no live API calls are made and
# no auth is required. If you've already run `dws auth login --device`, the
# dry-run output will be richer (includes resolved request body); without
# auth it still validates the command shape.
#
# Usage:
#   bash scripts/smoke.sh
set -euo pipefail

DWS=${DWS_BIN:-dws}

if ! command -v "$DWS" >/dev/null 2>&1; then
  echo "FAIL: '$DWS' not found in PATH. Install with: npm i -g dingtalk-workspace-cli" >&2
  exit 1
fi

echo "== dws --version =="
"$DWS" --version

run() {
  local label=$1
  shift
  echo
  echo "-- $label --"
  echo "+ $DWS --dry-run -y $*"
  "$DWS" --dry-run -y "$@" 2>&1 | head -40 || true
}

run "send (group)"        chat message send --group oc_test --title "T" --text "hello"
run "send (single)"       chat message send --user uid_test --title "T" --text "hi"
run "list (group)"        chat message list --group oc_test --time "2026-05-17 00:00:00"
run "search messages"     chat message search --keyword "周报"
run "search chats"        chat search --query "项目"
run "search user"         contact user search --query "Keith"
run "list topic replies"  chat message list-topic-replies --group oc_test --topic-id topic_test

echo
echo "== Smoke test complete =="
