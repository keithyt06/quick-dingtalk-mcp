# SETUP — 从零到能用的完整配置指南

## v0.1 → v0.2 迁移（v0.1 用户必读）

v0.2 把项目改成 monorepo，`server.mjs` 从仓库根挪到 `packages/local/server.mjs`。MCP host 配置里的 `args` 路径必须更新：

| | 老 | 新 |
|---|---|---|
| Args | `/path/to/quick-dingtalk-mcp/packages/local/server.mjs` | `/path/to/quick-dingtalk-mcp/packages/local/server.mjs` |

或者直接用 npx（无需 clone）：

```json
{ "command": "npx", "args": ["-y", "quick-dingtalk-mcp"] }
```

旧 6 个工具名（`dingtalk_send_message` 等）作为 alias 保留至 v0.3，工具描述会标 `[deprecated, use ...]`。新 prompt 请直接用 `dingtalk_chat_message_send` 等 catalog 名。

---

本文档手把手带你把 `quick-dingtalk-mcp` 装好、登录钉钉、接到 MCP Host（Amazon Quick Desktop / Claude Desktop / Cursor），最终能用自然语言操作钉钉消息。

预计耗时：**约 15 分钟**（含等管理员审批 CLI 访问的可选步骤）。

> 项目本身是什么 → 见 [README.md](./README.md)
> 用户态发送是否真的"以本人身份"显示 → 见 [VERIFICATION.md](./VERIFICATION.md)

---

## 概览

```
你说的话                              你的 MCP Host                          quick-dingtalk-mcp                       dws CLI                       钉钉
"在 X 群发消息"  ──→  Quick / Claude / Cursor  ──MCP stdio──→  node packages/local/server.mjs  ──exec──→  dws chat ...  ──HTTPS──→  mcp-gw.dingtalk.com
```

