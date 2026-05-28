# Remote 端 Quick Desktop 接入指南

> v0.2 Remote 多用户 HTTPS MCP 接入 Quick Desktop（钉钉）的完整流程。

## 前置条件

| 条件 | 说明 |
|---|---|
| Quick Desktop 版本 | ≥ 0.9.x，支持 `Authorization` header 自定义 |
| 钉钉账号 | 个人账号即可；企业内部应用需要在钉钉开放平台对应用 scope 授权 |
| 网络 | 直连公网；CloudFront 节点全球可达 |
| Region | 终端用户无需关心，端点固定 us-east-1 后端，CloudFront 边缘加速 |
| 管理员侧 | 已经跑过 `bash packages/remote/scripts/deploy.sh` 并拿到 stack outputs |

如果你只是个人本地用，看 README 的「Local 单用户」章节，本文不适用。

## 拿到端点 + 授权 URL

部署完成后 `deploy.sh` 在最后一段输出三个关键值（也可以随时 `aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 --query 'Stacks[0].Outputs'` 查）：

```text
McpEndpoint        = https://d1abc2def3.cloudfront.net/mcp
AuthorizeUrl       = https://d1abc2def3.cloudfront.net/authorize?scope=Contact.User.Read,im.message.send_to_chat
IncrementalAuthUrl = https://d1abc2def3.cloudfront.net/authorize?incremental=1
```

把 `AuthorizeUrl` 转给最终用户。`McpEndpoint` 是 Quick Desktop 配置里要填的地址。

> 注：CloudFront 域名也可以挂自定义域名（在 OAuthStack 里给 `cfDomainAlias` 上下文），生产环境推荐挂；下文一律按默认 `*.cloudfront.net` 描述。

## 首次授权流程

用户视角 5 步：

1. 浏览器打开管理员发的 `AuthorizeUrl`。`token-refresh-shim` Lambda 生成 PKCE `code_verifier` + `state`，写入 DynamoDB（TTL 10 分钟），重定向到钉钉 `/oauth2/authorize`。
2. 用户在钉钉同意页确认 scope。钉钉重定向回 `https://<cf>/callback?code=...&state=...`。
3. Lambda 校验 `state`，用 `code_verifier` 换 `access_token` + `refresh_token`，按 `userId` 写入 Secrets Manager `quick-dingtalk-mcp/users/<userId>`，KMS 加密；同步在 DDB 里写 `userId → secretArn` 映射。
4. Lambda 用 SSM 里的 HMAC 主密钥派生出该用户的 MCP token（HMAC-SHA256，24h 过期），把 token 渲染到一个一次性 HTML 页面回给浏览器。
5. 用户复制 token，粘到 Quick Desktop 的 `Authorization: Bearer <hmac>`。

完整 sequence：

```
User --> CloudFront --> /authorize Lambda --> DDB(state)
                              |--> redirect --> dingtalk.com (consent)
DingTalk --> CloudFront --> /callback Lambda
                              |--> exchange code --> ding access_token
                              |--> SecretsManager.PutSecret (KMS)
                              |--> DDB.PutItem (userId map)
                              |--> render HTML page with HMAC token
```

## Quick Desktop 配置示例

Quick Desktop → Settings → MCP Servers → New：

```json
{
  "name": "DingTalk (Remote)",
  "transport": "streamable-http",
  "url": "https://d1abc2def3.cloudfront.net/mcp",
  "headers": {
    "Authorization": "Bearer eyJ1aWQiOiJ1XzEyMyIsImV4cCI6MTc1...sig=abcd"
  },
  "timeout": 60000
}
```

字段说明：

| 字段 | 来源 | 备注 |
|---|---|---|
| `url` | OAuthStack output `McpEndpoint` | 必须以 `/mcp` 结尾 |
| `Authorization` | 授权页 HTML 复制 | 24h 过期，到期前 EventBridge 自动刷新 ding 侧 access_token，但 MCP HMAC token 必须重新走授权 |
| `transport` | `streamable-http` | `sse` 也可，但 v0.2 默认 streamable |
| `timeout` | 60000ms | 长工具（如 ai_table.search 大表）可能超 30s |

## 试发消息验证

