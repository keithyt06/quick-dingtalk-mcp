# Remote 端安全模型

> v0.2 Remote 多用户 HTTPS MCP 的信任边界、密钥层级、威胁模型与已知薄弱项。

## 信任边界图

```
[ End user / Quick Desktop ]    域 A：用户终端
            | TLS 1.2+, Authorization: Bearer <hmac>
            v
[ CloudFront edge ]             域 B：AWS 托管边缘
            | (optional WAFv2 us-east-1 CloudFront-scope)
            v
[ API Gateway HTTP API ]        域 C：HTTPS 入口
            | invoke Lambda
            v
[ mcp-middleware Lambda ]       域 D：HMAC 校验 + 路由
            | SigV4
            v
[ AgentCore Runtime ]           域 E：托管多租 runtime
            | invoke container
            v
[ Container (docker/server.js) ]  域 F：单容器多用户 (DWS_CONFIG_DIR/<uid>)
            | execFile dws
            v
[ dws CLI v1.0.32 ]             域 G：本地 CLI，HTTPS 出网
            | OAuth2 access_token
            v
[ DingTalk Open API ]           域 H：钉钉
```

每条边都是 trust boundary，每跳都重新做一次鉴权或上下文切换：

| Edge | 鉴权机制 | 风险点 |
|---|---|---|
| A→B | 公网 TLS（CloudFront 默认证书 / 自定义域 ACM） | 客户端 TLS 拦截；Quick Desktop 写入文件的 token |
| B→C | CloudFront → API GW 用 OAC (Origin Access Control) header | API GW URL 泄露绕过 CF |
| C→D | API GW → Lambda 默认 IAM | API 不在 VPC，Lambda 只能被该 API 触发 |
| D→E | Lambda role assume → SigV4 to AgentCore | Lambda role 被滥用 |
| E→F | AgentCore 内部信任 | 容器逃逸（基本不存在，节点级） |
| F→G | execFile + DWS_CONFIG_DIR 隔离 | 同容器内多用户串号 |
| G→H | OAuth2 access_token | 钉钉侧 token 滥用 |

## MCP HMAC token + incrAuthToken 域分离

所有用户态 token 都是 **HMAC-SHA256 派生**，不是 JWT，不可在客户端解出 payload 以外的东西。

| Token | 主密钥位置 | 用途 | 生命周期 | scope |
|---|---|---|---|---|
| `mcpToken` | SSM `/quick-dingtalk-mcp/hmac-key-mcp`（KMS） | Authorization: Bearer 调用 `/mcp` | 24h | 全部已授权 dingtalk scope |
| `incrAuthToken` | SSM `/quick-dingtalk-mcp/hmac-key-incr`（KMS） | 调用 `/authorize?incremental=1` 加 scope | 10 分钟 | 只能签 OAuth state，不能调 mcp |

**域分离**：两把 HMAC 主密钥不同 key id，alarm-webhook Lambda 可单独旋转 `incr` 而不重置全部用户 mcp token。一旦发现某用户的 mcpToken 被滥用：

1. `ops.sh revoke <userId>` 删除 SM secret + DDB 映射
2. 用户必须重新走 `AuthorizeUrl`，老 token 在下次 verify 时找不到 secret，自动 401

主密钥旋转：把 SSM 参数版本 +1，Lambda env `HMAC_KEY_VERSION` 跟着升；老 token 进 grace period（默认 24h）后失效。

token payload（base64url 编码）：

```json
{
  "uid": "u_5f23a8b1c4",
  "ver": 3,
  "exp": 1735689600,
  "scopes": ["Contact.User.Read", "im.message.send_to_chat"]
}
```

签名段拼 `sha256(hmac_key_v<ver> || payload)`。

## SM + KMS 加密

每个 userId 一个 secret：`quick-dingtalk-mcp/users/<userId>`。

| 项 | 值 |
|---|---|
| KMS key | 默认 `alias/aws/secretsmanager`（AWS-managed）；可在 OAuthStack `kmsKeyArn` 上下文传 CMK |
| 字段 | `{ access_token, refresh_token, expires_at, ding_user_id, scope, granted_at }` |
| 删除策略 | `RecoveryWindowInDays: 7`（软删；`ops.sh revoke` 可强制 0 天） |
| 访问 | 仅 `mcp-middleware` Lambda role 和 `token-refresh-shim` Lambda role 有 `secretsmanager:GetSecretValue`；按 secret name 前缀范围 |

container（Runtime）侧不直接读 SM——它收到 Lambda 已经解出来的 access_token，避免 IAM 给容器太多权限。这是与 lark-mcp-on-agentcore 的一个关键差异：lark 让容器自己掏 token，运维更简单但 IAM 面积更大。

## PKCE OAuth state 防重放

`/authorize` Lambda：

```
code_verifier = random_urlsafe(64)
code_challenge = base64url(sha256(code_verifier))
state = random_urlsafe(32)
ddb.put({ pk: state, code_verifier, scope, ttl: now+600 })
redirect → dingtalk.com/oauth2/authorize?code_challenge=...&state=...
```

`/callback` Lambda：

```
ddb.consume(state)  // ConditionExpression: attribute_exists + delete in same txn
  fail → 400 invalid_state
  ok   → exchange code with code_verifier
```

防御：

- **state 一次性**：DDB 条件删除，重放即 400
- **TTL 10 分钟**：DDB TTL 自动清理过期 state
- **PKCE**：钉钉侧也校验 code_challenge，防 code 截获换 token

## SigV4 链路签名

mcp-middleware → AgentCore：用 Lambda role 签 SigV4 调 `bedrock-agentcore:InvokeAgentRuntime`。

