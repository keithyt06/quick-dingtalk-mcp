# Remote 端安全模型

> 面向**安全评审者与管理员**。v0.2 Remote 多用户 HTTPS MCP 的信任边界、密钥层级、威胁模型与已知薄弱项。

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
| B→C | 无源站鉴权（CloudFront 直转 API GW，未做 OAC/秘密头） | **API GW 直连 URL 可绕过 CloudFront/WAF**（见已知薄弱项 #4） |
| C→D | API GW → Lambda 默认 IAM | API 不在 VPC，Lambda 只能被该 API 触发 |
| D→E | Lambda role assume → SigV4 to AgentCore | Lambda role 被滥用 |
| E→F | AgentCore 内部信任 | 容器逃逸（基本不存在，节点级） |
| F→G | execFile + DWS_CONFIG_DIR 隔离 | 同容器内多用户串号 |
| G→H | OAuth2 access_token | 钉钉侧 token 滥用 |

## MCP HMAC token + incrAuthToken 域分离

所有自签的用户态 token 都是 **HMAC-SHA256 签名**，不是 JWT，客户端改不了 payload（改了验签即失败）。OAuth 路径的 refresh token 是另一类：服务端有状态的不透明随机串（存 DDB，详见下文 PKCE 节）。

| Token | 签名密钥 | 用途 | 生命周期 |
|---|---|---|---|
| OAuth access token（方式 A） | 同一把 HMAC 主密钥，domain=`mcp` | Authorization: Bearer 调用 `/mcp` | 1h（Quick 用 refresh_token 自动续） |
| `mcpToken`（方式 B HTML fallback） | 同一把 HMAC 主密钥，domain=`mcp` | Authorization: Bearer 调用 `/mcp` | ~13 个月硬上限；实际有效性由 90 天活跃窗口判定 |
| `incrAuthToken` | 同一把 HMAC 主密钥，domain=`incr` | `/authorize?t=...` 增量加 scope | 10 分钟；只能开 OAuth 授权流，不能调 `/mcp` |

**域分离**：只有一把 HMAC 主密钥（SSM SecureString `/qdm-remote/QdmRemoteOAuth/hmac-key`），但签名输入带 domain 前缀（`mcp:` / `incr:`），且 verify 时校验 token 第一段的 domain 标识——incr token 拿去调 `/mcp` 直接被拒（domain 不符；即便篡改 domain 段，签名绑定了 domain 也会验签失败），反之亦然。

token 格式：`base64url(domain).base64url(payload).hex(sig)`，payload 为：

```json
{ "d": "mcp", "uid": "u_5f23a8b1c4", "exp": 1735689600 }
```

（incr token 额外带 `scopes` 数组。）scope 不进 mcp token——实际可调什么由后端按该用户钉钉 access_token 的真实授权决定。

一旦发现某用户的 mcpToken 被滥用：

1. `ops.sh revoke <userId>` 删除该用户的 SM secret
2. 老 token 在下次 verify 时找不到 secret，自动 401；用户重走 `AuthorizeUrl` 即可恢复

主密钥旋转：`aws ssm put-parameter --overwrite` 写入新值。**没有版本号/grace 机制**——Lambda 拿到新 key 后全部存量 token 立即失效（全员重新授权），仅在怀疑主密钥泄露时使用。注意 Lambda 进程内缓存 key，需触发冷启才完全生效。

## SM + KMS 加密

每个 userId 一个 secret：`quick-dingtalk-mcp/users/<userId>`。

| 项 | 值 |
|---|---|
| KMS key | `alias/aws/secretsmanager`（AWS-managed） |
| 字段 | `{ access_token, refresh_token, expires_at, scope, needs_reauth?, last_active? }`（钉钉侧 token + 活跃窗口元数据） |
| 删除策略 | 默认 30 天恢复窗口（AWS DeleteSecret 默认值；未显式传 `RecoveryWindowInDays`）；要立即清走 CLI `--force-delete-without-recovery` |
| 访问 | `mcp-middleware`（Get + Put，Put 仅为回写 `last_active`）与 `token-refresh-shim`（读写 + 账号级 ListSecrets）按 secret name 前缀授权 |

