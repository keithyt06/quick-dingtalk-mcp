# Remote 端 Quick Desktop 接入指南

> 状态：骨架（Plan 2 T22 填实）

## v0.2 → Quick Desktop 接入流程

1. 管理员部署 Remote 栈（见 `packages/remote/scripts/deploy.sh`）
2. 部署完成后 deploy.sh 输出 MCP 端点 + 首次授权 URL
3. 用户拿到授权 URL，点开 → 钉钉同意页 → 复制 HMAC token
4. Quick Desktop 配置 `Authorization: Bearer <hmac>` + 端点 URL
5. 试发一条消息验证

## 配置示例（待 T22 补真截图）

[TODO: T22 — 截 Quick Desktop 配置面板图]

## 故障排查

- 401 → token 失效，重新跑授权
- 503 with Retry-After → token 临过期，等 EventBridge 30min 刷新或手动 `ops.sh refresh`
- "permission_required" → 点 incremental authorize URL 加 scope

[TODO: T22 — 完整故障排查矩阵]
