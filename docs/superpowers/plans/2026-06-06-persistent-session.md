# 永久会话(后端活跃窗口)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Remote MCP 的终端用户配一次 Quick 后永不重登 —— 把 MCP Bearer 的 24h 死线移除,改由后端「90 天闲置窗口」判定有效性。

**Architecture:** MCP Bearer 本体不变(静态 header 无法被服务端换),签发寿命改为 ~13 个月硬上限(纵深防御)。`mcp-middleware` 每次验证时检查用户 `last_active`,90 天内用过则放行并(每日节流)更新 `last_active`,超窗返回 401。吊销复用现有 `ops.sh revoke`(删 secret)。

**Tech Stack:** TypeScript Lambda(Node ≥22.6,`--experimental-strip-types`),`node:test`,AWS Secrets Manager,HMAC-SHA256。

设计依据:`docs/superpowers/specs/2026-06-06-persistent-session-design.md`

---

## 运行测试的前置(每个 Task 的验证命令都依赖)

所有命令在 `packages/remote/` 下运行,且 PATH 必须含 Node 22:

```bash
export PATH="$HOME/.local/node22/bin:$PATH"   # 本机 Node22(见 memory: qdm-remote-deploy-env)
cd packages/remote
```

单测运行器(全套 lambda 单测):

```bash
node --test --experimental-strip-types lambda/mcp-middleware/index.test.ts lambda/shared/hmac.test.ts lambda/shared/sm-client.test.ts
```

基线:当前 18 tests / 0 fail。

---

## 文件结构

| 文件 | 职责 | 本计划改动 |
|---|---|---|
| `lambda/shared/sm-client.ts` | `UserToken` 类型 + SM 读写 | 加可选 `last_active?: number` 字段 |
| `lambda/token-refresh-shim/index.ts` | 签发 MCP Bearer(`/callback`) | 移除 24h,改 13 个月硬上限常量 |
| `lambda/mcp-middleware/index.ts` | 每请求验证 + 转发 | 加活跃窗口判定 + 节流写 `last_active` |
| `lambda/mcp-middleware/index.test.ts` | 中间件单测 | 补 Put 桩 + 3 个新用例 |
| `README.md` / `README_CN.md` | 项目说明 | 改写 24h 措辞 |
| `docs/remote-quick-desktop.md` | 用户接入指南 | 改写 24h 措辞 |

---

### Task 1: `UserToken` 加 `last_active` 字段

**Files:**
- Modify: `lambda/shared/sm-client.ts:10-16`

- [ ] **Step 1: 加字段**

把 `UserToken` 类型改为(在 `needs_reauth` 后加一行):

```typescript
export type UserToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  scope: string;
  needs_reauth?: boolean;
  last_active?: number; // unix seconds — 最后一次成功调用;mcp-middleware 维护,缺失视为首次活跃
};
```

- [ ] **Step 2: 跑现有 sm-client 测试确认不回归**

Run: `node --test --experimental-strip-types lambda/shared/sm-client.test.ts`
Expected: PASS(可选字段不破坏现有序列化用例)

- [ ] **Step 3: Commit**

```bash
git add lambda/shared/sm-client.ts
git commit -m "feat(remote): UserToken 增加 last_active 字段"
```

---

### Task 2: 签发寿命从 24h 改为 13 个月硬上限

**Files:**
- Modify: `lambda/token-refresh-shim/index.ts:227`

- [ ] **Step 1: 改签发常量**

把 `token-refresh-shim/index.ts` 第 227 行附近:

```typescript
  const mcpToken = signMcpToken({ userId, expiresInSec: 86400 }, hmacKey);
```

改为(并在上方加一行常量说明,放在文件顶部常量区,即 `REFRESH_BUFFER_SEC` 那一组附近):

