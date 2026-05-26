# Feature: 外部群成员 openDingTalkId 支持

> 版本：v0.3.1  
> 日期：2026-05-26  
> 状态：待实施

---

## 1. 问题背景

在外部群（`groupType: "NEW_EXTERNAL_GROUP"`）中，成员可能不在当前企业通讯录中。这导致：

1. **`dingtalk_search_user` 搜索不到外部成员** — 通讯录搜索仅覆盖本企业员工
2. **`dingtalk_list_group_members` 调用失败** — 代码中使用了错误的 CLI flag（`--group` 而非 `--id`）
3. **无法 @ 外部群成员** — 因为拿不到 userId，导致 `--at-users` 无法使用

## 2. 解决方案

### 2.1 核心发现（源自 `chat.go:100` 注释）

钉钉对外部群成员采用 **openDingTalkId** 作为替代标识：

| 成员类型 | 返回的标识 | 原因 |
|----------|-----------|------|
| 内部员工 | userId | 同企业，可直接访问 |
| 外部成员 | openDingTalkId | 隐私保护，不暴露 userId |

### 2.2 正确的获取路径

```
dws chat group members list --id <openConversationId>
```

- 接口返回所有群成员，**外部成员只有 `openDingTalkId`，没有 `userId`**
- 内部成员同时返回 `userId` 和 `openDingTalkId`

### 2.3 使用 openDingTalkId 发消息/@ 人

发消息给外部成员时，使用 `--open-dingtalk-id` 参数替代 `--user`：

```bash
# 单聊发送给外部成员
dws chat message send --open-dingtalk-id <openDingTalkId> --title "标题" --text "内容"

# 日程添加外部参会人
dws calendar event create --title "会议" --start ... --end ... --open-dingtalk-ids <id1,id2>
```

---

## 3. 代码修改

### 3.1 修复 `dingtalk_list_group_members`（Bug Fix）

**文件**: `src/tools/chat/group.mjs`

**问题**: `args` 函数使用 `--group` flag，但 `dws chat group members list` 实际使用 `--id`

**修改前**:
```javascript
command: ["chat", "group", "members", "list"],
args(a) {
  return [["--group", a.chat_id]];
},
```

**修改后**:
```javascript
command: ["chat", "group", "members", "list"],
args(a) {
  return [["--id", a.chat_id]];
},
```

### 3.2 增强 `dingtalk_send_message` 的 @ 外部成员能力

**文件**: `src/tools/chat/message.mjs`

在 `dingtalk_send_message` 的 inputSchema 中增加 `at_open_dingtalk_ids` 参数：

```javascript
{
  name: "dingtalk_send_message",
  inputSchema: {
    type: "object",
    properties: {
      // ... 现有参数 ...
      at_users: { type: "string", description: "@指定 userId 列表（逗号分隔，仅群聊）。需在 text 中包含 <@userId>。" },
      at_open_dingtalk_ids: { type: "string", description: "@指定 openDingTalkId 列表（逗号分隔，仅群聊，用于外部成员）。需在 text 中包含对应标记。" },
    },
  },
  args(a) {
    return [
      [\"--group\", a.chat_id],
      [\"--user\", a.user_id],
      [\"--open-dingtalk-id\", a.open_dingtalk_id],
      [\"--title\", a.title],
      [\"--text\", a.text],
      a.at_all ? [\"--at-all\"] : null,
      [\"--at-users\", a.at_users],
      [\"--at-open-dingtalk-ids\", a.at_open_dingtalk_ids],
    ];
  },
}
```

### 3.3 新增 `dingtalk_list_group_members` 的 cursor 分页支持

根据 `dws chat group members list --help` 的 available_flags，命令支持 `--cursor` 分页：

```javascript
{
  name: "dingtalk_list_group_members",
  description: "列出群聊所有成员（含外部成员的 openDingTalkId）。底层调用 dws chat group members list。",
  annotations: READ_ONLY,
  inputSchema: {
    type: "object",
    properties: {
      chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
      cursor: { type: "string", description: "分页游标（首页留空）" },
    },
    required: ["chat_id"],
  },
  command: ["chat", "group", "members", "list"],
  args(a) {
    return [
      ["--id", a.chat_id],
      ["--cursor", a.cursor],
    ];
  },
}
```

---

## 4. Agent 工作流更新

### 4.1 在外部群中 @ 成员的完整流程

```
1. dingtalk_list_chats (搜索群名) → 获取 openConversationId
2. dingtalk_list_group_members (传入 chat_id) → 获取成员列表
   - 内部成员: 返回 userId + openDingTalkId
   - 外部成员: 仅返回 openDingTalkId
3. dingtalk_send_message (传入 chat_id + at_open_dingtalk_ids) → 发送消息并 @ 外部成员
```

### 4.2 MCP tool 描述更新建议

`dingtalk_list_group_members` 的 description 更新为：

> "列出群聊所有成员。内部成员返回 userId，外部成员返回 openDingTalkId（因隐私保护不暴露 userId）。底层调用 dws chat group members list。"

---

## 5. 影响范围

| 模块 | 变更类型 | 说明 |
|------|---------|------|
| `src/tools/chat/group.mjs` | Bug Fix | `--group` → `--id` |
| `src/tools/chat/group.mjs` | Enhancement | 增加 cursor 分页参数 |
| `src/tools/chat/message.mjs` | Enhancement | 新增 `at_open_dingtalk_ids` 参数 |
| ARCHITECTURE.md | Doc Update | 补充外部成员标识说明 |

---

## 6. 验证步骤

1. **修复验证**: 调用 `dingtalk_list_group_members` 传入外部群 chat_id，确认返回成员列表（含 openDingTalkId）
2. **@ 外部成员验证**: 向外部群发送消息，使用 `at_open_dingtalk_ids` @ 外部成员，确认钉钉客户端显示正确的 @ 标识
3. **回归测试**: 确认内部群的发消息、@ 功能不受影响

---

## 7. 相关参考

- DWS CLI 源码注释: `chat.go:100`（外部成员 openDingTalkId 说明）
- 钉钉开放平台文档: [会话成员管理](https://open.dingtalk.com/document/)
- 项目架构文档: `ARCHITECTURE.md` §3 Tool 声明格式
