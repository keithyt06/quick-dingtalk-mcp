# quick-dingtalk-mcp

> **v0.2 升级提示（v0.1 用户必读）**：项目布局已改为 monorepo（`packages/local/server.mjs`）。v0.1 单文件 `server.mjs` 已不在仓库根。MCP host 配置里把 `args` 改成 `<repo>/packages/local/server.mjs`，或改用 `npx -y quick-dingtalk-mcp`。详见 [packages/local/docs/setup.md](./packages/local/docs/setup.md#v01--v02-迁移v01-用户必读)。

> **Talk to DingTalk as yourself, from any MCP host.**
> A lightweight MCP server that wraps the official DingTalk CLI (`dws`), letting Amazon Q Developer / Claude Desktop / Cursor / Continue send and read DingTalk messages with **your real user identity** — not as a bot.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Status](https://img.shields.io/badge/status-v0.2.0-blue)](#status)

[English](#english) · [中文](./README_CN.md)

---

## English

### Why this exists

DingTalk's official MCP server ([`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp)) only supports **bot-identity** messaging — the message shows up in groups as a bot, not as you. For most personal-assistant use cases (an LLM acting on your behalf), this is the wrong fit.

This project takes the opposite path: it wraps DingTalk's official CLI [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli), which supports **user-identity** OAuth flows. The result: when you tell your AI host "post 'meeting moved to 3pm' in the project group", the message lands in the group authored by **you** — same avatar, same name as if you typed it.

### Architecture

```
                   Local (v0.2 ready)                       Remote (v0.2 — e2e verified)
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

Under the hood, `dws` is itself a thin client to DingTalk's MCP gateway (`mcp-gw.dingtalk.com`) — which means DingTalk's server side is *already* MCP-native. This project exposes that capability over local stdio (Local) and over a managed Bedrock AgentCore runtime with per-user OAuth (Remote).

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

## Remote (v0.2 — end-to-end verified)

Multi-user shared deployment to AWS Bedrock AgentCore. **One deploy serves any number of
employees; onboarding a new user is self-service with zero code changes and no redeploy.**
One-liner deploy:

```bash
curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
~/.quick-dingtalk-mcp/packages/remote/scripts/deploy.sh
```

After deploy, `deploy.sh` prints:
- First-time authorize URL (send to teammates to open in browser)
- Quick Desktop MCP endpoint (paste into Quick Desktop config)

Detailed docs:
- [Quick Desktop integration](./docs/remote-quick-desktop.md)
- [Security model](./docs/remote-security.md)
- [Observability](./docs/remote-observability.md)
- [Operations runbook](./docs/remote-operations.md)
- [FAQ](./docs/remote-faq.md)
- [Cost estimates](./docs/remote-cost.md)

### Status

**v0.2 — Local + Remote both shipped; Remote verified end-to-end with a real DingTalk account.**

- ✅ **Local v0.2**: monorepo refactor done; 38 tools (30 tier1 + 6 aliases + discover/invoke); shared catalog covers all 261 dws v1.0.32 commands; smoke test passes; v0.1 user-identity verification still holds.
- ✅ **Remote v0.2 — end-to-end verified (2026-06-01)**: a real DingTalk account completed `/authorize` → consent → `/callback` → MCP token → Quick Desktop (streamable-http) connected → `dingtalk_contact_user_get_self` returned the user's own identity through the full chain. Token injection is `dws auth login --token` (D2, verified, not a stub); the EventBridge auto-refresh path is verified working.
  - Real issues found & fixed during the live bring-up (all folded back into the repo so the next `deploy.sh` works first try):
    1. AgentCore's HTTP contract requires the container to listen on **8080** (not 8000) → 502 otherwise;
    2. `requestHeaderConfiguration.requestHeaderAllowlist` must explicitly allow the custom identity headers, or the container never sees them (401);
    3. the mcp-middleware → AgentCore **SigV4** signature must not fold the query string into the path (else 403 SignatureDoesNotMatch);
    4. `secretsmanager:ListSecrets` must be granted on `Resource:*` (account-level action) or auto-refresh is denied and tokens expire (503);
    5. server.js now satisfies the MCP Streamable HTTP handshake (`Mcp-Session-Id` header + protocol-version negotiation + 202 for notifications), else clients stay "Configured" but never Connected;
    6. SSM params are recreated as SecureString (CloudFormation can only seed String placeholders);
    7. the CDK app is pre-bundled to CJS (`infra/bin/app.bundle.cjs`) to sidestep the native strip-types loader's incompatibility with aws-cdk-lib's CommonJS named exports.
  - Multi-user: one deploy serves any number of employees via self-service authorize; new users add zero code and no redeploy. See the [Quick Desktop onboarding guide](./docs/remote-quick-desktop.md).
- 📅 **Remaining**: backfill scope-map strings, observability dashboard tuning, multi-region, custom domain.

Roadmap, in priority order:
1. ~~Plan 2: Remote stack~~ ✅
2. ~~Plan 3: end-to-end bring-up~~ ✅ (remaining: scope-map backfill, multi-region)
3. v0.3: drop v0.1 aliases; image / file / interactive card support

### Acknowledgments

- [`@DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — does all the heavy lifting; this project is a thin shim
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — TypeScript MCP SDK
- Inspired by the `lark-cli-mcp` pattern for Feishu

### License

[MIT](./LICENSE) © 2026 Keith Yu

---

> 中文文档见 [README_CN.md](./README_CN.md)。