```typescript
// MCP Bearer 不带功能性过期 —— 有效性由 mcp-middleware 的「90 天活跃窗口」判定。
// 这里只保留一个远期硬上限(~13 个月 > 90 天窗口),作纵深防御:
// 即便活跃窗口逻辑失效,token 也终会自然过期,不会变成永久不可吊销的裸钥匙。
const MCP_TOKEN_MAX_LIFETIME_SEC = 400 * 86400;
```

第 227 行改为:

```typescript
  const mcpToken = signMcpToken({ userId, expiresInSec: MCP_TOKEN_MAX_LIFETIME_SEC }, hmacKey);
```

- [ ] **Step 2: 跑 token-refresh-shim 测试确认不回归**

Run: `node --test --experimental-strip-types lambda/token-refresh-shim/index.test.ts`
Expected: PASS(无测试断言具体 86400 值;若有则按 13 个月更新)

- [ ] **Step 3: Commit**

```bash
git add lambda/token-refresh-shim/index.ts
git commit -m "feat(remote): MCP Bearer 移除24h死线,改13个月硬上限"
```

---

### Task 3: 中间件测试桩支持写入(为 last_active 做准备)

**Files:**
- Modify: `lambda/mcp-middleware/index.test.ts:16-27`

> 现有 `smFake` 只支持 `GetSecretValueCommand`。活跃窗口要写 `last_active`(`PutSecretValueCommand`),先让桩支持写,否则后续用例会因 "unsupported" 抛错。

- [ ] **Step 1: 扩展 smFake 支持 Put,并暴露 store 给断言**

把 `lambda/mcp-middleware/index.test.ts` 第 16-27 行的 `smStore` / `smFake` 块替换为:

```typescript
const smStore = new Map<string, string>();
const smFake = {
  send: async (cmd: any) => {
    const op = cmd.constructor.name;
    if (op === "GetSecretValueCommand") {
      const v = smStore.get(cmd.input.SecretId);
      if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
      return { SecretString: v };
    }
    if (op === "PutSecretValueCommand") {
      smStore.set(cmd.input.SecretId, cmd.input.SecretString);
      return {};
    }
    throw new Error("unsupported");
  },
};
```

- [ ] **Step 2: 跑中间件测试确认现有 6 用例仍 PASS**

Run: `node --test --experimental-strip-types lambda/mcp-middleware/index.test.ts`
Expected: PASS(6 tests,行为未变,只是桩能力增强)

- [ ] **Step 3: Commit**

```bash
git add lambda/mcp-middleware/index.test.ts
git commit -m "test(remote): mcp-middleware SM桩支持PutSecretValue"
```

---

### Task 4: 活跃窗口判定 —— 先写失败测试

**Files:**
- Modify: `lambda/mcp-middleware/index.test.ts`(文件末尾追加)

> 三个新行为:(a) 闲置超 90 天 → 401 idle-expired;(b) 活跃用户首次(无 last_active)→ 放行且写入 last_active;(c) last_active 在 1 天内 → 放行但不写(节流)。

- [ ] **Step 1: 追加三个失败测试**

在 `lambda/mcp-middleware/index.test.ts` 末尾追加:

```typescript
const DAY = 86400;

test("闲置超90天 → 401 idle-expired", async () => {
  const tok = signMcpToken({ userId: "u5", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u5", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
    last_active: now - 91 * DAY,
  }));
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 401);
  assert.match((r as any).body, /idle-expired/);
});

test("无 last_active(旧记录)→ 放行并写入 last_active", async () => {
  const tok = signMcpToken({ userId: "u6", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u6", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
  }));
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 200);
  const stored = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u6")!);
  assert.ok(stored.last_active >= now, "last_active 应被写入");
});

test("last_active 在1天内 → 放行但不重写(节流)", async () => {
  const tok = signMcpToken({ userId: "u7", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const recent = now - 100; // 100秒前,远小于1天
  smStore.set("quick-dingtalk-mcp/users/u7", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
    last_active: recent,
  }));
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 200);
  const stored = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u7")!);
  assert.equal(stored.last_active, recent, "节流期内 last_active 不应被改写");
});
```

