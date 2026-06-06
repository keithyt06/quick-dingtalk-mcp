# Remote MCP 永久会话设计(终端用户配一次,永不重登)

日期:2026-06-06
状态:设计待批

## 1. 目标

Remote 部署的终端用户都是**非技术人员**。目标:

- 在 Amazon Quick Desktop 里**配一次 MCP，以后永不需要回来重新授权/换 token**。
- 所有「token 续命」由**后端**自动完成，用户无感。
- 万一真要重连，入口尽量傻瓜(打开网页 → 钉钉点同意 → 复制一行)。

## 2. 诊断(已用真实部署坐实,账号 434465421667 / us-east-1)

系统里有**两个独立的过期时钟**:

| 时钟 | 寿命 | 现状(实测) | 是否导致用户掉线 |
|---|---|---|---|
| 钉钉 access_token | ~2h | EventBridge 每 30min 刷新,连续多日 `refreshed:2, failed:0` ✅ | **否** |
| 钉钉 refresh_token | 30 天滑动 | 每次刷新滚动更新,`needs_reauth` 为空 ✅ | **否** |
| **我们签的 MCP Bearer** | **写死 24h** (`token-refresh-shim/index.ts:227` `expiresInSec: 86400`) | 24h 到点 `verifyMcpToken` 抛 `expired` → middleware 401 | **是,唯一原因** ✅ |

结论:**后端续命链路完全健康**。用户掉线 100% 是我们自己给那把「用户钥匙」(MCP Bearer)设了 24h 死线。钉钉侧永远不会是原因。

## 3. 关键工程约束(决定方案形态)

用户粘进 Quick 的 `Authorization: Bearer <token>` 是**静态 header**:Quick 每次请求原样发送,配置里不会变。因此:

- ❌ **「服务端换发新 token + 响应头滑动」对静态 Bearer 不成立** —— 服务端无法把新 token 写回 Quick 的配置(除非 Quick 实现完整 MCP OAuth 2.1 自动刷新流,实测它是手填静态 Bearer,不具备)。
- ✅ 正解:**Bearer 本体永不变**,把「有效性」从 token 内嵌的 `exp` 死线,改为由**后端状态(活跃窗口)**判定。

## 4. 方案:Token 不变,后端活跃窗口滑动(选项 B)

### 4.1 行为

- 签发的 MCP Bearer **不再带 24h 死线**(`exp` 设为一个远期常量或省略硬过期判定,见 4.3)。用户**永远不用换**。
- 每个用户在 Secrets Manager 记录里新增 `last_active`(unix 秒)。
- `mcp-middleware` 每次验证 token 时:
  1. HMAC 签名有效 → 继续;否则 401(防伪造,不变)。
  2. `needs_reauth` / `revoked` 为真 → 401(可吊销,见 4.4)。
  3. 距 `last_active` **< 90 天** → 放行,并(节流)更新 `last_active = now`。
  4. 距 `last_active` **≥ 90 天** → 401 `idle-expired`,需重连。

等价于:**90 天内用过一次就永久续下去**;真闲置满 90 天才失效。对终端用户 = 事实上的永不重登。

### 4.2 `last_active` 写入节流

中间件在热路径,不能每请求都写 Secrets Manager(成本 + 限流)。规则:**距上次 `last_active` 超过 1 天才写一次**(`now - last_active > 86400`)。其余请求只读判断、不写。摊薄到每用户每天最多 1 次写。

### 4.3 token 寿命常量

`token-refresh-shim` 签发时:`expiresInSec` 从 `86400` 改为一个远大于活跃窗口的值(取 `400 * 86400`,约 13 个月,作为「签名层兜底硬上限」——即便后端活跃窗口逻辑出 bug,token 也不会是永久不可吊销的裸钥匙)。真正的「90 天滑动」由 4.1 的后端状态控制,`exp` 只是最外层保险。

> 取舍说明:硬上限设 ~13 个月而非永久,是为了「即使 last_active 逻辑失效,token 也终会自然失效」的纵深防御。13 个月 > 90 天窗口,正常用户永远撞不到它。

### 4.4 吊销(兜底,复用现有能力)

现有 `ops.sh revoke <uid>` 直接删除该用户 secret → `getUserToken` 返回 null → middleware 已有的 `no-user-token` 分支返回 401。**吊销能力已存在,无需新增**。本设计不引入额外 `revoked` 字段(YAGNI):删 secret 即彻底吊销。

