#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# quick-dingtalk-mcp 一键部署脚本 (macOS / Linux)
#
# 用法 (远程一行安装):
#   curl -fsSL https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.sh | bash
# 或本地执行:
#   chmod +x scripts/setup.sh && ./scripts/setup.sh
#
# 自动完成:
#   1. 检测/安装 Node.js (>=18)
#   2. 安装 dingtalk-workspace-cli (dws)
#   3. 克隆或更新 quick-dingtalk-mcp 项目 (safe-mode 分支)
#   4. 安装项目依赖
#   5. 引导 dws 登录钉钉
#   6. 输出 MCP Host 配置信息
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 配色 ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
GRAY='\033[0;37m'
NC='\033[0m'

step()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
ok()    { echo -e "${GREEN}  ✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}  ⚠ $1${NC}"; }
err()   { echo -e "${RED}  ✗ $1${NC}"; }
info()  { echo -e "  → $1"; }

# ─── 配置 (修改此处适配你的 fork) ────────────────────────────────────
GITHUB_OWNER="EMP-WGJJ"
GITHUB_REPO="quick-dingtalk-mcp"
BRANCH="safe-mode"
REPO_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"
INSTALL_DIR="$HOME/${GITHUB_REPO}"
MIN_NODE_VER=18

# ─── 工具函数 ───────────────────────────────────────────────────────
detect_os() {
    case "$(uname -s)" in
        Darwin*) echo "macos" ;;
        Linux*)  echo "linux" ;;
        *)       echo "unknown" ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "x64" ;;
        arm64|aarch64) echo "arm64" ;;
        *) echo "x64" ;;
    esac
}

# ─── 检测系统 ───────────────────────────────────────────────────────
OS=$(detect_os)
ARCH=$(detect_arch)

if [ "$OS" = "unknown" ]; then
    err "不支持的操作系统: $(uname -s)"
    err "本脚本支持 macOS 和 Linux"
    exit 1
fi

echo -e "\n${GREEN}🚀 quick-dingtalk-mcp 一键部署${NC}"
echo -e "   系统: ${OS} (${ARCH})"
echo -e "   仓库: ${GITHUB_OWNER}/${GITHUB_REPO}"
echo -e "   分支: ${BRANCH}"
echo ""

# ═══════════════════════════════════════════════════════════════════════
# Step 1: 检测/安装 Node.js
# ═══════════════════════════════════════════════════════════════════════
step "Step 1/5: 检测 Node.js 环境"

NEED_NODE=false

