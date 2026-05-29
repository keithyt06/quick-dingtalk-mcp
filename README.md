# quick-dingtalk-mcp

> **Talk to DingTalk as yourself, from any MCP host.**
> A lightweight MCP server that wraps the official DingTalk CLI (`dws`), letting Amazon Q Developer / Claude Desktop / Cursor / Continue send and read DingTalk messages with **your real user identity** — not as a bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Status](https://img.shields.io/badge/status-v0.1-orange)](#status)

[中文](#中文) · [English](#english)

---

## English

### Why this exists

DingTalk's official MCP server ([`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp)) only supports **bot-identity** messaging — the message shows up in groups as a bot, not as you. For most personal-assistant use cases (an LLM acting on your behalf), this is the wrong fit.

This project takes the opposite path: it wraps DingTalk's official CLI [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli), which supports **user-identity** OAuth flows. The result: when you tell your AI host "post 'meeting moved to 3pm' in the project group", the message lands in the group authored by **you** — same avatar, same name as if you typed it.

### Architecture

```
You speak              Your MCP host                    quick-dingtalk-mcp                  dws CLI                  DingTalk
  │  natural               │  MCP stdio                     │                                 │                        │
  │  language              │  (JSON-RPC 2.0)                │  child_process                  │  HTTPS + OAuth         │
  ▼                        ▼                                ▼                                 ▼                        ▼
"在 X 群发消息" ──→ Q Desktop / Claude / Cursor ──→ node server.mjs ──exec──→ dws chat message send ──→ mcp-gw.dingtalk.com
```

Under the hood, `dws` is itself a thin client to DingTalk's MCP gateway (`mcp-gw.dingtalk.com`) — which means DingTalk's server side is *already* MCP-native. This project just exposes that capability over local stdio for any MCP host.

### Quick start

**🚀 One-line install (recommended):**

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.ps1 | iex
```

This auto-installs Node.js, dws CLI, clones the project (safe-mode branch), and guides you through DingTalk login. See [INSTALL.md](./INSTALL.md) for details.

**Manual install:**

```bash
# 1. Install DingTalk's official CLI
npm install -g dingtalk-workspace-cli

# 2. Clone & install (safe-mode branch)
git clone -b safe-mode https://github.com/EMP-WGJJ/quick-dingtalk-mcp.git
cd quick-dingtalk-mcp
npm install

# 3. Login to DingTalk (device flow, works in any environment)
dws auth login --device

# 4. Wire it into your MCP host (see Configuration below)
```

Full step-by-step guide → [SETUP.md](./SETUP.md)
Sanity-check the user-identity claim → [VERIFICATION.md](./VERIFICATION.md)

### Tools (6)

| Tool | What it does | Underlying `dws` command |
|---|---|---|
| `dingtalk_send_message` | Send a message to a group / 1:1 chat as yourself | `dws chat message send` |
| `dingtalk_get_messages` | Pull recent messages from a chat | `dws chat message list` |
| `dingtalk_search_messages` | Keyword-search across your chats | `dws chat message search` |
| `dingtalk_list_chats` | Find a group by name | `dws chat search` |
| `dingtalk_search_user` | Find a person by name | `dws contact user search` |
| `dingtalk_get_thread` | Read replies under a topic thread | `dws chat message list-topic-replies` |

DingTalk requires every message to have a **title** (unlike Feishu). The wrapper enforces this in the input schema.

### Configuration

#### Amazon Q Developer (Quick Desktop)

`Settings → Capabilities → MCP → + Add MCP`:

| Field | Value |
|---|---|
| Connection type | Local |
| ID | `quick-dingtalk-mcp` |
| Name | `quick-dingtalk-mcp` |
| Command | `node` (or absolute path from `which node`) |
| Arguments | `<absolute path>/quick-dingtalk-mcp/server.mjs` |

#### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "quick-dingtalk-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/quick-dingtalk-mcp/server.mjs"]
    }
  }
}
```

#### Cursor

`Settings → Cursor Settings → MCP → + Add new MCP server` — same JSON shape as above.

### Comparison with alternatives

| | This project | [`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp) | Custom robot webhook |
|---|---|---|---|
| Message identity | **You** (real user) | Bot | Custom robot |
| Auth | OAuth user_access_token | App credentials | Webhook URL |
| Read history | ✅ | ❌ (limited) | ❌ |
| Search | ✅ | ❌ | ❌ |
| Setup effort | ~5 min | ~5 min | ~1 min |
| Group display | Your avatar + name | Bot avatar + name | Robot name |

If you want a personal-assistant feel where the LLM *is you*, use this. If you want clearly-marked automation, use the bot/webhook routes.

### Status

**v0.1 — works, but young.** Implemented and dry-run-tested:

- ✅ All 6 tools verified to construct correct `dws` invocations (see `scripts/smoke.sh`)
- ✅ User-identity sender verified in real DingTalk app (see [VERIFICATION.md](./VERIFICATION.md))
- ⚠️ No support yet for: image/file attachments, interactive cards, group creation
- ⚠️ DingTalk-only commands (`@-mentions`, unread inbox, DING urgent messages) listed as "next"

Roadmap, in priority order:
1. `dingtalk_send_ding` — DingTalk's flagship "urgent" notification
2. `dingtalk_list_mentions` — fetch messages where you were @-ed
3. `dingtalk_list_unread` — your unread inbox
4. Schema-driven mode — auto-expose all 159 `dws` commands as MCP tools

### Acknowledgments

- [`@DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — does all the heavy lifting; this project is a thin shim
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — TypeScript MCP SDK
- Inspired by the `lark-cli-mcp` pattern for Feishu

### License

[MIT](./LICENSE) © 2026 Keith Yu

---

## 中文

### 这是什么

把钉钉官方 CLI（[`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)）包成一个 MCP Server，让 Amazon Q Developer / Claude Desktop / Cursor / Continue 这些 MCP 客户端能**以你本人身份**操作钉钉消息——发出去的消息在群里显示是你，不是机器人。

### 为什么不用钉钉官方 MCP

钉钉官方的 [`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp) 只支持**机器人身份**。如果你想让 AI 替你 in-place 操作钉钉（比如 LLM 看你的工作群、替你发周报），机器人身份会显得很别扭——同事看到的是一个 Bot 在你的群里讲话，不是你。

本项目用相反的路线：包装支持 OAuth **用户态**的 `dws`。结果是当你跟 AI 助手说"在 X 群发消息：明天会议改到 3 点"，消息出现在群里时**头像和昵称就是你本人**，跟你手动打字没区别。

### 5 步上手

**🚀 一键部署（推荐）:**

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/EMP-WGJJ/quick-dingtalk-mcp/safe-mode/scripts/setup.ps1 | iex

# Windows 双击: 下载 zip 后双击 scripts\setup.bat
```

自动安装 Node.js、dws、项目依赖并引导登录（默认 safe-mode 分支）。详见 [INSTALL.md](./INSTALL.md)。

**手动安装：**

```bash
# 1. 装钉钉官方 CLI
npm install -g dingtalk-workspace-cli

# 2. clone 本项目 + 装依赖 (safe-mode 分支)
git clone -b safe-mode https://github.com/EMP-WGJJ/quick-dingtalk-mcp.git
cd quick-dingtalk-mcp
npm install

# 3. 登录钉钉（设备流，任何环境都能用）
dws auth login --device

# 4. 跑冒烟测试（不调真实 API）
bash scripts/smoke.sh

# 5. 在 MCP Host 里配置 → 见 SETUP.md
```

完整配置流程 → [SETUP.md](./SETUP.md)
"用户态在群里到底显示啥" 5 分钟人工验证 → [VERIFICATION.md](./VERIFICATION.md)

### 暴露的 6 个工具

| 工具 | 功能 | 底层命令 |
|---|---|---|
| `dingtalk_send_message` | 以本人身份发消息到群/私聊 | `dws chat message send` |
| `dingtalk_get_messages` | 拉取消息历史 | `dws chat message list` |
| `dingtalk_search_messages` | 跨会话关键词搜消息 | `dws chat message search` |
| `dingtalk_list_chats` | 按名搜索群聊 | `dws chat search` |
| `dingtalk_search_user` | 按姓名搜人 | `dws contact user search` |
| `dingtalk_get_thread` | 查看话题（thread）回复列表 | `dws chat message list-topic-replies` |

> 钉钉强制每条消息有 **title**（飞书没这要求）—— 这是本 wrapper 与飞书侧 lark-cli-mcp 最显著的差异，已在 inputSchema 里设为必填。

### 致谢

- 钉钉团队 [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — 干了所有脏活，本项目只是个适配层
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — MCP TypeScript SDK
- 命名灵感来自飞书侧的 `lark-cli-mcp` 项目

### 开源协议

[MIT](./LICENSE) © 2026 Keith Yu
