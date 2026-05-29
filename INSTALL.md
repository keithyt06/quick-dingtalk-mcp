# 一键部署指南

> 零基础用户从零开始，一条命令搞定 Node.js + dws + quick-dingtalk-mcp 的完整部署。

---

## 快速开始

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.sh | bash
```

或者已克隆到本地：
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Windows

**方式一：双击执行**（推荐小白用户）
1. 下载项目 zip 并解压
2. 双击 `scripts\setup.bat`

**方式二：PowerShell 一行命令**
```powershell
irm https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.ps1 | iex
```

**方式三：本地执行**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

---

## 脚本会自动完成什么

| 步骤 | 说明 | 详情 |
|------|------|------|
| 1 | 检测/安装 Node.js | macOS 用 brew，Linux 用 NodeSource/nvm，Windows 用 winget/msi |
| 2 | 安装 dws CLI | 优先用官方安装脚本，失败则 npm 全局安装 |
| 3 | 获取项目代码 | git clone **safe-mode** 分支（有 git 时）或 zip 下载解压 |
| 4 | 安装依赖 | `npm install` |
| 5 | 引导钉钉登录 | 交互式设备流授权 (`dws auth login --device`) |

部署完成后输出可直接复制的 MCP Host 配置。

---

## 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | macOS 10.15+ / Linux (Ubuntu 18+, CentOS 7+, Fedora, Arch) / Windows 10+ |
| 网络 | 能访问 GitHub 和 npm registry |
| 钉钉账号 | 任一企业的成员账号 |
| 企业 CLI 权限 | 企业管理员已开通（首次使用时脚本会引导申请） |

> **不需要预装** Node.js、npm、git 或 dws — 脚本会自动检测并安装缺失的依赖。

---

## 安装路径

脚本默认将项目安装到：
- **macOS/Linux**: `~/quick-dingtalk-mcp`
- **Windows**: `%USERPROFILE%\quick-dingtalk-mcp`

程序入口：`src/index.mjs`

如需自定义路径，可修改脚本顶部的 `INSTALL_DIR` 变量。

---

## 自定义 Fork 地址

脚本顶部有独立的配置区域，方便适配不同 fork：

```bash
# setup.sh
GITHUB_OWNER="EMP-WGJJ"
GITHUB_REPO="quick-dingtalk-mcp"
BRANCH="safe-mode"
```

```powershell
# setup.ps1
$GITHUB_OWNER = "EMP-WGJJ"
$GITHUB_REPO  = "quick-dingtalk-mcp"
$BRANCH       = "safe-mode"
```

修改这三个变量即可指向任何 fork/分支，脚本中所有 URL 和路径自动跟随变化。

---

## 跨平台编码说明

本项目通过 `.gitattributes` 确保跨平台兼容：

| 文件类型 | 编码 | 换行符 | 原因 |
|----------|------|--------|------|
| `*.sh` | UTF-8 (无 BOM) | LF | Bash 不识别 CRLF 和 BOM |
| `*.ps1` | UTF-8 (BOM) | CRLF | PowerShell 需要 BOM 识别中文 |
| `*.bat` | UTF-8 | CRLF | CMD 需要 CRLF；脚本首行 `chcp 65001` 切换 UTF-8 |
| `*.mjs` / `*.js` | UTF-8 (无 BOM) | LF | Node.js 跨平台通用 |

> 如果在 Windows 上 `git clone` 后直接运行 `setup.sh`（如通过 WSL 或 Git Bash）报错 `\r: command not found`，
> 说明 git 的 `core.autocrlf` 把 LF 转成了 CRLF。解决方案：
> ```bash
> git config core.autocrlf input
> git checkout -- scripts/setup.sh
> ```
> 或直接用 `.gitattributes`（本项目已配置，正常 clone 不会有问题）。

---

## 钉钉登录说明

脚本会启动**设备码登录流程** (Device Flow)：

```
请在浏览器中打开：https://login.dingtalk.com/oauth2/auth/device
然后输入用户码：ABCD-1234
等待授权中...
```

操作步骤：
1. 在手机钉钉 App **扫描终端二维码**（或在浏览器打开链接）
2. 输入终端显示的**用户码**
3. 选择**企业** → 勾选所有权限（特别是 IM 相关）→ 确认授权

### 常见问题

**Q: 提示"企业未开通 CLI 访问"怎么办？**
A: 点击页面上的 "Apply Now"，系统会发审批卡片给你的企业管理员。管理员批准后重新执行 `dws auth login --device`。

**Q: 管理员如何开通？**
A: 登录 [open-dev.dingtalk.com](https://open-dev.dingtalk.com) → 左侧菜单 "CLI 访问管理" → 启用。一次操作，全员永久生效。

**Q: Token 过期了？**
A: 执行 `dws auth login --device --force` 重新授权即可，不用改 MCP 配置。

---

## 部署完成后

脚本执行完毕会打印类似如下配置（路径根据你的系统自动生成）：

```
  Amazon Quick Desktop 配置:
  Settings → Capabilities → MCP → + Add MCP

  Connection type: Local
  ID:   quick-dingtalk-mcp
  Name: quick-dingtalk-mcp

  Command:   /usr/local/bin/node          (Mac/Linux)
  Arguments: ~/quick-dingtalk-mcp/src/index.mjs

  Command:   C:\Program Files\nodejs\node.exe     (Windows)
  Arguments: C:\Users\你\quick-dingtalk-mcp\src\index.mjs
```

将 Command 和 Arguments 复制到你的 MCP Host 中即可使用。

---

## 卸载

```bash
# 1. 在 MCP Host 中移除 quick-dingtalk-mcp
# 2. 退出钉钉登录
dws auth logout
# 3. 删除项目目录
rm -rf ~/quick-dingtalk-mcp        # macOS/Linux
# 或 Windows PowerShell: Remove-Item -Recurse ~\quick-dingtalk-mcp
# 4. (可选) 卸载 dws
npm uninstall -g dingtalk-workspace-cli
```

---

## 问题反馈

如果部署遇到问题，请在 [GitHub Issues](https://github.com/EMP-WGJJ/quick-dingtalk-mcp/issues) 提交，附上：
- 操作系统版本
- 脚本报错截图
- `node --version` 和 `dws --version` 的输出
