#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# quick-dingtalk-mcp Update Script (macOS / Linux)
#
# Usage:
#   bash scripts/update.sh [options]
#
# Options:
#   --upgrade-dws   Also upgrade dws CLI
#   --force         Force reset to remote latest (discard local changes)
#   --json          Output result in JSON format (for MCP integration)
#   -h, --help      Show help
#
# This script is called by the MCP tool (dingtalk_self_update) or can
# be run manually. It performs:
#   1. Record current version
#   2. Pull latest code from remote
#   3. Install/update npm dependencies
#   4. Optionally upgrade dws CLI
#   5. Output update summary
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 配色 ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }
err()   { echo -e "${RED}✗ $1${NC}"; }
info()  { echo -e "${CYAN}→ $1${NC}"; }

# ─── 参数解析 ───────────────────────────────────────────────────────
UPGRADE_DWS=false
FORCE=false
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --upgrade-dws) UPGRADE_DWS=true; shift ;;
        --force)       FORCE=true; shift ;;
        --json)        JSON_OUTPUT=true; shift ;;
        -h|--help)
            echo "Usage: bash scripts/update.sh [options]"
            echo ""
            echo "Options:"
            echo "  --upgrade-dws   Also upgrade dws CLI"
            echo "  --force         Force reset to remote latest (discard local changes)"
            echo "  --json          Output result in JSON format (for MCP integration)"
            echo "  -h, --help      Show help"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ─── 固定更新分支 ───────────────────────────────────────────────────
UPDATE_BRANCH="safe-mode"

# ─── 定位项目根目录 ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
info "quick-dingtalk-mcp update starting"
echo "   Project path: $PROJECT_DIR"
echo "   Update branch: $UPDATE_BRANCH"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# Step 1: 记录当前版本
# ═══════════════════════════════════════════════════════════════════════
info "Step 1: Checking current state"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "   Current branch: $CURRENT_BRANCH"
echo "   Target branch: $UPDATE_BRANCH"
echo "   Commit: $CURRENT_COMMIT"

# ═══════════════════════════════════════════════════════════════════════
# Step 2: 拉取最新代码
# ═══════════════════════════════════════════════════════════════════════
info "Step 2: Pulling latest code"

if [ "$FORCE" = true ]; then
    warn "Force mode: resetting to origin/$UPDATE_BRANCH"
    git fetch origin
    git reset --hard "origin/$UPDATE_BRANCH"
else
    # 检查是否有未提交的修改
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        warn "Local uncommitted changes detected, stashing..."
        git stash push -m "auto-stash before update $(date +%Y%m%d-%H%M%S)"
        STASHED=true
    else
        STASHED=false
    fi

    # 从固定分支拉取（不切换当前分支）
    if git pull origin "$UPDATE_BRANCH" 2>/dev/null; then
        ok "Code pulled from origin/$UPDATE_BRANCH successfully"
    else
        err "Pull failed (possible conflict), try --force option"
        if [ "$STASHED" = true ]; then
            git stash pop 2>/dev/null || true
        fi
        exit 1
    fi

    # 恢复暂存
    if [ "$STASHED" = true ]; then
        if git stash pop 2>/dev/null; then
            ok "Local changes restored"
        else
            warn "Conflict restoring stash, please resolve manually: git stash pop"
        fi
    fi
fi

NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# ═══════════════════════════════════════════════════════════════════════
# Step 3: 更新项目依赖
# ═══════════════════════════════════════════════════════════════════════
info "Step 3: Updating dependencies"

if npm install 2>&1 | tail -3; then
    ok "Dependencies updated"
else
    err "npm install failed"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════
# Step 4: 升级 dws（可选）
# ═══════════════════════════════════════════════════════════════════════
DWS_UPGRADED="skipped"
if [ "$UPGRADE_DWS" = true ]; then
    info "Step 4: Upgrading dws CLI"

    if command -v dws &>/dev/null; then
        DWS_VER_BEFORE=$(dws --version 2>&1 | head -1)
        if dws upgrade 2>/dev/null; then
            DWS_VER_AFTER=$(dws --version 2>&1 | head -1)
            ok "dws upgraded: $DWS_VER_BEFORE → $DWS_VER_AFTER"
            DWS_UPGRADED="$DWS_VER_BEFORE → $DWS_VER_AFTER"
        else
            warn "dws upgrade failed, trying npm..."
            npm update -g dingtalk-workspace-cli 2>/dev/null || true
            DWS_UPGRADED="fallback_npm"
        fi
    else
        warn "dws not installed, skipping upgrade"
        DWS_UPGRADED="not_installed"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════
# 输出更新摘要
# ═══════════════════════════════════════════════════════════════════════

# JSON 输出模式（供 MCP tool 解析）
if [ "$JSON_OUTPUT" = true ]; then
    UPDATED="false"
    if [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
        UPDATED="true"
    fi
    cat <<EOF
{
  "success": true,
  "updated": $UPDATED,
  "update_branch": "$UPDATE_BRANCH",
  "previous_commit": "$CURRENT_COMMIT",
  "current_commit": "$NEW_COMMIT",
  "dws_upgraded": "$DWS_UPGRADED",
  "restart_required": true
}
EOF
    exit 0
fi

# 人类可读输出
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Update complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "   Update from:  origin/$UPDATE_BRANCH"
echo "   Commit:  $CURRENT_COMMIT → $NEW_COMMIT"

if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
    echo "   Status:  Already up-to-date, no changes"
else
    echo "   Status:  Updated to latest version"
    echo ""
    echo "   Changes:"
    git log --oneline "$CURRENT_COMMIT..$NEW_COMMIT" 2>/dev/null | head -10 | sed 's/^/     /'
fi

echo ""
echo "   ⚠ Note: MCP server needs restart to load new code"
echo "   Restart: Disconnect and reconnect in your MCP host"
echo ""