`dws` 是钉钉官方的 CLI（[`DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)，1.8k stars，Apache-2.0），它内部已经把所有钉钉 OpenAPI 包成 MCP 工具发给钉钉的 MCP 网关。本项目（`server.mjs`）只是个轻量适配层，把 dws 暴露给本地 stdio MCP Host。

---

## 前置条件

| 项 | 要求 | 验证 |
|---|---|---|
| Node.js | v18 以上 | `node --version` |
| 操作系统 | macOS / Linux / Windows | — |
| 钉钉账号 | 任一企业的成员账号 | — |
| 企业 CLI 访问权限 | 已开通 | 见 [Step 3](#step-3-登录钉钉) 处理 |

> 如果你是企业管理员、还没开通过 CLI 访问：登录 [open-dev.dingtalk.com](https://open-dev.dingtalk.com) → 左侧菜单 "**CLI 访问管理**" → **启用**。一次开通，全员永久生效。普通成员遇到未开通时，登录页会引导一键申请，管理员审批后即可使用。

---

## Step 1：安装钉钉 CLI (dws)

**macOS / Linux（推荐 npm，需要 Node.js）**：
```bash
npm install -g dingtalk-workspace-cli
```

**Windows（PowerShell）**：
```powershell
irm https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.ps1 | iex
```

**macOS / Linux 也可用 curl**：
```bash
curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh
```

**验证安装：**
```bash
dws --version
# 期望: dws version v1.0.x (...)
```

❌ 如果 `command not found`：
- npm 装的话检查 `npm bin -g` 输出的目录是否在 `$PATH` 里
- macOS Apple Silicon 注意 brew 路径是 `/opt/homebrew/bin`，Intel 是 `/usr/local/bin`

---

## Step 2：安装项目依赖

进入 quick-dingtalk-mcp 项目目录（你解压 zip 的位置），跑：

```bash
cd ~/Downloads/quick-dingtalk-mcp     # 替换成你实际的解压路径
npm install
```

期望输出末尾包含：
```
added 92 packages, ...
0 vulnerabilities
```

---

## Step 3：登录钉钉

**首选用设备流（headless / SSH / 容器都能跑）**：
```bash
dws auth login --device
```

终端会显示类似：
```
请在浏览器中打开：https://login.dingtalk.com/oauth2/auth/device
然后输入用户码：ABCD-1234
等待授权中...
```

操作步骤：
1. 用钉钉 App **扫描终端给的二维码**（或在浏览器打开短链）
2. 输入 `user_code`
3. **选择企业** → 授权所有需要的 scope（特别是 IM 相关）

**验证登录成功：**
```bash
dws auth status -f json
```
期望：
```json
{"success": true, "authenticated": true, "userInfo": {...}}
```

### 企业未开通 CLI 访问？

授权页会显示 **"Apply Now"** 按钮，点击后系统会发审批卡片给你企业的钉钉管理员。管理员审批后（通常几分钟），你重跑 `dws auth login --device` 即可。

如果你就是管理员、需要操作指南：
1. 用钉钉账号登录 [open-dev.dingtalk.com](https://open-dev.dingtalk.com)
2. 左侧菜单 → "CLI 访问管理"
3. 切换到"启用"

一次操作，全员永久生效。

---

## Step 4：冒烟测试（不调真实 API）

```bash
npm run smoke
```

期望输出：7 段 dry-run 结果（覆盖 v0.1 的 6 个语义 + 1 个 single-chat 变体），每段打印一段 JSON 含 `"canonical_path"` 字段。只要每段 canonical_path 都能正常显示（即使 chat search 返回空结果或 not_authenticated 都没关系），就说明 wrapper 构造的 dws 命令是正确的。

> v0.2 实际暴露 **38 个工具**（30 tier1 + 6 v0.1 alias + `dingtalk_discover` / `dingtalk_invoke`），smoke 只针对 v0.1 alias 做最小冒烟。完整列表见 `tools/list` 输出或 README。

---

## Step 5：用户态验证（**关键，必做一次**）

> 决定整个方案是否成立的一步。详情见 [VERIFICATION.md](./VERIFICATION.md)。

精简版三条命令：

```bash
# 1) 拿自己的 userId
dws contact user get-self -f json --jq '.result[0].orgEmployeeModel | {name: .orgUserName, userId}'

# 2) 给自己发一条测试消息（替换 <YOUR_USERID>）
dws chat message send --user <YOUR_USERID> --title "user-mode test" --text "verify sender identity" -y
```

然后**打开钉钉 App** 看那条消息的发送者显示：
- ✅ **A. 你本人头像 + 昵称** → 方案完美成立
- ⚠️ **B. 本人但底部有"由 XX 应用发送"** → 方案能用，呈现层有 App 标记
- ❌ **C. 显示是机器人/某 App** → 方案降级；考虑改用 `send-by-bot` 模式

---

## Step 6：接入 MCP Host

下面三种 MCP Host 选一个（或多个都接）。

### 6a. Amazon Quick Desktop（重点）

#### 6a.1 拿绝对路径

```bash
# 进项目目录
cd ~/Downloads/quick-dingtalk-mcp     # 替换成你实际路径

# 拿 server.mjs 绝对路径
echo "$(pwd)/packages/local/server.mjs"
# 例如：/Users/keithyu/Downloads/quick-dingtalk-mcp/packages/local/server.mjs

# 拿 node 绝对路径（Quick Desktop 启动的子进程 PATH 不一定全，用绝对路径最稳）
which node
# 例如：/usr/local/bin/node 或 /opt/homebrew/bin/node 或 ~/.nvm/versions/node/v22.x.x/bin/node
```

记下这两个路径。**路径不能含空格**（Quick Desktop 按空格切参数）；如果含，把项目移到无空格路径再来。

#### 6a.2 在 Quick Desktop 添加

打开 **Amazon Quick Desktop** → **Settings → Capabilities → MCP → + Add MCP**，按下表填：

| 字段 | 值 |
|---|---|
| Connection type | **Local** |
| ID | `quick-dingtalk-mcp` |
| Name | `quick-dingtalk-mcp` |
| Command | 第一步的 `which node` 输出 |
| Arguments | 第一步的 `server.mjs` 绝对路径 |

点 **Save**。

#### 6a.3 验证连接

保存后应该看到：
```
quick-dingtalk-mcp · 38 tools · Connected ✅
```

如果显示 0 tools 或 Disconnected：见下面[故障排查](#故障排查)。

---

### 6b. Claude Desktop（可选）

编辑配置文件：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

加入：
```json
{
  "mcpServers": {
    "quick-dingtalk-mcp": {
      "command": "/usr/local/bin/node",
      "args": ["/Users/keithyu/Downloads/quick-dingtalk-mcp/packages/local/server.mjs"]
    }
  }
}
```

> 把 `command` 和 `args` 路径替换成你实际的绝对路径。

完全退出 Claude Desktop（**Cmd+Q**，不是关窗口）后重启。底部输入框右下角 🔌 图标应该显示 1 个新连接。

---

### 6c. Cursor（可选）

`Settings → Cursor Settings → MCP → + Add new MCP server`：
```json
{
  "quick-dingtalk-mcp": {
    "command": "node",
    "args": ["/Users/keithyu/Downloads/quick-dingtalk-mcp/packages/local/server.mjs"]
  }
}
```

---

## Step 7：实际使用

在 MCP Host 里直接说自然语言：

| 你说 | 调用的工具 | 备注 |
|---|---|---|
| "帮我找一下叫张三的同事" | `dingtalk_search_user` | 返回 userId |
| "搜一下叫'AWS项目组'的群" | `dingtalk_list_chats` | 返回 openConversationId |
| "看看 AWS项目组 群最近聊了什么" | `dingtalk_list_chats` → `dingtalk_get_messages` | 自动两步 |
| "在 AWS项目组 群发：明天会议改到 3 点" | `dingtalk_send_message` | LLM 会自动给 title 一个默认值 |
| "在 AWS项目组 群里搜一下'报价'" | `dingtalk_search_messages` | 关键词搜 |
| "看看刚那条消息底下的回复" | `dingtalk_get_thread` | 需要 chat_id + topic_id |

⚠️ **首次让 MCP Host 发群消息时，先发到一个测试群**（自己创的"测试用"群），不要直接发工作群——避免 LLM 对群名/语义判断有偏差导致误发。

---

## 维护

### Token 过期了

dws 会自动 refresh，但 refresh token 也有最长有效期（通常 30-90 天，企业策略而异）。过期后 MCP Host 会报 `unauthenticated`：

```bash
dws auth login --device --force
```

不需要改 MCP Host 配置，重新授权后立刻生效。

### 升级 dws

```bash
dws upgrade        # 交互式升级到最新版
dws upgrade --check    # 只检查不升级
dws upgrade --rollback # 回滚到上一版本
```

### 升级 wrapper

如果是从 git 同步的：
```bash
cd ~/Downloads/quick-dingtalk-mcp
git pull
npm install
```

如果是 zip 解压的：直接覆盖文件再 `npm install`。

---

## 故障排查

### Quick Desktop 显示 0 tools / Disconnected

**第一步：在终端手动跑 server.mjs：**
```bash
cd ~/Downloads/quick-dingtalk-mcp
node packages/local/server.mjs
```

**正确的状态**：没输出，光标停住（在等 MCP 客户端从 stdin 发请求）。Ctrl+C 退出即可。

如果有报错：

| 错误片段 | 原因 | 处理 |
|---|---|---|
| `Cannot find module '@modelcontextprotocol/sdk'` | 没装依赖 | `npm install` |
| `Cannot find module ...` 其他 | 部分依赖损坏 | `rm -rf node_modules && npm install` |
| `command not found: node` | Node 未装或 PATH 问题 | 用 `nvm install 20` 装新的；Quick Desktop 配置里用 node 绝对路径 |

### 调用工具返回 `unauthenticated`

```bash
dws auth status -f json
```

如果 `authenticated: false`，重新登录：
```bash
dws auth login --device --force
```

### 调用返回 `permission denied` / `missing scope`

登录时没勾对应 scope。强制重登并仔细看授权页：
```bash
dws auth login --device --force
```

### 单聊发不出去 / `invalid receiverUserId`

`userId` 写错了。重新拿：
```bash
dws contact user get-self -f json | head -50
# 找 "userId" 字段
```

### 群聊发不出去 / `chat not found`

`chat_id` 错了，或你不在那个群。先搜群：
```bash
dws chat search --query "群名关键字"
```
返回里的 `openConversationId` 才是正确的 chat_id（cid... 或 oc... 开头）。

### Quick Desktop 启动子进程立刻断开

99% 是路径含空格。把项目移到无空格路径：
```bash
mv ~/Downloads/quick-dingtalk-mcp ~/quick-dingtalk-mcp
```
然后回 Quick Desktop 改 Arguments 里的路径。

---

## 卸载

```bash
# 1) 在 MCP Host 里 Remove 这个 MCP
# Amazon Quick Desktop: Settings → Capabilities → MCP → 三个点 → Remove

# 2) 退出钉钉登录
dws auth logout

# 3) 卸载 dws (可选)
npm uninstall -g dingtalk-workspace-cli

# 4) 删除 wrapper 项目目录
rm -rf ~/Downloads/quick-dingtalk-mcp
```

---

## 参考

- [README.md](./README.md) — 项目概览、架构、工具列表
- [VERIFICATION.md](./VERIFICATION.md) — 5 分钟用户态验证
- [dws GitHub](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — 钉钉官方 CLI
- [钉钉开放平台](https://open.dingtalk.com)
- [MCP 协议](https://modelcontextprotocol.io)