container（Runtime）侧运行时不读 SM——它收到的是 mcp-middleware 已解出、经 `x-user-access-token` 头注入的 access_token。这是与 lark-mcp-on-agentcore 的一个关键差异：lark 让容器自己掏 token，运维更简单但 IAM 面积更大。（注：当前 Runtime role 仍保留了一条 `secretsmanager:GetSecretValue` 授权，代码路径未使用，属可收紧项。）

## PKCE OAuth state 防重放

`/authorize` Lambda（对钉钉的内层流）：

```
code_verifier = random(PKCE)
code_challenge = base64url(sha256(code_verifier))
state = random(16 bytes, base64url)
ddb.put({ state, payload:{verifier, scopes, oauthSessionId?}, ttl: now+300 })   # 5 分钟
redirect → login.dingtalk.com/oauth2/auth?code_challenge=...&state=...&prompt=consent
```

`/callback` Lambda：

```
consumeState(state)  // 原子 DeleteItem(ReturnValues=ALL_OLD)：读取即销毁，并发兑换只有一个能赢；代码内校验 ttl（不只靠 DDB TTL 的 best-effort 清理）
  fail → 400 state expired or unknown
  ok   → 用 code_verifier + AppSecret 换钉钉 token
```

外层（对 Quick 等 MCP 客户端）是另一套独立 OAuth 2.1：强制 PKCE S256，授权码 `code#`（5 分钟、一次性）、会话 `sess#`（10 分钟）、refresh token `refresh#`（90 天、**有状态不透明串、每次使用即轮换**——旧串重放时已被删除，天然具备 OAuth 2.1 重用检测）。全部记录复用同一张 `OAuthStateTable`（RETAIN + PITR）。

防御汇总：

- **state / code 一次性**：用后即删，重放即 400；TTL 在代码内强制校验（DDB TTL 删除可能滞后数小时）
- **refresh token 轮换**：泄露的旧 refresh token 在合法客户端续期一次后即失效
- **PKCE 双层**：外层校验 Quick 的 code_verifier；内层向钉钉发 code_challenge（钉钉侧是否强制校验待实测确认）
- **`?t=`（增量授权）与 OAuth 参数互斥**：防止用 incr token 绕过钉钉同意页为任意 client 铸 code
- **DCR 限速**：`POST /register` 1 rps / burst 10，防匿名灌表

## SigV4 链路签名

mcp-middleware → AgentCore：用 Lambda role 签 SigV4 调 `bedrock-agentcore:InvokeAgentRuntime`。

容器 `docker/server.js` 收到的请求已由 AgentCore 平台完成 SigV4 验证；容器内的 token 注入**只信 mcp-middleware 经 `x-user-id` / `x-user-access-token` 头传来的值**，运行时不回查 SM。

容器 IAM role 只允许：

- 写自己 stdout/stderr 到 CloudWatch Logs
- 从 bootstrap ECR 拉镜像
- 一条按前缀范围的 `secretsmanager:GetSecretValue`（当前代码路径未使用，可收紧）

## WAF 速率限制

可选启用（`WafStack`，us-east-1 CloudFront-scope WAFv2），当前 2 条规则：

| 规则 | 阈值 | 动作 |
|---|---|---|
| rate-limit-per-ip | 滑动 5 分钟窗口内 > 1000 reqs/IP | Block |
| AWSManagedRulesCommonRuleSet | OWASP 常见攻击 | 按托管规则默认动作 |

启用方式：

```bash
cd packages/remote/infra
npx cdk deploy QdmRemoteWaf -c enableWaf=true
```

注意：WebACL 创建后需手动关联到 OAuthStack 的 CloudFront Distribution（跨 region 关联 CDK 暂未自动化，栈输出里有提示）。不启用 WAF 时，CloudFront 仍有默认抗 DDoS（Shield Standard），但 application-layer 没限速。

## 容器隔离

`docker/server.js` 是单容器多用户。隔离手段：

1. **DWS_CONFIG_DIR**：每个用户独立 `/var/dws/users/<uid>`，dws 的 token、缓存都写各自目录（注入策略 `INJECT_STRATEGY=d2`，即 `dws auth login --token`，已实测）。
2. **execFile 不 spawn shell**：args 数组传参，避免命令注入。
3. **semaphore**：`MAX_CONCURRENT`（默认 10）限制同时跑的 dws 进程数，超出排队等待。
4. **USER node 非 root**：Dockerfile 末尾 `USER node`，`/var/dws` 已 `chown node:node`。

