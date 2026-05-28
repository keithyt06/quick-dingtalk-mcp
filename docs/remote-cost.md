# Remote 端成本估算

> us-east-1 价格（2026 年 5 月数据），三档用户量月度估算 + 单价表 + 优化清单 + Free Tier 覆盖。

## 月度估算（三档）

假设单用户每天 100 次工具调用，5% 触发 OAuth 刷新，30% 命中工具是 ai_table 之类长任务（容器 800ms）。

### 10 用户 / 30k 调用/月

| 项 | 单价 | 数量/月 | 月成本 (USD) |
|---|---|---|---|
| API Gateway HTTP | $1.00 / M req | 30k | $0.03 |
| Lambda invoke (mcp-middleware) | $0.20 / M | 30k | $0.006 |
| Lambda compute (256MB, ~80ms avg) | $0.0000166667 / GB-s | 600 GB-s | $0.01 |
| Lambda token-refresh (cron + OAuth) | — | ~3k | $0.01 |
| AgentCore Runtime invoke | $0.30 / M | 30k | $0.009 |
| AgentCore container time (1vCPU/2GB, 500ms avg) | ~$0.05 / vCPU-h | ~4 vCPU-h | $0.20 |
| Secrets Manager | $0.40 / secret / month | 10 | $4.00 |
| Secrets Manager API calls | $0.05 / 10k | 30k | $0.15 |
| DynamoDB writes | $1.25 / M | 1k | $0.001 |
| DynamoDB reads | $0.25 / M | 30k | $0.008 |
| DynamoDB storage | $0.25 / GB / month | < 0.1 GB | $0.03 |
| CloudWatch Logs ingest | $0.50 / GB | 2 GB | $1.00 |
| CloudWatch Logs storage | $0.03 / GB / month | 2 GB (30d) | $0.06 |
| CloudWatch Dashboard | $3 / dashboard | 1 | $3.00 |
| CloudWatch Alarms | $0.10 / alarm | 10 | $1.00 |
| CloudFront data out | $0.085 / GB | 0.5 GB | $0.04 |
| CloudFront requests | $0.0075 / 10k HTTPS | 30k | $0.02 |
| SNS publish | $0.50 / M | < 1k | $0.001 |
| KMS request (SM uses aws/secretsmanager) | $0.03 / 10k | 30k | $0.09 |
| **WAF（不开默认）** | — | — | $0 |
| **合计** | | | **~$9.7 / 月** |

开 WAF 加 $5（WebACL）+ $3（3 managed rules）+ $0.018（30k req）≈ **+$8/月**。

### 100 用户 / 300k 调用/月

| 项 | 月成本 (USD) |
|---|---|
| API Gateway | $0.30 |
| Lambda invoke + compute | $0.20 |
| AgentCore Runtime | $2.10 |
| Secrets Manager (100 secrets + 300k API calls) | $40 + $1.5 = $41.50 |
| DynamoDB | $0.10 |
| CloudWatch Logs (~15 GB ingest + storage) | $7.95 |
| CloudWatch Dashboard + Alarms | $4.00 |
| CloudFront | $0.40 |
| SNS, KMS | $1.00 |
| **合计** | **~$57 / 月** |

100 用户的瓶颈：**Secrets Manager 占 ~70%**，因为每用户 $0.40。优化方案见下文。

### 1000 用户 / 3M 调用/月

| 项 | 月成本 (USD) |
|---|---|
| API Gateway | $3.00 |
| Lambda | $2.50 |
| AgentCore Runtime invoke + container | $25 |
| Secrets Manager (1000 secrets + API) | $400 + $15 = $415 |
| DynamoDB | $1.00 |
| CloudWatch Logs (~150 GB) | $79 |
| CloudWatch Dashboard + Alarms | $4 |
| CloudFront | $4 |
| KMS | $9 |
| **合计** | **~$540 / 月** |

> 注：1000 用户场景**强烈建议** Secrets Manager 合并方案（见下文优化），把 $415 砍到 ~$5，总账压回 ~$130。任务摘要里写的「~$200」按合并优化估，**不优化**则 ~$540。

## 各资源单价表（us-east-1，2026-05）

| 资源 | 计费维度 | 单价 |
|---|---|---|
| API Gateway HTTP API | per request | $1.00 / M |
| Lambda | invocation | $0.20 / M |
| Lambda | duration | $0.0000166667 / GB-second |
| Lambda | provisioned concurrency | $0.0000041667 / GB-s + $0.000003125 / req |
| AgentCore Runtime | invoke | $0.30 / M |
| AgentCore Runtime | container vCPU-hour | ~$0.05（与 Bedrock managed 等价定价） |
| Secrets Manager | per secret per month | $0.40 |
| Secrets Manager | API call | $0.05 / 10k |
| DynamoDB on-demand | write | $1.25 / M WRU |
| DynamoDB on-demand | read | $0.25 / M RRU |
| DynamoDB | storage | $0.25 / GB / month |
| DynamoDB | PITR | $0.20 / GB / month |
| CloudWatch Logs | ingest | $0.50 / GB |
| CloudWatch Logs | storage | $0.03 / GB / month |
| CloudWatch metrics（custom） | per metric | $0.30 / month（前 10 免费） |
| CloudWatch Dashboard | per dashboard | $3 / month（前 3 免费） |
| CloudWatch Alarm | per metric alarm | $0.10 / month |
| CloudFront | data out (first 10 TB) | $0.085 / GB |
| CloudFront | HTTPS requests | $0.0075 / 10k |
| SNS | publish | $0.50 / M |
| KMS | request | $0.03 / 10k |
| KMS | CMK | $1.00 / month |
| WAFv2 | WebACL | $5 / month |
| WAFv2 | managed rule | $1 / month each |
| WAFv2 | request | $0.60 / M |
| ECR | storage | $0.10 / GB / month |
| Route 53（如挂自定义域） | hosted zone | $0.50 / month |
| ACM 证书 | — | 免费（CloudFront 用） |