接入后在 Quick Desktop 聊天里说：

```
用 dingtalk 给群 chat_id=cidXXXXX 发一条 markdown，标题 "remote 链路通了"，正文一行 "from quick-dingtalk-mcp v0.2"。
```

预期：

1. Quick Desktop 调 `dingtalk_invoke` 工具（或直接 `im.send_to_chat`）。
2. 后端日志：`mcp-middleware` 报 `auth=ok userId=u_xxx tool=im.send_to_chat`，`AgentCore Runtime` 容器日志看到 `dws im.send_to_chat …` execFile。
3. 钉钉群里收到消息。

如果失败，看下文「故障排查矩阵」。

## 切换 Local / Remote

Quick Desktop 支持挂多个 MCP server。常见做法：

```json
{
  "mcpServers": {
    "dingtalk-local":  { "command": "node", "args": ["packages/local/server.mjs"] },
    "dingtalk-remote": { "transport": "streamable-http", "url": "https://.../mcp", "headers": {"Authorization": "Bearer ..."} }
  }
}
```

策略建议：

- 个人/敏感工具（如 calendar.create_event 占用本机日历）→ Local。
- 多人共享、需要审计的（im.send_to_chat 给客户群）→ Remote，DDB 留痕。
- 同时挂时给两个 server 不同的 `name`，让 Quick Desktop 在路由层选。

## token 过期处理

| 情况 | 表象 | 处理 |
|---|---|---|
| MCP HMAC 24h 过期 | `401 Unauthorized` body `{code:"hmac_expired"}` | 重新打开 `AuthorizeUrl`，复制新 token |
| ding access_token 临过期（< 5 分钟） | `503` `Retry-After: 30` | 等 EventBridge 30 分钟刷新 cron，或管理员 `bash packages/remote/scripts/ops.sh refresh` |
| ding refresh_token 失效（90 天未用） | `401` `{code:"reauth_required"}` | 必须重新走授权 URL |
| scope 不足 | `403` `{code:"permission_required", incrementalAuthUrl:"..."}` | 用户点响应里给的 IncrementalAuthUrl 加 scope，无需换 HMAC token |

## 故障排查矩阵

| 现象 | 可能原因 | 定位 |
|---|---|---|
| `401 invalid_signature` | Authorization 拼错 / HMAC 密钥被旋转 | 重新走授权；`aws ssm get-parameter --name /quick-dingtalk-mcp/hmac-key-version` 看版本 |
| `401 hmac_expired` | 24h 过期 | 重新授权 |
| `403 permission_required` | scope 不在已授 list | 看 response body 里 `incrementalAuthUrl`，让用户点开 |
| `429 Too Many Requests` | WAF 触发（IP 5min > 1000） | 看 CloudWatch metric `WAF.BlockedRequests`；正常用户改用 VPN/直连 |
| `503 Retry-After: 30` | ding token < 5min 过期且未刷 | 等 30s 重试；持续 503 → 跑 `ops.sh refresh` |
| `504 Gateway Timeout` | Runtime 容器冷启动 + dws 慢工具 | 看 `RuntimeStack` 容器日志；冷启动 1.5-3s 正常 |
| 工具调用 hang | semaphore=10 满 | 容器日志 `[semaphore] queue depth=10`；扩 `MAX_CONCURRENCY` |
| `tool_not_found` | `dingtalk_discover` 没列出来 | dws 版本不对；管理员 `bump-dws-version` |
| Quick Desktop 显示「无法连接」 | URL 写错或 CF 没起来 | `curl -i https://<cf>/healthz` 应回 200 |
| 钉钉端没收到消息 | userId 对应 ding 账号没群权限 | 让用户先在钉钉里被加进该群 |

排查通用三步：

1. `bash packages/remote/scripts/ops.sh status` —— 看 stack 是否健康。
2. `bash packages/remote/scripts/ops.sh logs mcp-middleware` —— 看请求是否到了网关。
3. `aws logs tail /aws/agentcore/runtime/quick-dingtalk-mcp --follow --region us-east-1` —— 看容器内部 dws 调用。

更深问题（容器内 SigV4 签名、KMS 解密失败）见 [remote-observability.md](./remote-observability.md) 的「错误归因 playbook」。