依旧存在的薄弱：同容器内进程级隔离（不是 VM/microVM 级），见下文 STRIDE。

## STRIDE 威胁模型

| 类别 | 威胁 | 缓解 | 残余风险 |
|---|---|---|---|
| **S**poofing | 伪造他人 mcpToken | HMAC 主密钥 KMS + SSM SecureString，Lambda role 范围限制 | 低；主密钥泄露需要 root account |
| | 伪造 ding callback | state 一次性 + 代码内 TTL 校验、PKCE | 极低 |
| **T**ampering | 篡改请求 body | TLS 全链路 + HMAC 验签 | 低 |
| | 篡改容器镜像 | 镜像存 CDK bootstrap ECR，AgentCore 按 image digest 引用 | 低；ECR 账号被攻陷除外 |
| **R**epudiation | 用户否认操作 | Lambda/容器结构化日志含 userId（CloudWatch Logs，默认保留） | 中；**无独立 audit 表**，依赖日志保留期 |
| **I**nformation Disclosure | secret 泄露 | KMS、Secrets Manager、结构化日志不打 token 字段 | 低；新增日志时注意勿打 token（无自动 redact 中间件兜底） |
| | 跨用户串号 | DWS_CONFIG_DIR + 每用户独立注入（D2 `dws auth login --token`） | **中**；依赖 dws 无全局缓存（v1.0.32 已确认无） |
| **D**oS | 单 IP 灌爆 | WAF rate limit + API GW throttle + AgentCore concurrency | 中；不开 WAF 时 API GW $1/M 也是钱 |
| | 烧 ding API quota | 容器 semaphore=10 + ding 侧 per-app rate | 中；恶意用户可烧光企业额度 |
| **E**levation of Privilege | 容器逃逸 | AgentCore 节点托管，单容器 USER node | 低；依赖 AWS 边界 |
| | Lambda role 横向 | 三个 Lambda role 完全分离（refresh / middleware / alarm） | 低 |

## 已知薄弱项

记录在案、待修：

1. **inject-token D2 依赖 dws 行为**：默认 `INJECT_STRATEGY=d2`（`dws auth login --token` 写各用户的 `DWS_CONFIG_DIR`），依赖 dws 没有跨目录的全局缓存（v1.0.32 已确认无）。dws 升版本时需重验；D1（直接写加密 token 文件）当前是 stub，不可用作即时 fallback。
2. **token 不可单独即时撤销**：撤销靠删 SM secret（懒失效，下一次请求才 401）。要做即时黑名单需要加 DDB allowlist 表，每个请求查一次，会加 ~5ms 延迟，目前未做。
3. **WAF 关掉时无 application-layer 限速**：deploy.sh 默认不开 WAF（省 ~$6/月），生产建议开。
4. **CloudFront → API GW 无源站鉴权**：API GW 的 `execute-api` 直连 URL 若被发现，可绕过 CloudFront（以及 WAF）直接打到后端——HMAC 鉴权仍然有效，但限速/防护层失效。待加 OAC 或秘密头校验。
5. **alarm-webhook → 钉钉群 webhook 卡片含 alarm 名等内部信息**：webhook URL 在部署时以 context 传入，告警卡片泄露给非运维成员可能暴露内部命名。
6. **没做 IP allowlist**：企业部署如需锁内网出口，待加 `ALLOWED_CIDRS`。

## 与 lark-mcp-on-agentcore 的差异

| 维度 | lark-mcp-on-agentcore | quick-dingtalk-mcp v0.2 |
|---|---|---|
| token 存储 | 容器内 SM 自取 | Lambda 取后经头注入，容器运行时不读 SM |
| 域分离 | 单 HMAC 单用途 | 一把主密钥、`mcp`/`incr` 双域签名分离 |
| state 防重放 | TTL only | 用后即删 + 代码内 TTL 校验 |
| 限速 | API GW throttle | 可选 WAF + DCR 路由级 throttle |
| 配置隔离 | per-container | per-user DWS_CONFIG_DIR |