- [ ] **Step 2: 跑测试,确认这三个 FAIL**

Run: `node --test --experimental-strip-types lambda/mcp-middleware/index.test.ts`
Expected: FAIL —— "闲置超90天" 现在会走到 happy-path 返回 200(因为还没实现判定);"无 last_active" 的 `stored.last_active` 为 undefined。

---

### Task 5: 活跃窗口判定 —— 实现

**Files:**
- Modify: `lambda/mcp-middleware/index.ts`(常量区 + handler 中 `getUserToken` 之后)
- Import: `lambda/mcp-middleware/index.ts:7`(已 import `getUserToken`,需补 `putUserToken`、`UserToken`)

- [ ] **Step 1: 补常量(放在第 14 行 `TOKEN_NEAR_EXPIRY_SEC` 附近)**

```typescript
const TOKEN_NEAR_EXPIRY_SEC = 60; // if expires_at - now < 60s, return 503
// 90 天闲置窗口:90 天内用过则永久续;超窗需重连。可用 env 覆盖。
const IDLE_WINDOW_SEC = parseInt(process.env.IDLE_WINDOW_SEC || String(90 * 86400), 10);
// last_active 写入节流:距上次写超过此秒数才再写一次(摊薄 SM 写入成本)。
const LAST_ACTIVE_THROTTLE_SEC = parseInt(process.env.LAST_ACTIVE_THROTTLE_SEC || String(86400), 10);
```

- [ ] **Step 2: 补 import(第 7 行)**

把:

```typescript
import { getUserToken } from "../shared/sm-client.ts";
```

改为:

```typescript
import { getUserToken, putUserToken, type UserToken } from "../shared/sm-client.ts";
```

- [ ] **Step 3: 在 handler 里加判定**

当前(第 72-78 行):

```typescript
  const userToken = await getUserToken(userId);
  if (!userToken) return unauth("no-user-token");
  if (userToken.needs_reauth) return unauth("needs-reauth");
  const now = Math.floor(Date.now() / 1000);
  if (userToken.expires_at - now < TOKEN_NEAR_EXPIRY_SEC) {
    return serverBusyOrRetry("token-near-expiry", 30);
  }
```

替换为:

```typescript
  const userToken = await getUserToken(userId);
  if (!userToken) return unauth("no-user-token");
  if (userToken.needs_reauth) return unauth("needs-reauth");
  const now = Math.floor(Date.now() / 1000);

  // 90 天闲置窗口:缺失 last_active 的旧记录视为「首次活跃」,放行并写入。
  if (typeof userToken.last_active === "number" && now - userToken.last_active >= IDLE_WINDOW_SEC) {
    return unauth("idle-expired");
  }

  if (userToken.expires_at - now < TOKEN_NEAR_EXPIRY_SEC) {
    return serverBusyOrRetry("token-near-expiry", 30);
  }

  // 节流更新 last_active:距上次超过阈值(或从未写过)才写一次。
  if (userToken.last_active === undefined || now - userToken.last_active > LAST_ACTIVE_THROTTLE_SEC) {
    const updated: UserToken = { ...userToken, last_active: now };
    try {
      await putUserToken(userId, updated);
    } catch (e: any) {
      // 写 last_active 失败不应阻断本次请求(下次再补)。
      log.warn("last_active write failed", { userId, err: e.message });
    }
  }
```

- [ ] **Step 4: 跑测试,确认全 PASS**

Run: `node --test --experimental-strip-types lambda/mcp-middleware/index.test.ts`
Expected: PASS(原 6 + 新 3 = 9 tests)

- [ ] **Step 5: 跑全套 lambda 单测确认无回归**

