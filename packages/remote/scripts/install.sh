#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — one-liner installer.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
set -euo pipefail

REPO_URL="${QDM_REPO_URL:-https://github.com/keithyt06/quick-dingtalk-mcp.git}"
INSTALL_DIR="${QDM_INSTALL_DIR:-$HOME/.quick-dingtalk-mcp}"
BRANCH="${QDM_BRANCH:-main}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h) echo "Usage: install.sh [--dry-run]"; exit 0 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

command -v git >/dev/null || { echo "git required" >&2; exit 1; }
command -v node >/dev/null || { echo "node >= 20 required" >&2; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node >= 20 required (have $(node -v))" >&2; exit 1
fi
command -v aws >/dev/null || { echo "aws cli required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker required (for cdk DockerImageAsset)" >&2; exit 1; }

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating $INSTALL_DIR..."
  run git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  run git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  echo "Cloning $REPO_URL -> $INSTALL_DIR..."
  run git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

run cd "$INSTALL_DIR"
run npm install
echo
echo "Installed. Next: run"
echo "  bash $INSTALL_DIR/packages/remote/scripts/deploy.sh"
