# 钉钉助手 · 新人第一次配置（OAuth 向导版，推荐）

> 面向**第一次接入**的同事。用 Amazon Quick 自带的 OAuth 向导自动授权——**全程不用复制粘贴任何 token**，过期了 Quick 自己续。约 2 分钟。
>
> 不懂技术也能照做。本文是**推荐路径**；如果你的 Quick 版本没有 OAuth 向导，看文末「附录：手动复制 token（备用）」或 [remote-连接帮助.md](./remote-连接帮助.md)。

这是什么：在 Amazon Quick 里接上「钉钉助手」后，你能用大白话让它**以你本人身份**发钉钉消息、查群、查通讯录、建日程等——消息用**你的头像和昵称**出现，不是机器人。

向管理员要一个值：

- **网关域名**：形如 `https://<域名>`（例如 `https://d512ohnwy06c3.cloudfront.net`）

下面三个地址都是它拼出来的：
- 连接地址 `https://<域名>/mcp`
- 授权地址 `https://<域名>/authorize`
- 令牌地址 `https://<域名>/token`

---

## 一、第一次连接（2 步）

### 第 1 步：在 Quick 里新建连接器，选 User authentication

> ⚠️ **入口要走对**：从 **Connectors（连接器）→ Add connector → MCP** 进，**不要**从 Settings → MCP 进——后者会被当成"无认证"，不会触发 OAuth 授权。

认证方式选 **User authentication**（OAuth），按下表逐项填：

| 字段 | 填什么 |
|---|---|
| 名称 / Name | 随便起，例如 `钉钉助手` |
| MCP server endpoint / URL | `https://<域名>/mcp`（务必以 `/mcp` 结尾） |
| Network / 连接类型 | `Public network`（公网） |
| Authorization URL | `https://<域名>/authorize` |
| Token URL | `https://<域名>/token` |
| Client ID | `quick` |
| Client Secret | **任意非空占位串**，例如 `placeholder` |
| Scope | `openid` |

> **为什么 Client Secret 随便填？** 网关用更安全的 PKCE 机制鉴权，**不校验这个 secret**；但 Quick 的表单强制要求非空，所以填个占位值即可。别填真实密钥。

> ⚠️ **填完先自查域名**（最常见的翻车点）：MCP endpoint、Authorization URL、Token URL 三栏的域名必须**逐字一致**。例如 `d512ohnwy06c3` 中间是字母 **`y`**（d5-1-2-o-h-n-w-**y**-0-6-c-3），不是 `v`。**强烈建议复制粘贴，别手打**——打错一个字母授权页就打不开（浏览器报"意外终止了连接"）。

### 第 2 步：保存 → 点授权 → 用你的钉钉账号同意

保存后 Quick 会自动：

1. 弹出一个**登录 / 授权按钮**——点它。
2. 浏览器跳到钉钉，用**你自己的钉钉账号**点「同意」。
3. 自动跳回 Quick，**token 自动填好**——你不用复制任何东西。

状态变成 **Connected ✅**，显示一批工具（约 38 个）就成功了。

### 验证一下

在 Quick 对话框输入：

```
用 dingtalk 查一下我自己的钉钉账号信息
```

返回的是**你本人**的企业、部门信息 = 连通了。再试发消息会用**你的头像和昵称**出现在群里。

---

## 二、它会一直能用吗？

**会，而且比手动方式更省心。** access token 短期有效，但 **Quick 会自动用 refresh token 帮你续期**，你完全不用管。只有极端情况（连续 90 天完全没用过、或管理员重置了你的授权）才需要重连——届时 Quick 一般会自己重新弹授权按钮，点一下同意即可。

---

## 三、可能遇到的几个提示

**授权页打不开 / 「意外终止了连接」**
基本都是 URL 打错了字母。回去核对 Authorization URL、Token URL、MCP endpoint 三栏域名**逐字一致**（见第 1 步的域名自查）。复制粘贴最稳。

**`{"error":"invalid_client","error_description":"unknown client_id"}`**
Client ID 没填对。本网关预置了 `quick` 这个客户端，**Client ID 必须正好填 `quick`**（别留空、别自己改）。

**「redirect_uri not in registered allowlist」（授权第一步报错）**
你的 Quick 回调地址不在网关白名单里。把 Quick 报错里显示的回调地址（形如 `https://<region>.quicksight.aws.amazon.com/sn/oauthcallback`）发给管理员加白名单即可。**这不是你配错了**——是管理员侧的一次性动作，加完你重试一次就好。

**「Configured」一直不变「Connected」**
先确认 URL 结尾是 `/mcp`；再确认授权那一步真的点完了钉钉「同意」。仍不行找管理员看日志。

---

## 四、常见问题

**Q：我要去钉钉开发者后台配置什么吗？**
A：不需要。钉钉应用是管理员配的，你只是用自己的账号在浏览器点「同意」。

**Q：发消息会显示成机器人吗？**
A：不会。显示**你本人的头像和昵称**，跟你自己打字发的一样。

**Q：换了电脑怎么办？**
A：在新电脑的 Quick 里按「一」重新配一遍（用同一个钉钉账号授权）。

**Q：OAuth 向导版和手动复制版有啥区别？**
A：OAuth 向导版授权后 token 自动回填、自动续期，省去复制粘贴；手动版要自己复制一行 `Bearer ...` 粘进请求头。两者最终都是「以你本人身份操作钉钉」，能力完全一样。优先用向导版。

---

## 附录：手动复制 token（备用，Quick 没有 OAuth 向导时）

如果你的 Quick 版本只能填固定请求头、没有 OAuth 选项：

1. 浏览器直接打开 `https://<域名>/authorize`，用你的钉钉账号同意，**复制**返回页面里那行 `Bearer ...`。
2. 在 Quick 新建 MCP 连接器：连接类型 **Remote / HTTP**，URL 填 `https://<域名>/mcp`，请求头填 `Authorization: Bearer <刚复制的那行>`，Timeout 填 `300`。

详细手动流程见 [remote-连接帮助.md](./remote-连接帮助.md)。

---

> 🔧 **以下仅管理员相关，普通成员到此即可，无需继续阅读。**

**为什么 Client ID 固定是 `quick`**：Amazon Quick 的「User authentication」表单强制要填 Client ID/Secret 且不跑动态注册（DCR），直接拿你填的 ID 打 `/authorize`，所以网关侧必须预注册一个固定客户端。部署新环境（或重建了 OAuthStateTable）后，管理员需一次性预注册 `client#quick` 并把 Quick 回调加进它的白名单，否则成员填 `quick` 会报 `unknown client_id`。具体步骤（写哪条 DynamoDB 记录、如何验证）见 [remote-quick-desktop.md 的「附录：为方式 A 预注册 `quick` 客户端」](./remote-quick-desktop.md#附录为方式-a-预注册-quick-客户端每套环境一次性)。

---

需要技术细节（传输协议、OAuth 端点、故障排查矩阵、Local 与 Remote 并存）见 [remote-quick-desktop.md](./remote-quick-desktop.md)；管理员运维见 [remote-operations.md](./remote-operations.md)。
