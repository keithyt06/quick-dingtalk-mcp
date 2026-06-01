# 钉钉 OAuth / Token 注入 字段核对（对照 dws 源码）

**日期**:2026-05-30
**方法**:钉钉文档页 JS 动态渲染、WebFetch 抓不到正文,改用**最权威来源**——被包装的 `dws` CLI 自身源码(`DingTalk-Real-AI/dingtalk-workspace-cli` HEAD, v1.0.32 线)+ casdoor 的钉钉 provider 交叉验证。
**结论**:Remote 侧 OAuth 代码有 **3 个确定性 bug** + **1 个架构性疑问** + token 注入 stub 的**真实机制已查明**(和现有 D1/D2 假设都不一样)。

---

## 修复进度(2026-05-30)

**已修(不依赖 TOKEN,直接对照 dws 源码确定):**
- ✅ BUG-1 `expireIn`→`expiresIn`(§1.1):token-refresh-shim 两处改为 `j.expiresIn ?? j.expireIn`(兼容 casdoor/dws 两种,待真实返回定论)。新增测试断言 `expires_at` 为有限值 ~now+7200,不再 NaN。
- ✅ BUG-3 `prompt=consent` + scope `openid corpid`(§1.4):`DEFAULT_SCOPES` 默认值改 `openid corpid`,authorize URL 加 `prompt=consent`。新增测试断言两者。
- ✅ 多用户 keychain 串号(§2.4):server.js + inject-token.mjs 都加 `DWS_KEYCHAIN_DIR=<per-user dir>`。新增测试断言每用户 keychain 目录与 config 目录一致。

测试:token-refresh-shim 5/5、hmac 7/7、sm-client 5/5、docker(inject+server) 11/11、build:lambda 3/3 全绿(本机 Node20 用 esbuild 转译跑 TS 测试;mcp-middleware/sigv4/alarm-webhook 因 esbuild ESM 打包 `require("buffer")` 限制跑不了,但这三个文件未改动,本机限制非回归)。

**留到 TOKEN 联调(需真实验证,不能凭源码拍板):**
- ⏳ BUG-2 PKCE 去留(§1.3):dws 自身不用 PKCE。已在代码加注释,但 `code_challenge` 暂留——钉钉是否接受/要求 PKCE 要联调试。
- ⏳ token 注入策略(§2):`dws auth import --token` 不存在,正解可能是 `dws auth exchange --code`。D2 实现 + 测试维持现状,等联调确认 exchange 可用后重写。
- ⏳ 架构模式 direct vs MCP(§4)、scope-map 填充(§3)、PAT 错误 fixture。

> ⚠️ 所有"✅匹配 / ❌不匹配"是针对 **dws 直连模式(direct mode)** 的源码而言。dws 还有 MCP 模式(见 §4),用真 TOKEN 联调时第一件事是**抓 userAccessToken 的原始返回 JSON**,因为 casdoor 和 dws 对返回字段名有分歧(见 §1.2)。

---

## 1. token-refresh-shim/index.ts 的字段核对

dws 直连模式真实请求(`internal/auth/oauth_helpers.go: exchangeCode / refreshWithRefreshToken`):

```
// 换 token (authorization_code)
POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken
body(JSON): { clientId, clientSecret, code, grantType:"authorization_code" }

// 刷新 (refresh_token)
POST 同一个 URL
body(JSON): { clientId, clientSecret, refreshToken, grantType:"refresh_token" }

// 返回解析(parseTokenResponse)
{ accessToken, refreshToken, persistentCode, expiresIn, corpId }
```

### 1.1 ❌ BUG-1:返回字段名 `expireIn` 写错了
- 项目代码(`token-refresh-shim/index.ts:112,137`):`expires_in: j.expireIn`
- dws 源码解析的是 **`expiresIn`**(带 s)。
- 后果:`j.expireIn` 取到 `undefined` → `expires_at = now + undefined` = `NaN` → mcp-middleware 的 `expires_at - now < 60` 判断恒为真 → **每次调用都返回 503 token-near-expiry**,链路根本走不到 Runtime。
- **修复**:`j.expiresIn`。

