# 5 分钟人工验证（决定方案是否成立）

这套方案的核心假设是："`dws chat message send`（钉钉官方叫 `chat.send_message_as_user`）发出的消息，群里其他成员看到的发送者是**用户本人**，不是机器人。"

如果假设不成立，整个 MCP wrapper 的价值（"以你本人身份替你操作钉钉"）就站不住，要换思路。所以**必须人肉验证一次**。

---

## 步骤 1：登录（约 1 分钟）

```bash
dws auth login --device
```

终端会输出一个 `user_code`（6-8 位字符）和一个短链接。**用钉钉扫码或在钉钉里打开链接**，输入 user_code 完成授权。

> 注意：headless Linux / SSH 环境**必须**用 `--device`（设备流），不要用默认的 `dws auth login`。后者会跳到 127.0.0.1 回调，远端浏览器跳不到本机。

如果你的企业管理员还没在 [open-dev.dingtalk.com](https://open-dev.dingtalk.com) → "CLI 访问管理"开通 CLI 权限，授权页会引导你"申请开通"。点 Apply Now 后管理员审批一次，全员永久生效。

验证已登录：
```bash
dws auth status -f json
# 期望: {"success":true,"authenticated":true,...}
```

---

## 步骤 2：拿到自己的 userId（约 30 秒）

```bash
dws contact user get-self -f json --jq '.result[0].orgEmployeeModel | {name: .orgUserName, userId, dept: .depts[0].deptName}'
```

记下 `userId` 这个值，下一步要用。

---

## 步骤 3：关键验证 — 给自己发一条消息（约 30 秒）

```bash
# 把 <YOUR_USERID> 换成上一步拿到的 userId
dws chat message send --user <YOUR_USERID> --title "user-mode test" --text "verify sender identity" -y
```

期望返回：
```json
{
  "success": true,
  "result": { ... }
}
```

---

## 步骤 4：肉眼检查（约 1 分钟，**这是整个验证的核心**）

打开**钉钉手机或桌面 App**，找到刚才发的那条消息（在你和"自己"的单聊里，或在"我的电脑"/类似的自聊会话里）。

**关键观察点**：
- 发送者头像：**是你本人头像** 还是 **某个机器人/默认头像**？
- 发送者昵称：**是你的姓名/花名** 还是 **某个 App/Bot 名字**？
- 消息底部是否有 "由 XXX 应用发送" 之类的小字？

---

## 步骤 5：把结果告诉我

只需要一句话：

- ✅ **A. 显示是我本人** → wrapper 的核心价值成立，可以直接 ship
- ⚠️ **B. 显示是某个应用名/机器人** → 方案的"用户态"是 API 鉴权层面的，**不是群聊呈现层面的**。要重新设计。
- ❌ **C. 报错了** → 把报错原文发给我，可能是权限 scope 没开通、企业未开通 CLI、或其他

---

## 已知可能的非"A"结果

钉钉的"开放平台应用消息"机制比飞书复杂——钉钉服务端可能强制把所有 OpenAPI 发出的消息标注一个"来源应用"小标签（即便鉴权是 user_access_token）。`chat.send_message_as_user` 这个名字字面看是用户态，但展示层是否真的"无痕"还需要肉眼确认。

如果是 **B**（API 鉴权用户态、展示层有 App 标记），那这套方案仍然有用——只是从"完全无痕替你操作"降级为"以你本人身份代发，群里能看出是 CLI/App 发的"。这个降级是否可接受由你判断。

如果是 **C**，最常见原因排查：
1. 未授权 IM 相关 scope → 重新 `dws auth login --device --force`，授权页选 IM 域
2. 企业未开通 CLI 访问权限 → 找企业管理员去 [open-dev.dingtalk.com](https://open-dev.dingtalk.com) 开通
3. userId 写错了 → `dws contact user get-self` 重新拿
