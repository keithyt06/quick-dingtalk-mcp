# quick-dingtalk-mcp 功能扩展需求（完整版）

> 基于 `dws-full-commands.md` 实际 `--help` 输出整理，确保每个模块命令全覆盖  
> 更新时间：2026-05-26

## 当前状态（v0.2）

已实现 14 个 tools：

| Tool | dws 命令 | 功能 |
| --- | --- | --- |
| dingtalk_send_message | `dws chat message send` | 发消息（群/单聊） |
| dingtalk_get_messages | `dws chat message list` | 查看消息历史 |
| dingtalk_search_messages | `dws chat message search` | 跨会话搜索消息 |
| dingtalk_list_chats | `dws chat search` | 搜索群聊 |
| dingtalk_search_user | `dws contact user search` | 搜索用户 |
| dingtalk_get_thread | `dws chat message list-topic-replies` | 查看话题回复 |
| dingtalk_create_event | `dws calendar event create` | 创建日程 |
| dingtalk_list_events | `dws calendar event list` | 查看日程列表 |
| dingtalk_get_event | `dws calendar event get` | 获取日程详情 |
| dingtalk_delete_event | `dws calendar event delete` | 删除日程 |
| dingtalk_check_busy | `dws calendar busy search` | 查询闲忙 |
| dingtalk_create_todo | `dws todo task create` | 创建待办 |
| dingtalk_list_todos | `dws todo task list` | 查看待办列表 |
| dingtalk_send_ding | `dws ding message send` | 发送 DING |

---

## P0 — 高频刚需补全

### 1. 日历补全（当前 5/14，补 9 个）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| ✅ dingtalk_create_event | `calendar event create` | --title, --start, --end, --attendees, --open-dingtalk-ids, --desc, --timezone | 已实现 |
| ✅ dingtalk_list_events | `calendar event list` | --start, --end | 已实现 |
| ✅ dingtalk_get_event | `calendar event get` | --id | 已实现 |
| ✅ dingtalk_delete_event | `calendar event delete` | --id | 已实现 |
| ✅ dingtalk_check_busy | `calendar busy search` | --users, --start, --end | 已实现 |
| 🆕 dingtalk_update_event | `calendar event update` | --id, --title, --start, --end, --desc, --timezone | 更新日程 |
| 🆕 dingtalk_suggest_time | `calendar event suggest` | --users, --start, --end, --duration, --timezone | 推荐可用时间 |
| 🆕 dingtalk_add_participant | `calendar participant add` | (event_id, user_ids) | 添加参与者 |
| 🆕 dingtalk_remove_participant | `calendar participant delete` | (event_id, user_ids) | 移除参与者 |
| 🆕 dingtalk_list_participants | `calendar participant list` | (event_id) | 列出参与者 |
| 🆕 dingtalk_list_rooms | `calendar room list-groups` | — | 列出会议室分组 |
| 🆕 dingtalk_search_rooms | `calendar room search` | — | 搜索会议室 |
| 🆕 dingtalk_add_room | `calendar room add` | — | 添加会议室到日程 |
| 🆕 dingtalk_delete_room | `calendar room delete` | — | 从日程移除会议室 |

### 2. 待办补全（当前 2/6，补 4 个）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| ✅ dingtalk_create_todo | `todo task create` | --title, --executors, --due, --priority, --recurrence | 已实现 |
| ✅ dingtalk_list_todos | `todo task list` | --page, --size, --status | 已实现 |
| 🆕 dingtalk_get_todo | `todo task get` | --task-id | 获取待办详情 |
| 🆕 dingtalk_update_todo | `todo task update` | --task-id, --title, --priority, --due, --done | 更新待办 |
| 🆕 dingtalk_delete_todo | `todo task delete` | --task-id | 删除待办 |
| 🆕 dingtalk_done_todo | `todo task done` | --task-id, --status(true/false) | 标记完成/未完成 |

### 3. DING 补全（当前 1/2，补 1 个）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| ✅ dingtalk_send_ding | `ding message send` | --users, --content, --type, --robot-code | 已实现 |
| 🆕 dingtalk_recall_ding | `ding message recall` | --id, --robot-code | 撤回 DING |

