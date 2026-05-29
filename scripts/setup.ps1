<#
.SYNOPSIS
    quick-dingtalk-mcp 一键部署脚本 (Windows PowerShell)
.DESCRIPTION
    自动完成以下步骤:
    1. 检测/安装 Node.js (>=18)
    2. 安装 dingtalk-workspace-cli (dws)
    3. 克隆或更新 quick-dingtalk-mcp 项目 (safe-mode 分支)
    4. 安装项目依赖
    5. 引导 dws 登录钉钉
    6. 输出 MCP Host 配置信息
.NOTES
    用法: 右键以管理员身份运行 PowerShell，然后执行:
    irm https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.ps1 | iex
    或者本地执行:
    powershell -ExecutionPolicy Bypass -File setup.ps1
#>

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ═══════════════════════════════════════════════
# 配色与工具函数
# ═══════════════════════════════════════════════
function Write-Step  { param($msg) Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan; Write-Host "  $msg" -ForegroundColor Cyan; Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "  → $msg" -ForegroundColor White }

# ═══════════════════════════════════════════════
# 配置 (修改此处适配你的 fork)
# ═══════════════════════════════════════════════
$GITHUB_OWNER = "EMP-WGJJ"
$GITHUB_REPO  = "quick-dingtalk-mcp"
$BRANCH       = "safe-mode"
$REPO_URL     = "https://github.com/$GITHUB_OWNER/$GITHUB_REPO.git"
$INSTALL_DIR  = "$env:USERPROFILE\$GITHUB_REPO"
$MIN_NODE_VER = 18

# ═══════════════════════════════════════════════
# Step 1: 检测/安装 Node.js
# ═══════════════════════════════════════════════
Write-Step "Step 1/5: 检测 Node.js 环境"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVer = (node --version) -replace '^v', ''
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    if ($nodeMajor -ge $MIN_NODE_VER) {
        Write-OK "Node.js v$nodeVer 已安装 (满足 >= $MIN_NODE_VER)"
    } else {
        Write-Warn "Node.js v$nodeVer 版本过低 (需要 >= $MIN_NODE_VER)"
        $needNode = $true
    }
} else {
    Write-Warn "未检测到 Node.js"
    $needNode = $true
}

if ($needNode) {
    Write-Info "正在安装 Node.js LTS..."

    # 尝试用 winget
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        Write-Info "使用 winget 安装 Node.js..."
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # 刷新 PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } else {
        # 手动下载安装
        $nodeInstallerUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $installerPath = "$env:TEMP\node-installer.msi"
        Write-Info "下载 Node.js 安装包..."
        Invoke-WebRequest -Uri $nodeInstallerUrl -OutFile $installerPath
        Write-Info "安装中 (可能需要管理员权限)..."
        Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /qn" -Wait -NoNewWindow
        Remove-Item $installerPath -Force
        # 刷新 PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }

    # 验证
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeVer = (node --version) -replace '^v', ''
        Write-OK "Node.js v$nodeVer 安装成功"
    } else {
        Write-Err "Node.js 安装失败，请手动安装: https://nodejs.org/"
        Write-Err "安装后请重新运行此脚本"
        exit 1
    }
}

# ═══════════════════════════════════════════════
# Step 2: 安装 dingtalk-workspace-cli (dws)
# ═══════════════════════════════════════════════
Write-Step "Step 2/5: 安装钉钉 CLI (dws)"

$dwsCmd = Get-Command dws -ErrorAction SilentlyContinue
if ($dwsCmd) {
    $dwsVer = (dws --version 2>&1) | Select-Object -First 1
    Write-OK "dws 已安装: $dwsVer"
} else {
    Write-Info "正在通过官方脚本安装 dws..."
    try {
        Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.ps1" -UseBasicParsing).Content
        # 刷新 PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        Write-Warn "官方脚本安装失败，尝试 npm 全局安装..."
        npm install -g dingtalk-workspace-cli
    }

    # 验证
    $dwsCmd = Get-Command dws -ErrorAction SilentlyContinue
    if ($dwsCmd) {
        $dwsVer = (dws --version 2>&1) | Select-Object -First 1
        Write-OK "dws 安装成功: $dwsVer"
    } else {
        Write-Err "dws 安装失败"
        Write-Info "请手动执行: npm install -g dingtalk-workspace-cli"
        Write-Info "或访问: https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli"
        exit 1
    }
}

# ═══════════════════════════════════════════════
# Step 3: 克隆/更新项目 (safe-mode 分支)
# ═══════════════════════════════════════════════
Write-Step "Step 3/5: 获取 $GITHUB_REPO 项目 ($BRANCH 分支)"

