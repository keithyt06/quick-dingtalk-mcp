# 文档索引

按「你是谁、要干什么」选文档。Local（本机单用户）模式的文档在 [`packages/local/docs/`](../packages/local/docs/)。

## 普通成员（接入 Remote）

| 文档 | 什么时候看 |
|---|---|
| [remote-新人首配-oauth.md](./remote-新人首配-oauth.md) | **第一次接入，从这篇开始**（OAuth 向导自动授权，推荐） |
| [remote-连接帮助.md](./remote-连接帮助.md) | 你的客户端没有 OAuth 向导，需要手动复制 Bearer 时 |
| [remote-faq.md](./remote-faq.md) | 常见问题（个人账号能不能用、token 存哪、安全性等） |

## 管理员（部署与运维 Remote）

| 文档 | 内容 |
|---|---|
| [remote-quick-desktop.md](./remote-quick-desktop.md) | 技术版接入参考：两种接入方式细节、故障排查矩阵、`quick` 客户端预注册 |
| [remote-operations.md](./remote-operations.md) | 日常运维：`ops.sh`、升级 dws、撤销用户、灾备、alarm preset |
| [remote-security.md](./remote-security.md) | 安全模型：信任边界、token 体系、PKCE/防重放、STRIDE、已知薄弱项 |
| [remote-observability.md](./remote-observability.md) | Dashboard、10 个 Alarm、钉钉群告警、Logs Insights 查询 |
| [remote-cost.md](./remote-cost.md) | 三档用户量成本估算、单价表、优化清单 |

## 图（assets/）

| 文件 | 内容 | 引用处 |
|---|---|---|
| `assets/architecture.svg` | Local + Remote 总览 | README |
| `assets/remote-oauth-modes.svg` | 两种接入模式对比（A 向导 / B 手动） | README |
| `assets/oauth-wizard-sequence.svg` | 方式 A OAuth 完整时序 | 新人首配 |
| `assets/token-lifecycle.svg` | 三层 token 生命周期 | remote-quick-desktop |
| `assets/request-chain-errors.svg` | 请求链路与各错误码出处 | remote-quick-desktop |

> `superpowers/` 是设计历史（plans/specs/notes），仅供考古，不保证与现状一致。