### 4. IM 增强（当前 6/57，补 20 个高频命令）

#### 消息操作

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_reply_message | `chat message reply` | (message_id, text) | 引用回复消息 |
| 🆕 dingtalk_forward_message | `chat message forward` | (message_id, target) | 转发消息 |
| 🆕 dingtalk_recall_message | `chat message recall` | (message_id) | 撤回消息 |
| 🆕 dingtalk_send_card | `chat message send-card` | (template, data) | 发送卡片消息 |
| 🆕 dingtalk_get_mentions | `chat message list-mentions` | — | 获取 @我 的消息 |
| 🆕 dingtalk_get_unread | `chat message list-unread-conversations` | — | 未读会话列表 |
| 🆕 dingtalk_get_focused | `chat message list-focused` | — | 特别关注人的消息 |
| 🆕 dingtalk_list_by_sender | `chat message list-by-sender` | (chat_id, sender_id) | 按发送者筛选消息 |
| 🆕 dingtalk_search_advanced | `chat message search-advanced` | (多维度) | 多维度搜索消息 |
| 🆕 dingtalk_read_status | `chat message query-read-status` | (message_id) | 查询消息已读状态 |
| 🆕 dingtalk_add_emoji | `chat message add-emoji` | (message_id, emoji) | 给消息添加表情 |

#### 群管理

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_create_group | `chat group create` | (name, members) | 创建群 |
| 🆕 dingtalk_dismiss_group | `chat group dismiss` | (group_id) | 解散群 |
| 🆕 dingtalk_rename_group | `chat group rename` | (group_id, name) | 改群名 |
| 🆕 dingtalk_list_group_members | `chat group members list` | (group_id) | 列出群成员 |
| 🆕 dingtalk_add_group_members | `chat group members add` | (group_id, user_ids) | 添加群成员 |
| 🆕 dingtalk_group_invite_url | `chat group invite-url` | (group_id) | 获取群邀请链接 |
| 🆕 dingtalk_mute_group | `chat group-mute` | (group_id) | 群全员禁言 |
| 🆕 dingtalk_set_admin | `chat group set-admin` | (group_id, user_id) | 设置管理员 |

#### 会话管理

| Tool | dws 命令 | 说明 |
| --- | --- | --- |
| 🆕 dingtalk_search_common | `chat search-common` | 搜索常用联系人/群 |
| 🆕 dingtalk_top_conversations | `chat list-top-conversations` | 置顶会话列表 |

---

## P1 — 常用功能

### 5. 文档（全 15 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_search_doc | `doc search` | --query, --page-size, --workspace-ids, --creator-uids, --extensions, --created-from/to, --visited-from/to | 搜索文档 |
| 🆕 dingtalk_read_doc | `doc read` | --node(nodeId) | 读取文档内容 |
| 🆕 dingtalk_list_docs | `doc list` | — | 列出文档 |
| 🆕 dingtalk_doc_info | `doc info` | — | 获取文档信息 |
| 🆕 dingtalk_create_doc | `doc create` | — | 创建文档 |
| 🆕 dingtalk_update_doc | `doc update` | — | 更新文档 |
| 🆕 dingtalk_upload_doc | `doc upload` | — | 上传文件 |
| 🆕 dingtalk_download_doc | `doc download` | — | 下载文件 |
| 🆕 dingtalk_copy_doc | `doc copy` | — | 复制文档 |
| 🆕 dingtalk_move_doc | `doc move` | — | 移动文档 |
| 🆕 dingtalk_rename_doc | `doc rename` | — | 重命名文档 |
| 🆕 dingtalk_doc_block | `doc block` | — | 块级编辑 |
| 🆕 dingtalk_doc_comment | `doc comment` | — | 文档评论 |
| 🆕 dingtalk_doc_file | `doc file` | — | 文件操作 |
| 🆕 dingtalk_doc_folder | `doc folder` | — | 文件夹操作 |

