# Remote 端可观测性

> CloudWatch Dashboard、10 个 Alarm、SNS → 钉钉群告警链路、常用 Logs Insights 查询、错误归因 playbook。

## Dashboard 5 板块逐项

Dashboard 名 `QdmRemote-Main`，部署后看 [Console 链接](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=QdmRemote-Main)。

### 板块 1 入口流量

| 图表 | 指标 | 备注 |
|---|---|---|
| CloudFront Requests | `AWS/CloudFront.Requests`（global） | 5min sum |
| CloudFront 4xx/5xx | `4xxErrorRate`, `5xxErrorRate` | % stacked |
| API Gateway Count | `AWS/ApiGateway.Count` per route | `/mcp` `/authorize` `/callback` 分线 |
| WAF BlockedRequests | `AWS/WAFV2.BlockedRequests` | 不开 WAF 显 No Data |

### 板块 2 Lambda 健康

| 图表 | 指标 | 备注 |
|---|---|---|
| Invocations | `AWS/Lambda.Invocations` per function | 三 Lambda 叠加 |
| Errors | `AWS/Lambda.Errors` | 阈值线 1/min |
| Duration p95 / p99 | `Duration` 统计 p95/p99 | 冷启动会拉高 |
| Throttles | `Throttles` | 应该恒为 0 |
| ConcurrentExecutions | reserved concurrency 用量 | mcp-middleware 设了 reserved=50 |

### 板块 3 OAuth 流程

| 图表 | 指标 | 备注 |
|---|---|---|
| Authorize 成功率 | `QuickDingtalkMcp/OAuth.AuthorizeOk` / `AuthorizeAttempt` | 自定义 metric |
| Callback 失败原因 | `CallbackFailReason` dimension `reason=invalid_state\|expired\|ding_error` | 切片 |
| Token 刷新成功率 | `RefreshOk` / `RefreshAttempt` | EventBridge 30min cron |
| 有效用户数 | `QuickDingtalkMcp/Users.Active24h` | 24h 内有调用的 uid 唯一计数 |

### 板块 4 Runtime 容器

| 图表 | 指标 | 备注 |
|---|---|---|
| InvokeAgentRuntime Count | `AWS/Bedrock.InvocationCount` | filter agent name |
| InvokeAgentRuntime Latency | p50/p95/p99 | p95 期望 < 800ms |
| Container CPU/Mem | `AWS/Bedrock-AgentCore.CpuUtilization`, `MemoryUtilization` | reserved 1vCPU/2GB |
| Cold Start | `QuickDingtalkMcp/Runtime.ColdStart` | 容器内打点 |
| Semaphore Queue Depth | `QuickDingtalkMcp/Runtime.SemaphoreDepth` | 长期 > 5 = 应扩 |

### 板块 5 业务错误

| 图表 | 指标 | 备注 |
|---|---|---|
| dws execFile 失败 | `QuickDingtalkMcp/Runtime.DwsError` dimension `code` | top N error code |
| 工具分布 | `QuickDingtalkMcp/Tool.InvokeCount` dimension `tool` | top 10 |
| 钉钉 API 4xx/5xx | dws 内部抛出的 ding error，按 errcode 切片 | 例如 errcode=88（access_token 过期） |
| permission_required | `QuickDingtalkMcp/Auth.PermissionRequired` | 多 = scope 配错 |

## 10 Alarms 详细表（3 preset 阈值）

Preset 用 deploy 上下文 `--context alarmPreset=relaxed|standard|strict` 切，默认 `standard`。

| # | Alarm | Metric | relaxed | standard | strict | Action |
|---|---|---|---|---|---|---|
| 1 | Lambda errors spike | `AWS/Lambda.Errors` per function, 5min sum | > 10 | > 5 | > 1 | SNS |
| 2 | Lambda p99 latency | `Duration` p99, 5min | > 5000ms | > 3000ms | > 1500ms | SNS |
| 3 | API GW 5xx rate | `5XXError` / `Count`, 5min | > 5% | > 2% | > 0.5% | SNS |
| 4 | API GW 4xx rate | `4XXError` / `Count`, 15min | > 30% | > 15% | > 5% | SNS |
| 5 | OAuth callback fail | `CallbackFailReason` 5min sum | > 20 | > 10 | > 3 | SNS |
| 6 | Token refresh fail | 1 - `RefreshOk/RefreshAttempt`, 30min | > 50% | > 20% | > 5% | SNS + page |
| 7 | Runtime invoke errors | `AWS/Bedrock-AgentCore.InvocationErrors` | > 10 | > 5 | > 1 | SNS |
| 8 | Container cold start | `Runtime.ColdStart` p95, 5min | > 5000ms | > 3000ms | > 2000ms | SNS |
| 9 | dws execFile err rate | `DwsError` / `Tool.InvokeCount` 5min | > 5% | > 2% | > 0.5% | SNS |
| 10 | WAF blocked spike | `BlockedRequests` 5min | > 1000 | > 500 | > 100 | SNS |

第 6 号还会写 PagerDuty webhook（如果配了 `PAGERDUTY_INTEGRATION_KEY` SSM）。

## SNS → 钉钉群卡片样例

`alarm-webhook` Lambda 订阅 SNS topic，把 `CloudWatchAlarm` JSON 转成钉钉 markdown：

```json
{
  "msgtype": "markdown",
  "markdown": {
    "title": "[ALARM] QdmRemote: Lambda errors spike",
    "text": "## QdmRemote: Lambda errors spike\n\n- Function: `QdmRemoteOAuth-mcp-middleware`\n- Region: `us-east-1`\n- Threshold: `> 5 errors / 5min` (preset=standard)\n- Current: `12`\n- State change: `OK → ALARM` at `2026-05-28T03:14:22Z`\n\n[Open Dashboard](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=QdmRemote-Main)\n[Open Alarm](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:alarm/QdmRemote-LambdaErrors-mcp-middleware)\n\n> Run `bash packages/remote/scripts/ops.sh logs mcp-middleware` to tail."
  }
}
```