### 1.2 ⚠️ 必须用真 TOKEN 验证:`expireIn` vs `expiresIn` 两个权威源打架
- casdoor 钉钉 provider(`idp/dingtalk.go`):`ExpiresIn int64 json:"expireIn"` ← 用 **expireIn**
- dws v1.0.32(`oauth_helpers.go`):`ExpiresIn int64 json:"expiresIn"` ← 用 **expiresIn**
- 两者矛盾(casdoor 偏旧、dws 是当前)。**只有真实 API 返回能定论。** 拿到 TOKEN 后第一步就是 dump 这个 JSON。
- 同理 `code` vs `authCode`(MCP 模式用 authCode,见 §4)也要一起确认。

### 1.3 ❌ BUG-2:exchange 多塞了 `codeVerifier`,且 dws 根本不用 PKCE
- 项目 `exchangeCodeForToken` 发送 `codeVerifier`,authorize URL 里也带 `code_challenge` / `code_challenge_method`。
- dws 真实 `buildAuthURL`(`oauth_helpers.go:303`)**完全没有 PKCE**:
  ```
  client_id, redirect_uri, response_type=code, scope, prompt=consent
  ```
  token 交换 body 里也**没有** codeVerifier。
- 判定:dws 走的是经典 server-side(有 clientSecret)流,**不是** PKCE。项目自建了一整套 PKCE,钉钉是否接受未验证。多发的 `codeVerifier` 钉钉大概率忽略,但 `code_challenge` 在 authorize 阶段如果钉钉严格校验 PKCE 会话一致性,反而可能让回调失败。
- **建议**:对齐 dws,先去掉 PKCE,改回 clientSecret 直连流(或留 TOKEN 联调时二选一验证)。

### 1.4 ❌ BUG-3:authorize URL 缺 `prompt=consent`,scope 缺 `corpid`
- 项目 authorize 没设 `prompt`;dws 固定 `prompt=consent`(强制拉起同意页)。不带可能被钉钉静默跳过、拿不到授权码或不弹同意。
- 项目 `DEFAULT_SCOPES = "openid"`;dws `DefaultScopes = "openid corpid"`。少了 `corpid` → 拿不到企业上下文(`corpId`),很多组织级接口会缺 corp。
- **修复**:`prompt=consent` + scope 默认 `openid corpid`。

### 1.5 ✅ 匹配的部分
- token 端点 URL、refresh body 字段、`grantType` 取值 ✓
- `users/me` 用 `x-acs-dingtalk-access-token` header、取 `unionId` ✓(casdoor + dws 一致)
- 但注意:dws 的 `corpId` 是从 **token 返回**里拿的,不是 users/me。项目从 users/me 取 userId 的兜底链 `unionId||userid||openId||userId` 里,`userid`/`userId` 大小写两版都列了,稳妥。

---

## 2. Token 注入(inject-token.mjs)真实机制 —— D1/D2 假设都要改

dws **有现成的 host 注入入口**,不需要我们逆向加密格式:

### 2.1 D2 假设错了:`dws auth import` 不收 `--token`
- 现有 D2:`dws auth import --token <accessToken>` → **会失败**。
- dws 真实 `import`(`auth_command.go:377`):`dws auth import -i <file> [--base64] [--force]`,吃的是 **`dws auth export` 产出的 tar.gz / base64 认证包**,不是裸 JWT。

### 2.2 ✅ 真正该用的:`dws auth exchange`(隐藏命令)
- `auth_command.go:442`:`dws auth exchange --code <authCode> --uid <uid>`
- 内部直接 code→token 交换并持久化到 configDir。这是**官方给 external host 的注入口**(注释原文:"takes an AuthCode and an optional UserID provided by an external host")。
- 含义:Remote 的正确模型可能是 **host 拿授权码 → 在容器里 `dws auth exchange` → dws 自己管 token**,而不是我们自己换 token 存 Secrets Manager 再想办法塞进 dws。这会**简化甚至删掉** token-refresh-shim 的换 token/刷新逻辑。

