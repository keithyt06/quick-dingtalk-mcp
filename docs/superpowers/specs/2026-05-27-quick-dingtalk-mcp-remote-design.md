# quick-dingtalk-mcp v0.2 — Local + Remote 双栈设计

**状态**：草案（brainstorming 阶段产物，待 plan 阶段细化）
**日期**：2026-05-27
**作者**：Keith Yu
**前置版本**：v0.1（仅 Local stdio，6 个手写工具）
**参考实现**：[ddpie/lark-mcp-on-agentcore](https://github.com/ddpie/lark-mcp-on-agentcore)（飞书侧同模式）

---

## 1. 背景与目标

v0.1 是个 275 行的 stdio MCP server，把 6 个 `dws` 子命令包成 MCP 工具，给 Local MCP host（Q Desktop / Claude Desktop / Cursor）使用。本次升级把项目同时支持两种发行形态：

- **Local（保留并增强）**：单机自用，stdio MCP，依赖用户机器上已登录的 dws；工具集从 6 个扩到 30 + 兜底全部 159 个。
- **Remote（新增）**：多用户共享托管，参考 lark-mcp-on-agentcore 部署到 AWS Bedrock AgentCore，多用户 OAuth 隔离、token 自动刷新、可观测告警齐全。

两种形态共用同一份工具 catalog 与 dispatcher 代码。

### 关键决策（brainstorming 已拍板）

| 决策 | 取值 | 原因 |
|---|---|---|
| Remote 用户模型 | 多用户共享部署 | 一份部署多人用，对齐 lark-mcp |
| dws token 注入 | 每用户一个 `DWS_CONFIG_DIR` | dws 没有 `*_USER_ACCESS_TOKEN` 环境变量；configDir 是唯一稳定接口 |
| 工具暴露策略 | tier1 30 个 + `dingtalk_discover` / `dingtalk_invoke` 兜底全部 | 对齐 lark-mcp，prompt cache 不炸 |
| 仓库布局 | 单 repo + npm workspaces 子包 | shared 代码单源真理，发布边界清楚 |
| Remote MCP 客户端 | 仅 Quick Desktop（Claude/Cursor 走 Local） | Streamable HTTP 在 Claude/Cursor 还不稳 |
| IaC | CDK | 与 lark-mcp 一致，可直接借鉴 |
| 可观测 | MVP 即上齐：Dashboard + 10 Alarms + 钉钉群 webhook | 多用户托管不能没监控 |
| WAF | 可选，默认关 | 个人/小团队部署不需要，企业按需开 |

### 不做（YAGNI）

- 不支持 Local 端多用户切换。
- 不实现 image / file 附件、互动卡片、群创建（v0.1 同样未做，本版本不补）。
- 不引入 TypeScript 重写 Local 端（Local 仍是 .mjs）。
- 不做跨区域多活、不做 blue/green，单 region 单 stack。
- 不做 prompt 模板 / preset。

---

## 2. 整体架构

```
                                      ┌──────── Local 路径（个人/单机）────────┐
                                      │  MCP host (Q/Claude/Cursor) ─stdio──→  │
                                      │  packages/local/server.mjs (~300L)     │
                                      │  ── exec ──→ 用户本机 dws ── HTTPS ──→ │
                                      │  钉钉 mcp-gw                            │
                                      └────────────────────────────────────────┘
                                                       │
                                                       │ 共用
                                                       ▼
                                      ┌──────── packages/shared ───────────────┐
                                      │  catalog.json (build 时由 dws 提取)     │
                                      │  scope-map.json                         │
                                      │  tier1.json (30 个常用)                 │
                                      │  schema 生成、参数序列化、错误重写、     │
                                      │  discover/invoke 派发                    │
                                      └────────────────────────────────────────┘
                                                       │
                                                       │ 共用
                                                       ▼
       ┌─────────────────────────── Remote 路径（多用户托管）───────────────────────────┐
       │ Quick Desktop ─HTTPS──→  CloudFront (+可选 WAF us-east-1)                     │
       │                              ↓                                                 │
       │                          API Gateway                                           │
       │                              ↓                                                 │
       │                          mcp-middleware Lambda                                 │
       │                          (校验 HMAC token + SigV4 签名)                         │
       │                              ↓                                                 │
       │                          AgentCore Runtime (容器, 端口 8000, Streamable HTTP) │
       │                          packages/remote/docker/server.js                      │
       │                          ↓                                                      │
       │                          dws 子进程 (DWS_CONFIG_DIR=<perUser tmpfs>)            │
       │                              ↓                                                 │
       │                          钉钉 mcp-gw                                            │
       │                                                                                 │
       │                          token-refresh-shim Lambda                            │
       │                          (OAuth PKCE + EventBridge 30min 刷新 + incremental)  │
       │                          → Secrets Manager (per-user token 加密存)             │
       │                          → DynamoDB (auth code 临时存)                          │
       │                          → SSM Parameter Store (HMAC 签名密钥)                  │
       │                                                                                 │
       │                          alarm-relay Lambda (SNS → 钉钉群 webhook，可选)       │
       └────────────────────────────────────────────────────────────────────────────────┘
```

**核心理念**：Local 和 Remote 是同一份能力的两种发行形态。`packages/shared` 是单源真理，build 时一次性从 dws 提取 catalog，运行时直接读。tier1.json 决定哪 30 个工具直接暴露；其它通过 `dingtalk_discover` / `dingtalk_invoke` 兜底。

---

## 3. 仓库布局

```
quick-dingtalk-mcp/
├── README.md                    ← 双语，Local / Remote 两条入口
├── LICENSE  package.json  package-lock.json  tsconfig.json  .gitignore
│
├── packages/                    ← npm workspaces
│   ├── shared/                  ← 共享层，单源真理
│   │   ├── catalog.json         ← build 时由 dws 提取的全部 ~159 个命令
│   │   ├── tier1.json           ← 30 个 tier1 工具名（手写）
│   │   ├── scope-map.json       ← dws command → 钉钉 scope 映射
│   │   ├── generate-catalog.mjs ← build 时调 `dws --help` 递归提取
│   │   ├── src/
│   │   │   ├── schema.mjs       ← buildInputSchema / toToolName
│   │   │   ├── dispatcher.mjs   ← MCP call → dws 参数翻译 + execFile 调用
│   │   │   ├── search.mjs       ← discover 检索（query/category）
│   │   │   ├── annotations.mjs  ← MCP 2025-03-26 destructiveHint / readOnlyHint
│   │   │   └── errors.mjs       ← PAT/scope 错误重写 + Local/Remote 文案差异
│   │   └── __tests__/
│   │
│   ├── local/                   ← Local 路径（stdio）
│   │   ├── package.json         ← bin: quick-dingtalk-mcp
│   │   ├── server.mjs           ← 旧 server.mjs 升级版（用 shared/dispatcher）
│   │   ├── scripts/smoke.sh
│   │   └── docs/
│   │       ├── setup.md         ← 迁自原 SETUP.md
│   │       └── verification.md  ← 迁自原 VERIFICATION.md
│   │
│   └── remote/                  ← Remote 路径（容器 + CDK）
│       ├── package.json
│       ├── docker/
│       │   ├── Dockerfile       ← node:20-bookworm + dws pinned + AWS SDK
│       │   ├── server.js        ← Streamable HTTP :8000
│       │   └── inject-token.mjs ← D1/D2/D3 PoC 后定的 token 注入实现
│       ├── infra/
│       │   ├── bin/app.ts
│       │   └── lib/{oauth-stack,runtime-stack,waf-stack}.ts
│       ├── lambda/
│       │   ├── token-refresh-shim/index.ts   ← OAuth + 30min 刷新
│       │   ├── mcp-middleware/index.ts       ← HMAC + SigV4
│       │   ├── alarm-webhook/index.ts        ← 钉钉群通知（可选）
│       │   └── shared/log.ts
│       └── scripts/
│           ├── install.sh       ← curl | bash 一键入口
│           ├── deploy.sh        ← 交互式部署（中英）
│           ├── teardown.sh
│           ├── ops.sh           ← status/list-users/revoke/refresh/logs
│           └── test-e2e.sh
│
├── config/                      ← repo 全局配置（Remote 读，Local 也可用）
│   ├── i18n.json
│   ├── alarm-thresholds.json    ← MVP 上齐告警，跟 lark-mcp 对齐
│   ├── alarm-presets.json
│   └── oauth-scopes.json        ← tier1 所需 scope，用于首次授权
│
├── docs/
│   ├── superpowers/specs/2026-05-27-...-design.md  ← 本设计文档
│   ├── architecture.svg
│   ├── remote-quick-desktop.md  remote-security.md  remote-observability.md
│   ├── remote-operations.md     remote-faq.md       remote-cost.md
│   └── structure.md
│
└── .claude/skills/
    └── bump-dws-version.md      ← dws 升级 runbook（拷贝 lark-mcp 的）
```

### 关键决定

1. **Local 端 `server.mjs` 从根目录搬到 `packages/local/server.mjs`** — break change。README 顶部要有醒目的"v0.2 迁移说明"，提示用户更新 MCP host 配置里的 `args` 路径。
2. **shared 是纯 ESM**，Local（.mjs）直接 import，Remote 容器 server.js 也直接 require/import；Lambda（TS）走 tsconfig paths。整个 repo 不引入 TypeScript 重写 Local。
3. **`scripts/install.sh` 放 `packages/remote/scripts/` 下** — install 只针对 Remote；Local 仍走 git clone + npm install + npm link 老路径。
4. **`config/` 在根目录，不在 packages/remote 下** — i18n / 错误信息将来 Local 也会用。

---

## 4. 共享层（packages/shared）

### 4.1 Catalog 生成（build-time，提交到 git）

`generate-catalog.mjs` 流程：

1. 启 dws 子进程跑 `dws --help`，从输出抽出顶级 group（`chat / contact / calendar / drive / ...`）
2. 对每个 group 递归 `dws <group> --help`，向下到叶子节点
3. 对每个叶子节点跑 `dws <full-path> --help`，解析 flag 名字、类型（string/bool/number）、required 标志、description
4. 拼上手维护的 `scope-map.json`（每个命令需要的钉钉 OpenAPI scope）和 `tier1.json`（手写 30 个）
5. 输出 `catalog.json` — check 进 git

**Catalog 头部**保留 `_dwsCliVersion` / `_scopeMapVersion` / `_generatedAt` 元数据。

**版本同步**：`scripts/check-dws-version.sh` 比对 `package.json` 的 `dws.version` 字段和 `catalog.json` 头部 `_dwsCliVersion`。CI 跑、不一致就失败。dws 升级流程：bump version → `npm run build:catalog` → diff catalog → commit。

**为什么 build-time 不 runtime**：
- 避免每次容器冷启动跑 `dws --help`（时间不可控、冷启慢）
- 避免上线后 dws 行为变化让 prod 飘
- catalog diff 进 git 让命令变更 review 可见

### 4.2 Tier1 工具清单（30 个）

`tier1.json` 是字符串数组。建议覆盖范围（具体名单 plan 阶段对照 dws --help 后定）：

| 域 | 数量 | 工具示例 |
|---|---|---|
| **IM**（消息） | 8 | `dingtalk_chat_message_send` / `_list` / `_search` / `_recall` / `_list_topic_replies` / `_send_card` / `_list_at_me` / `_mark_read` |
| **Contact**（联系人/部门） | 5 | `_contact_user_search` / `_user_get_self` / `_user_get` / `_dept_list` / `_dept_user_list` |
| **Chat**（群管理） | 4 | `_chat_search` / `_create` / `_member_list` / `_join` |
| **Calendar** | 4 | `_calendar_event_list` / `_create` / `_update` / `_attendee_list` |
| **Drive/Doc** | 4 | `_drive_file_list` / `_file_create` / `_doc_read` / `_doc_append` |
| **Todo** | 3 | `_todo_list` / `_create` / `_complete` |
| **DING**（紧急） | 2 | `_ding_send` / `_list` |

剩余 ~130 个走 `dingtalk_discover` / `dingtalk_invoke` 两层兜底。

### 4.3 老工具名 alias（向后兼容）

v0.1 用户已经在 prompt 里写了 `dingtalk_send_message` 等 6 个名字。tier1 内部留 6 个 alias：

| v0.1 名 | catalog 名 |
|---|---|
| `dingtalk_send_message` | `dingtalk_chat_message_send` |
| `dingtalk_get_messages` | `dingtalk_chat_message_list` |
| `dingtalk_search_messages` | `dingtalk_chat_message_search` |
| `dingtalk_list_chats` | `dingtalk_chat_search` |
| `dingtalk_search_user` | `dingtalk_contact_user_search` |
| `dingtalk_get_thread` | `dingtalk_chat_message_list_topic_replies` |

老名字的 `description` 加 `[deprecated, use <new>]` 前缀。下一个 major 版本（v0.3+）才删 alias。

### 4.4 错误重写

dws 设了 `DINGTALK_DWS_AGENTCODE` 环境变量后，命中权限不足时 stderr 输出结构化 JSON + exit code 4。dispatcher 捕获 `exit=4`：

```js
{
  "error": "permission_required",
  "missing_scopes": ["Contact.User.Read", "..."],
  "authorize_url": "https://<oauth-base>/authorize?extra_scope=...&t=<incrAuthToken>",
  "hint": "钉钉提示需要新增权限。点击链接完成授权后重试。"
}
```

`authorize_url` 仅 Remote 模式有意义；Local 模式 `errors.rewritePAT` 输出本地命令提示：

```
钉钉权限不足。请在终端运行：dws pat chmod Contact.User.Read
完成后重试。
```

---

## 5. Local 端实现（packages/local）

### 5.1 关键变更

**【大变】tools/list 改成 catalog-driven**：
- 从 shared/catalog.json + tier1.json 读 30 个 tier1 + 6 个 alias
- 加 `dingtalk_discover` + `dingtalk_invoke`，共 38 个工具

**【大变】tools/call 路由**：
- toolName 命中 tier1（含 alias）→ shared/dispatcher.toCliArgs(def, args) → execFile("dws", ...)
- toolName == discover → shared/search.searchCatalog
- toolName == invoke → 按 tool_name 找 def → 同 tier1
- exit=4 → shared/errors.rewritePAT (mode=local)
- 其它非零 → 透传 stderr

**【小变】鉴权链路不动**：
- Local 用户先在自己机器 `dws auth login --device`，token 存 `~/.dws`
- server.mjs 子进程不传 token，dws 自己从 configDir 读
- **新增**：默认设 `DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp` 给子进程，让 PAT 错误结构化返回（不拉本机浏览器）

### 5.2 入口与 npm 包

`packages/local/package.json`：

- `bin: { "quick-dingtalk-mcp": "./server.mjs" }` — 支持 npx 启动
- 依赖：`@modelcontextprotocol/sdk`，shared 通过 workspaces 链接

迁移指引（README 顶部）：

```
v0.1 → v0.2 迁移
- 老配置：args = ["/path/to/quick-dingtalk-mcp/server.mjs"]
- 新配置：args = ["/path/to/quick-dingtalk-mcp/packages/local/server.mjs"]
  或：command="npx", args=["-y", "quick-dingtalk-mcp"]
```

---

## 6. Remote 端实现（packages/remote）

### 6.1 容器（docker/）

- `FROM node:20-bookworm-slim@sha256:<digest>`
- `ARG DWS_VERSION=<pin>` — 通过 release tarball 装；`scripts/check-dws-version.sh` 跟 catalog.json `_dwsCliVersion` 一致性
- `ENV DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp`
- `ENV DWS_DISABLE_KEYCHAIN=1`（容器无 keychain）
- `ENV DWS_CONFIG_DIR_BASE=/var/dws/users`（每用户的 configDir 挂 tmpfs）
- `USER node`，`EXPOSE 8000`，`ENTRYPOINT ["node", "/app/server.js"]`

`server.js` 直接借用 lark-mcp 的 server.js 结构（500 行级），替换：
- `runLarkCli` → `runDws`
- `LARKSUITE_CLI_USER_ACCESS_TOKEN` 注入 → `provisionUserConfig(uid, token)` + `DWS_CONFIG_DIR=<perUserDir>`
- 工具 catalog 从 shared 读
- PAT 错误 patch 用 shared/errors

`server.js` 仍保留 lark-mcp 的关键能力：semaphore、SIGTERM drain、SSE response、health check `GET /ping`、request abort 传播、1MB body 限。

### 6.2 Lambda × 3

| Lambda | 文件 | 触发 | 职责 |
|---|---|---|---|
| **token-refresh-shim** | `lambda/token-refresh-shim/index.ts` | API Gateway `/authorize` `/callback` `/refresh` + EventBridge 30min | (1) PKCE OAuth 流程：生成 state → 跳钉钉同意页 → callback 拿 code → 换 access/refresh token → 加密入 SM。(2) 颁发 MCP HMAC token 给 Quick Desktop。(3) EventBridge 每 30min 全量用户 token refresh。(4) incremental-auth：tier2 工具碰 scope 错时跳一次新增 scope 的授权 |
| **mcp-middleware** | `lambda/mcp-middleware/index.ts` | API Gateway `/mcp` POST | (1) 校验 `Authorization: Bearer <hmac>` → 解 userId。(2) SM 读 user access_token；过期则 503。(3) SigV4 sign request → AgentCore Runtime；header 注 `X-User-Access-Token` / `X-Incr-Auth-Token`。(4) 25s 超时（API GW 上限 29s 留 buffer） |
| **alarm-webhook**（可选） | `lambda/alarm-webhook/index.ts` | SNS topic | (1) SNS 收 CloudWatch alarm → 转钉钉群消息卡片。webhook URL 部署时填，没填就不创建这个 Lambda |

### 6.3 CDK Stacks

| Stack | 文件 | 内容 |
|---|---|---|
| **OAuthStack** | `infra/lib/oauth-stack.ts` | DDB（auth code）+ SM（user token + dingtalk app secret）+ SSM（HMAC 签名密钥）+ token-refresh-shim Lambda + mcp-middleware Lambda + API Gateway + CloudFront + Dashboard + 10 Alarms + SNS + alarm-webhook Lambda |
| **RuntimeStack** | `infra/lib/runtime-stack.ts` | Docker 镜像 build & push → ECR + AgentCore Runtime + IAM Role（含 SM 读权限） |
| **WAFStack**（可选） | `infra/lib/waf-stack.ts` | us-east-1 CloudFront-scope WAFv2 + 速率限制规则。不开就不部署 |

部署顺序：OAuthStack → RuntimeStack（要 OAuthStack 输出的 SM ARN）→（可选）WAFStack。

---

## 7. 数据流（4 条 sequence）

### 7.1 首次授权

```
Quick Desktop      API Gateway       token-refresh-shim       钉钉 OAuth        Secrets Manager
     │                                       │                                          │
     │  用户点 deploy.sh 输出的授权链接 ────────→ /authorize                              │
     │                                       │ 生成 state + PKCE verifier               │
     │                                       │ 写 DDB（state→pkce, 5min TTL）            │
     │ ←─── 302 跳钉钉同意页 ──────────────────                                          │
     │                                       │                                          │
     │ 用户在钉钉同意 ──→ 钉钉  ─── /callback?code=&state= ─→ /callback                  │
     │                                       │ DDB 查 state → 拿 verifier               │
     │                                       │ POST 钉钉 /v1.0/oauth2/userAccessToken   │
     │                                       │   ← access_token + refresh_token          │
     │                                       │ GET 钉钉 /v1.0/contact/users/me           │
     │                                       │   ← userId                                │
     │                                       │ ──── 加密入 SM <userId> ────────────────→ │
     │                                       │ 签 HMAC token: base64url(uid:exp:sig)    │
     │ ←── 200 HTML 页面，"复制下面 token 填到 Quick Desktop" ──                          │
     │                                                                                  │
     │ 用户填到 Quick Desktop "Authorization: Bearer <hmac>"                              │
```

### 7.2 一次工具调用

```
Quick Desktop ─ POST /mcp Bearer <hmac> ─→ CloudFront ─→ API GW ─→ mcp-middleware Lambda
                                                                    │ verify HMAC → uid
                                                                    │ SM.get(<uid>) → access_token
                                                                    │ 临过期 → 503 + Retry-After
                                                                    │
                                                                    │ SigV4 sign request
                                                                    │   X-User-Access-Token: <access>
                                                                    │   X-Incr-Auth-Token: <hmac2>
                                                                    │
                                                                    ↓
                                              AgentCore Runtime: docker/server.js
                                                                    │
                                                                    │ inject-token.mjs(uid, token)
                                                                    │   DWS_CONFIG_DIR=/var/dws/users/<uid>
                                                                    │   ［PoC 后选 D1/D2/D3］
                                                                    │
                                                                    │ withSemaphore(MAX_CONCURRENT=10)
                                                                    │ execFile(dws, dispatcher.toCliArgs(...))
                                                                    │   ENV: DWS_CONFIG_DIR + AGENTCODE
                                                                    │
                                                                    │ dws ──→ mcp-gw.dingtalk.com
                                                                    │   ← JSON / exit=0
                                                                    │   或 PAT JSON / exit=4
                                                                    │
                                                                    │ exit=4 → patchPermissionError
                                                                    │   → 拼 incremental authorize URL
                                                                    │
                                              ←── SSE event: message {content[0].text} ──
                                ←─ ApiGW response ─                ←── SigV4 response body ─
   ←── HTTPS body ──
```

### 7.3 Token 自动刷新（EventBridge 30min）

```
EventBridge ─→ token-refresh-shim Lambda
                │ 列 SM 里所有 SecretId（前缀 quick-dingtalk-mcp/users/*）
                │ for each user:
                │   if expires_at - now > 60min: skip
                │   POST 钉钉 /oauth2/userAccessToken（grant=refresh_token）
                │   ← 新 access_token + 新 refresh_token
                │   加密回写 SM
                │   失败 → 标 needs_reauth + emit CloudWatch metric
                │ 失败计数 > 0 → CW Alarm → SNS → alarm-webhook → 钉钉群
```

钉钉 access_token 默认 7200s，refresh_token 默认 30 天。30min 刷新留充足 buffer。

### 7.4 Incremental auth

```
tier2 调用 dingtalk_invoke ─→ executeTool ─→ dws exit=4 (PAT JSON)
   ↓
patchPermissionError 拿 missing_scopes
   ↓
拼出 hint：
   "需要新增钉钉权限：Calendar.Event.Write
    点击授权 https://<oauth-base>/authorize?extra_scope=Calendar.Event.Write&t=<hmac2>"
   ↓
LLM 把链接给用户
   ↓
用户点 → token-refresh-shim 用 hmac2 解出 uid → 走渐进授权（PKCE 加 extra_scope）
   ↓
钉钉同意页（钉钉会累积已有 scope，不丢）
   ↓
回 /callback → 加密更新 SM ← 新 access_token 含全部 scope
   ↓
用户重试同一个 tool call，成功
```

---

## 8. dws Token 注入 PoC（关键不确定项）

部署前必须先 PoC。设计假设：每用户一个临时 `DWS_CONFIG_DIR=/var/dws/users/<uid>`（tmpfs / per-request），请求结束销毁。三个候选实现，PoC 顺序便宜→贵：

### 8.1 候选方案

| 候选 | 思路 | 优点 | 风险 |
|---|---|---|---|
| **D1. 写加密文件** | OAuth Lambda 完成钉钉 OAuth → 拿到 access_token → 复现 dws 的 file-DEK 加密格式 → 写入 `<configDir>/oauth-token.enc` | 上游 dws 不动 | 加密格式可能跨版本变；逆向工作量未知 |
| **D2. 调 dws auth 子命令** | 容器在收到 token 后调 `dws auth ...`（如有 import / restore / from-token 子命令）让 dws 自己写入 configDir | 完全黑盒、跨版本稳定 | dws 可能没暴露这种子命令 |
| **D3. fork dws 加 env 注入** | 临时 fork dws，加 `DWS_USER_ACCESS_TOKEN` 环境变量或 `--access-token <jwt>` 全局 flag。`pkg/runtimetoken/token.go` 已有 `explicitToken` 接口，应该是几十行 patch | 代码最干净 | 自己跟 dws 版本 |

### 8.2 PoC 步骤

**Step 1（D2 探）**：本地装 dws，跑完整 `dws auth login --device`。看 `~/.dws/` 生成的文件结构。看 `dws auth --help` 是否有 `import` / `restore` / `from-token` 子命令。如果有 → **D2 胜**。

**Step 2（D1 探）**：D2 不行就读 `internal/keychain/file_dek.go` + `internal/auth/*` 推算加密格式（应是 AES-GCM with file-DEK）。在 Node 里复现：
- 读 `<configDir>/dek` 取 master key
- `crypto.createCipheriv("aes-256-gcm", dek, iv)` 加密 token JSON
- 写实际文件名

跨版本风险：dws 改格式我们就挂。需要 `scripts/check-dws-version.sh` 钉死版本。

**Step 3（D3 退）**：前两个都不通就 fork dws，extend `pkg/runtimetoken/token.go` 的 `ResolveAuxiliaryAccessToken` 到 MCP 工具调用路径。同步给上游 PR；本地用 fork 先跑。

### 8.3 PoC 验收

单容器并发 10 个 user 各发一条消息到钉钉，群里看到的发送者全是各自本人头像 + 名字（不是同一个用户、不是混乱），且 dws 子进程间互不污染。

### 8.4 接口先冻结

让 plan 阶段不被 PoC 阻塞，server.js 调用接口先定下来：

```js
// inject-token.mjs
export async function provisionUserConfig(userId, accessToken) {
  // 返回 configDir 绝对路径；幂等
}
export async function teardownUserConfig(userId) {
  // 请求结束清理（或定期 GC）
}
```

server.js 只调这俩，不关心实现是 D1/D2/D3。

---

## 9. 可观测性（MVP 上齐）

### 9.1 Dashboard（5 板块 / 12 图表）

| 板块 | 内容 |
|---|---|
| 入口流量 | API GW 4xx / 5xx / latency p50p99 / throttle |
| Lambda 健康 | middleware 错误率 / 冷启动 / duration p99；refresh-shim 同样 |
| OAuth 流程 | callback 成功率 / 拒绝率 / state 过期；refresh 成功率 / 失败用户数 |
| Runtime 容器 | invocation 数 / dws 子进程时长 / semaphore 队列深度 / server_busy 计数 |
| 业务错误 | PAT 触发次数 / scope-错误工具 top10 / dws 非零退出 |

### 9.2 Alarms（10 个）

API GW 5xx 持续 / middleware 错误率 / Lambda Throttle / refresh 失败 / Runtime 启动失败 / 容器 5xx / server_busy 持续 / SM throttle / DDB throttle / OAuth callback 失败率。

阈值默认在 `config/alarm-thresholds.json`，三套 preset（standard / relaxed / strict）。

### 9.3 通知

SNS topic → alarm-webhook Lambda（webhook URL 没填就不创建这个 Lambda）→ 钉钉群消息卡片。

---

## 10. 安全

| 项 | 做法 |
|---|---|
| OAuth state 防重放 | DDB 存 5min TTL，一次性消费 |
| PKCE | code_verifier 随机 64B / S256 challenge |
| MCP token | HMAC-SHA256，密钥从 SSM Parameter Store（KMS 加密）；24h 过期 |
| incrAuthToken | 第二把 HMAC，专给 incremental-auth 复用，避免暴露主 MCP token |
| per-user token 加密 | SM SecretsManager + KMS（默认 alias/aws/secretsmanager；敏感企业可换 CMK） |
| no-store cache | middleware response 显式 `Cache-Control: no-store`，避免 CloudFront 缓存跨用户结果 |
| WAF（可选） | us-east-1 CloudFront-scope WAFv2，5 分钟内 IP > 1000 reqs 阻断 |
| request body 限 | 1MB（同 lark-mcp），防 DoS |
| SigV4 | middleware → AgentCore Runtime 全段链路签名 |
| container 用户 | `USER node`（非 root），`DWS_DISABLE_KEYCHAIN=1` |

---

## 11. 错误处理（dispatcher 统一一层）

| 场景 | 表现 | 处理 |
|---|---|---|
| dws exit=0，stdout 含 `success:false` | 钉钉业务错（chat_id 错、receiver 不存在） | 透传 JSON 给 LLM |
| dws exit=4，stderr 是 PAT JSON | scope 不足 | rewrite → incremental-auth URL（Remote）/ `dws pat chmod` 提示（Local） |
| dws exit=非0非4 | dws 自身错 / 网络 / dingtalk 5xx | 透传 stderr，标 `isError: true` |
| execFile 超时（60s） | dws 卡死 | kill child，返 `{error:"timeout"}` |
| semaphore 满 | 并发超 MAX_CONCURRENT | `{error:"server_busy"}` + retry-after 提示 |
| client abort | Quick Desktop 取消 | abort signal → 中断 dws 子进程 |
| SM throttle / SM AccessDenied | AWS-side transient | 503 + Retry-After，**不**误导用户去重新授权 |
| token expires_at 已过 | refresh-shim 还没跑 | 503 让客户端重试；可同时给 EventBridge 临时 trigger |

降级原则：能让 LLM 看到机器可读 JSON 就不给纯文本。所有错误都返 `{error: <code>, message, hint?}`。

---

## 12. 风险与开放项

| 项 | 风险 | 缓解 |
|---|---|---|
| dws token 注入方案未定 | PoC 三个候选都失败的极端情况 | D3 fork 路径兜底，最坏几十行 patch；接口先冻结让其它工作不阻塞 |
| dws 加密格式跨版本变 | D1 走通后下个 dws 版本挂 | `check-dws-version.sh` CI 强制；升 dws 时跑回归 |
| Catalog 解析依赖 `--help` 文本 | dws --help 格式微变会影响解析 | generate-catalog 单测覆盖；CI 比对 catalog diff |
| 钉钉 OAuth scope 模型与 lark 不同 | 渐进授权链路细节可能要调 | PoC 阶段实测 `extra_scope` 参数行为 |
| 多用户共享部署的"用户态"展示 | 钉钉群里发出去显示是 App 还是用户本人 | 沿用 v0.1 `VERIFICATION.md` 的 5 分钟肉眼验证流程 |
| MCP 协议版本兼容 | Quick Desktop 当前协议版本未知 | 沿用 lark-mcp 的 2024-11-05 base + 2025-03-26 annotations 混用 |
| AgentCore Runtime 在某些 region 不可用 | 部署目标 region 限制 | 仅支持 lark-mcp 已验过的 region 列表；deploy.sh 里枚举 |

---

## 13. 实施阶段（不属本设计范围，由 plan 阶段细化）

按依赖顺序：

1. **PoC token 注入**（验 D1/D2/D3）
2. **packages/shared**（catalog 生成 + dispatcher + tier1 + alias + errors）
3. **packages/local**（迁 server.mjs，加 alias，smoke pass）
4. **packages/remote/docker**（server.js + Dockerfile + inject-token 实现）
5. **packages/remote/lambda**（token-refresh-shim → mcp-middleware → alarm-webhook）
6. **packages/remote/infra**（CDK stacks）
7. **packages/remote/scripts**（install / deploy / ops / teardown / e2e）
8. **可观测**（Dashboard + 10 Alarms + webhook）
9. **WAF stack**（可选）
10. **README + docs/**（双语，迁移指引醒目）
11. **回归**：v0.1 用户场景在 v0.2 路径下全跑通

---

## 14. 参考

- [ddpie/lark-mcp-on-agentcore](https://github.com/ddpie/lark-mcp-on-agentcore) — 飞书侧同模式实现
- [DingTalk-Real-AI/dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) — dws CLI 上游
- [Model Context Protocol spec](https://modelcontextprotocol.io)
- [AWS Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/)
- v0.1 的 [README.md](../../packages/local/docs/setup.md) / [VERIFICATION.md](../../packages/local/docs/verification.md)（迁移后路径）
