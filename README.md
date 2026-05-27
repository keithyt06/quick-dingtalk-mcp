# quick-dingtalk-mcp

> **v0.2 升级提示（v0.1 用户必读）**：项目布局已改为 monorepo（`packages/local/server.mjs`）。v0.1 单文件 `server.mjs` 已不在仓库根。MCP host 配置里把 `args` 改成 `<repo>/packages/local/server.mjs`，或改用 `npx -y quick-dingtalk-mcp`。详见 [packages/local/docs/setup.md](./packages/local/docs/setup.md#v01--v02-迁移v01-用户必读)。

> **Talk to DingTalk as yourself, from any MCP host.**
> A lightweight MCP server that wraps the official DingTalk CLI (`dws`), letting Amazon Q Developer / Claude Desktop / Cursor / Continue send and read DingTalk messages with **your real user identity** — not as a bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Status](https://img.shields.io/badge/status-v0.2.0-blue)](#status)

[中文](#中文) · [English](#english)

---

## English

### Why this exists

DingTalk's official MCP server ([`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp)) only supports **bot-identity** messaging — the message shows up in groups as a bot, not as you. For most personal-assistant use cases (an LLM acting on your behalf), this is the wrong fit.

This project takes the opposite path: it wraps DingTalk's official CLI [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli), which supports **user-identity** OAuth flows. The result: when you tell your AI host "post 'meeting moved to 3pm' in the project group", the message lands in the group authored by **you** — same avatar, same name as if you typed it.

### Architecture

```
                   Local (v0.2 ready)                       Remote (v0.2 Plan 2 — coming)
MCP host ──stdio──→ packages/local/server.mjs              Quick Desktop ──HTTPS──→ AWS AgentCore + Lambda
                       │                                              │
                       │ uses → packages/shared/{catalog,             │ uses same packages/shared
                       │   dispatcher, errors, search}                │
                       ▼                                              ▼
                    dws CLI ──HTTPS──→ DingTalk             container running dws (per-user DWS_CONFIG_DIR)
                                                                       │
                                                                       ▼
                                                              DingTalk
```

Under the hood, `dws` is itself a thin client to DingTalk's MCP gateway (`mcp-gw.dingtalk.com`) — which means DingTalk's server side is *already* MCP-native. This project exposes that capability over local stdio (Local) and over a managed Bedrock AgentCore runtime with per-user OAuth (Remote, Plan 2).

### Quick start

```bash
# 1. Install DingTalk's official CLI
npm install -g dingtalk-workspace-cli

# 2. Clone & install
git clone https://github.com/keithyt06/quick-dingtalk-mcp.git
cd quick-dingtalk-mcp
npm install

# 3. Login to DingTalk (device flow, works in any environment)
dws auth login --device

# 4. Wire it into your MCP host (see Configuration below)
```

Full step-by-step guide → [packages/local/docs/setup.md](./packages/local/docs/setup.md)
Sanity-check the user-identity claim → [packages/local/docs/verification.md](./packages/local/docs/verification.md)

### Tools (38)

| Bucket | Count | Examples | Notes |
|---|---|---|---|
| **Tier1** | 30 | `dingtalk_chat_message_send`, `_list`, `_search`, `_recall`, `_reply`, `_list_mentions`, `_forward`; `dingtalk_contact_user_search`, `_get_self`, `_get`, `_dept_search`; `dingtalk_chat_search`, `_chat_group_create`, `_chat_group_members_list`; `dingtalk_calendar_event_create`, `_list`, `_update`, `_participant_list`; `dingtalk_doc_create`, `_read`, `_search`, `dingtalk_drive_list`; `dingtalk_todo_task_list`, `_create`, `_done`; `dingtalk_ding_message_send`, `_recall` | hand-picked, exposed by name |
| **v0.1 aliases** | 6 | `dingtalk_send_message` → `dingtalk_chat_message_send` etc. | `[deprecated, use <new>]` in description; will drop in v0.3 |
| **Discovery** | 2 | `dingtalk_discover` (keyword search the full catalog) + `dingtalk_invoke` (run anything from catalog) | covers all 261 dws v1.0.32 commands |

DingTalk requires every message to have a **title** (unlike Feishu). The catalog enforces this in `inputSchema.required`.

### Configuration

#### Amazon Q Developer (Quick Desktop)

`Settings → Capabilities → MCP → + Add MCP`:

| Field | Value |
|---|---|
| Connection type | Local |
| ID | `quick-dingtalk-mcp` |
| Name | `quick-dingtalk-mcp` |
| Command | `node` (or absolute path from `which node`) |
| Arguments | `<absolute path>/quick-dingtalk-mcp/packages/local/server.mjs` |

#### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "quick-dingtalk-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/quick-dingtalk-mcp/packages/local/server.mjs"]
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

**v0.2-pre — under active migration to monorepo + remote.**

- ✅ **Local v0.2 (this release)**: monorepo refactor done; 38 tools (30 tier1 + 6 aliases + discover/invoke); shared catalog covers all 261 dws v1.0.32 commands; smoke test passes; v0.1 user-identity verification still holds.
- 🚧 **Remote v0.2 (next, Plan 2)**: AWS Bedrock AgentCore + per-user OAuth, multi-user shared deployment. PoC for dws token injection in progress (see `docs/superpowers/notes/2026-05-27-poc-token-injection.md`).
- 📅 **Production hardening (Plan 3)**: observability dashboard + 10 alarms + WAF + comprehensive docs.

Roadmap, in priority order:
1. Plan 2: Remote stack (container + 3 Lambdas + 3 CDK stacks + scripts)
2. Plan 3: Production hardening
3. v0.3: drop v0.1 aliases; image / file / interactive card support

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

```bash
# 1. 装钉钉官方 CLI
npm install -g dingtalk-workspace-cli

# 2. clone 本项目 + 装依赖
git clone https://github.com/keithyt06/quick-dingtalk-mcp.git
cd quick-dingtalk-mcp
npm install

# 3. 登录钉钉（设备流，任何环境都能用）
dws auth login --device

# 4. 跑冒烟测试（不调真实 API）
npm run smoke

# 5. 在 MCP Host 里配置 → 见 packages/local/docs/setup.md
```

完整配置流程 → [packages/local/docs/setup.md](./packages/local/docs/setup.md)
"用户态在群里到底显示啥" 5 分钟人工验证 → [packages/local/docs/verification.md](./packages/local/docs/verification.md)

### 暴露的 38 个工具

| 类别 | 数量 | 示例 | 备注 |
|---|---|---|---|
| **Tier1** | 30 | `dingtalk_chat_message_send` / `_list` / `_search` / `_recall`、`dingtalk_contact_user_search`、`dingtalk_calendar_event_create`、`dingtalk_doc_create`、`dingtalk_todo_task_create`、`dingtalk_ding_message_send` | 手挑常用,按工具名直接暴露 |
| **v0.1 alias** | 6 | `dingtalk_send_message` → `dingtalk_chat_message_send` 等 | 描述带 `[deprecated, use ...]` 前缀,v0.3 删除 |
| **兜底** | 2 | `dingtalk_discover`(关键词搜全部 catalog) + `dingtalk_invoke`(执行任意 catalog 命令) | 覆盖 dws v1.0.32 全部 261 个命令 |

> 钉钉强制每条消息有 **title**（飞书没这要求）—— catalog 已在 inputSchema 里把 `title` 设为必填。

### 致谢

- 钉钉团队 [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — 干了所有脏活，本项目只是个适配层
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — MCP TypeScript SDK
- 命名灵感来自飞书侧的 `lark-cli-mcp` 项目

### 开源协议

[MIT](./LICENSE) © 2026 Keith Yu
