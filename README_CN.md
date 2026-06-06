# quick-dingtalk-mcp

> **以你*本人身份*操作钉钉 —— 从 Amazon Quick Desktop 以及任意 MCP 客户端。**

一个 MCP server，包装钉钉官方 CLI（[`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)），让 AI 助手能**用你的真实用户身份**收发钉钉消息——群里显示的是你的头像、你的名字，而不是一个机器人。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

[English](./README.md) · 中文

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="quick-dingtalk-mcp 架构：Local 与 Remote MCP，都从 Amazon Quick Desktop 通到钉钉" width="100%">
</p>

---

## 为什么需要它

钉钉官方的 MCP server（[`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp)）只能**以机器人身份**说话——同事在群里看到的是一个 Bot，不是你。对于"个人助理"这个场景，这是错的。

本项目走相反的路线：包装钉钉官方 CLI `dws`，它走的是**用户态 OAuth** 认证。于是当你跟助手说*"在项目群发一条：会议改到下午 3 点"*，消息会**以你本人的身份**出现在群里——和你亲手打字一模一样。

`dws` 本身就是钉钉 MCP 网关（`mcp-gw.dingtalk.com`）的瘦客户端，也就是说钉钉后端本就是 MCP-native 的。本项目用两种方式把这个能力暴露出来：

| | **Local MCP（本地）** | **Remote MCP（远程）** |
|---|---|---|
| 面向谁 | 只有你，在自己机器上 | 整个团队，共享 |
| 跑在哪 | `dws` 在你笔记本上，stdio 接客户端 | AWS Bedrock AgentCore + Lambda，HTTPS |
| 配置成本 | `npm install` + `dws auth login`（~5 分钟） | 管理员部署一次；每个成员自助授权 |
| 身份 | 你本机登录的 `dws` 会话 | 每用户独立 OAuth，互相隔离 |
| 适合 | 个人用，最快上手 | 多人、需要集中审计、不想本地装东西 |