容器 `docker/server.js` 收到的 invocation 已带 SigV4 上下文，但容器内 `provisionUserConfig(uid, accessToken)` **只信 Lambda 注入的 payload**，不再回查 SM。这避免了容器持有 SM/KMS 权限。

容器 IAM role 只允许：

- 写自己 stdout/stderr 到 CloudWatch Logs
- `bedrock-agentcore:GetInvocationContext`（读自己的 payload）
- 没有任何对外 AWS API 权限

## WAF 速率限制

可选启用（`WafStack`，us-east-1 CloudFront-scope WAFv2）：

| 规则 | 阈值 | 动作 |
|---|---|---|
| RateLimit per-IP | 5 分钟内 > 1000 reqs | Block 5 分钟 |
| AWSManagedRulesCommonRuleSet | OWASP top 10 | Count（先观察） |
| AWSManagedRulesKnownBadInputsRuleSet | known bad inputs | Block |
| BodySizeLimit | request body > 1MB | Block 413 |

启用方式：

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteWaf --context wafEnabled=true
```

不启用 WAF 时，CloudFront 仍有默认抗 DDoS（Shield Standard），但 application-layer 没限速。

## 容器隔离

`docker/server.js` 是单容器多用户。隔离手段：

1. **DWS_CONFIG_DIR**：每个 invocation 改 `process.env.DWS_CONFIG_DIR=/var/dws/users/<uid>` 后 execFile dws，dws 把 token、缓存、cookie 都写这个 dir。
2. **execFile 不 spawn shell**：`execFile(dws, args, { env })`，args 数组传，避免命令注入。
3. **semaphore=10**：`MAX_CONCURRENCY` 限制同时跑的 dws 进程数，超了排队 30s 后 503。
4. **USER node 非 root**：Dockerfile 末尾 `USER node`，写 `/var/dws` 走 `chown node:node /var/dws`。
5. **/tmp 隔离**：每 invocation 结束后 `rm -rf /var/dws/users/<uid>/cache/`（保留 token），防 disk 累积。

依旧存在的薄弱：同容器内进程级隔离（不是 VM/microVM 级），见下文 STRIDE。

## STRIDE 威胁模型

| 类别 | 威胁 | 缓解 | 残余风险 |
|---|---|---|---|
| **S**poofing | 伪造他人 mcpToken | HMAC 主密钥 KMS + SSM SecureString，Lambda role 范围限制 | 低；主密钥泄露需要 root account |
| | 伪造 ding callback | state 一次性、PKCE、CloudFront → API GW OAC | 极低 |
| **T**ampering | 篡改请求 body | TLS + CloudFront OAC + body 1MB 限 | 低 |
| | 篡改容器镜像 | ECR image scan + immutable tag + AgentCore digest pinning | 低；ECR 账号被攻陷除外 |
| **R**epudiation | 用户否认操作 | DDB audit log: `userId, tool, args_hash, ts` | 中；args 不全存（隐私）只 hash |
| **I**nformation Disclosure | secret 泄露 | KMS、Secrets Manager、Lambda env 不写 token | 低；CW Logs 误打 token 是历史踩坑点，已加 redact 中间件 |
| | 跨用户串号 | DWS_CONFIG_DIR + provisionUserConfig 强制刷 env | **中**；inject-token D2 (`dws auth-import`) 要求 dws 不缓存全局 |
| **D**oS | 单 IP 灌爆 | WAF rate limit + API GW throttle + AgentCore concurrency | 中；不开 WAF 时 API GW $1/M 也是钱 |
| | 烧 ding API quota | 容器 semaphore=10 + ding 侧 per-app rate | 中；恶意用户可烧光企业额度 |
| **E**levation of Privilege | 容器逃逸 | AgentCore 节点托管，单容器 USER node | 低；依赖 AWS 边界 |
| | Lambda role 横向 | 三个 Lambda role 完全分离（refresh / middleware / alarm） | 低 |

## 已知薄弱项

记录在案、Plan 3 待修：

1. **inject-token D2 串号风险**：默认走 `dws auth-import` 把 token 文件写 `DWS_CONFIG_DIR`。如果 dws 内部有全局缓存（v1.0.32 已确认无），同容器多用户切换时可能读到上一个用户。Plan 3 要做 D2 PoC 验证，并保留 D1（直接写 file-DEK）作为 fallback。可通过 `INJECT_STRATEGY=D1|D2|D3` 切换。
2. **mcpToken 24h 不可单独撤销**：撤销靠 SM secret 删除（懒失效）。要做即时黑名单需要加 DDB allowlist 表，每个请求查一次，会加 ~5ms 延迟，目前未做。
3. **WAF 关掉时无 application-layer 限速**：deploy.sh 默认 `wafEnabled=false`（省 $5/月），生产建议开。
4. **CloudFront → API GW 用 header 校验 OAC**，`x-cloudfront-secret` SSM 取，泄露则 CF 可被绕过。每次 deploy 自动旋转。
5. **alarm-webhook → 钉钉群 webhook 是明文**：webhook URL 在 SSM SecureString，但群里看到的告警卡片含 stack name，泄露给非运维成员可能暴露内部 stack 命名。
6. **没做 IP allowlist**：Plan 3 拟加 `ALLOWED_CIDRS` ENV，企业部署可锁内网出口。

## 与 lark-mcp-on-agentcore 的差异

| 维度 | lark-mcp-on-agentcore | quick-dingtalk-mcp v0.2 |
|---|---|---|
| token 存储 | 容器内 SM 自取 | Lambda 取后注入 payload，容器无 SM 权限 |
| 域分离 | 单 HMAC | mcp + incr 两把 HMAC |
| state 防重放 | TTL only | TTL + 条件删除 |
| 限速 | API GW throttle | 可选 WAF + API GW throttle |
| 配置隔离 | per-container | per-invocation DWS_CONFIG_DIR |