### 2.3 D1(直接写加密文件)真实格式已查明
若坚持自己写文件,真实落点是:
- Token 密文:`<configDir>/.data`(`secure_store.go`,`secureDataFile=".data"`),AES-256-GCM,明文是 `json.MarshalIndent(TokenData)`。
- DEK:`<StorageDir>/dek`,32 字节随机,文件权限 0600(`file_dek.go`)。
- 另有 keychain 副本:`<StorageDir>/auth-token.enc`(account=`auth-token`)。
- 加密格式:`[12B IV | ciphertext | 16B GCM tag]`(`keychain_linux.go: encryptData`)。
- 现有 D1 outline 写的是 `oauth-token.enc` —— **文件名/路径都不对**,应是 `.data` + keychain 的 `auth-token.enc`。

### 2.4 🔴 容器多用户隔离 bug:`DWS_KEYCHAIN_DIR` 没设
- `StorageDir`(`keychain_linux.go:45`)默认 `~/.local/share/dws-cli`,**不在 configDir 下**;只有设 `DWS_KEYCHAIN_DIR` 才跟着走。
- 项目容器只设了 `DWS_CONFIG_DIR=<per-user>`,**没设 `DWS_KEYCHAIN_DIR`** → 所有用户的 keychain(含 token 密文 + DEK)挤在同一个 `~/.local/share/dws-cli`,**跨用户串号/覆盖**。
- **修复**:每用户同时设 `DWS_CONFIG_DIR` 和 `DWS_KEYCHAIN_DIR` 指向各自目录。
- 附:`dws auth export` 要可移植必须**登录时**就 `DWS_DISABLE_KEYCHAIN=1`(否则 DEK 进系统 keychain)。容器运行已设该环境变量 ✓。

---

## 3. scope-map.json 仍全空
- dws 默认只要 `openid corpid` 两个顶层 scope;细粒度业务权限钉钉走的是 **PAT(host-owned)模式**下按需申请。`scope-map.json` 30 条命令的 scope 字符串要等登录态触发真实 PAT 错误后才能抄到(PoC 仍 ⏳)。
- 增量授权 URL(`server.js: buildAuthorizeUrl` 用 `extra_scope`)在 scope 字符串填上之前是空壳。

---

## 4. 🔴 架构性疑问:dws 可能根本不用你自己的 AppKey

`endpoints.go` + `oauth_provider.go` 显示 dws 有两条路:
- **direct mode**:用 `DWS_CLIENT_ID/DWS_CLIENT_SECRET`(或内置 DefaultClientID),直连 `api.dingtalk.com`。
- **MCP mode**(`IsClientIDFromMCP()`):clientId 从 `mcp.dingtalk.com/cli/clientId` **现取**,token 走 `mcp.dingtalk.com/oauth2/getToken`,body 是 `{clientId, authCode, grantType}`(**注意是 `authCode` 不是 `code`,且无 clientSecret**),刷新走 `/oauth2/refreshToken`。

dws 默认 `dws auth login --device` 很可能走 MCP mode(钉钉托管 clientId,用户不需要自建应用)。而项目 Remote 的整套设计假设"管理员注册一个钉钉应用、拿 AppKey/AppSecret、自己驱动 OAuth"——**这对应 direct mode**。两种模式的回调地址注册、scope、token 端点都不同。

**拿到 TOKEN 联调时必须先定:Remote 到底走 direct 还是 MCP 模式。** 这决定 token-refresh-shim 几乎一半代码。

---

## 拿到真实 TOKEN 后的最小验证清单(按优先级)
1. **dump `userAccessToken` 原始返回 JSON** → 定 `expireIn`/`expiresIn`、字段全名。(解 §1.1/1.2)
2. `dws auth login` 后看 `dws auth status -f json` + `ls -la $DWS_CONFIG_DIR` + `ls -la ~/.local/share/dws-cli`,确认 token 落点是 `.data` 还是 keychain,确认是否 MCP 模式。(解 §2.3/2.4/4)
3. 试 `dws auth exchange --code <code> --uid <uid>` 能否注入成功 → 定 token 注入走 exchange 而非自写文件。(解 §2.2)
4. 登录时少勾 scope,触发真实 PAT 错误,抄 stderr JSON + missing scope 字符串。(解 §3 + 填 scope-map + errors.mjs fixture)
5. 确认 authorize 必须 `prompt=consent` + scope `openid corpid`。(解 §1.4)
