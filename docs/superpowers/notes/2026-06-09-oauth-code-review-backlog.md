# OAuth 2.1 Authorization Server — code review backlog

**日期**:2026-06-09
**背景**:Remote MCP 升级为标准 OAuth 2.1 AS(让 Quick 向导自动授权)后做的高强度 code review(7 finder 角度 + 验证)。OAuth 核心**功能正确**:PKCE 正确绑定并校验、redirect_uri 在 /authorize 与 /token 双重校验、token 域分离(mcp/incr/opaque-refresh)无混用、DDB key 前缀与裸 state 不冲突、50 个测试全绿。下列 10 条是 review 查出的待改项,**已知悉并按现状提交**(无崩溃 bug),留作 backlog。

> 验证状态:所有结论已对照当前代码核实(非凭空)。文件行号以提交时为准,可能漂移。

## 状态:top5 已修(2026-06-09 同日)

#1–#5 已在后续 commit 修复 + 补测试(shared 40 / shim 18 / middleware 11 / oauth 12 全绿,synth 确认 RETAIN+PITR)。#6–#10 仍为开放 backlog。下方保留各条原始描述备查,top5 标注 ✅。

## 应尽早修(便宜且真实)

### ✅ #1 服务端 TTL 未校验(只靠 DynamoDB best-effort TTL)— 已修
`ddbGet`/`consumeState` 读出后比较存储的 `ttl` 与当前时间,过期视为不存在。补测试 `review#1`。
原始问题:
`ddbGet`/`getMcpCode`/`getOAuthSession`/`getRefresh` 读出 payload 后**从不比较存储的 `ttl` 与当前时间**。DynamoDB TTL 删除最长滞后 ~48h → 一次性 authorization_code(名义 5min)、OAuth session(10min)、refresh_token(90d)在名义过期后仍可兑换最长约 2 天。
**修法**:payload 里存 `exp`,`ddbGet` 读时若 `now > exp` 视为不存在(返回 null)。~5 行。

### ✅ #2 OAuthStateTable `removalPolicy: DESTROY` + 无 PITR,却存了持久记录 — 已修
改为 `RETAIN` + `pointInTimeRecovery: true`。synth 确认 `DeletionPolicy: Retain` + `PointInTimeRecoveryEnabled: true`。
原始问题:
表当初是为 5min 抛弃型 state 设计的,现在存了 `client#`(400天)、`refresh#`(90天)。任何替换表的 cdk 操作(改分区键/逻辑 id/拆栈重部署)会**静默清空所有 DCR 注册客户端 + 所有 refresh token,全员登出且无备份**。
**修法**:`removalPolicy: RETAIN` + `pointInTimeRecovery: true`(或 spec 版)。2 行 CDK。
**关联**:[[qdm-remote-deploy-env]] 的整栈 deploy 注意事项。

