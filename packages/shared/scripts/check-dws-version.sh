#!/usr/bin/env bash
# Verify catalog.json was generated with the same dws version that's currently installed.
# CI runs this — mismatch fails the build, forcing the dev to run `npm run build:catalog`
# and commit the diff.
set -euo pipefail

CATALOG="$(dirname "$0")/../catalog.json"

if ! command -v dws >/dev/null 2>&1; then
  echo "FAIL: dws not in PATH" >&2
  exit 1
fi

CATALOG_VER=$(jq -r '._dwsCliVersion' "$CATALOG")
RUNTIME_VER=$(dws --version | sed -nE 's/.*v([0-9.]+).*/\1/p' | head -1)

if [ "$CATALOG_VER" != "$RUNTIME_VER" ]; then
  cat >&2 <<EOF
FAIL: dws version mismatch
  catalog.json: $CATALOG_VER
  installed:    $RUNTIME_VER

To fix:
  1) make sure you have the dws version that catalog.json was generated against:
       npm install -g dingtalk-workspace-cli@$CATALOG_VER
  2) OR regenerate catalog:
       npm run build:catalog
       git add packages/shared/catalog.json
       git commit -m "chore: refresh catalog for dws $RUNTIME_VER"
EOF
  exit 1
fi

echo "OK: dws $RUNTIME_VER matches catalog"