if command -v node &>/dev/null; then
    NODE_VER=$(node --version | sed 's/^v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge "$MIN_NODE_VER" ]; then
        ok "Node.js v${NODE_VER} 已安装 (满足 >= ${MIN_NODE_VER})"
    else
        warn "Node.js v${NODE_VER} 版本过低 (需要 >= ${MIN_NODE_VER})"
        NEED_NODE=true
    fi
else
    warn "未检测到 Node.js"
    NEED_NODE=true
fi

if [ "$NEED_NODE" = true ]; then
    info "正在安装 Node.js..."

    if [ "$OS" = "macos" ]; then
        if command -v brew &>/dev/null; then
            info "使用 Homebrew 安装 Node.js 20..."
            brew install node@20
            brew link node@20 --overwrite --force 2>/dev/null || true
        else
            info "未检测到 Homebrew，使用官方安装包..."
            if [ "$ARCH" = "arm64" ]; then
                NODE_PKG_URL="https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-arm64.tar.gz"
            else
                NODE_PKG_URL="https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-x64.tar.gz"
            fi
            curl -fsSL "$NODE_PKG_URL" -o /tmp/node.tar.gz
            sudo mkdir -p /usr/local/lib/nodejs
            sudo tar -xzf /tmp/node.tar.gz -C /usr/local/lib/nodejs
            NODE_DIR=$(ls /usr/local/lib/nodejs | grep node | head -1)
            sudo ln -sf "/usr/local/lib/nodejs/$NODE_DIR/bin/node" /usr/local/bin/node
            sudo ln -sf "/usr/local/lib/nodejs/$NODE_DIR/bin/npm" /usr/local/bin/npm
            sudo ln -sf "/usr/local/lib/nodejs/$NODE_DIR/bin/npx" /usr/local/bin/npx
            rm /tmp/node.tar.gz
        fi
    else
        if command -v apt-get &>/dev/null; then
            info "使用 NodeSource 安装 Node.js 20 (apt)..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &>/dev/null; then
            info "使用 NodeSource 安装 Node.js 20 (yum)..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
        elif command -v dnf &>/dev/null; then
            info "使用 NodeSource 安装 Node.js 20 (dnf)..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
        else
            info "使用 nvm 安装 Node.js..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
            nvm install 20
            nvm use 20
        fi
    fi

    # 验证
    if command -v node &>/dev/null; then
        NODE_VER=$(node --version | sed 's/^v//')
        ok "Node.js v${NODE_VER} 安装成功"
    else
        err "Node.js 安装失败"
        err "请手动安装: https://nodejs.org/ (选择 LTS 版本)"
        err "安装后重新运行此脚本"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════════
# Step 2: 安装 dingtalk-workspace-cli (dws)
# ═══════════════════════════════════════════════════════════════════════
step "Step 2/5: 安装钉钉 CLI (dws)"

if command -v dws &>/dev/null; then
    DWS_VER=$(dws --version 2>&1 | head -1)
    ok "dws 已安装: ${DWS_VER}"
else
    info "正在安装 dws..."

    # 尝试官方安装脚本
    if curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh 2>/dev/null; then
        export PATH="$HOME/.local/bin:$HOME/.dws/bin:/usr/local/bin:$PATH"
    else
        warn "官方脚本安装失败，尝试 npm 全局安装..."
        npm install -g dingtalk-workspace-cli
    fi

    # 验证
    if command -v dws &>/dev/null; then
        DWS_VER=$(dws --version 2>&1 | head -1)
        ok "dws 安装成功: ${DWS_VER}"
    else
        err "dws 安装失败"
        info "请手动执行: npm install -g dingtalk-workspace-cli"
        info "或访问: https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════════
# Step 3: 克隆/更新项目 (safe-mode 分支)
# ═══════════════════════════════════════════════════════════════════════
step "Step 3/5: 获取 ${GITHUB_REPO} 项目 (${BRANCH} 分支)"

if [ -d "$INSTALL_DIR/.git" ]; then
    info "项目已存在，切换到 ${BRANCH} 分支并拉取最新代码..."
    cd "$INSTALL_DIR"
    git fetch origin 2>/dev/null || true
    git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null || true
    git pull origin "$BRANCH" 2>/dev/null || true
    ok "代码已更新 (${BRANCH})"
elif [ -f "$INSTALL_DIR/package.json" ]; then
    ok "项目已存在 (非 git 方式)，跳过克隆"
else
    if command -v git &>/dev/null; then
        info "克隆项目到 $INSTALL_DIR (分支: ${BRANCH})..."
        git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        ok "克隆完成"
    else
        info "未检测到 git，使用 zip 下载 (${BRANCH} 分支)..."
        ZIP_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip"
        curl -fsSL "$ZIP_URL" -o /tmp/${GITHUB_REPO}.zip
        unzip -q /tmp/${GITHUB_REPO}.zip -d /tmp/
        mv "/tmp/${GITHUB_REPO}-${BRANCH}" "$INSTALL_DIR"
        rm /tmp/${GITHUB_REPO}.zip
        ok "下载并解压完成"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════
# Step 4: 安装项目依赖
# ═══════════════════════════════════════════════════════════════════════
step "Step 4/5: 安装项目依赖"

cd "$INSTALL_DIR"
info "npm install ..."
if npm install 2>&1 | tail -3; then
    ok "依赖安装完成"
else
    err "npm install 失败，请检查网络连接"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════
# Step 5: 引导 dws 登录
# ═══════════════════════════════════════════════════════════════════════
step "Step 5/5: 登录钉钉"

AUTH_STATUS=$(dws auth status -f json 2>&1 || echo '{}')
if echo "$AUTH_STATUS" | grep -q '"authenticated": *true'; then
    ok "已登录钉钉"
else
    echo ""
    echo -e "${MAGENTA}  ┌─────────────────────────────────────────────────────┐${NC}"
    echo -e "${MAGENTA}  │  即将启动钉钉设备登录流程:                          │${NC}"
    echo -e "${MAGENTA}  │                                                     │${NC}"
    echo -e "${MAGENTA}  │  1. 终端会显示一个链接和用户码                      │${NC}"
    echo -e "${MAGENTA}  │  2. 在浏览器中打开链接（或钉钉扫码）                │${NC}"
    echo -e "${MAGENTA}  │  3. 输入用户码并授权                                │${NC}"
    echo -e "${MAGENTA}  │  4. 选择企业 → 勾选所有权限 → 确认                  │${NC}"
    echo -e "${MAGENTA}  │                                                     │${NC}"
    echo -e "${MAGENTA}  │  ⚡ 如果提示企业未开通 CLI，点 Apply Now 申请       │${NC}"
    echo -e "${MAGENTA}  │     管理员审批后重新运行此脚本即可                   │${NC}"
    echo -e "${MAGENTA}  └─────────────────────────────────────────────────────┘${NC}"
    echo ""

    read -p "  按 Enter 开始登录 (输入 s 跳过): " REPLY
    if [ "${REPLY:-}" != "s" ]; then
        dws auth login --device

        # 验证
        AUTH_STATUS=$(dws auth status -f json 2>&1 || echo '{}')
        if echo "$AUTH_STATUS" | grep -q '"authenticated": *true'; then
            ok "登录成功！"
        else
            warn "登录似乎未完成，稍后可手动执行: dws auth login --device"
        fi
    else
        warn "已跳过登录，稍后请手动执行: dws auth login --device"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════
# 输出配置信息
# ═══════════════════════════════════════════════════════════════════════

NODE_PATH=$(which node)
SERVER_PATH="$INSTALL_DIR/src/index.mjs"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🎉 部署完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ┌─────────────────────────────────────────────────────┐"
echo -e "  │  ${CYAN}Amazon Quick Desktop 配置:${NC}                         │"
echo -e "  │                                                     │"
echo -e "  │  Settings → Capabilities → MCP → + Add MCP         │"
echo -e "  │                                                     │"
echo -e "  │  Connection type: Local                             │"
echo -e "  │  ID:   quick-dingtalk-mcp                           │"
echo -e "  │  Name: quick-dingtalk-mcp                           │"
echo -e "  └─────────────────────────────────────────────────────┘"
echo ""
echo -e "${YELLOW}  Command:   ${NODE_PATH}${NC}"
echo -e "${YELLOW}  Arguments: ${SERVER_PATH}${NC}"
echo ""
echo -e "  ┌─────────────────────────────────────────────────────┐"
echo -e "  │  ${CYAN}Claude Desktop / Cursor 配置 (JSON):${NC}               │"
echo -e "  └─────────────────────────────────────────────────────┘"
echo ""

cat << EOF
  {
    "mcpServers": {
      "quick-dingtalk-mcp": {
        "command": "${NODE_PATH}",
        "args": ["${SERVER_PATH}"]
      }
    }
  }
EOF

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ 全部就绪！在 MCP Host 中配置后即可使用。${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  常用命令:"
echo -e "${GRAY}    dws auth status                   # 查看登录状态${NC}"
echo -e "${GRAY}    dws auth login --device --force   # 重新登录${NC}"
echo -e "${GRAY}    dws upgrade                       # 升级 dws${NC}"
echo ""

read -p "  按 Enter 退出..." _