if (Test-Path "$INSTALL_DIR\.git") {
    Write-Info "项目已存在，切换到 $BRANCH 分支并拉取最新代码..."
    Push-Location $INSTALL_DIR
    git fetch origin 2>$null
    git checkout $BRANCH 2>$null
    git pull origin $BRANCH 2>$null
    Pop-Location
    Write-OK "代码已更新 ($BRANCH)"
} elseif (Test-Path "$INSTALL_DIR\package.json") {
    Write-OK "项目已存在 (非 git 方式)，跳过克隆"
} else {
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCmd) {
        Write-Info "克隆项目到 $INSTALL_DIR (分支: $BRANCH)..."
        git clone -b $BRANCH $REPO_URL $INSTALL_DIR
        Write-OK "克隆完成"
    } else {
        Write-Info "未检测到 git，使用 zip 下载 ($BRANCH 分支)..."
        $zipUrl = "https://github.com/$GITHUB_OWNER/$GITHUB_REPO/archive/refs/heads/$BRANCH.zip"
        $zipPath = "$env:TEMP\$GITHUB_REPO.zip"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $env:TEMP -Force
        Move-Item "$env:TEMP\$GITHUB_REPO-$BRANCH" $INSTALL_DIR
        Remove-Item $zipPath -Force
        Write-OK "下载并解压完成"
    }
}

# ═══════════════════════════════════════════════
# Step 4: 安装项目依赖
# ═══════════════════════════════════════════════
Write-Step "Step 4/5: 安装项目依赖"

Push-Location $INSTALL_DIR
Write-Info "npm install ..."
npm install 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-OK "依赖安装完成"
} else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install 失败，请检查网络连接"
        Pop-Location
        exit 1
    }
}
Pop-Location

# ═══════════════════════════════════════════════
# Step 5: 引导 dws 登录
# ═══════════════════════════════════════════════
Write-Step "Step 5/5: 登录钉钉"

# 检查是否已登录
$authStatus = dws auth status -f json 2>&1 | Out-String
if ($authStatus -match '"authenticated":\s*true') {
    Write-OK "已登录钉钉"
} else {
    Write-Host ""
    Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Magenta
    Write-Host "  │  即将启动钉钉设备登录流程:                          │" -ForegroundColor Magenta
    Write-Host "  │                                                     │" -ForegroundColor Magenta
    Write-Host "  │  1. 终端会显示一个链接和用户码                      │" -ForegroundColor Magenta
    Write-Host "  │  2. 在浏览器中打开链接（或钉钉扫码）                │" -ForegroundColor Magenta
    Write-Host "  │  3. 输入用户码并授权                                │" -ForegroundColor Magenta
    Write-Host "  │  4. 选择企业 → 勾选所有权限 → 确认                  │" -ForegroundColor Magenta
    Write-Host "  │                                                     │" -ForegroundColor Magenta
    Write-Host "  │  ⚡ 如果提示企业未开通 CLI，点 Apply Now 申请       │" -ForegroundColor Magenta
    Write-Host "  │     管理员审批后重新运行此脚本即可                   │" -ForegroundColor Magenta
    Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Magenta
    Write-Host ""

    $continue = Read-Host "  按 Enter 开始登录 (输入 s 跳过)"
    if ($continue -ne 's') {
        dws auth login --device

        # 验证
        $authStatus = dws auth status -f json 2>&1 | Out-String
        if ($authStatus -match '"authenticated":\s*true') {
            Write-OK "登录成功！"
        } else {
            Write-Warn "登录似乎未完成，稍后可手动执行: dws auth login --device"
        }
    } else {
        Write-Warn "已跳过登录，稍后请手动执行: dws auth login --device"
    }
}

# ═══════════════════════════════════════════════
# 输出配置信息
# ═══════════════════════════════════════════════

$nodePath = (Get-Command node).Source
$serverPath = Join-Path $INSTALL_DIR "src\index.mjs"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  🎉 部署完成！" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor White
Write-Host "  │  Amazon Quick Desktop 配置:                         │" -ForegroundColor White
Write-Host "  │                                                     │" -ForegroundColor White
Write-Host "  │  Settings → Capabilities → MCP → + Add MCP         │" -ForegroundColor White
Write-Host "  │                                                     │" -ForegroundColor White
Write-Host "  │  Connection type: Local                             │" -ForegroundColor White
Write-Host "  │  ID:   quick-dingtalk-mcp                           │" -ForegroundColor White
Write-Host "  │  Name: quick-dingtalk-mcp                           │" -ForegroundColor White
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor White
Write-Host ""
Write-Host "  Command:   $nodePath" -ForegroundColor Yellow
Write-Host "  Arguments: $serverPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor White
Write-Host "  │  Claude Desktop / Cursor 配置 (JSON):               │" -ForegroundColor White
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor White
Write-Host ""

# 路径转义用于 JSON
$nodePathJson = $nodePath -replace '\\', '\\\\'
$serverPathJson = $serverPath -replace '\\', '\\\\'

$configJson = @"
  {
    "mcpServers": {
      "quick-dingtalk-mcp": {
        "command": "$nodePathJson",
        "args": ["$serverPathJson"]
      }
    }
  }
"@
Write-Host $configJson -ForegroundColor Gray
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅ 全部就绪！在 MCP Host 中配置后即可使用。" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  常用命令:" -ForegroundColor White
Write-Host "    dws auth status       # 查看登录状态" -ForegroundColor Gray
Write-Host "    dws auth login --device --force  # 重新登录" -ForegroundColor Gray
Write-Host "    dws upgrade           # 升级 dws" -ForegroundColor Gray
Write-Host ""
Read-Host "  按 Enter 退出"
