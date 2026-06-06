# Remote 端 Quick Desktop 接入指南（多用户）

> v0.2 Remote 多用户 HTTPS MCP 接入 Quick Desktop（钉钉）的完整流程。
> 本文基于一次真实部署 + 端到端联调（2026-06-01）编写，所有步骤均已实测。

## 核心模型：一次部署，多人自助

Remote 的设计目标是**一次部署支持任意多个员工**，新员工接入**不需要改代码、不需要重新部署、管理员几乎零介入**：

```
管理员（一次性）        每个员工（自助，~2 分钟）
─────────────────      ──────────────────────────
部署 1 套栈        ┐
注册 1 个钉钉应用   ├──→  浏览器打开 AuthorizeUrl
拿到 CloudFront 域名 ┘         ↓ 钉钉同意页（用自己的钉钉账号）
                              ↓ 复制返回的 Bearer token
                          粘进自己的 Quick Desktop
                              ↓
                          以"本人身份"操作钉钉
```

每个员工的钉钉 token 按 `userId` 独立加密存放在 Secrets Manager（`quick-dingtalk-mcp/users/<userId>`），容器为每个用户开独立的 `DWS_CONFIG_DIR`。**新增一个员工 = 多一条 Secrets Manager 记录，纯数据，不动任何代码或部署。**

---

## 前置条件

| 角色 | 条件 | 说明 |
|---|---|---|
| 管理员 | 已跑过 `bash packages/remote/scripts/deploy.sh` | 拿到 CloudFront 域名（形如 `https://xxxxx.cloudfront.net`） |
| 管理员 | 钉钉开放平台建了一个企业内部应用 | 拿到 AppKey/AppSecret，并把 `<域名>/callback` 注册进应用的「安全设置 → 重定向 URL」 |
| 员工 | 有公司钉钉账号 | 不需要任何 AppKey/Secret，不需要碰钉钉开放平台 |
| 员工 | Quick Desktop ≥ 0.9.x | 支持 streamable-http transport + 自定义 `Authorization` header |

> 员工侧**完全不需要在钉钉开放平台做任何配置**——应用是管理员统一建的，员工只是用自己的钉钉账号去授权。

---

## 员工接入：3 步

假设管理员给你的 CloudFront 域名是 `https://d512ohnwy06c3.cloudfront.net`（换成你们实际的）。

### 第 1 步：浏览器授权，拿到你自己的 token

在浏览器打开（管理员会把这个 AuthorizeUrl 发给你）：

```
https://<域名>/authorize
```

流程（你视角）：
1. 页面自动跳转到钉钉授权页。
2. 用**你自己的钉钉账号**确认授权（同意 scope `openid corpid`）。
3. 钉钉跳回，页面显示一段 `Bearer ...` token——**复制它**（这就是你的专属 MCP token，长期有效——只要在用就不过期）。

> 底层：`token-refresh-shim` Lambda 生成 `state`（写 DynamoDB，TTL 10 分钟）重定向到钉钉；钉钉回调后 Lambda 用授权码换 `access_token`+`refresh_token` 存进 Secrets Manager（KMS 加密），再用 SSM 里的 HMAC 主密钥派生出你的 MCP token（HMAC-SHA256，~13 个月硬上限；实际有效性由后端 90 天活跃窗口判定——只要 90 天内用过就持续续期）渲染到页面。

### 第 2 步：填进 Quick Desktop

Quick Desktop → Settings → MCP → + Add MCP，填：

| 字段 | 值 |
|---|---|
| Connection type / transport | **Remote / HTTP**（`streamable-http`） |
| Name | 任意，如 `钉钉 (Remote)` |
| URL | `https://<域名>/mcp`（**必须以 `/mcp` 结尾**） |
| Header | `Authorization: Bearer <第1步复制的 token>` |
| Timeout | 60000（可选，长工具防超时） |

JSON 形式：

```json
{
  "name": "钉钉 (Remote)",
  "transport": "streamable-http",
  "url": "https://<域名>/mcp",
  "headers": {
    "Authorization": "Bearer <你的 token>"
  },
  "timeout": 60000
}
```

保存后状态应变为 **Connected**，并显示 **38 个工具**。如果停在 "Configured" 不 Connected，见下文「故障排查」。

### 第 3 步：验证

在 Quick 对话里说：