### 6. 云盘（全 9 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_drive_list | `drive list` | --space-id, --parent-id, --max, --next-token, --order, --order-by | 列出文件 |
| 🆕 dingtalk_drive_list_spaces | `drive list-spaces` | — | 列出空间 |
| 🆕 dingtalk_drive_info | `drive info` | — | 获取文件信息 |
| 🆕 dingtalk_drive_download | `drive download` | --space-id, --file-id | 下载文件 |
| 🆕 dingtalk_drive_upload | `drive upload` | — | 上传文件 |
| 🆕 dingtalk_drive_upload_info | `drive upload-info` | — | 获取上传信息 |
| 🆕 dingtalk_drive_commit | `drive commit` | — | 提交上传 |
| 🆕 dingtalk_drive_mkdir | `drive mkdir` | — | 创建文件夹 |
| 🆕 dingtalk_drive_delete | `drive delete` | — | 删除文件 |

### 7. 通讯录（全 6 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| ✅ dingtalk_search_user | `contact user search` | --query | 已实现 |
| 🆕 dingtalk_search_user_mobile | `contact user search-mobile` | — | 按手机号搜索 |
| 🆕 dingtalk_get_user | `contact user get` | --ids(逗号分隔) | 批量获取用户详情 |
| 🆕 dingtalk_get_self | `contact user get-self` | — | 获取当前用户信息 |
| 🆕 dingtalk_search_dept | `contact dept search` | — | 搜索部门 |
| 🆕 dingtalk_list_dept_members | `contact dept list-members` | — | 查看部门成员 |

### 8. 日志（全 6 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_create_report | `report create` | --template-id(必填), --contents(JSON, 必填), --to-chat, --to-user-ids | 创建日志 |
| 🆕 dingtalk_list_reports | `report list` | --start(必填), --end(必填), --cursor, --size | 查看收到的日志 |
| 🆕 dingtalk_list_sent_reports | `report sent` | — | 查看已发送的日志 |
| 🆕 dingtalk_report_detail | `report detail` | — | 获取日志详情 |
| 🆕 dingtalk_report_stats | `report stats` | — | 日志统计 |
| 🆕 dingtalk_report_template | `report template` | — | 获取日志模板 |

---

## P2 — 进阶功能

### 9. OA 审批（全 9 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_oa_list_pending | `oa approval list-pending` | --start, --end, --page, --size | 待审批列表 |
| 🆕 dingtalk_oa_list_initiated | `oa approval list-initiated` | --process-code(必填), --start(必填), --end, --max-results, --next-token | 已发起列表 |
| 🆕 dingtalk_oa_list_forms | `oa approval list-forms` | — | 列出审批表单 |
| 🆕 dingtalk_oa_detail | `oa approval detail` | --instance-id | 审批详情 |
| 🆕 dingtalk_oa_approve | `oa approval approve` | --instance-id, --task-id, --remark | 同意审批 |
| 🆕 dingtalk_oa_reject | `oa approval reject` | — | 拒绝审批 |
| 🆕 dingtalk_oa_revoke | `oa approval revoke` | — | 撤销审批 |
| 🆕 dingtalk_oa_records | `oa approval records` | — | 审批记录 |
| 🆕 dingtalk_oa_tasks | `oa approval tasks` | — | 审批任务 |

### 10. 考勤（全 4 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_attendance_record | `attendance record get` | --user(必填), --date(YYYY-MM-DD, 必填) | 查看打卡记录 |
| 🆕 dingtalk_attendance_summary | `attendance summary` | --user(必填), --date(必填), --stats-type(week/month, 必填) | 考勤汇总 |
| 🆕 dingtalk_attendance_rules | `attendance rules` | — | 考勤规则 |
| 🆕 dingtalk_attendance_shift | `attendance shift` | — | 排班管理 |

