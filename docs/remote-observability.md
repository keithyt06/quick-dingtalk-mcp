# Remote 端可观测性

> 面向**运维 Remote 栈的管理员**。CloudWatch Dashboard、10 个 Alarm、SNS → 钉钉群告警链路、常用 Logs Insights 查询、错误归因 playbook。

## Dashboard：`qdm-remote`（5 板块 / 10 图）

Dashboard 名 `qdm-remote`，部署后在 CloudWatch Console（us-east-1）→ Dashboards 打开。

| 板块 | 图 | 指标 |
|---|---|---|
| 1 入口流量 | API GW 4xx/5xx | `AWS/ApiGateway.4XXError` / `5XXError`（Sum） |
| | API GW Latency | `AWS/ApiGateway.Latency` p50 / p99 |
| 2 Lambda 健康 | mcp-middleware errors / invocations | `AWS/Lambda.Errors` + `Invocations` |
| | mcp-middleware duration p99 | `AWS/Lambda.Duration` p99（冷启动会拉高） |
| 3 OAuth 流程 | token-refresh-shim errors / invocations | `AWS/Lambda.Errors` + `Invocations` |
| | Refresh failure users | `QuickDingtalkMcp/Remote.RefreshFailureUsers`（Sum） |
| 4 Runtime 容器 | AgentCore invocation count / errors | `AWS/BedrockAgentCore.InvocationCount` / `InvocationErrors` |
| | Container semaphore depth + busy | `QuickDingtalkMcp/Runtime.QueueDepth` / `ServerBusy` |
| 5 业务错误 | PAT triggers | `QuickDingtalkMcp/Runtime.PATTrigger`（权限不足触发增量授权的次数） |
| | dws non-zero exits | `QuickDingtalkMcp/Runtime.DwsNonZeroExit` |

> **现状说明**：`QuickDingtalkMcp/Runtime.*` 四个容器侧指标已在 Dashboard / Alarm 中引用，但当前容器代码尚未打点，这些图显示 No Data（对应 alarm 设了 `TreatMissingData: NOT_BREACHING`，不会误报）。`QuickDingtalkMcp/Remote.RefreshFailureUsers` 由 token-refresh-shim 用 EMF 打点，是真实有数的。

## 10 个 Alarm（三档 preset）

Preset 用 deploy 上下文 `--context alarmPreset=relaxed|standard|strict` 切，默认 `standard`。阈值定义在 `config/alarm-thresholds.json`，alarm 名统一 `qdm-remote-<Id>`，全部动作为发 SNS（→ 钉钉群卡片）。

下表为 `standard` 档（格式：阈值 / 评估期数 × 周期）：

| # | Alarm | Metric | standard | 含义 |
|---|---|---|---|---|
| 1 | ApiGw5xxPersistent | `AWS/ApiGateway.5XXError` Sum | > 5 / 3×60s | 入口持续 5xx |
| 2 | MiddlewareErrorRate | mcp-middleware `Errors` | > 0.05 / 3×60s | 网关 Lambda 报错 |
| 3 | LambdaThrottle | mcp-middleware `Throttles` | ≥ 1 / 1×60s | 任何限流事件 |
| 4 | RefreshFailureUsers | `QuickDingtalkMcp/Remote.RefreshFailureUsers` | ≥ 1 / 1×30min | 定时刷新失败的用户数 |
| 5 | RuntimeInvocationFailure | `AWS/BedrockAgentCore.InvocationErrors` | > 3 / 3×60s | AgentCore 调用失败 |
| 6 | Container5xx | `QuickDingtalkMcp/Runtime.Container5xx` | > 5 / 3×60s | 容器 5xx（待打点） |
| 7 | ServerBusyPersistent | `QuickDingtalkMcp/Runtime.ServerBusy` | > 10 / 5×60s | 信号量队列持续打满（待打点） |
| 8 | SmThrottle | `AWS/SecretsManager.ThrottledRequests` | ≥ 1 / 1×60s | SM 限流 |
| 9 | DdbThrottle | `AWS/DynamoDB.ThrottledRequests` | ≥ 1 / 1×60s | DDB 限流 |
| 10 | OAuthCallbackFailureRate | token-refresh-shim `Errors` | > 0.2 / 3×300s | OAuth 回调失败 |

