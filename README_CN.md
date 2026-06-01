# quick-dingtalk-mcp（中文）

> **v0.2 升级提示（v0.1 用户必读）**：项目布局已改为 monorepo（`packages/local/server.mjs`）。v0.1 单文件 `server.mjs` 已不在仓库根。MCP host 配置里把 `args` 改成 `<repo>/packages/local/server.mjs`，或改用 `npx -y quick-dingtalk-mcp`。详见 [packages/local/docs/setup.md](./packages/local/docs/setup.md#v01--v02-迁移v01-用户必读)。

> **以你本人身份，在任意 MCP 客户端里操作钉钉。**
> 一个轻量 MCP Server，包装钉钉官方 CLI（`dws`），让 Amazon Q Developer / Claude Desktop / Cursor / Continue 能**以你的真实用户身份**收发钉钉消息——不是机器人。

[English](./README.md) · 中文

---

## 这是什么

把钉钉官方 CLI（[`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)）包成一个 MCP Server，让 Amazon Q Developer / Claude Desktop / Cursor / Continue 这些 MCP 客户端能**以你本人身份**操作钉钉消息——发出去的消息在群里显示是你，不是机器人。

## 为什么不用钉钉官方 MCP

钉钉官方的 [`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp) 只支持**机器人身份**。如果你想让 AI 替你 in-place 操作钉钉（比如 LLM 看你的工作群、替你发周报），机器人身份会显得很别扭——同事看到的是一个 Bot 在你的群里讲话，不是你。

本项目用相反的路线：包装支持 OAuth **用户态**的 `dws`。结果是当你跟 AI 助手说"在 X 群发消息：明天会议改到 3 点"，消息出现在群里时**头像和昵称就是你本人**，跟你手动打字没区别。

## 架构

```
                   Local（v0.2 可用）                      Remote（v0.2 已端到端打通）
MCP host ──stdio──→ packages/local/server.mjs             Quick Desktop ──HTTPS──→ AWS AgentCore + Lambda
                       │                                              │
                       │ 用 → packages/shared/{catalog,               │ 用同一份 packages/shared
                       │   dispatcher, errors, search}                │
                       ▼                                              ▼
                    dws CLI ──HTTPS──→ 钉钉              容器内运行 dws（每用户独立 DWS_CONFIG_DIR）
                                                                       │
                                                                       ▼
                                                                     钉钉
```

底层上 `dws` 本身就是钉钉 MCP 网关（`mcp-gw.dingtalk.com`）的瘦客户端——也就是说钉钉服务端**本就是 MCP-native** 的。本项目把这个能力通过本地 stdio（Local）和托管的 Bedrock AgentCore 运行时 + 每用户 OAuth（Remote）暴露出来。

## 5 步上手（Local 单用户）

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

## 暴露的 38 个工具

| 类别 | 数量 | 示例 | 备注 |
|---|---|---|---|
| **Tier1** | 30 | `dingtalk_chat_message_send` / `_list` / `_search` / `_recall`、`dingtalk_contact_user_search`、`dingtalk_calendar_event_create`、`dingtalk_doc_create`、`dingtalk_todo_task_create`、`dingtalk_ding_message_send` | 手挑常用，按工具名直接暴露 |
| **v0.1 alias** | 6 | `dingtalk_send_message` → `dingtalk_chat_message_send` 等 | 描述带 `[deprecated, use ...]` 前缀，v0.3 删除 |
| **兜底** | 2 | `dingtalk_discover`（关键词搜全部 catalog）+ `dingtalk_invoke`（执行任意 catalog 命令） | 覆盖 dws v1.0.32 全部 261 个命令 |

> 钉钉强制每条消息有 **title**（飞书没这要求）—— catalog 已在 inputSchema 里把 `title` 设为必填。

## 本地客户端配置

### Amazon Q Developer (Quick Desktop)

`Settings → Capabilities → MCP → + Add MCP`：

| 字段 | 值 |
|---|---|
| Connection type | Local |
| ID | `quick-dingtalk-mcp` |
| Name | `quick-dingtalk-mcp` |
| Command | `node`（或 `which node` 给出的绝对路径） |
| Arguments | `<绝对路径>/quick-dingtalk-mcp/packages/local/server.mjs` |

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）：

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

### Cursor

`Settings → Cursor Settings → MCP → + Add new MCP server` —— JSON 结构同上。

## 与其它方案对比

| | 本项目 | [`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp) | 自定义机器人 webhook |
|---|---|---|---|
| 消息身份 | **你**（真实用户） | 机器人 | 自定义机器人 |
| 认证 | OAuth user_access_token | 应用凭证 | Webhook URL |
| 读历史 | ✅ | ❌（受限） | ❌ |
| 搜索 | ✅ | ❌ | ❌ |
| 上手成本 | ~5 分钟 | ~5 分钟 | ~1 分钟 |
| 群内显示 | 你的头像+昵称 | 机器人头像+名 | 机器人名 |

想要 LLM "就是你"的个人助理体验，用本项目；想要清晰标记的自动化，用机器人/webhook 路线。

## Remote（v0.2 — 多用户共享部署，已端到端打通）

部署到 AWS Bedrock AgentCore 的多用户共享版本。**一次部署支持任意多个员工自助接入，新增用户零代码、零重部署。**

一键部署：

```bash
curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
~/.quick-dingtalk-mcp/packages/remote/scripts/deploy.sh
```

部署完 `deploy.sh` 会打印：
- 首次授权 URL（发给团队成员在浏览器打开）
- Quick Desktop MCP 端点（粘进 Quick Desktop 配置）

### 多用户接入模型

```
管理员（一次性）              每个员工（自助 ~2 分钟）
─────────────────            ──────────────────────────
部署 1 套栈        ┐
注册 1 个钉钉应用   ├──→  浏览器打开 AuthorizeUrl
拿 CloudFront 域名  ┘         ↓ 钉钉同意页（用自己的钉钉账号）
                              ↓ 复制返回的 Bearer token
                          粘进自己的 Quick Desktop → 以本人身份操作钉钉
```

每个员工的钉钉 token 按 `userId` 独立加密存在 Secrets Manager；容器为每个用户开独立的 `DWS_CONFIG_DIR`。**新增员工 = 多一条记录，不动任何代码或部署。**

完整流程见 → **[Remote 多用户接入指南](./docs/remote-quick-desktop.md)**

### 详细文档

- [Quick Desktop 接入指南](./docs/remote-quick-desktop.md)
- [安全模型](./docs/remote-security.md)
- [可观测性](./docs/remote-observability.md)
- [运维手册](./docs/remote-operations.md)
- [FAQ](./docs/remote-faq.md)
- [成本估算](./docs/remote-cost.md)

## 状态

**v0.2 — Local + Remote 均已交付；Remote 已用真实钉钉账号端到端联调打通。**

- ✅ **Local v0.2**：monorepo 重构完成；38 工具（30 tier1 + 6 alias + discover/invoke）；shared catalog 覆盖 dws v1.0.32 全部 261 命令；冒烟测试通过；v0.1 用户态验证仍成立。
- ✅ **Remote v0.2 — 端到端联调通过（2026-06-01）**：用真实钉钉账号走完 `/authorize` → 同意 → `/callback` → 拿 MCP token → Quick Desktop streamable-http 连上 → `dingtalk_contact_user_get_self` 以本人身份调通钉钉。token 注入定为 `dws auth login --token`（D2，已实测，非 stub）；EventBridge 自动刷新链路验证可用。
  - 联调中发现并修复的真实问题（已回写仓库，下次 `deploy.sh` 一次成功）：
    1. AgentCore HTTP 契约要求容器监听 **8080**（非 8000），否则 502；
    2. `requestHeaderConfiguration.requestHeaderAllowlist` 必须显式放行 `x-user-id` 等自定义头，否则容器收不到用户身份（401）；
    3. mcp-middleware → AgentCore 的 **SigV4 签名** path 不能含 query string（否则 403 SignatureDoesNotMatch）；
    4. `secretsmanager:ListSecrets` 必须 `Resource:*`（账号级操作不支持资源限定），否则自动刷新被拒、token 过期返回 503；
    5. server.js 补齐 MCP Streamable HTTP 握手（`Mcp-Session-Id` 响应头 + 协议版本协商 + 通知回 202），否则客户端停在 "Configured" 不 Connected；
    6. SSM 参数需以 SecureString 重建（CloudFormation 的 `AWS::SSM::Parameter` 只能建 String 占位）；
    7. CDK app 预打包为 CJS（`infra/bin/app.bundle.cjs`），绕开原生 `--experimental-strip-types` 对 aws-cdk-lib（CJS）命名导出的限制。
- 📅 **后续（收尾项）**：scope-map 字符串回填、observability dashboard 调优、多区域、自定义域名。

路线图（按优先级）：
1. ~~Plan 2：Remote 栈~~ ✅
2. ~~Plan 3：端到端联调打通~~ ✅（收尾：scope-map 回填、多区域）
3. v0.3：删除 v0.1 alias；图片 / 文件 / 交互卡片支持

## 致谢

- 钉钉团队 [`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) —— 干了所有脏活，本项目只是个适配层
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) —— MCP TypeScript SDK
- 命名灵感来自飞书侧的 `lark-cli-mcp` 项目

## 开源协议

[MIT](./LICENSE) © 2026 Keith Yu