两种方式暴露**同样的 38 个工具**（见 [工具](#工具)），共用同一份命令 catalog。

---

## Local MCP（本地单用户）

跑在你自己机器上，通过 stdio 接进 Amazon Quick Desktop（或 Claude Desktop、Cursor）。

```
你说的话               Amazon Quick Desktop          quick-dingtalk-mcp              dws CLI                 钉钉
"在 X 群发消息"  ──→  （MCP 客户端）──stdio──→ node packages/local/server.mjs ──exec──→ dws chat ... ──HTTPS──→ mcp-gw.dingtalk.com
```

### 1. 安装钉钉 CLI

```bash
npm install -g dingtalk-workspace-cli
```

> 你的钉钉企业需要开通 **CLI 访问**。管理员：[open-dev.dingtalk.com](https://open-dev.dingtalk.com) → "CLI 访问管理" → 启用（一次开通，全员永久生效）。普通成员遇到未开通时，登录页会引导一键申请。

### 2. 拉项目

```bash
git clone https://github.com/keithyt06/quick-dingtalk-mcp.git
cd quick-dingtalk-mcp
npm install
```

### 3. 登录钉钉（以你本人）

```bash
dws auth login --device      # 设备流——SSH / 无头环境也能用
```

用钉钉 App 扫码授权。**正是这一步让消息以你本人身份发出。**

### 4. 接入 Amazon Quick Desktop

先拿两个绝对路径（Quick Desktop 启动的子进程不一定继承完整 `PATH`，用绝对路径最稳——且路径**不能含空格**）：

```bash
which node                                  # 例如 /opt/homebrew/bin/node
echo "$(pwd)/packages/local/server.mjs"     # server 入口
```

然后在 **Amazon Quick Desktop → Settings → Capabilities → MCP → + Add MCP**：

| 字段 | 值 |
|---|---|
| Connection type | **Local** |
| ID | `quick-dingtalk-mcp` |
| Name | `quick-dingtalk-mcp` |
| Command | `which node` 的输出 |
| Arguments | `server.mjs` 的绝对路径 |

保存。应看到 **`quick-dingtalk-mcp · 38 tools · Connected ✅`**。

连上后，让它查一下你自己，会返回你真实的钉钉身份——证明整条链路端到端打通：

<p align="center">
  <img src="./docs/assets/quick-desktop-connected.png" alt="Amazon Quick Desktop 连上 quick-dingtalk-mcp，返回用户本人的钉钉资料" width="80%">
</p>

### 5. 试一下

在 Quick Desktop 对话里：

```
列一下我最近的钉钉会话，然后给 chat_id=cidXXXX 发一条 markdown，
标题"测试"，正文"hello from quick-dingtalk-mcp"。
```

完整流程（含 Claude Desktop / Cursor、故障排查、"真的是我本人吗"的人工验证）→ **[packages/local/docs/setup.md](./packages/local/docs/setup.md)**

---

## Remote MCP（远程多用户）

部署在 AWS Bedrock AgentCore 上的共享多用户版本。**一次部署支持任意多个成员**——新增一个人是自助的，零代码改动、零重新部署。

```
每个成员            Amazon Quick Desktop                    AWS
授权一次  ──→  （MCP 客户端，HTTPS + Bearer）──→ CloudFront → API GW → mcp-middleware (Lambda)
                                                     │  校验 HMAC token，加载*该用户*的钉钉 token
                                                     ▼
                                              AgentCore Runtime（容器内跑 dws，每用户独立配置）
                                                     │
                                                     ▼
                                                   钉钉（以该成员身份发出）
```

每个成员的钉钉 token 按 `userId` 分别用 KMS 加密存在 Secrets Manager；容器给每个用户一份隔离的 `dws` 配置。钉钉 token 由定时任务自动续期；你粘进客户端的 MCP token **只要在用就一直有效**——后端按用户记录活跃窗口（连续 90 天不用才需重新授权），所以一次配置长期可用。

### 管理员：部署一次

```bash
curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
~/.quick-dingtalk-mcp/packages/remote/scripts/deploy.sh
```

`deploy.sh` 会创建全部资源（CloudFront、API Gateway、Lambda、DynamoDB、Secrets Manager、AgentCore Runtime 容器），并打印：
- 发给成员的**授权 URL**
- 成员粘进 Amazon Quick Desktop 的 **MCP 端点**（`https://<域名>/mcp`）

> 前置：一个钉钉应用（AppKey/AppSecret），并把 `<域名>/callback` 注册为其重定向 URL；`us-east-1` 的 AWS 凭证；Docker；Node ≥ 22.6。详见 [docs/remote-operations.md](./docs/remote-operations.md)。

### 成员：接入 Amazon Quick Desktop（3 步自助）

1. **授权** —— 浏览器打开管理员给的 `https://<域名>/authorize`，用*你自己*的钉钉账号同意，复制返回的 `Bearer ...` token。**只需做这一次**——token 只要在用就长期有效（连续 90 天不用才需重新授权）。
2. **添加 MCP server**，在 **Amazon Quick Desktop → Settings → Capabilities → MCP → + Add MCP**：

   | 字段 | 值 |
   |---|---|
   | Connection type | **Remote / HTTP**（`streamable-http`） |
   | URL | `https://<域名>/mcp` |
   | Header | `Authorization: Bearer <你的 token>` |

   ```json
   {
     "transport": "streamable-http",
     "url": "https://<域名>/mcp",
     "headers": { "Authorization": "Bearer <你的 token>" },
     "timeout": 300
   }
   ```
3. **验证** —— 说一句*"用 dingtalk 查一下我自己的资料"*，它会返回你真实的企业/部门信息。

你完全不需要碰钉钉开放平台——应用是管理员建的，你只是用自己的账号授权。

完整接入 + 故障排查 → **[docs/remote-quick-desktop.md](./docs/remote-quick-desktop.md)**

---

## 工具

38 个工具，Local 和 Remote 完全一致，背后的 catalog 覆盖**全部 261 个 `dws` 命令**：

| 类别 | 数量 | 内容 |
|---|---|---|
| **命名工具** | 30 | 常用的，按名直接暴露：`dingtalk_chat_message_send` / `_list` / `_search` / `_recall` / `_reply` / `_forward`、`dingtalk_contact_user_search` / `_get_self`、`dingtalk_calendar_event_create`、`dingtalk_doc_create` / `_read`、`dingtalk_todo_task_create`、`dingtalk_ding_message_send` …… |
| **discover + invoke** | 2 | `dingtalk_discover`（关键词搜全部 catalog）+ `dingtalk_invoke`（执行它返回的任意命令）——不撑爆工具列表就能触达全部 261 个命令 |
| **alias** | 6 | 老工具名保留可用，标注 `[deprecated, use …]` |

覆盖 IM、通讯录、日历、文档/云盘、待办、DING、考勤、OA 审批、AI 表格、听记、邮箱等。钉钉每条消息都要求有 **title**（飞书没这要求）—— catalog 已强制。

---

## 与其它方案对比

| | **本项目** | [`open-dingtalk/dingtalk-mcp`](https://github.com/open-dingtalk/dingtalk-mcp) | 自定义机器人 webhook |
|---|---|---|---|
| 以谁的身份发 | **你**（真实用户） | 机器人 | 机器人 |
| 认证 | 用户 OAuth（`dws`） | 应用凭证 | Webhook URL |
| 读历史 / 搜索 | ✅ | ❌ / 受限 | ❌ |
| 群内显示 | 你的头像+昵称 | 机器人 | 机器人名 |

想让助手*就是你*？用本项目。想要清晰标记的自动化？用机器人/webhook。

---

## 文档

- **Local**：[安装配置](./packages/local/docs/setup.md) · [身份验证](./packages/local/docs/verification.md)
- **Remote**：[连接帮助（新人必读）](./docs/remote-连接帮助.md) · [Quick Desktop 接入（技术版）](./docs/remote-quick-desktop.md) · [安全模型](./docs/remote-security.md) · [运维](./docs/remote-operations.md) · [可观测性](./docs/remote-observability.md) · [FAQ](./docs/remote-faq.md) · [成本](./docs/remote-cost.md)

## 致谢

- [`dws` — DingTalk-Real-AI/dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) —— 干了所有脏活，本项目只是它之上的薄适配层。
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- 命名灵感来自飞书侧的 `lark-cli-mcp`。

## 开源协议

[MIT](./LICENSE) © Keith Yu