### 11. 邮箱（全 4 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_send_mail | `mail message send` | --from(必填), --to(必填), --subject(必填), --body(必填), --cc | 发送邮件 |
| 🆕 dingtalk_search_mail | `mail message search` | --email(必填), --query(KQL, 必填), --size, --cursor | 搜索邮件 |
| 🆕 dingtalk_get_mail | `mail message get` | — | 查看邮件内容 |
| 🆕 dingtalk_list_mailboxes | `mail mailbox list` | — | 邮箱地址列表 |

### 12. AI 搜索（全 1 个子命令）

| Tool | dws 命令 | 参数 | 说明 |
| --- | --- | --- | --- |
| 🆕 dingtalk_ai_search_person | `aisearch person` | --keyword(必填), --dimension(all/name/department/position/duty/supervisor/subordinate/phone/jobNumber) | 智能搜人 |

### 13. AI 听记（全 19 个子命令）

| Tool | dws 命令 | 说明 |
| --- | --- | --- |
| 🆕 dingtalk_list_minutes_all | `minutes list all` | 全部听记 |
| 🆕 dingtalk_list_minutes_mine | `minutes list mine` | 我的听记 |
| 🆕 dingtalk_list_minutes_shared | `minutes list shared` | 共享给我的 |
| 🆕 dingtalk_minutes_info | `minutes get info` | 基本信息 |
| 🆕 dingtalk_minutes_summary | `minutes get summary` | 摘要 |
| 🆕 dingtalk_minutes_todos | `minutes get todos` | 待办 |
| 🆕 dingtalk_minutes_transcription | `minutes get transcription` | 文字稿 |
| 🆕 dingtalk_minutes_keywords | `minutes get keywords` | 关键词 |
| 🆕 dingtalk_minutes_batch | `minutes get batch` | 批量获取 |
| 🆕 dingtalk_minutes_mind_graph | `minutes mind-graph` | 思维导图 |
| 🆕 dingtalk_minutes_speaker | `minutes speaker` | 发言人 |
| 🆕 dingtalk_minutes_hot_word | `minutes hot-word` | 个人热词 |
| 🆕 dingtalk_minutes_update | `minutes update` | 更新听记 |
| 🆕 dingtalk_minutes_upload | `minutes upload` | 上传音频 |
| 🆕 dingtalk_minutes_replace_text | `minutes replace-text` | 替换文本 |

### 14. 知识库（全 5+ 个子命令）

| Tool | dws 命令 | 说明 |
| --- | --- | --- |
| 🆕 dingtalk_wiki_create | `wiki space create` | 创建知识库 |
| 🆕 dingtalk_wiki_get | `wiki space get` | 查看知识库详情 |
| 🆕 dingtalk_wiki_list | `wiki space list` | 列出知识库 |
| 🆕 dingtalk_wiki_search | `wiki space search` | 搜索知识库 |
| 🆕 dingtalk_wiki_member | `wiki member` | 成员管理 |

---

## P3 — 长尾需求

### 15. AI 表格（42 个子命令）

| 分类 | dws 命令 | 说明 |
| --- | --- | --- |
| Base | `aitable base create/list/get/delete` | Base 管理 |
| 数据表 | `aitable table create/list/get/delete` | 数据表管理 |
| 字段 | `aitable field create/list/get/update/delete` | 字段管理 |
| 记录 | `aitable record create/query/update/delete` | 记录 CRUD |
| 视图 | `aitable view create/list/get/delete` | 视图管理 |
| 仪表盘 | `aitable dashboard create/list/get/delete` | 仪表盘 |
| 图表 | `aitable chart create/list/get/delete` | 图表 |
| 导入导出 | `aitable import/export` | 数据导入导出 |
| 附件 | `aitable attachment upload/download` | 附件管理 |
| 模板 | `aitable template list/get` | 模板搜索 |

### 16. 表格（20+ 个子命令）

| 分类 | dws 命令 | 说明 |
| --- | --- | --- |
| 文档级 | `sheet create/list/info` | 创建/列表/信息 |
| 工作表 | `sheet new` | 新建工作表 |
| 数据读写 | `sheet read/update/append` | 读取/更新/追加 |
| 搜索替换 | `sheet find/replace` | 搜索/替换 |
| 行列操作 | `sheet add-dimension/insert-dimension/delete-dimension/move-dimension/update-dimension` | 行列管理 |
| 单元格 | `sheet merge-cells/unmerge-cells` | 合并/拆分 |
| 筛选 | `sheet filter-view` | 筛选视图 |
| 图片 | `sheet write-image` | 写入图片 |
| 范围 | `sheet range` | 数据区域操作 |

