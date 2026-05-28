# Remote 端成本估算

> 状态：骨架（Plan 2 T22 填实）

## 月度估算（10 用户、每天 100 次工具调用、us-east-1 价格）

| 项 | 单价 | 数量/月 | 月成本 (USD) |
|---|---|---|---|
| API Gateway | [TODO] | [TODO] | [TODO] |
| Lambda | [TODO] | [TODO] | [TODO] |
| AgentCore Runtime | [TODO] | [TODO] | [TODO] |
| Secrets Manager | $0.40/secret | 10 | $4 |
| DynamoDB | [TODO] | [TODO] | [TODO] |
| CloudWatch (logs + dashboard) | [TODO] | [TODO] | [TODO] |
| **合计** | | | **[TODO T22]** |

[TODO: T22 — 实际 us-east-1 价格表 + 100 用户 / 1000 用户的 scaling 估算]

## 成本优化

[TODO: T22 — Lambda memory tuning / log retention / SM secret consolidation]