Run: `node --test --experimental-strip-types lambda/mcp-middleware/index.test.ts lambda/shared/hmac.test.ts lambda/shared/sm-client.test.ts lambda/token-refresh-shim/index.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lambda/mcp-middleware/index.ts lambda/mcp-middleware/index.test.ts
git commit -m "feat(remote): mcp-middleware 90天活跃窗口判定+节流写last_active"
```

---

### Task 6: 全量 remote 测试

**Files:** 无(验证)

- [ ] **Step 1: 跑完整 remote 测试套件(单测 + infra synth)**

Run(在 `packages/remote/`,PATH 含 Node22):

```bash
npm test
```

Expected: PASS。若 infra synth 因本机 loader 报错(见 memory: qdm-remote-deploy-env,infra 测试需 esbuild bundle harness),只需保证 `test:unit` 段全绿即可,记录 infra 段的已知缺陷,不在本计划范围。

- [ ] **Step 2: 无新文件需提交则跳过**

---

### Task 7: 更新文档(README + 接入指南)

**Files:**
- Modify: `README.md:126,143`
- Modify: `README_CN.md:126,143`
- Modify: `docs/remote-quick-desktop.md:54,56,108,112`

- [ ] **Step 1: README.md**

第 126 行,把:

```
Each teammate's DingTalk token is stored, KMS-encrypted, per `userId` in Secrets Manager; the container gives each user an isolated `dws` config. Tokens auto-refresh on a schedule, so people only re-authorize when their 24h MCP session token lapses.
```

改为:

```
Each teammate's DingTalk token is stored, KMS-encrypted, per `userId` in Secrets Manager; the container gives each user an isolated `dws` config. Tokens auto-refresh on a schedule, and the MCP token you paste into your client stays valid as long as you keep using it — the backend tracks a per-user activity window (90 days idle before re-auth is needed), so a one-time setup just keeps working.
```

第 143 行,把:

