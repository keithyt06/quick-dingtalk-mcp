# Remote 端可观测性

> 状态：骨架（Plan 2 T22 填实）

## Dashboard（5 板块 12 图表）

| 板块 | 图表 |
|---|---|
| 入口流量 | [TODO T22] |
| Lambda 健康 | [TODO T22] |
| OAuth 流程 | [TODO T22] |
| Runtime 容器 | [TODO T22] |
| 业务错误 | [TODO T22] |

## Alarms（10 个）

[TODO: T22 — 列每个 alarm 的指标、阈值、preset 取值表]

## 告警通知链路

SNS → alarm-webhook Lambda → 钉钉群 Markdown 卡片

[TODO: T22 — 钉钉群卡片样例 + 链接到 Dashboard]
