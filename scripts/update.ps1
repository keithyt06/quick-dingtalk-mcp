<#
.SYNOPSIS
    quick-dingtalk-mcp Update Script (Windows PowerShell)
.DESCRIPTION
    This script is called by the MCP tool (dingtalk_self_update) or can
    be run manually. It performs:
    1. Record current version
    2. Pull latest code from remote
    3. Install/update npm dependencies
    4. Optionally upgrade dws CLI
    5. Output update summary
.PARAMETER UpgradeDws
    Also upgrade dws CLI
.PARAMETER Force
    Force reset to remote latest (discard local changes)
.PARAMETER Json
    Output result in JSON format (for MCP integration)
.PARAMETER Help
    Show help
.NOTES
    Usage:
      powershell -ExecutionPolicy Bypass -File scripts/update.ps1
      powershell -ExecutionPolicy Bypass -File scripts/update.ps1 -UpgradeDws
      powershell -ExecutionPolicy Bypass -File scripts/update.ps1 -Force
      powershell -ExecutionPolicy Bypass -File scripts/update.ps1 -Json
#>

param(
    [switch]$UpgradeDws,
    [switch]$Force,
    [switch]$Json,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ─── 工具函数 ───────────────────────────────────────────────────────
function Write-OK   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "  → $msg" -ForegroundColor Cyan }

# ─── 帮助 ───────────────────────────────────────────────────────────
if ($Help) {
    Write-Host "Usage: powershell -File scripts/update.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -UpgradeDws   Also upgrade dws CLI"
    Write-Host "  -Force        Force reset to remote latest (discard local changes)"
    Write-Host "  -Json         Output result in JSON format (for MCP integration)"
    Write-Host "  -Help         Show help"
    exit 0
}

# ─── 固定更新分支 ───────────────────────────────────────────────────
$UpdateBranch = "safe-mode"

# ─── 定位项目根目录 ─────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir

if (-not $Json) {
    Write-Host ""
    Write-Info "quick-dingtalk-mcp update starting"
    Write-Host "   Project path: $ProjectDir"
    Write-Host "   Update branch: $UpdateBranch"
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════
# Step 1: 记录当前版本
# ═══════════════════════════════════════════════════════════════════════
if (-not $Json) { Write-Info "Step 1: Checking current state" }

$CurrentBranch = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $CurrentBranch) { $CurrentBranch = "unknown" }
$CurrentCommit = git rev-parse --short HEAD 2>$null
if (-not $CurrentCommit) { $CurrentCommit = "unknown" }

if (-not $Json) {
    Write-Host "   Current branch: $CurrentBranch"
    Write-Host "   Target branch: $UpdateBranch"
    Write-Host "   Commit: $CurrentCommit"
}

# ═══════════════════════════════════════════════════════════════════════
# Step 2: 拉取最新代码
# ═══════════════════════════════════════════════════════════════════════
if (-not $Json) { Write-Info "Step 2: Pulling latest code" }

if ($Force) {
    if (-not $Json) { Write-Warn "Force mode: resetting to origin/$UpdateBranch" }
    git fetch origin 2>$null
    git reset --hard "origin/$UpdateBranch"
} else {
    # 检查本地修改
    $diffStatus = git status --porcelain 2>$null
    $Stashed = $false

    if ($diffStatus) {
        if (-not $Json) { Write-Warn "Local uncommitted changes detected, stashing..." }
        git stash push -m "auto-stash before update $(Get-Date -Format 'yyyyMMdd-HHmmss')"
        $Stashed = $true
    }

    # 从固定分支拉取（不切换当前分支）
    $pullResult = git pull origin $UpdateBranch 2>&1
    if ($LASTEXITCODE -eq 0) {
        if (-not $Json) { Write-OK "Code pulled from origin/$UpdateBranch successfully" }
    } else {
        if (-not $Json) { Write-Err "Pull failed (possible conflict), try -Force option" }
        if ($Stashed) {
            git stash pop 2>$null
        }
        if ($Json) {
            Write-Output '{"success": false, "error": "git pull failed"}'
        }
        exit 1
    }

    # 恢复暂存
    if ($Stashed) {
        $popResult = git stash pop 2>&1
        if ($LASTEXITCODE -eq 0) {
            if (-not $Json) { Write-OK "Local changes restored" }
        } else {
            if (-not $Json) { Write-Warn "Conflict restoring stash, please resolve manually: git stash pop" }
        }
    }
}

