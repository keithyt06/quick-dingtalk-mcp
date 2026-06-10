# Remote 端 FAQ

> 面向**用户和管理员**的常见问题，按「接入 / 安全 / 成本 / 运维」分组。新人接入请直接看 [新人首配（OAuth 向导版）](./remote-新人首配-oauth.md)。

## 接入

### Q1：Local 和 Remote 能同时用吗？

A：能。Local 是 stdio MCP（`packages/local/server.mjs` 进程内 wrap dws），Remote 是 HTTPS MCP（CloudFront → Lambda → AgentCore），两条独立链路，共用同一份 `packages/shared` catalog（261 条 dws 命令全集 + tier1 的 38 个对外工具定义）。

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

A：不必。钉钉个人账号也能授权，但能调用的工具受限——组织级接口（如企业通讯录搜索）需要企业管理员在钉钉开放平台给应用授权，个人账号调用会拿到权限错误（返回里带引导补授权的 `authorize_url`）。工具列表本身不按 scope 过滤——38 个工具都会显示，权限不足在调用时才报。

企业部署：管理员要在钉钉开放平台创建「企业内部应用」并申请对应权限。授权默认 scope 是 `openid corpid`；额外 scope 通过 `/authorize?extra_scope=...` 传入。

### Q3：Quick Desktop 之外的 MCP 客户端能用吗？