```
1. **Authorize** — open the admin's `https://<domain>/authorize` in a browser, approve with *your* DingTalk account, copy the `Bearer ...` token it returns (valid 24h).
```

改为:

```
1. **Authorize** — open the admin's `https://<domain>/authorize` in a browser, approve with *your* DingTalk account, copy the `Bearer ...` token it returns. You only do this once — the token stays valid as long as you keep using it (re-auth only after 90 days of no use).
```

- [ ] **Step 2: README_CN.md**

第 126 行,把:

```
每个成员的钉钉 token 按 `userId` 分别用 KMS 加密存在 Secrets Manager；容器给每个用户一份隔离的 `dws` 配置。token 由定时任务自动续期，所以大家只在 24h 的 MCP 会话 token 过期时才需要重新授权一次。
```

改为:

```
每个成员的钉钉 token 按 `userId` 分别用 KMS 加密存在 Secrets Manager；容器给每个用户一份隔离的 `dws` 配置。钉钉 token 由定时任务自动续期；你粘进客户端的 MCP token **只要在用就一直有效**——后端按用户记录活跃窗口(连续 90 天不用才需重新授权),所以一次配置长期可用。
```

第 143 行,把:

```
1. **授权** —— 浏览器打开管理员给的 `https://<域名>/authorize`，用*你自己*的钉钉账号同意，复制返回的 `Bearer ...` token（24 小时有效）。
```

改为:

```
1. **授权** —— 浏览器打开管理员给的 `https://<域名>/authorize`，用*你自己*的钉钉账号同意，复制返回的 `Bearer ...` token。**只需做这一次**——token 只要在用就长期有效(连续 90 天不用才需重新授权)。
```

- [ ] **Step 3: docs/remote-quick-desktop.md**

第 54 行,把 `（这就是你的专属 MCP token，24 小时有效）` 改为 `（这就是你的专属 MCP token，长期有效——只要在用就不过期）`。

第 56 行,把 `再用 SSM 里的 HMAC 主密钥派生出你的 MCP token（HMAC-SHA256，24h 过期）渲染到页面。` 改为 `再用 SSM 里的 HMAC 主密钥派生出你的 MCP token（HMAC-SHA256，~13 个月硬上限;有效性由后端 90 天活跃窗口判定）渲染到页面。`

第 108 行,把表格行:

```
| MCP token 24h 过期 | Quick 报 401 / 连接失效 | 重新打开 `<域名>/authorize` 走一遍授权，复制新 token 替换 |
```

改为:

```
| 闲置 90 天后 MCP token 失效 | Quick 报 401 / 连接失效(极罕见) | 重新打开 `<域名>/authorize` 走一遍授权，复制新 token 替换 |
```

第 112 行,把:

```
> **重点**：钉钉侧的 access_token 由后端自动保活（EventBridge 定时刷新），你平时无感。你唯一需要手动做的是 **MCP token 24h 过期后重新授权一次**——就是重复第 1 步。
```

改为:

```
> **重点**：钉钉侧的 access_token 由后端自动保活（EventBridge 定时刷新），MCP token 也只要你在用就长期有效。正常情况下你**配一次就一直能用**，不需要反复重新授权;只有连续 90 天完全没用过才需要重复第 1 步。
```

- [ ] **Step 4: Commit**

```bash
git add README.md README_CN.md docs/remote-quick-desktop.md
git commit -m "docs(remote): 永久会话——改写24h重授权措辞为90天活跃窗口"
```

---

### Task 8: 部署 + 现网验证(需用户在场/授权)

**Files:** 无(运维)

> 涉及改动 AWS 真实资源(更新两个 Lambda)。需要 Node22 PATH + 部署 memory(qdm-remote-deploy-env)里的绕坑。**此 Task 由用户确认后执行,不在自动实现范围内。**

- [ ] **Step 1: 构建 lambda 产物**

```bash
export PATH="$HOME/.local/node22/bin:$PATH"
cd packages/remote && npm run build:lambda
```

- [ ] **Step 2: 更新两个 Lambda 代码(mcp-middleware + token-refresh-shim)**

按 `scripts/deploy.sh` 的方式(或 `aws lambda update-function-code` 热更新 `dist/` 产物)。函数名:
- `QdmRemoteOAuth-McpMiddlewareA826B93A-5qwD5GSdFzfi`
- `QdmRemoteOAuth-TokenRefreshShim47259938-sOwVYY8DgRL0`

- [ ] **Step 3: 现网验证**

1. 重新走一遍 `https://<域名>/authorize` 拿新 Bearer,粘进 Quick → 调 `get-self` 成功。
2. `aws secretsmanager get-secret-value --secret-id quick-dingtalk-mcp/users/<uid>` → 出现 `last_active` 字段。
3. (可选)手动把某测试用户的 `last_active` 改成 91 天前 → 该 Bearer 调用返回 401 `idle-expired`。

- [ ] **Step 4: 通知现有 2 个用户各重连一次**(旧 24h token 会过期,这是最后一次)。

---

## Self-Review 结论

- **Spec 覆盖**:§4.1 判定(Task 5)、§4.2 节流(Task 5 + Task 4 节流用例)、§4.3 寿命常量(Task 2)、§4.4 吊销复用 revoke(无需代码,设计已说明)、§4.5 env 覆盖(Task 5 常量)、§5 改动清单逐条对应 Task 1/2/5/7、§8 迁移(Task 8 Step 4)、§9 验证(Task 6 + Task 8)。✅
- **占位符**:无 TBD/TODO,所有代码步骤含完整代码。✅
- **类型一致**:`last_active`(Task 1 定义)在 Task 4/5 一致使用;`IDLE_WINDOW_SEC` / `LAST_ACTIVE_THROTTLE_SEC` 在 Task 5 定义并使用;`putUserToken` / `UserToken` import 在 Task 5 Step 2 补齐。✅
- **已知缺陷**:infra synth 测试在本机原生 loader 下会崩(memory 记录),Task 6 已注明只保 `test:unit` 段绿。