### 4.5 常量集中

`IDLE_WINDOW_SEC`(默认 `90*86400`)与 `LAST_ACTIVE_WRITE_THROTTLE_SEC`(默认 `86400`)定义在 `mcp-middleware`,通过环境变量可覆盖(`IDLE_WINDOW_SEC` / `LAST_ACTIVE_THROTTLE_SEC`),CDK 不强制注入,用默认即可。

## 5. 改动清单

| 文件 | 改动 | 说明 |
|---|---|---|
| `lambda/shared/sm-client.ts` | `UserToken` 加可选字段 `last_active?: number` | 数据结构 |
| `lambda/token-refresh-shim/index.ts:227` | `expiresInSec: 86400` → `86400 * 400` | 移除 24h 死线,留 13 个月硬上限 |
| `lambda/mcp-middleware/index.ts` | 在 `getUserToken` 之后加活跃窗口判定 + 节流写 `last_active` | 核心逻辑 |
| `lambda/mcp-middleware/index.test.ts` | 加用例:活跃中放行、闲置超窗 401、节流写不写 | 测试 |
| `lambda/shared/sm-client.test.ts` | `last_active` 往返序列化(如适用) | 测试 |
| `README.md` / `README_CN.md` (L126,143) | 删除「24h 重新授权」措辞,改为「配一次长期有效,后端自动续期」 | 文档 |
| `docs/remote-quick-desktop.md` (L54,56,108,112) | 同上;故障表把「24h 过期」条目改为「闲置 90 天才需重连」 | 文档 |

**不改**:EventBridge 刷新链路(健康)、钉钉后台(与此无关)、`hmac.ts` 的签发/验证机制本身(仍校验 `exp` 作为硬上限)、容器、SigV4。

## 6. 数据流(改后)

```
Quick ──Bearer(不变)──▶ API GW ──▶ mcp-middleware
                                      │ 1. verifyMcpToken: 签名✅ + exp(13个月硬上限)未到
                                      │ 2. getUserToken(uid)
                                      │ 3. needs_reauth? → 401
                                      │ 4. now - last_active ≥ 90d? → 401 idle-expired
                                      │ 5. now - last_active > 1d? → putUserToken(last_active=now) [节流]
                                      ▼ 放行,SigV4 → AgentCore → dws → 钉钉
```

## 7. 错误语义

| 场景 | 返回 | 用户可见 |
|---|---|---|
| 签名无效/伪造 | 401 `token-<reason>` | 连接失效(异常,不该发生) |
| secret 被删(吊销) | 401 `no-user-token` | 需重连 |
| 闲置满 90 天 | 401 `idle-expired` | 需重连(正常,极罕见) |
| 13 个月硬上限到 | 401 `token-expired` | 需重连(纵深防御兜底) |
| 正常活跃 | 放行 | 无感 |

## 8. 迁移 / 一次性成本

改完重新部署 `mcp-middleware` + `token-refresh-shim`。**现存的 24h 旧 Bearer 仍可验证(签名没变),但旧 token 的 `exp` 是 24h,撞到硬过期后失效。** 因此现有 2 个用户需各重连一次(最后一次),拿到新的长寿命 token,之后一劳永逸。新签发的 token 立即享受长寿命 + 活跃窗口。

> 注:旧 token 在其 24h 内仍然能用且会写 `last_active`,但因 `exp=24h` 终会过期 → 现有用户务必重连一次。

## 9. 验证标准

- 单测:`expiresInSec` 远期常量;活跃窗口内放行、超窗 401;`last_active` 节流(>1d 写、<1d 不写);`UserToken` 带/不带 `last_active` 均可解析(向后兼容旧记录:`last_active` 缺失时视为「首次活跃」,放行并写入)。
- `npm run test:remote` 全绿。
- 真实部署后:用新 Bearer 调 `get-self` 成功;Secrets Manager 该用户记录出现 `last_active`;伪造闲置(手动改 `last_active` 为 91 天前)→ 401 `idle-expired`。

## 10. 明确不做(YAGNI)

- 不实现客户端自动 token 刷新(静态 Bearer 不支持,且无需要)。
- 不引入 `revoked` 字段(删 secret 已足够)。
- 不做永久不失效 token(13 个月硬上限是有意保留的纵深防御)。
- 不改 EventBridge 频率 / 钉钉 scope / 后台配置。