OK 状态恢复也发一条，title 换 `[OK]`。

钉钉群 webhook 在 SSM `/quick-dingtalk-mcp/alarm-webhook-url`（SecureString）。webhook 加签密钥放 `/quick-dingtalk-mcp/alarm-webhook-secret`，alarm-webhook Lambda 拼 `&timestamp=...&sign=...`。

## ops.sh logs 用法

```bash
bash packages/remote/scripts/ops.sh logs token-refresh-shim
bash packages/remote/scripts/ops.sh logs mcp-middleware
bash packages/remote/scripts/ops.sh logs alarm-webhook
```

底层是 `aws logs tail /aws/lambda/QdmRemoteOAuth-<name>* --follow --region us-east-1`，加 `--since 1h` 回溯。

容器日志单独：

```bash
aws logs tail /aws/agentcore/runtime/quick-dingtalk-mcp --follow --region us-east-1
```

## CloudWatch Logs Insights 5 条常用查询

1. **24h 错误 top 10 工具**：

```sql
fields @timestamp, tool, errorCode, userId
| filter @logStream like /runtime/ and errorCode != ""
| stats count() as cnt by tool, errorCode
| sort cnt desc
| limit 10
```

2. **某用户最近 1h 全部调用**：

```sql
fields @timestamp, tool, args_hash, status, durationMs
| filter userId = "u_5f23a8b1c4"
| sort @timestamp desc
| limit 100
```

3. **OAuth callback 失败原因切片**：

```sql
fields @timestamp, reason, dingErrcode
| filter @logStream like /token-refresh-shim/ and msg = "callback_fail"
| stats count() by reason, dingErrcode
```

4. **冷启动时长分布**：

```sql
fields @timestamp, coldStartMs
| filter event = "cold_start"
| stats avg(coldStartMs), max(coldStartMs), pct(coldStartMs, 95) by bin(5m)
```

5. **dws execFile 平均时长 by tool**：

```sql
fields tool, durationMs
| filter event = "dws_invoke" and status = "ok"
| stats avg(durationMs), pct(durationMs, 95), count() by tool
| sort count desc
```

## 自定义 metric (`QuickDingtalkMcp` namespace)

容器 + Lambda 用 EMF（CloudWatch Embedded Metric Format）打点，零额外 PutMetricData 费用。

| Metric | 维度 | 来源 | 单位 |
|---|---|---|---|
| `Tool.InvokeCount` | `tool`, `userId` | container | Count |
| `Tool.DurationMs` | `tool` | container | Milliseconds |
| `Runtime.ColdStart` | — | container | Milliseconds |
| `Runtime.SemaphoreDepth` | — | container | Count |
| `Runtime.DwsError` | `code` | container | Count |
| `OAuth.AuthorizeAttempt` | — | token-refresh-shim | Count |
| `OAuth.AuthorizeOk` | — | token-refresh-shim | Count |
| `OAuth.CallbackFailReason` | `reason` | token-refresh-shim | Count |
| `OAuth.RefreshAttempt` | — | token-refresh-shim | Count |
| `OAuth.RefreshOk` | — | token-refresh-shim | Count |
| `Auth.PermissionRequired` | `scope` | mcp-middleware | Count |
| `Users.Active24h` | — | scheduled cron in mcp-middleware | Count |

EMF 例（容器内）：

```json
{
  "_aws": {
    "Timestamp": 1735689600000,
    "CloudWatchMetrics": [{
      "Namespace": "QuickDingtalkMcp",
      "Dimensions": [["tool"]],
      "Metrics": [{"Name": "Tool.DurationMs", "Unit": "Milliseconds"}]
    }]
  },
  "tool": "im.send_to_chat",
  "userId": "u_5f23a8b1c4",
  "Tool.DurationMs": 432
}
```

## 错误归因 playbook

```
告警来 → 看 Dashboard
       → 哪个板块红？
            ├─ 入口流量 4xx 高 → WAF 命中 / 用户 token 全过期 → 看板块 3 OAuth 失败
            ├─ Lambda Errors 高 → ops.sh logs <fn> → 看 Insights query 1 / 3
            ├─ Runtime 错 → 容器日志 → 看 dws code → bump-dws-version 或回滚镜像
            ├─ 业务错 dws execFile 高 → 是不是某个工具 ding 端 5xx？看 Insights query 5
            └─ Cold Start 高 → AgentCore reserved concurrency 不够 → 调 Runtime config
```

排查流程参考 [remote-quick-desktop.md 故障排查矩阵](./remote-quick-desktop.md#故障排查矩阵)。

## 成本影响

可观测性本身的月成本（10 用户、每天 100 次调用估算）：

| 项 | 量 | 月成本 |
|---|---|---|
| CloudWatch Logs 摄入 | ~2GB/月 | $1.0 |
| CloudWatch Logs 存储（30 天） | ~2GB | $0.06 |
| Custom metric (EMF) | 嵌在日志，0 额外 | $0 |
| Dashboard | 1 个 | $3.0 |
| Alarms | 10 个 | $1.0（$0.10 each） |
| SNS publish | < 100/月 | < $0.01 |
| **小计** | | **~$5.1/月** |

放大到 1000 用户：日志 ~50GB → $25 + 存储 $1.5 + 上面合计约 $30。日志保留期建议生产 30 天、开发 7 天，见 [remote-cost.md](./remote-cost.md)。
