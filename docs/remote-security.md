# Remote 端安全模型

> 状态：骨架（Plan 2 T22 填实）

## 信任链

[TODO: T22 — 画从 Quick Desktop → CloudFront → API GW → Lambda → Runtime → dws → DingTalk 的完整信任边界]

## 鉴权

- MCP token：HMAC-SHA256，密钥从 SSM Parameter Store（KMS 加密），24h 过期
- incrAuthToken：第二把 HMAC，专用于 incremental-auth
- per-user access_token：Secrets Manager + KMS（默认 alias/aws/secretsmanager）

## 防护

- WAF（可选，us-east-1 CloudFront-scope）：5min 内 IP > 1000 reqs 阻断
- request body 1MB 上限
- response `Cache-Control: no-store`
- container `USER node` 非 root

[TODO: T22 — 各项细节展开]

## 威胁模型

[TODO: T22 — STRIDE，逐条列出]

## 与 lark-mcp-on-agentcore 的差异

[TODO: T22]