### 17. 直播（2 个子命令）

| Tool | dws 命令 | 说明 |
| --- | --- | --- |
| 🆕 dingtalk_list_live | `live stream list` | 直播列表 |

---

## 统计汇总

| 优先级 | 当前已实现 | 新增 tools | 累计 |
| --- | --- | --- | --- |
| 已实现 | 14 | — | 14 |
| P0 补全 | — | +34（日历9 + 待办4 + DING 1 + IM 20） | 48 |
| P1 | — | +36（文档15 + 云盘9 + 通讯录5 + 日志6 + 直播1） | 84 |
| P2 | — | +41（OA 9 + 考勤4 + 邮箱4 + AI搜索1 + 听记15 + 知识库5 + 会议室3） | 125 |
| P3 | — | +62+（AI表格42 + 表格20+） | 187+ |
| **Schema-driven v1.0** | — | 自动发现全部 | **213** |

---

## 迭代计划

| 版本 | 内容 | 预计 Tools |
| --- | --- | --- |
| v0.2 ✅ | P0 基础（日历5 + 待办2 + DING 1） | 14 |
| v0.3 | P0 补全（日历补9 + 待办补4 + DING补1 + IM增强20） | 48 |
| v0.4 | P1（文档 + 云盘 + 通讯录 + 日志） | 84 |
| v0.5 | P2（OA + 考勤 + 邮箱 + AI搜索 + 听记 + 知识库） | 125 |
| v0.6 | P3（AI表格 + 表格 + 直播） | 187+ |
| v1.0 | Schema-driven 自动发现（覆盖全部 213 命令） | 213 |

---

## 技术策略

### 开发模式

每个新 tool 的添加步骤：
1. 运行 `dws <service> <command> --help` 确认参数
2. 在 `TOOLS` 数组添加 tool 定义（name + description + inputSchema）
3. 写 `buildXxxArgs(a)` 函数映射参数到 dws CLI 参数
4. 在 `CallToolRequestSchema` handler 的 switch/case 中注册

### Schema 自动发现（v1.0 目标）

```bash
# 发现所有产品及 tool 数量
dws schema --jq '.products[] | {id, tool_count: (.tools | length)}'

# 查看某个 tool 的完整参数 schema
dws schema calendar.create --jq '.tool.parameters'
```

后续可实现 schema-driven 模式，自动将 dws 的全部 tools 暴露为 MCP tools，无需逐个硬编码。

### 授权处理策略

新模块首次使用时可能返回权限错误，统一处理模式：
1. 捕获 `PAT_MEDIUM_RISK_NO_PERMISSION` 或 `PAT_HIGH_RISK_NO_PERMISSION`
2. 提取 `authorizationUrl` 返回给客户端
3. 引导用户在浏览器授权（可选 once/permanent）
4. 授权完成后重试

### dws 命令路径注意

实际命令路径可能与直觉不同（需逐个 `--help` 确认）：
- 待办：`dws todo task create`（不是 `dws todo create`）
- DING：`dws ding message send`（不是 `dws ding send`）
- 闲忙：`dws calendar busy search`（不是 `dws calendar busy`）
- 邮件：`dws mail message send`（不是 `dws mail send`）
- 考勤：`dws attendance record get`（不是 `dws attendance status`）

### 注意事项

1. **权限授权**：新模块首次使用需 OAuth 授权引导
2. **参数格式**：时间格式多为 ISO-8601，需逐个确认
3. **错误处理**：保持 `errorResult()` 模式统一处理
4. **测试**：每个 tool 先用 `--dry-run` 验证参数拼装
5. **dws 版本**：确保 dws ≥ v1.0.32，用 `dws upgrade` 保持更新
