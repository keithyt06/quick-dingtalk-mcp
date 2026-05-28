# Remote 端 FAQ

> 15 个最常被问的问题，按「接入 / 安全 / 运维 / 调试」分组。

## 接入

### Q1：Local 和 Remote 能同时用吗？

A：能。Local 是 stdio MCP（`packages/local/server.mjs` 进程内 wrap dws），Remote 是 HTTPS MCP（CloudFront → Lambda → AgentCore），两条独立链路，共用同一份 `packages/shared/catalog.json`（38 工具白名单 + tier1 元数据）。

Quick Desktop 配置里挂两个 server，name 不同即可：

```json
{
  "mcpServers": {
    "dingtalk-local":  { "command": "node", "args": ["packages/local/server.mjs"] },
    "dingtalk-remote": { "transport": "streamable-http", "url": "https://.../mcp", "headers": {"Authorization": "Bearer ..."} }
  }
}
```

### Q2：要钉钉企业账号才能用吗？

A：不必。钉钉个人账号也能授权，但能调用的工具受限——比如 `corp.contact.search` 需要企业管理员授应用 scope，个人账号会拿到 403。`dingtalk_discover` 在容器内会按当前 access_token 的实际 scope 过滤工具列表，所以前端看到的工具数会少。

企业部署：管理员要在钉钉开放平台创建「企业内部应用」，把 `Contact.User.Read`、`im.message.send_to_chat`、`workspace.calendar` 等 scope 申请下来，才能在 `AuthorizeUrl` 的 `scope=` 参数里写。

### Q3：Quick Desktop 之外的 MCP 客户端能用吗？