## 成本优化

### 1. Log retention 缩短

默认 CDK `logs.RetentionDays.ONE_MONTH`（30 天）。开发环境改 `ONE_WEEK`（7 天），存储成本下降 75%。生产可保 30 天。归档需求用 Logs subscription → S3 Glacier，$0.004/GB/月。

```ts
// 在 OAuthStack 里
new logs.LogGroup(this, 'McpLogs', { retention: logs.RetentionDays.ONE_WEEK })
```

### 2. Lambda memory tuning

mcp-middleware 当前 256MB。Lambda 价格按 GB-s 算，跑得越快每 invoke 越便宜，但 memory 越大每秒越贵——存在最优点。用 [Lambda Power Tuning](https://github.com/alexcasalboni/aws-lambda-power-tuning) 跑一次：

| Memory | avg duration | cost / 1M |
|---|---|---|
| 128 MB | 240 ms | $0.20 + $0.50 |
| 256 MB | 80 ms | $0.20 + $0.34 |
| 512 MB | 60 ms | $0.20 + $0.50 |

256MB 是 sweet spot，已经选了。token-refresh-shim cron 跑得不频繁（30min/次），128MB 即可。

### 3. Secrets Manager 合并

最大开销点。v0.2 默认每用户一个 secret（隔离最强、IAM 范围最干净）。三种合并方案：

| 方案 | 月费 | 隔离强度 | IAM 复杂度 | 合规风险 |
|---|---|---|---|---|
| **A. per-user secret**（默认） | $0.40 / user | 最强 | 简单（按 prefix 授权） | 最低 |
| **B. 单 secret + 内部 JSON map** | $0.40 / 月 | 弱（一次解出全部 token） | 简单 | 高（一次泄漏即所有用户） |
| **C. 分桶**（每 100 user 一 secret） | $0.04 / user | 中 | 需 bucket lookup | 中 |

> 方案 B 的「弱隔离」是关键：mcp-middleware 拿到 secret 必须解全表，单个 Lambda 漏洞 = 全部用户 token 泄露。  
> 方案 C 的桶映射逻辑：`bucketId = userId.substr(0, 2)`（256 桶上限），每 100 用户均摊 $0.40 = $0.004/user，仍维持桶级隔离边界。  
> 1000 用户场景：A 方案 $400，C 方案 $4，B 方案 $0.40。但 B 方案不推荐除非你能接受单次泄露 = 全员。

切换：`packages/remote/lambda/shared/token-store.mjs` 实现两种 storage adapter，env `TOKEN_STORAGE=per-user|bucketed`。Plan 3 落地。

### 4. CloudWatch Dashboard 控制在 3 个内

前 3 dashboard 免费。当前只 1 个 `QdmRemote-Main`，OK。不要为每个用户/客户做 dashboard。

### 5. AgentCore Runtime container reserved concurrency

如果 cold start 不是问题，关 reserved concurrency，按需启动，省 idle container 时间。当前默认 reserved=2（~$5/月 idle），10 用户场景可降到 0。100 用户保 2 即可。

### 6. CloudFront 不必要的 cache 关掉

我们的 endpoint 全是 POST + Authorization，本来就不会被 cache。但默认行为节点会做 ETag 协商。确认 `cache_policy=CachingDisabled` 即可，避免误命中。

## Free Tier 覆盖

新账号 12 个月内：

| 资源 | Free Tier | 我们的用量（10 用户场景） | 是否覆盖 |
|---|---|---|---|
| Lambda | 1M req + 400k GB-s | 30k + 600 GB-s | 完全覆盖 |
| API Gateway | 1M HTTP req | 30k | 完全覆盖 |
| DynamoDB | 25 GB + 25 RCU/WCU on-demand | 0.1 GB + 30k req | 完全覆盖 |
| CloudFront | 1 TB out + 10M req | 0.5 GB + 30k | 完全覆盖 |
| SNS | 1M publish | 1k | 完全覆盖 |
| CloudWatch | 10 metrics + 5GB logs ingest | 0 custom（EMF）+ 2GB | 完全覆盖 |

**永久免费**：CloudWatch 前 3 dashboard、前 10 custom metric。

**永远收费**：Secrets Manager（无 free tier）、AgentCore Runtime、KMS CMK（aws-managed 免费）、WAF。

新账号 10 用户全年大概：

- 月 1-12：~$5/月（SM $4 + Dashboard $3 一部分）= **$60/年**
- 月 13+：~$10/月

> 上面的「全年 $60」是估算上限，实际取决于第一年的 Free Tier 使用量是否被同账号其他工作负载吃掉。

## 量级临界点

| 用户数 | 关键瓶颈 | 优化优先级 |
|---|---|---|
| 1-50 | Dashboard $3 + SM 累积 | 不需要优化 |
| 50-500 | SM 占主导 | 切换 bucketed storage |
| 500-5000 | SM + CloudWatch Logs | bucketed + 缩短 log retention |
| 5000+ | AgentCore container time | 加大 reserved concurrency 谈定价 + 看 dws 单调用时长 |
| 10000+ | 该考虑专门部署 | reserve capacity 或上架 SaaS |

参考 [remote-operations.md](./remote-operations.md) 的运维清单结合本文档定期 review 成本。