### ✅ #3 增量授权 `?t=` 与标准 OAuth 分支不互斥 — 已修
OAuth 分支条件加 `!qs.t`,`?t=` 时不建 OAuth session。补测试 `review#3`(攻击构造不再铸 code、不建 sess#)。
原始问题:
`handleAuthorize`:`if (qs.t)` 块设了 userId(无新钉钉同意),随后 `if (qs.client_id || ...)` 又跑 `beginOAuthSession`,两者可同时触发。构造 `/authorize?t=<victim_incr>&client_id=<attacker_DCR>&redirect_uri=<attacker_https>&code_challenge=x` → callback 会铸一个绑定 victim uid 的 mcp_code 发到攻击者 redirect。incrAuthToken 会通过 PAT 错误里的 authorize URL 暴露给用户。
**修法**:两路径互斥(`?t=` 时不建 OAuth session,或反之)。~2 行。

### ✅ #4 refresh_token grant 仅在调用方主动带 client_id 时才校验绑定 — 已修
refresh 路径改为硬要求 client_id(`!clientId`→400)并校验 `rrec.clientId === clientId`。补测试 `review#4`。
原始问题:
`if (clientId && rrec.clientId !== clientId)` —— `none`/public 调用方不带 client_id 时短路跳过校验。authorization_code grant 硬要求 client_id(`!clientId`→400),refresh 不要求,形成不对称。持有 refresh_token 字符串者无需任何客户端身份即可轮换。
**修法**:refresh 路径也要求并校验 client_id(对 public client 至少校验 rrec.clientId 一致)。~2 行。

### ✅ #5 IRREVERSIBLE_VERBS 与 DESTRUCTIVE_VERBS 两份清单不一致 — 已修
`annotationsFor()` 改为先判 `isIrreversible(command)`,保证 IRREVERSIBLE ⊆ destructiveHint(派生而非两份手维护清单)。补测试断言每个不可逆动词都得 destructiveHint。
原始问题:
`toolDescription()` 用 IRREVERSIBLE_VERBS(delete/remove/revoke/reject/recall/quit/cancel/disband)注入确认前缀;`annotationsFor()` 用 DESTRUCTIVE_VERBS(send/create/recall/update/delete/...)。`remove/revoke/reject/quit/cancel/disband` 在前者不在后者 → 这些工具描述里有⚠️确认提示,但 annotation 返回 `{}`(无 destructiveHint),两个安全信号自相矛盾。新增动词易只改一处。
**修法**:让 IRREVERSIBLE_VERBS ⊂ DESTRUCTIVE_VERBS,或两者从同一个「动词→风险」map 派生。~3 行。

## 较低优先 / 现状可辩护

- **#6 一次性 code 仅成功路径删除**:PKCE 失败不烧毁 code,留到 TTL。OAuth2.1 要求任何兑换尝试都失效。PKCE S256 使猜 verifier 不可行,当前不可直接利用,但偏离 spec + 配合 #1 放大窗口。
- **#7 putUserToken 早于 session 校验**:OAuth 路径先 `putUserToken` 再 `getOAuthSession`;session 过期(慢同意)→ 400 但钉钉 token 已存、state 已消费、未发 code,用户需重跑 /authorize。轻微 UX。**修法**:OAuth 路径把 putUserToken 移到 session 校验之后。
- **#8 部分 OAuth 参数 → 400 而非 HTML fallback**:分支用 OR 触发(任一参数),`beginOAuthSession` 用 AND 要求(全部)。只带一个参数的请求硬 400,不再降级到 HTML 粘贴页。边缘情况。
- **#9 refresh 路径不读/写 last_active 90天活跃窗口**:三套生命周期(OAuth 1h+90d / fallback 13月 / 中间件90天idle)并存不连贯。只刷 token 不调 /mcp 的 host 可无限续命;反之活着的 OAuth client 下次真实 /mcp 仍可能 401 idle-expired。设计连贯性。关联 [[qdm-persistent-session]]。
- **#10 DCR(/register)无鉴权、无限流、客户端存 ~400天、redirect_uri 仅校验 https/localhost scheme**:任何人可注册带自控 https redirect 的客户端(是 #3 与会话固定攻击的前置),也是对共享表的写放大。RFC 7591 允许开放注册,但可考虑限流 / 缩短客户端 TTL / host allowlist。

## 已检查并排除(无需处理)
- token 域混用:HMAC `mcp`/`incr` 域绑进签名,opaque `rt_` 不是合法 3 段 HMAC,互相冒用干净失败。
- access_token 过期:`verifyMcpToken` 在代码里校验 `payload.exp`(TTL 滞后问题仅限有状态记录:code/session/refresh)。
- 开放重定向:callback 302 用的是 /authorize 已校验过的 `session.redirectUri`。
- parseBody 原型污染:V8 里 JSON.parse 的 `__proto__` 是自有属性非原型;poisoned client_name/scope 仅回显不参与安全决策。