A：能。Remote 端是标准 [MCP 0.2 Streamable HTTP](https://modelcontextprotocol.io/specification) transport，凡是支持的 client（Claude Code、Codex CLI、Cursor、自研 agent）都能挂。需要客户端支持 `Authorization` header 自定义。SSE transport 也兼容（同一端点 `Accept: text/event-stream` 自动协商）。

### Q4：scope 怎么填？

A：在 `AuthorizeUrl` 的 `?scope=` 参数里，用逗号分隔。常用：

| Scope | 用途 |
|---|---|
| `Contact.User.Read` | 读取自己的用户信息（必带） |
| `Contact.User.Read.All` | 读企业通讯录 |
| `im.message.send_to_chat` | 发群消息 |
| `im.chat.list` | 列群 |
| `workspace.calendar` | 日历读写 |
| `corp.workflow.send` | 触发审批 |
| `corp.attendance.read` | 考勤读取 |

不会列举所有 38 工具的 scope 需求；调用时如果 scope 不够会返回 `403 permission_required` 带 `incrementalAuthUrl`，让用户加授就好。详见 [remote-quick-desktop.md token 过期处理](./remote-quick-desktop.md#token-过期处理)。

## 安全

### Q5：用户 token 存在哪？泄露怎么办？

A：

- **MCP HMAC token**（用户拿到的那串）：客户端的责任，用户自己不要外传。Quick Desktop 写入本地 keychain。
- **ding access_token / refresh_token**：在 AWS Secrets Manager `quick-dingtalk-mcp/users/<userId>`，KMS 加密；只有两个 Lambda role 能读。

如果某个 mcpToken 怀疑泄露：管理员 `bash packages/remote/scripts/ops.sh revoke <userId>` 立即让该 token 失效，让用户重走授权拿新 token。

如果整个 HMAC 主密钥泄露（攻击者能伪造任意 mcpToken）：旋转 SSM `/quick-dingtalk-mcp/hmac-key-mcp` 到 v+1，把 `HMAC_KEY_VERSION` Lambda env 升上去，所有老 token grace 24h 后失效。详见 [remote-security.md](./remote-security.md#mcp-hmac-token--incrauthtoken-域分离)。

### Q6：Region 为什么锁 us-east-1？

A：

1. AgentCore Runtime 当前仅在 us-east-1 GA。
2. CloudFront WAF（CLOUDFRONT scope）必须在 us-east-1。
3. 同 region 部署延迟最低、跨 region IAM/SM/SSM 拉数据会增加延迟和成本。

中国大陆用户访问 us-east-1 经过 CloudFront 边缘节点（含中国香港节点），实测端到端 200-400ms 可接受。Plan 3 视 AgentCore 推广到其他 region 再考虑多 region 部署。

### Q7：可以自部署到自己的 AWS 账号吗？

A：可以，整个 stack 是 CDK，没有任何上游 SaaS 依赖。流程：

```bash
git clone https://github.com/<org>/quick-dingtalk-mcp
cd quick-dingtalk-mcp
npm install
# 准备钉钉应用 client_id + client_secret 写入 SSM SecureString
aws ssm put-parameter --name /quick-dingtalk-mcp/ding-client-id --type SecureString --value <id>
aws ssm put-parameter --name /quick-dingtalk-mcp/ding-client-secret --type SecureString --value <sec>
bash packages/remote/scripts/deploy.sh
```

最低 IAM 权限：CDK bootstrap 已建的 `cdk-hnb659fds-*` role 之上，加 `bedrock-agentcore:*`、`secretsmanager:*`、`cloudfront:*`、`wafv2:*`、`ecr:*`。

### Q8：可以多 region 部署吗？

A：v0.2 不支持原生多 region。如果一定要做，思路：

1. 主 region us-east-1 跑全量
2. 次 region 跑只读 read replica（DDB Global Tables、SM 的 cross-region replication）
3. CloudFront 用 origin failover 切到次 region 的 API GW
4. 但 AgentCore Runtime 不支持跨 region 复制，次 region 的 Runtime 必须等 AgentCore 在该 region GA

成本翻倍、复杂度翻 3 倍，不建议除非真有 region 级 SLA 需求。

## 成本

### Q9：成本多少？

A：见 [remote-cost.md](./remote-cost.md) 的详细测算。摘要：

| 用户数 | 估算月成本 (USD) |
|---|---|
| 10 | < $10 |
| 100 | ~$30 |
| 1000 | ~$200 |

最大头是 AgentCore Runtime 的容器时长 + CloudWatch Logs。开 WAF 多 $5。

## 运维

### Q10：没有 dws CLI 也能用吗？

A：不能。整个 Remote 容器的核心就是包 dws v1.0.32，`dingtalk_invoke` 翻译为 `execFile(dws, ...)`。dws 是闭源 CLI，但 npm 公开发布（`@alicloud/dws-cli`），Dockerfile 里 `npm i -g @alicloud/dws-cli@1.0.32`。

如果未来要绕 dws 直接调钉钉 OpenAPI（比如 dws 停更或太慢），需要重写 `docker/server.js` 把每个工具映射到对应 OpenAPI endpoint，工作量大概 1 周。当前没必要。

### Q11：WAF 怎么开？默认开吗？

A：默认 **不开**，省 $5/月 + $0.6/M req。要开：

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteWaf --context wafEnabled=true
```

开了之后 4 条规则上线（IP rate limit、CommonRuleSet、KnownBadInputs、BodySizeLimit），见 [remote-security.md WAF 速率限制](./remote-security.md#waf-速率限制)。生产 > 50 用户量级建议开。

### Q12：怎么升级到下一版？

A：

1. `git pull` 拿最新代码
2. 看 `CHANGELOG.md` 是否有 breaking change
3. `bash packages/remote/scripts/deploy.sh`，CDK 自动 diff 后只更新有变化的资源
4. 跑 `bash packages/remote/scripts/test-e2e.sh` 验
5. 看 Dashboard 板块 5 半小时无 spike 即可

回滚：`git checkout <prev-tag> && deploy.sh` 即可，CDK 会把资源回到老态。SM/DDB 数据不动。

### Q13：灾备方案？数据丢了怎么办？

A：见 [remote-operations.md 灾备](./remote-operations.md#灾备-ddb--sm-snapshot)。三层兜底：

1. DDB PITR 默认开，35 天内任意秒可恢复
2. SM 默认 7 天软删（可调到 30 天）
3. 每周脚本导出加密 blob 到离线介质（手动）

最坏情况整 stack 删了：用 PITR + SM 备份重建，丢失数据 = 最近一次备份到事故时刻之间。日常用户重新走 `AuthorizeUrl` 即可重置。

### Q14：怎么删某用户？

A：两种语义不同的「删」：

- 撤销访问（保留软删窗口）：`bash packages/remote/scripts/ops.sh revoke <userId>`
- 立即彻底删：

```bash
aws secretsmanager delete-secret \
  --secret-id quick-dingtalk-mcp/users/<userId> \
  --force-delete-without-recovery --region us-east-1
aws dynamodb delete-item --table-name QdmRemoteOAuth-Users \
  --key '{"userId":{"S":"<userId>"}}' --region us-east-1
```

第二条删 DDB 是为了清掉 audit log 索引；audit log 自身按 TTL 自然过期。

### Q15：调试技巧？

A：从快到慢：

1. **看 Dashboard 哪块红** —— 90% 问题板块直接告诉你出在 OAuth 还是 Runtime 还是 Lambda
2. **`bash packages/remote/scripts/ops.sh logs <fn>`** —— 实时看 Lambda 日志
3. **`aws logs tail /aws/agentcore/runtime/quick-dingtalk-mcp --follow`** —— 看容器
4. **CW Logs Insights 5 条常用查询**（见 [remote-observability.md](./remote-observability.md#cloudwatch-logs-insights-5-条常用查询)）—— 切片错误、按用户回放
5. **本地 reproduce**：拿到出错请求的 input，在 `packages/local/server.mjs` 里直接喂给 dws，能快速判断是 dws 锅还是网络锅
6. **打印 SigV4 签名前/后的 canonical request**：在 mcp-middleware Lambda 临时加 `console.log(JSON.stringify(canonicalRequest))`，看是不是签错了
7. **AgentCore 容器进入**：暂不支持（不是 ECS Exec），只能靠日志。Plan 3 拟加 trace dump endpoint
