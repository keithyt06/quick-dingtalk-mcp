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

### 第 1 步：在 Quick 里新建 MCP 连接器，选 OAuth

打开 **Quick → 设置（Settings）→ Capabilities → MCP → + Add MCP**，连接类型选 **Remote / HTTP**，认证方式选 **OAuth**，按下表填：

| 字段 | 填什么 |
|---|---|
| MCP Server Endpoint / URL | `https://<域名>/mcp`（务必以 `/mcp` 结尾） |
| Authorization URL | `https://<域名>/authorize` |
| Token URL | `https://<域名>/token` |
| Client ID | 留空（Quick 会自动注册）；若必须填，随便填 `quick` |
| Client Secret | **任意非空占位串**，例如 `placeholder` |
| Scope | `openid` |

> **为什么 Client Secret 随便填？** 网关用更安全的 PKCE 机制鉴权，**不校验这个 secret**；但 Quick 的表单强制要求非空，所以填个占位值即可。别填真实密钥。

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

## 三、可能遇到的两个提示

**「redirect_uri not in registered allowlist」（授权第一步报错）**
你的 Quick 回调地址不在网关白名单里。把 Quick 报错里显示的回调地址（形如 `https://<region>.quicksight.aws.amazon.com/sn/oauthcallback`）发给管理员加白名单即可。

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

需要技术细节（传输协议、OAuth 端点、故障排查矩阵、Local 与 Remote 并存）见 [remote-quick-desktop.md](./remote-quick-desktop.md)；管理员运维见 [remote-operations.md](./remote-operations.md)。