$NewCommit = git rev-parse --short HEAD 2>$null
if (-not $NewCommit) { $NewCommit = "unknown" }

# ═══════════════════════════════════════════════════════════════════════
# Step 3: 更新项目依赖
# ═══════════════════════════════════════════════════════════════════════
if (-not $Json) { Write-Info "Step 3: Updating dependencies" }

npm install 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    if (-not $Json) { Write-OK "Dependencies updated" }
} else {
    npm install
    if ($LASTEXITCODE -ne 0) {
        if (-not $Json) { Write-Err "npm install failed" }
        if ($Json) {
            Write-Output '{"success": false, "error": "npm install failed"}'
        }
        exit 1
    }
}

# ═══════════════════════════════════════════════════════════════════════
# Step 4: 升级 dws（可选）
# ═══════════════════════════════════════════════════════════════════════
$DwsUpgraded = "skipped"
if ($UpgradeDws) {
    if (-not $Json) { Write-Info "Step 4: Upgrading dws CLI" }

    $dwsCmd = Get-Command dws -ErrorAction SilentlyContinue
    if ($dwsCmd) {
        $DwsVerBefore = (dws --version 2>&1) | Select-Object -First 1
        $upgradeResult = dws upgrade 2>&1
        if ($LASTEXITCODE -eq 0) {
            $DwsVerAfter = (dws --version 2>&1) | Select-Object -First 1
            if (-not $Json) { Write-OK "dws upgraded: $DwsVerBefore → $DwsVerAfter" }
            $DwsUpgraded = "$DwsVerBefore → $DwsVerAfter"
        } else {
            if (-not $Json) { Write-Warn "dws upgrade failed, trying npm..." }
            npm update -g dingtalk-workspace-cli 2>$null
            $DwsUpgraded = "fallback_npm"
        }
    } else {
        if (-not $Json) { Write-Warn "dws not installed, skipping upgrade" }
        $DwsUpgraded = "not_installed"
    }
}

# ═══════════════════════════════════════════════════════════════════════
# 输出更新摘要
# ═══════════════════════════════════════════════════════════════════════

# JSON 输出模式（供 MCP tool 解析）
if ($Json) {
    $Updated = if ($CurrentCommit -ne $NewCommit) { "true" } else { "false" }
    $jsonOutput = @"
{
  "success": true,
  "updated": $Updated,
  "update_branch": "$UpdateBranch",
  "previous_commit": "$CurrentCommit",
  "current_commit": "$NewCommit",
  "dws_upgraded": "$DwsUpgraded",
  "restart_required": true
}
"@
    Write-Output $jsonOutput
    exit 0
}

# 人类可读输出
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅ Update complete" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "   Update from:  origin/$UpdateBranch"
Write-Host "   Commit:  $CurrentCommit → $NewCommit"

if ($CurrentCommit -eq $NewCommit) {
    Write-Host "   Status:  Already up-to-date, no changes"
} else {
    Write-Host "   Status:  Updated to latest version"
    Write-Host ""
    Write-Host "   Changes:"
    $logs = git log --oneline "$CurrentCommit..$NewCommit" 2>$null | Select-Object -First 10
    foreach ($line in $logs) {
        Write-Host "     $line"
    }
}

Write-Host ""
Write-Host "   ⚠ Note: MCP server needs restart to load new code" -ForegroundColor Yellow
Write-Host "   Restart: Disconnect and reconnect in your MCP host"
Write-Host ""