```
用 dingtalk 查一下我自己的钉钉账号信息
```

应返回你本人的企业/部门信息（证明"以你身份"链路通）。再试发消息（需要群的 chat_id）：

```
用 dingtalk 给群 chat_id=cidXXXX 发条 markdown，标题"测试"，正文"remote 链路通了"
```

消息会以**你本人的头像和昵称**出现在群里。

---

## token 过期处理

| 情况 | 表象 | 处理 |
|---|---|---|
| 闲置 90 天后 MCP token 失效 | Quick 报 401 / 连接失效（极罕见） | 重新打开 `<域名>/authorize` 走一遍授权，复制新 token 替换 |
| 钉钉 access_token 临过期 | 偶发 503 `Retry-After: 30` | 后端 EventBridge 每 30 分钟自动用 refresh_token 续期，等一会重试即可；持续 503 找管理员跑 `ops.sh refresh` |
| 钉钉 refresh_token 失效（约 30 天未用） | 401 reauth | 必须重新走授权 URL |

> **重点**：钉钉侧的 access_token 由后端自动保活（EventBridge 定时刷新），MCP token 也只要你在用就长期有效。正常情况下你**配一次就一直能用**，不需要反复重新授权；只有连续 90 天完全没用过才需要重复第 1 步。

---

## 切换 / 并存 Local 与 Remote

Quick 支持同时挂多个 MCP server：

```json
{
  "mcpServers": {
    "dingtalk-local":  { "command": "node", "args": ["packages/local/server.mjs"] },
    "dingtalk-remote": { "transport": "streamable-http", "url": "https://<域名>/mcp", "headers": {"Authorization": "Bearer ..."} }
  }
}
```

- 个人本机用、不想走云 → Local。
- 多人共享、要审计留痕（DDB 记录） → Remote。
- 两个都挂时给不同 `name`，Quick 在路由层区分。

---

## 故障排查矩阵

| 现象 | 可能原因 | 定位 / 处理 |
|---|---|---|
| Quick 停在 "Configured" 不 Connected、0 tools | ① token 过期返回 503；② 协议握手不匹配（旧版后端） | 先重新授权拿新 token；仍不行让管理员确认后端已部署最新 server（带 `Mcp-Session-Id` 头 + 协议版本协商 + 通知 202） |
| 401 unauthorized | token 拼错 / HMAC 密钥被轮换 / token 过期 | 重新走授权 URL |
| 503 `Retry-After: 30`，body `token-near-expiry` | 钉钉 access_token < 60s 过期且未刷 | 等 EventBridge 刷新（≤30 分钟），或管理员 `ops.sh refresh`；**若长期 503，检查 token-refresh-shim 角色是否有 `secretsmanager:ListSecrets`（Resource:*）权限** |
| 403 SignatureDoesNotMatch | mcp-middleware → AgentCore 的 SigV4 签名问题 | 后端 bug，管理员查 `sigv4.ts`（path 不能含 query；ARN 走默认 uriEscapePath） |
| 502 from runtime | 容器没监听 8080 | 管理员确认 AgentCore Runtime env `PORT=8080`（AgentCore HTTP 契约强制） |
| 工具能列出但调用 401 | AgentCore 未透传自定义头 | 管理员确认 Runtime `requestHeaderAllowlist` 含 `x-user-id,x-user-access-token,x-incr-auth-token` |
| 钉钉端没收到消息 | 你的钉钉账号没那个群的权限 | 先在钉钉里被加进该群 |

管理员排查三板斧：
1. `bash packages/remote/scripts/ops.sh status` —— 看栈健康。
2. `bash packages/remote/scripts/ops.sh logs mcp-middleware` —— 看请求是否到网关、HMAC 校验、token 状态。
3. `aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT --follow --region us-east-1` —— 看容器内 dws 调用。

---

## 管理员：给新员工开通的最小动作

实际上**没有"开通"动作**——员工自助即可。管理员只需：

1. 把 **AuthorizeUrl**（`https://<域名>/authorize`）和本文档发给员工。
2. （仅当员工要用某些组织级接口时）在钉钉开放平台给应用补充对应 scope 权限。

无需在 AWS 侧为每个员工建任何资源——员工首次授权时 `token-refresh-shim` 会自动为其创建 Secrets Manager 记录。