A：能。Remote 端是标准 [MCP Streamable HTTP](https://modelcontextprotocol.io/specification) transport（协议版本 2025-03-26，响应为 SSE 格式流），凡是支持的 client（Claude Code、Codex CLI、Cursor、自研 agent）都能挂。客户端要么支持 OAuth 向导（方式 A），要么支持自定义 `Authorization` header（方式 B）。

### Q4：scope 怎么填？

A：通常**不用填**。`/authorize` 默认带 `openid corpid`（dws 同款默认 scope，`corpid` 用于企业上下文），日常工具基本够用。要额外加 scope 用 `/authorize?extra_scope=...`（空格或逗号分隔）。

具体某个工具缺什么 scope，**不要猜**：调用时权限不足会返回 `permission_required` 错误，并附带一个 `authorize_url`——用户打开它补一次授权即可。各工具的精确 scope 字符串以钉钉的真实错误响应为准（项目约定：`config/oauth-scopes.json` 只从真实错误里回填，不发明 scope 名）。

## 安全

### Q5：用户 token 存在哪？泄露怎么办？

A：

- **MCP HMAC token**（用户拿到的那串）：客户端的责任，用户自己不要外传。Quick Desktop 写入本地 keychain。
- **ding access_token / refresh_token**：在 AWS Secrets Manager `quick-dingtalk-mcp/users/<userId>`，KMS 加密；只有两个 Lambda role 能读。

如果某个 mcpToken 怀疑泄露：管理员 `bash packages/remote/scripts/ops.sh revoke <userId>` 立即让该 token 失效，让用户重走授权拿新 token。

如果整个 HMAC 主密钥泄露（攻击者能伪造任意 mcpToken）：覆写 SSM `/qdm-remote/QdmRemoteOAuth/hmac-key` 为新随机值——所有老 token **立即**失效（无 grace 期），全员重新授权一次。详见 [remote-security.md](./remote-security.md#mcp-hmac-token--incrauthtoken-域分离)。

### Q6：部署在哪个 region？可以换吗？

A：默认 us-east-1，**可以换**——`AWS_REGION=<region> bash deploy.sh` 即可，前提是该 region 已上线 Bedrock AgentCore（已确认可用：us-east-1 / us-west-2 / ap-southeast-1 / eu-central-1 / ap-northeast-1 / eu-west-1）。唯一例外是可选的 WAF 栈：CloudFront-scope WebACL 是 AWS 硬约束，恒在 us-east-1。详见 [remote-deploy.md](./remote-deploy.md#选择部署-region)。

中国大陆用户访问 us-east-1 经过 CloudFront 边缘节点（含中国香港节点），端到端延迟通常在 200-400ms，日常使用可接受；也可以选 ap-southeast-1 / ap-northeast-1 等更近的 region 部署。

### Q7：可以自部署到自己的 AWS 账号吗？

A：可以，整个 stack 是 CDK，没有任何上游 SaaS 依赖。流程：

```bash
git clone https://github.com/keithyt06/quick-dingtalk-mcp
cd quick-dingtalk-mcp
npm install
bash packages/remote/scripts/deploy.sh
# deploy.sh 交互式询问钉钉 AppKey/AppSecret（AppSecret 写入 SSM SecureString
#   /qdm-remote/QdmRemoteOAuth/dingtalk-app-secret，AppKey 经 CDK context 传入）。
# 首次部署可用 --only-oauth 先拿到 CloudFront 域名、去钉钉开放平台注册
#   <域名>/callback 回调，再跑完整 deploy。
```

最低 IAM 权限：CDK bootstrap 已建的 `cdk-hnb659fds-*` role 之上，加 `bedrock-agentcore:*`、`secretsmanager:*`、`cloudfront:*`、`wafv2:*`、`ecr:*`。

### Q8：可以多 region 同时部署吗（异地容灾）？

A：单 region 部署可任选 region（见 Q6），但**不支持一套数据跨多 region 热备**。如果真有 region 级 SLA 需求，思路：主 region 跑全量；次 region 用 DDB Global Tables + SM cross-region replication 做只读副本；CloudFront origin failover 切流。成本翻倍、复杂度翻 3 倍，绝大多数团队不需要。

## 成本

### Q9：成本多少？

A：见 [remote-cost.md](./remote-cost.md) 的详细测算。摘要：

| 用户数 | 估算月成本 (USD) |
|---|---|
| 10 | < $10 |
| 100 | ~$54 |
| 1000 | ~$540（SM 合并优化后可压到 ~$130，优化未实现） |

百人以上量级最大头是 Secrets Manager（每用户 $0.40/月）和 CloudWatch Logs。开 WAF 多 ~$8。

## 运维

### Q10：没有 dws CLI 也能用吗？

A：不能。整个 Remote 容器的核心就是包 dws v1.0.32，工具调用最终翻译为 `execFile(dws, ...)`。dws 是钉钉官方开源 CLI（[`DingTalk-Real-AI/dingtalk-workspace-cli`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)），Dockerfile 从其 GitHub releases 下载对应架构的二进制（`ARG DWS_VERSION` 锁版本）；本机 Local 模式则 `npm install -g dingtalk-workspace-cli`。

如果未来要绕 dws 直接调钉钉 OpenAPI（比如 dws 停更或太慢），需要重写 `docker/server.js` 把每个工具映射到对应 OpenAPI endpoint，工作量大概 1 周。当前没必要。

### Q11：WAF 怎么开？默认开吗？

A：默认 **不开**，省 $5/月 + $0.6/M req。要开：

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteWaf -c enableWaf=true
```

开了之后 2 条规则上线（per-IP rate limit、AWSManagedRulesCommonRuleSet），WebACL 还需手动关联到 CloudFront Distribution（栈输出有提示），见 [remote-security.md WAF 速率限制](./remote-security.md#waf-速率限制)。生产 > 50 用户量级建议开。

### Q12：怎么升级到下一版？

A：

1. `git pull` 拿最新代码，看 release notes / commit log 是否有 breaking change
2. `bash packages/remote/scripts/deploy.sh`，CDK 自动 diff 后只更新有变化的资源
3. 跑 `bash packages/remote/scripts/test-e2e.sh` 验（单测 + synth），再手工验一次真实调用
4. 看 Dashboard `qdm-remote` 半小时无 spike 即可

回滚：`git checkout <prev-commit> && deploy.sh` 即可，CDK 会把资源回到老态。SM/DDB 数据不动。

### Q13：灾备方案？数据丢了怎么办？

A：见 [remote-operations.md 灾备](./remote-operations.md#灾备-ddb--sm-snapshot)。三层兜底：

1. DDB PITR 默认开，35 天内任意秒可恢复
2. SM 删除默认 30 天软删窗口（`--recovery-window-in-days` 可缩到 7 天）
3. 每周脚本导出加密 blob 到离线介质（手动）

最坏情况整 stack 删了：用 PITR + SM 备份重建，丢失数据 = 最近一次备份到事故时刻之间。日常用户重新走 `AuthorizeUrl` 即可重置。

### Q14：怎么删某用户？

A：两种语义不同的「删」：

- 撤销访问（保留软删窗口，默认 30 天，可 `restore-secret` 反悔）：`bash packages/remote/scripts/ops.sh revoke <userId>`
- 立即彻底删：

```bash
aws secretsmanager delete-secret \
  --secret-id quick-dingtalk-mcp/users/<userId> \
  --force-delete-without-recovery --region <部署region>
```

该用户在 DDB `OAuthStateTable` 里的 `refresh#` 记录（方式 A 的 refresh token）会在续期时因 `needs_reauth`/secret 缺失被拒绝并删除，也会随 90 天 TTL 自然过期，无需手动清。

### Q15：调试技巧？

A：从快到慢：

1. **看 Dashboard `qdm-remote` 哪块红** —— 板块直接告诉你出在入口、Lambda、OAuth 还是 Runtime
2. **`bash packages/remote/scripts/ops.sh logs <fn>`** —— 实时看 Lambda 日志
3. **`aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT --follow --region us-east-1`** —— 看容器
4. **CW Logs Insights 常用查询**（见 [remote-observability.md](./remote-observability.md#cloudwatch-logs-insights-常用查询)）—— 错误聚类、401 原因切片
5. **本地 reproduce**：拿到出错请求的 input，在 `packages/local/server.mjs` 里直接喂给 dws，能快速判断是 dws 锅还是网络锅
6. **打印 SigV4 签名前/后的 canonical request**：在 mcp-middleware Lambda 临时加 `console.log(JSON.stringify(canonicalRequest))`，看是不是签错了
7. **AgentCore 容器进入**：暂不支持（不是 ECS Exec），只能靠日志