`relaxed`（开发期，阈值约 2-4 倍宽）与 `strict`（大用户量，阈值压到 1 且窗口更短）的具体数值见 `config/alarm-thresholds.json`。

## SNS → 钉钉群告警卡片

部署时通过 `alarmWebhookUrl` 上下文传入钉钉群机器人 webhook，`alarm-webhook` Lambda 订阅 SNS topic，把 CloudWatch Alarm JSON 转成钉钉 markdown 卡片，内容包括：alarm 名、状态（ALARM/OK）、指标、阈值、原因，以及 Dashboard 链接。未配 webhook 时该 Lambda 不部署/直接跳过，告警仍可在 CloudWatch Console 查看。

## ops.sh logs 用法

```bash
bash packages/remote/scripts/ops.sh logs token-refresh-shim
bash packages/remote/scripts/ops.sh logs mcp-middleware
bash packages/remote/scripts/ops.sh logs alarm-webhook
```

底层是 `aws logs tail "/aws/lambda/QdmRemoteOAuth-<name>*" --follow --region us-east-1`。

容器日志单独（runtime-id 形如 `qdm_remote-XXXXXXXXXX`）：

```bash
aws logs tail /aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT --follow --region us-east-1
```

## CloudWatch Logs Insights 常用查询

Lambda 日志是结构化 JSON（`level` / `msg` / `ts` + 上下文字段），以下查询对 `/aws/lambda/QdmRemoteOAuth-*` 日志组直接可用。容器日志目前是纯文本，只能按字符串过滤。

1. **24h 错误按消息聚类**（先看错在哪类）：

```sql
fields @timestamp, msg, err
| filter level = "error"
| stats count() as cnt by msg
| sort cnt desc
```

2. **401 原因切片**（mcp-middleware）：

```sql
fields @timestamp, reason
| filter msg = "unauthorized"
| stats count() by reason
```

3. **定时刷新失败明细**（token-refresh-shim）：

```sql
fields @timestamp, userId, err
| filter msg = "refresh failed"
| sort @timestamp desc
```

4. **OAuth 发 token / 续期的量**（验证方式 A 用户在正常续期）：

```sql
fields @timestamp, msg, userId, clientId
| filter msg in ["token issued (authorization_code)", "token refreshed"]
| stats count() by msg, bin(1h)
```

## 自定义 metric（EMF）

当前唯一有打点的自定义指标：

| Metric | 来源 | 触发 |
|---|---|---|
| `QuickDingtalkMcp/Remote.RefreshFailureUsers` | token-refresh-shim（EMF，嵌在日志里，零额外 PutMetricData 费用） | 每轮 EventBridge 刷新结束后上报失败用户数 |

Dashboard / Alarm 中引用的 `QuickDingtalkMcp/Runtime.*`（Container5xx、ServerBusy、QueueDepth、PATTrigger、DwsNonZeroExit）为容器侧预留指标，**尚未打点**（见上文现状说明）。

## 错误归因 playbook

```
告警来 → 看 Dashboard qdm-remote
       → 哪个板块异常？
            ├─ 板块 1 入口 5xx 高 → 看板块 2/3 哪个 Lambda 在报错
            ├─ 板块 2 middleware 错误高 → ops.sh logs mcp-middleware → Insights 查询 1/2
            ├─ 板块 3 RefreshFailureUsers ≥ 1 → Insights 查询 3 看哪个用户、什么错
            ├─ 板块 4 AgentCore InvocationErrors → 容器日志 → 看 dws 报错 → 回滚镜像或升 dws
            └─ 用户报 401/503 但 Dashboard 正常 → 多半是单用户 token 状态，走故障排查矩阵
```

逐错误码排查见 [remote-quick-desktop.md 故障排查矩阵](./remote-quick-desktop.md#故障排查矩阵)。

## 成本影响

可观测性相关成本（日志摄入/存储、Dashboard、Alarm、SNS）的估算统一见 [remote-cost.md](./remote-cost.md)，量级参考：10 用户场景约 $2-5/月，大头是 CloudWatch Logs 摄入。
