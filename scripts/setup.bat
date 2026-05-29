@echo off
chcp 65001 >nul 2>&1
REM ═══════════════════════════════════════════════════════════════════════
REM quick-dingtalk-mcp 一键部署 (Windows CMD 入口)
REM
REM 此脚本是 Windows 双击入口，会自动启动 PowerShell 执行 setup.ps1
REM 设置 UTF-8 编码 (chcp 65001) 确保中文正常显示
REM
REM 用法: 直接双击 setup.bat 即可
REM ═══════════════════════════════════════════════════════════════════════

echo.
echo  ============================================
echo   quick-dingtalk-mcp 一键部署
echo   分支: safe-mode
echo  ============================================
echo.

REM 检查 PowerShell 是否可用 (优先 pwsh/PowerShell 7+)
where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PS_CMD=pwsh
    goto :run
)

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PS_CMD=powershell
    goto :run
)

echo [ERROR] 未找到 PowerShell，请手动安装 PowerShell
echo 下载地址: https://github.com/PowerShell/PowerShell/releases
pause
exit /b 1

:run
REM 获取当前脚本所在目录
set SCRIPT_DIR=%~dp0

REM 检查 setup.ps1 是否存在 (同目录)
if exist "%SCRIPT_DIR%setup.ps1" (
    echo  使用本地脚本...
    echo.
    %PS_CMD% -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup.ps1"
) else (
    echo  从 GitHub 下载并执行安装脚本 (safe-mode 分支)...
    echo.
    %PS_CMD% -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.ps1 | iex"
)

echo.
pause
