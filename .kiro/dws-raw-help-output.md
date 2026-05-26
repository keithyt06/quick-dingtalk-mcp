$ dws --help
Discovered MCP Services:

  aiapp        AI 应用创建 / 查询 / 修改
  aisearch     AI 搜问：按姓名/工号/手机号/部门/职责/上下级等维度搜人
  aitable      AI 表格操作（Base / 数据表 / 字段 / 记录 / 视图 / 仪表盘 / 图表 / 导入导出 / 附件 / 模板）
  attendance   考勤打卡 / 排班 / 统计
  calendar     日历日程 / 会议室 / 闲忙
  chat         IM 扩展命令（合并到 dws chat 命令树）
  contact      通讯录 / 用户 / 部门
  devdoc       开放平台文档搜索
  ding         DING 消息 / 发送 / 撤回
  doc          钉钉文档（搜索 / 浏览 / 读写 / 上传下载 / 文件 / 文件夹 / 块级编辑 / 评论）
  doc-comment  文档评论（子 server，由 doc 产品通过 toolOverrides.serverOverride 调用）。
  drive        云盘 / 文件 / 上传 / 下载
  live         直播列表 / 信息
  mail         邮箱 / 邮件收发
  minutes      AI 听记（列表 / 详情 / 摘要 / 待办 / 文字稿 / 录音 / 思维导图 / 发言人 / 热词 / 上传）
  oa           OA 审批 / 同意 / 拒绝 / 撤销
  pat          行为授权管理
  report       日志 / 模版 / 统计
  sheet        钉钉表格管理
  todo         待办任务管理
  wiki         钉钉知识库管理

Usage:
  dws <service> [command] [flags]
  dws <command> [flags]

Utility Commands:

  api         调用钉钉 OpenAPI (Raw HTTP)
  auth        认证管理
  cache       缓存管理
  completion  生成 Shell 自动补全脚本
  config      配置管理
  doctor      环境健康检查
  help        Help about any command
  plugin      Manage plugins
  recovery    错误恢复辅助命令
  schema      查看 MCP 工具 Schema (产品列表 / 工具参数)
  skill       技能管理
  version     显示版本信息

Use "dws <service> --help" for more information about a discovered MCP service or "dws <command> --help" for utility commands.

提示: 如果遇到能力缺失、命令报错、新功能未注册、或无法完成任务, 请先用 'dws upgrade' 升级到最新版本后再试. 钉钉 OpenAPI 和 dws CLI 持续迭代, 新能力和 bugfix 会先在新版本上线.

$ dws chat --help
IM 扩展命令（合并到 dws chat 命令树）

Usage:
  dws chat [flags]
  dws chat [command]

Available Commands:
  bot                    机器人
  conversation-info      chat/conversation-info
  group                  群组扩展管理
  group-mute             群全员禁言
  group-mute-member      群成员禁言
  list-categories        列出用户自定义会话分类
  list-conversations     按分类拉取会话列表
  list-top-conversations chat/list-top-conversations
  message                消息扩展操作
  mute                   会话消息免打扰（开启/关闭）
  search                 根据关键词搜索群聊（im 新版）
  search-common          搜索共同群（指定昵称列表，查询共同所在的群聊）
  set-top                会话置顶（开启/关闭）

Flags:
  -h, --help   help for chat

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws chat [command] --help" for more information about a command.

$ dws chat message --help
消息扩展操作

Usage:
  dws chat message [flags]
  dws chat message [command]

Available Commands:
  add-emoji                 给消息添加表情回复
  add-text-emotion          添加文字表情
  combine-forward           将一组消息合并转发到目标会话（合并转发卡片）。
  create-text-emotion       创建文字表情
  forward                   转发消息
  list                      chat/list
  list-all                  按时间范围分页搜索历史消息，结果包含单聊和群聊（singleChat 字段区分）。若只关心某位同事的单聊，用 dws chat message list-direct --user <userId> 更直接。
  list-by-ids               按消息 ID 列表批量获取消息
  list-by-sender            拉取指定发送者的消息（含单聊 / 群聊；两者互斥）
  list-direct               按对方 userId 拉取单聊会话的消息（专用于私聊；查群聊请用 dws chat message list --group <openConversationId>）。
  list-focused              拉取特别关注人的消息
  list-mentions             拉取 @我 的消息
  list-topic-replies        拉取群话题回复消息列表
  list-unread-conversations 获取未读会话列表
  query-read-status         查询消息已读状态
  query-send-status         查询消息发送状态（按 openTaskId）
  recall                    撤回单条消息
  recall-by-bot             机器人撤回消息（--group 群聊 / 不传为单聊）
  remove-emoji              移除消息表情回复
  remove-text-emotion       移除文字表情
  reply                     引用回复消息（支持单聊/群聊）
  search                    按关键词搜索消息
  search-advanced           多维度搜索消息
  send                      以当前用户身份发送消息 (--group 群聊 / --user 或 --open-dingtalk-id 单聊)
  send-by-bot               机器人发送消息（--group 群聊 / --users 单聊）
  send-by-webhook           自定义机器人 Webhook 发送群消息
  send-card                 创建并发送卡片
  send-direct               按对方 userId 给同事发单聊消息（同组织内同事用 --user；非同组织好友用 --open-dingtalk-id）。如需群发请用 dws chat message send --group。
  update-card               更新流式卡片

Flags:
  -h, --help   help for message

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws chat message [command] --help" for more information about a command.

$ dws chat message send --help
以当前用户身份发送群消息或单聊消息。

--group 指定群聊 openConversationId 发群消息；--user 指定 userId 发单聊；
--open-dingtalk-id 指定 openDingTalkId 发单聊 (适用于无法获取 userId 的场景)。
三者只能选其一，不能同时指定。

消息内容通过 --text 传入，也可作为位置参数；支持 Markdown。
--title 是消息标题，群聊与单聊都必填（API 强制要求；缺失时返回误导性的 "发群服务窗会话消息失败"）。

群聊场景下可用 --at-all / --at-users / --at-mobiles 进行 @ 提醒（仅 --group 时生效）。
注意 --text 中需包含对应的 <@userId> / <@all> 占位符才能在客户端渲染出 @ 效果。

Usage:
  dws chat message send [flags]

Examples:
  dws chat message send --group <openconversation_id> --title "周报" --text "请提交本周日报"
  dws chat message send --user <userId> --title "提醒" --text "请查收"
  dws chat message send --open-dingtalk-id <openDingTalkId> --title "提醒" --text "请确认"
  dws chat message send --group <openconversation_id> --title "拉群通知" --text "<@uid> 你被 @ 了" --at-users uid

Flags:
      --at-all                    @所有人 (仅 --group 群聊生效)
      --at-mobiles string         按手机号 @ 指定成员，逗号分隔 (仅 --group 群聊生效)
      --at-users string           按 userId @ 指定成员，逗号分隔 (仅 --group 群聊生效)
      --group string              群会话 openConversationId (群聊三选一)
  -h, --help                      help for send
      --open-dingtalk-id string   接收人 openDingTalkId (单聊三选一)
      --text string               消息内容，支持 Markdown (也可作位置参数)
      --title string              消息标题 (必填，群聊与单聊都必填)
      --user string               接收人 userId (单聊三选一)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message reply --help
以当前用户身份引用某条消息并回复。需 --conversation-id 会话 ID、--ref-msg-id 被引用消息 ID、--ref-sender 原发送者 openDingTalkId、--text 回复内容。

Usage:
  dws chat message reply [flags]

Examples:
  dws chat message reply --conversation-id <openConversationId> --ref-msg-id <openMessageId> --ref-sender <openDingTalkId> --text "收到，马上处理"

Flags:
      --conversation-id string   会话 openConversationId (必填，支持单聊/群聊)
  -h, --help                     help for reply
      --ref-msg-id string        被引用的消息 openMessageId (必填)
      --ref-sender string        被引用消息发送者 openDingTalkId (必填)
      --text string              回复正文 (必填)
      --uuid string              可选 uuid（幂等标识）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message list --help
chat/list

Usage:
  dws chat message list [flags]

Flags:
      --forward        forward (default true)
      --group string   群会话 openconversationId（必填，**仅支持群聊**；查群 ID 用 dws chat search --query "群名"。如需查单聊消息请用 dws chat message list-direct --user <userId>）
  -h, --help           help for list
      --limit int      limit (default 50)
      --time string    time

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message list-all --help
按时间范围分页搜索历史消息，结果包含单聊和群聊（singleChat 字段区分）。若只关心某位同事的单聊，用 dws chat message list-direct --user <userId> 更直接。

Usage:
  dws chat message list-all [flags]

Examples:
  dws chat message list-all --start "2025-03-01 00:00:00" --end "2025-03-31 23:59:59" --limit 50
  dws chat message list-all --start "2025-03-01 00:00:00" --end "2025-03-31 23:59:59" --limit 50 --cursor "abc123token"
  # 只想精确拉某个同事的单聊消息：用 dws chat message list-direct --user <userId>

Flags:
      --cursor string   分页游标（首页传 "0"） (default "0")
      --end string      结束时间，格式 yyyy-MM-dd HH:mm:ss（必填）
  -h, --help            help for list-all
      --limit int       每页返回数量（默认 50） (default 50)
      --start string    起始时间，格式 yyyy-MM-dd HH:mm:ss（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message list-mentions --help
拉取 @我 的消息

Usage:
  dws chat message list-mentions [flags]

Examples:
  dws chat message list-mentions --start "2026-03-10T00:00:00+08:00" --end "2026-03-11T00:00:00+08:00" --limit 50 --cursor 0
  dws chat message list-mentions --start "2026-04-01T00:00:00+08:00" --end "2026-04-14T00:00:00+08:00" --limit 20 --cursor 0
  dws chat message list-mentions --group <openconversation_id> --start "2026-03-10T00:00:00+08:00" --end "2026-03-11T00:00:00+08:00" --limit 50 --cursor 0
  dws chat message list-mentions --start "2026-03-10T00:00:00+08:00" --end "2026-03-11T00:00:00+08:00" --limit 50 --cursor <nextCursor>
  # 查询群 ID: dws chat search --query "群名"

Flags:
      --cursor string   分页游标（默认 "0"） (default "0")
      --end string      结束时间，ISO-8601 格式（必填）
      --group string    群聊 openconversation_id（可选，不传则查全部）
  -h, --help            help for list-mentions
      --limit int       每页返回数量（默认 50） (default 50)
      --start string    开始时间，ISO-8601 格式（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message list-unread-conversations --help
获取未读会话列表

Usage:
  dws chat message list-unread-conversations [flags]

Examples:
  dws chat message list-unread-conversations
  dws chat message list-unread-conversations --count 20

Flags:
      --count int   返回未读会话条数（可选，不传使用服务端默认）
  -h, --help        help for list-unread-conversations

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message search --help
按关键词搜索消息

Usage:
  dws chat message search [flags]

Examples:
  dws chat message search --keyword "changefree" --start "2026-04-01T00:00:00+08:00" --end "2026-04-15T00:00:00+08:00" --limit 50 --cursor 0
  dws chat message search --keyword "codereview" --group <openconversation_id> --start "2026-04-01T00:00:00+08:00" --end "2026-04-15T00:00:00+08:00" --limit 100 --cursor 0
  dws chat message search --keyword "链接" --start "2026-04-15T00:00:00+08:00" --end "2026-04-16T00:00:00+08:00" --limit 100 --cursor <nextCursor>
  # 查询群 ID: dws chat search --query "群名"

Flags:
      --cursor string    分页游标（默认 "0"） (default "0")
      --end string       结束时间，ISO-8601 格式（必填）
      --group string     群聊 openconversation_id（可选，不传则搜索所有会话）
  -h, --help             help for search
      --keyword string   搜索关键词（必填）
      --limit int        每页返回数量（默认 100） (default 100)
      --start string     开始时间，ISO-8601 格式（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message search-advanced --help
多维度搜索消息

Usage:
  dws chat message search-advanced [flags]

Flags:
      --at-ids string             atOpenDingTakIds
      --at-me                     atMe
      --conversation-ids string   openConversationIds
      --cursor string             cursor
      --end string                endTime
  -h, --help                      help for search-advanced
      --keyword string            keyword
      --limit int                 limit
      --sender-ids string         senderOpenDingTakIds
      --start string              startTime

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message forward --help
转发消息

Usage:
  dws chat message forward [flags]

Flags:
      --dest-conversation-id string   目标会话 openConversationId（必填）
  -h, --help                          help for forward
      --msg-id string                 源消息 openMessageId（必填）
      --src-conversation-id string    源会话 openConversationId（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message recall --help
撤回单条消息

Usage:
  dws chat message recall [flags]

Flags:
      --group string    群/会话 openConversationId（必填）
  -h, --help            help for recall
      --msg-id string   消息 openMessageId（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message send-card --help
创建并发送卡片

Usage:
  dws chat message send-card [flags]

Flags:
      --card-data string          cardData
      --card-template-id string   cardTemplateId
      --group string              群/会话 openConversationId（必填）
  -h, --help                      help for send-card
      --user string               openDingTalkId

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat message query-read-status --help
查询消息已读状态

Usage:
  dws chat message query-read-status [flags]

Flags:
      --group string    群/会话 openConversationId（必填）
  -h, --help            help for query-read-status
      --msg-id string   消息 openMessageId（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat group --help
群组扩展管理

Usage:
  dws chat group [flags]
  dws chat group [command]

Available Commands:
  bots            列出群内的机器人。
  create          创建群
  dismiss         解散群（不可恢复，仅群主可用）。
  get-by-group-id 按内部 groupId 获取会话信息
  invite-url      获取群邀请链接
  member-role     群自定义角色
  members         群组成员管理
  quit            退出群聊
  rename          更新群名称
  set-admin       设置/取消群管理员
  set-history     设置新成员入群可见历史消息策略。
  transfer-owner  转让群主
  update-icon     更新群头像
  update-settings 更新群设置

Flags:
  -h, --help   help for group

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws chat group [command] --help" for more information about a command.

$ dws chat group create --help
创建群

Usage:
  dws chat group create [flags]

Examples:
  dws chat group create --name "Q1 项目冲刺群" --users userId1,userId2,userId3

Flags:
  -h, --help           help for create
      --name string    群名称 (必填)
      --users string   群成员 userId 列表，逗号分隔 (必填)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat group members --help
群组成员管理

Usage:
  dws chat group members [flags]
  dws chat group members [command]

Available Commands:
  add         向群中添加成员
  add-bot     添加机器人到群
  list        查看群成员列表
  remove      从群中移除成员
  remove-bot  把机器人移出群。

Flags:
  -h, --help   help for members

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws chat group members [command] --help" for more information about a command.

$ dws chat search --help
根据关键词搜索群聊（im 新版）

Usage:
  dws chat search [flags]

Flags:
      --cursor string    分页游标 (default "0")
  -h, --help             help for search
      --keyword string   搜索关键词（必填）
      --limit int        每页返回数量 (default 20)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws chat search-common --help
搜索共同群（指定昵称列表，查询共同所在的群聊）

Usage:
  dws chat search-common [flags]

Examples:
  dws chat search-common --nicks "风雷,山乔" --limit 20 --cursor 0
  dws chat search-common --nicks "天鸡,乐函" --match-mode OR --limit 20 --cursor 0
  dws chat search-common --nicks "风雷,山乔,天鸡" --limit 10 --cursor <nextCursor>

Flags:
      --cursor string       分页游标（默认 "0"） (default "0")
  -h, --help                help for search-common
      --limit int           每页返回数量（默认 20） (default 20)
      --match-mode string   匹配模式：AND=所有人都在群里，OR=任一人在群里 (default "AND")
      --nicks string        要搜索的昵称列表，逗号分隔（必填）

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar --help
日历日程 / 会议室 / 闲忙

Usage:
  dws calendar [flags]
  dws calendar [command]

Available Commands:
  busy        闲忙查询
  event       日程管理
  participant 日程参与者管理
  room        会议室管理

Flags:
  -h, --help   help for calendar

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws calendar [command] --help" for more information about a command.

$ dws calendar event --help
日程管理

Usage:
  dws calendar event [flags]
  dws calendar event [command]

Available Commands:
  create      calendar/create
  delete      calendar/delete
  get         calendar/get
  list        calendar/list
  suggest     calendar/suggest
  update      calendar/update

Flags:
  -h, --help   help for event

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws calendar event [command] --help" for more information about a command.

$ dws calendar event create --help
calendar/create

Usage:
  dws calendar event create [flags]

Flags:
      --attendees string           attendees
      --desc string                description
      --end string                 endDateTime
  -h, --help                       help for create
      --open-dingtalk-ids string   openDingTalkIds
      --start string               startDateTime
      --timezone string            timeZone
      --title string               summary

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar event list --help
calendar/list

Usage:
  dws calendar event list [flags]

Flags:
      --end string     endTime
  -h, --help           help for list
      --start string   startTime

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar event get --help
calendar/get

Usage:
  dws calendar event get [flags]

Flags:
  -h, --help        help for get
      --id string   eventId

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar event update --help
calendar/update

Usage:
  dws calendar event update [flags]

Flags:
      --desc string       description
      --end string        endDateTime
  -h, --help              help for update
      --id string         eventId
      --start string      startDateTime
      --timezone string   timeZone
      --title string      summary

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar event delete --help
calendar/delete

Usage:
  dws calendar event delete [flags]

Flags:
  -h, --help        help for delete
      --id string   eventId

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar event suggest --help
calendar/suggest

Usage:
  dws calendar event suggest [flags]

Flags:
      --duration string   durationMinutes
      --end string        end
  -h, --help              help for suggest
      --start string      start
      --timezone string   timeZone
      --users string      attendeeUserIds

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar busy --help
闲忙查询

Usage:
  dws calendar busy [flags]
  dws calendar busy [command]

Available Commands:
  search      calendar/search

Flags:
  -h, --help   help for busy

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws calendar busy [command] --help" for more information about a command.

$ dws calendar busy search --help
calendar/search

Usage:
  dws calendar busy search [flags]

Flags:
      --end string     endTime
  -h, --help           help for search
      --start string   startTime
      --users string   userIds

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar participant --help
日程参与者管理

Usage:
  dws calendar participant [flags]
  dws calendar participant [command]

Available Commands:
  add         calendar/add
  delete      calendar/delete
  list        calendar/list

Flags:
  -h, --help   help for participant

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws calendar participant [command] --help" for more information about a command.

$ dws calendar participant add --help
calendar/add

Usage:
  dws calendar participant add [flags]

Flags:
      --event string      eventId
  -h, --help              help for add
      --optional string   optional
      --users string      attendeesToAdd

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar participant delete --help
calendar/delete

Usage:
  dws calendar participant delete [flags]

Flags:
      --event string   eventId
  -h, --help           help for delete
      --users string   attendeesToRemove

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar participant list --help
calendar/list

Usage:
  dws calendar participant list [flags]

Flags:
      --event string   eventId
  -h, --help           help for list

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar room --help
会议室管理

Usage:
  dws calendar room [flags]
  dws calendar room [command]

Available Commands:
  add         calendar/add
  delete      calendar/delete
  list-groups calendar/list-groups
  search      calendar/search

Flags:
  -h, --help   help for room

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws calendar room [command] --help" for more information about a command.

$ dws calendar room add --help
calendar/add

Usage:
  dws calendar room add [flags]

Flags:
      --event string   eventId
  -h, --help           help for add
      --rooms string   roomIds

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar room delete --help
calendar/delete

Usage:
  dws calendar room delete [flags]

Flags:
      --event string   eventId
  -h, --help           help for delete
      --rooms string   roomIds

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar room list-groups --help
calendar/list-groups

Usage:
  dws calendar room list-groups [flags]

Flags:
  -h, --help   help for list-groups

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws calendar room search --help
calendar/search

Usage:
  dws calendar room search [flags]

Flags:
      --available string   needAvailable
      --end string         endTime
      --group-id string    groupId
  -h, --help               help for search
      --start string       startTime

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws todo --help
待办任务管理

Usage:
  dws todo [flags]
  dws todo [command]

Available Commands:
  task        创建 / 查询 / 更新 / 删除待办

Flags:
  -h, --help   help for todo

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws todo [command] --help" for more information about a command.

$ dws todo task --help
创建 / 查询 / 更新 / 删除待办

Usage:
  dws todo task [flags]
  dws todo task [command]

Available Commands:
  create      Create todo
  delete      Delete todo
  done        Update executor todo done status
  get         Todo detail
  list        List todos
  update      Update todo task

Flags:
  -h, --help   help for task

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws todo task [command] --help" for more information about a command.

$ dws todo task create --help
Create todo

Usage:
  dws todo task create [flags]

Examples:
  dws todo task create --title "修复线上Bug" --executors userId1,userId2 --priority 40
  dws todo task create --title "提交报告" --executors userId1 --due "2026-03-10T18:00:00+08:00"

  # 查询 userId: dws contact user search --query "姓名"

Flags:
      --due string          Due time ISO-8601 (e.g. 2026-03-10T18:00:00+08:00)
      --executors string    执行者 userId 列表，逗号分隔 (必填)。注意: 此处是通讯录 userId，可通过 dws contact user search --query 姓名 查询
  -h, --help                help for create
      --priority string     Priority: 10=low/20=normal/30=high/40=urgent
      --recurrence string   Recurring todo (requires --due); format: DTSTART:...\nRRULE:FREQ=DAILY;INTERVAL=1
      --title string        Todo title (required)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws todo task list --help
查询当前用户在当前企业的待办列表。

覆盖范围:
  返回当前用户作为"执行者"(executor) 的待办。
  仅参与但不执行的待办、自己创建但交给他人执行的待办不在返回范围内。

  当前列表能力面向"个人待办"，即钉钉待办模块中展示的待办任务，
  不包含 OA 审批流待办、Teambition 项目任务等其他业务线的待办。

分页:
  默认每页 20 条。--size 超过 20 时，CLI 会自动进行多次 API 调用
  并合并结果（自动分页），无需手动翻页。

Usage:
  dws todo task list [flags]

Examples:
  dws todo task list --page 1 --size 20 --status false

Flags:
  -h, --help            help for list
      --page string     page number (required) (default "1")
      --size string     Fetch count, auto-paginate if over 20 (default 20) (default "20")
      --status string   true=completed, false=not completed

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws todo task get --help
查看待办任务详情。

返回字段说明:
  creatorId / executorIds / participantIds / modifierId
    待办系统内部人员标识（短数字 ID，如 6380165826），
    不是通讯录 userId（如 035551044606950179）或 unionid。
    这些 ID 在待办系统内对同一用户稳定，但无法直接用于通讯录 API 查询。
    如需获取人员姓名，可参考返回中的 creatorInfo / executorInfos /
    participantInfos 字段（包含 name 属性）。

  bizTag / source
    底层待办引擎的实现标识。即使是在钉钉客户端直接创建的普通个人待办，
    也会返回 "teambition"，这是内核实现细节，不代表来自 Teambition 产品。

  tenantId / tenantType
    待办所属的租户标识，非企业 corpId。tenantType 为 "user" 时
    tenantId 是用户维度标识；为 "org" 时是组织维度标识。

Usage:
  dws todo task get [flags]

Examples:
  dws todo task get --task-id <taskId>

  # 查询 taskId: dws todo task list

Flags:
  -h, --help             help for get
      --task-id string   Todo task ID (required)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws todo task update --help
Update todo task

Usage:
  dws todo task update [flags]

Examples:
  dws todo task update --task-id <taskId> --title "新标题"
  dws todo task update --task-id <taskId> --priority 40 --due "2026-03-10T18:00:00+08:00"
  dws todo task update --task-id <taskId> --done true

  # 查询 taskId: dws todo task list

Flags:
      --done string       Done status: true/false
      --due string        Due time ISO-8601 (e.g. 2026-03-10T18:00:00+08:00)
  -h, --help              help for update
      --priority string   Priority: 10=low/20=normal/30=high/40=urgent
      --task-id string    Todo task ID (required)
      --title string      New title

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws todo task delete --help
Delete todo

Usage:
  dws todo task delete [flags]

Examples:
  dws todo task delete --task-id <taskId>
  dws todo task delete --task-id <taskId> --yes

  # 查询 taskId: dws todo task list

Flags:
  -h, --help             help for delete
      --task-id string   Todo task ID (required)
      --yes              Skip confirmation and delete directly

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志

$ dws todo task done --help
Update executor todo done status

Usage:
  dws todo task done [flags]

Examples:
  dws todo task done --task-id <taskId> --status true
  dws todo task done --task-id <taskId> --status false

  # 查询 taskId: dws todo task list

Flags:
  -h, --help             help for done
      --status string    Done status: true=completed, false=not completed (required)
      --task-id string   Todo task ID (required)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws ding --help
DING 消息 / 发送 / 撤回

Usage:
  dws ding [flags]
  dws ding [command]

Available Commands:
  message     DING 消息管理

Flags:
  -h, --help   help for ding

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws ding [command] --help" for more information about a command.

$ dws ding message --help
DING 消息管理

Usage:
  dws ding message [flags]
  dws ding message [command]

Available Commands:
  recall      ding/recall
  send        ding/send

Flags:
  -h, --help   help for message

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws ding message [command] --help" for more information about a command.

$ dws ding message send --help
ding/send

Usage:
  dws ding message send [flags]

Flags:
      --content string      content
  -h, --help                help for send
      --robot-code string   robotCode
      --type string         remindType
      --users string        receiverUserIdList

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws ding message recall --help
ding/recall

Usage:
  dws ding message recall [flags]

Flags:
  -h, --help                help for recall
      --id string           openDingId
      --robot-code string   robotCode

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws doc --help
钉钉文档（搜索 / 浏览 / 读写 / 上传下载 / 文件 / 文件夹 / 块级编辑 / 评论）

Usage:
  dws doc [flags]
  dws doc [command]

Available Commands:
  block       块级编辑
  comment     文档评论
  copy        doc/copy
  create      doc/create
  download    doc/download
  file        文件管理
  folder      文件夹管理
  info        doc/info
  list        doc/list
  move        doc/move
  read        doc/read
  rename      doc/rename
  search      doc/search
  update      doc/update
  upload      doc/upload

Flags:
  -h, --help   help for doc

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws doc [command] --help" for more information about a command.

$ dws drive --help
云盘 / 文件 / 上传 / 下载

Usage:
  dws drive [flags]
  dws drive [command]

Available Commands:
  commit      drive/commit
  delete      drive/delete
  download    drive/download
  info        drive/info
  list        drive/list
  list-spaces drive/list-spaces
  mkdir       drive/mkdir
  upload      上传本地文件到钉盘
  upload-info drive/upload-info

Flags:
  -h, --help   help for drive

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws drive [command] --help" for more information about a command.

$ dws drive list --help
drive/list

Usage:
  dws drive list [flags]

Flags:
  -h, --help                help for list
      --max string          maxResults
      --next-token string   nextToken
      --order string        order
      --order-by string     orderBy
      --parent-id string    parentId
      --space-id string     spaceId
      --thumbnail string    withThumbnail

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws drive download --help
drive/download

Usage:
  dws drive download [flags]

Flags:
      --file-id string    fileId
  -h, --help              help for download
      --space-id string   spaceId

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws contact --help
通讯录 / 用户 / 部门

Usage:
  dws contact [flags]
  dws contact [command]

Available Commands:
  dept        部门查询
  search      use: dws contact user search (also: dws contact dept search)
  user        人员查询

Flags:
  -h, --help   help for contact

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws contact [command] --help" for more information about a command.

$ dws contact user --help
人员查询

Usage:
  dws contact user [flags]
  dws contact user [command]

Available Commands:
  get           批量获取用户详情（逗号分隔 userId）
  get-self      获取当前用户信息
  search        按关键词搜索用户
  search-mobile 按手机号搜索用户

Flags:
  -h, --help   help for user

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws contact user [command] --help" for more information about a command.

$ dws contact user search --help
按关键词搜索用户

Usage:
  dws contact user search [flags]

Examples:
  dws contact user search --query "张三"

Flags:
  -h, --help           help for search
      --query string   搜索关键词

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws contact user get --help
批量获取用户详情（逗号分隔 userId）

Usage:
  dws contact user get [flags]

Examples:
  dws contact user get --ids userId1,userId2  # 查询 userId: dws contact user search --keyword "姓名"

Flags:
  -h, --help         help for get
      --ids string   用户 userId 列表，逗号分隔

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws contact user get-self --help
获取当前用户信息

Usage:
  dws contact user get-self [flags]

Examples:
  dws contact user get-self

Flags:
  -h, --help   help for get-self

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws contact dept --help
部门查询

Usage:
  dws contact dept [flags]
  dws contact dept [command]

Available Commands:
  list-members 查看部门成员（逗号分隔 deptId）
  search       按关键词搜索部门

Flags:
  -h, --help   help for dept

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws contact dept [command] --help" for more information about a command.

$ dws oa --help
OA 审批 / 同意 / 拒绝 / 撤销

Usage:
  dws oa [flags]
  dws oa [command]

Available Commands:
  approval    审批管理

Flags:
  -h, --help   help for oa

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws oa [command] --help" for more information about a command.

$ dws oa approval --help
审批管理

Usage:
  dws oa approval [flags]
  dws oa approval [command]

Available Commands:
  approve        oa/approve
  detail         oa/detail
  list-forms     oa/list-forms
  list-initiated 查询当前用户已发起的审批实例列表
  list-pending   oa/list-pending
  records        oa/records
  reject         oa/reject
  revoke         oa/revoke
  tasks          oa/tasks

Flags:
  -h, --help   help for approval

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws oa approval [command] --help" for more information about a command.

$ dws attendance --help
考勤打卡 / 排班 / 统计

Usage:
  dws attendance [flags]
  dws attendance [command]

Available Commands:
  record      考勤记录
  rules       查询考勤组与考勤规则
  shift       排班管理
  summary     查询某个人的考勤统计摘要

Flags:
  -h, --help   help for attendance

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws attendance [command] --help" for more information about a command.

$ dws mail --help
邮箱 / 邮件收发

Usage:
  dws mail [flags]
  dws mail [command]

Available Commands:
  mailbox     邮箱地址管理
  message     邮件管理

Flags:
  -h, --help   help for mail

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws mail [command] --help" for more information about a command.

$ dws mail message --help
邮件管理

Usage:
  dws mail message [flags]
  dws mail message [command]

Available Commands:
  get         查看邮件完整内容
  search      搜索邮件 (KQL 语法)
  send        发送邮件

Flags:
  -h, --help   help for message

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws mail message [command] --help" for more information about a command.

$ dws mail message send --help
发送邮件

Usage:
  dws mail message send [flags]

Examples:
  dws mail message send --from user@company.com \
    --to colleague@company.com --subject "周报" --body "本周..."  # 查询邮箱: dws mail mailbox list

Flags:
      --body string      邮件正文 (必填)
      --cc string        抄送人列表，逗号分隔 (可选)
      --from string      发件人邮箱 (必填)
  -h, --help             help for send
      --subject string   邮件标题 (必填)
      --to string        收件人列表，逗号分隔 (必填)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws mail message search --help
搜索邮件 (KQL 语法)

Usage:
  dws mail message search [flags]

Examples:
  dws mail message search --email user@company.com --query "subject:\"周报\"" --size 20  # 查询邮箱: dws mail mailbox list
  dws mail message search --email user@company.com --query "from:alice AND date>2025-06-01T00:00:00Z" --size 10

Flags:
      --cursor string   分页游标 (首页留空)
      --email string    搜索目标邮箱地址 (必填)
  -h, --help            help for search
      --query string    KQL 查询表达式 (必填)
      --size string     每页返回数量 1-100 (默认 20) (default "20")

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws aisearch --help
AI 搜问：按姓名/工号/手机号/部门/职责/上下级等维度搜人

Usage:
  dws aisearch [flags]
  dws aisearch [command]

Available Commands:
  person      搜索企业人员（支持按姓名/部门/职位/职责/上下级/手机号/工号筛选）

Flags:
  -h, --help   help for aisearch

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws aisearch [command] --help" for more information about a command.

$ dws aisearch person --help
搜索企业人员（支持按姓名/部门/职位/职责/上下级/手机号/工号筛选）

Usage:
  dws aisearch person [flags]

Aliases:
  person, search, find, query, user, people, search-person, search-user, user-search, lookup, ask, contact

Examples:
  dws aisearch person --keyword "张三" --dimension department
  dws aisearch person --keyword "产品部" --dimension department
  dws aisearch person --keyword "五道" --dimension supervisor
  dws aisearch person --keyword "AI搜问" --dimension duty
  dws aisearch person --keyword "李四" --dimension name,department
  dws aisearch person --keyword "13800138000" --dimension phone
  dws aisearch person --keyword "W12345" --dimension jobNumber

Flags:
  -d, --dimension string   查询维度: all/name/department/position/duty/supervisor/subordinate/phone/jobNumber，多个用逗号分隔 (默认 all) (default "all")
  -h, --help               help for person
  -w, --keyword string     搜索关键词 (必填，如人名、技能关键词等)

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

$ dws minutes --help
AI 听记（列表 / 详情 / 摘要 / 待办 / 文字稿 / 录音 / 思维导图 / 发言人 / 热词 / 上传）

Usage:
  dws minutes [flags]
  dws minutes [command]

Available Commands:
  get          听记详情
  hot-word     个人热词
  list         听记列表
  mind-graph   思维导图
  replace-text minutes/replace-text
  speaker      发言人管理
  update       更新听记信息
  upload       文件上传

Flags:
  -h, --help   help for minutes

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws minutes [command] --help" for more information about a command.

$ dws wiki --help
钉钉知识库管理

Usage:
  dws wiki [flags]
  dws wiki [command]

Available Commands:
  create      use: dws wiki space create --name <名称>
  get         use: dws wiki space get --id <workspaceId>
  list        use: dws wiki space list
  member      知识库成员管理
  search      use: dws wiki space search --keyword <关键词>
  space       知识库管理

Flags:
  -h, --help   help for wiki

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws wiki [command] --help" for more information about a command.

$ dws report --help
日志 / 模版 / 统计

Usage:
  dws report [flags]
  dws report [command]

Available Commands:
  create      创建日志
  detail      获取日志详情
  list        查询当前人收到的日志列表
  sent        查询当前人创建的日志列表
  stats       获取日志统计数据
  template    日志模版

Flags:
  -h, --help   help for report

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws report [command] --help" for more information about a command.

$ dws aitable --help
AI 表格操作（Base / 数据表 / 字段 / 记录 / 视图 / 仪表盘 / 图表 / 导入导出 / 附件 / 模板）

Usage:
  dws aitable [flags]
  dws aitable [command]

Available Commands:
  attachment  附件管理
  base        Base 管理
  chart       图表管理
  dashboard   仪表盘管理
  export      数据导出
  field       字段管理
  import      数据导入
  record      记录管理
  table       数据表管理
  template    模板搜索
  view        视图管理

Flags:
  -h, --help   help for aitable

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws aitable [command] --help" for more information about a command.

$ dws sheet --help
钉钉表格管理

Usage:
  dws sheet [flags]
  dws sheet [command]

Available Commands:
  add-dimension    在工作表末尾追加空行或空列
  append           在工作表末尾追加若干行数据
  create           创建钉钉表格文档
  delete-dimension 删除指定位置起的若干行或列
  filter-view      筛选视图管理
  find             在工作表中搜索单元格内容（支持子串/正则/整格匹配/搜索公式文本/包含隐藏）
  get              use: dws sheet range read --node <nodeId> (alias: get)
  info             获取指定工作表详情
  insert-dimension 在指定位置插入空行或空列
  list             获取全部工作表列表
  merge-cells      合并指定范围的单元格（mergeAll/mergeRows/mergeColumns）
  move-dimension   移动行或列到指定位置（0-based 索引）
  new              新建工作表
  range            数据区域操作
  read             use: dws sheet range read --node <nodeId>
  replace          全局查找替换（支持正则/整格匹配/区分大小写/范围/包含隐藏）
  unmerge-cells    取消指定范围的合并单元格
  update           use: dws sheet range update --node <nodeId> --sheet-id --range
  update-dimension 更新指定范围行/列属性（显隐 hidden、行高/列宽 pixel-size，至少一项）
  write-image      将已上传图片资源写入指定单元格

Flags:
  -h, --help   help for sheet

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws sheet [command] --help" for more information about a command.

$ dws live --help
直播列表 / 信息

Usage:
  dws live [flags]
  dws live [command]

Available Commands:
  list        use: dws live stream list
  stream      直播流管理

Flags:
  -h, --help   help for live

Global Flags:
      --client-id string       Override OAuth client ID (DingTalk AppKey)
      --client-secret string   Override OAuth client secret (DingTalk AppSecret)
      --debug                  显示调试日志
      --dry-run                预览操作内容，不实际执行
      --fields string          筛选输出字段 (逗号分隔, 如: name,id,status)
  -f, --format string          输出格式: json|table|raw|pretty|ndjson|csv (default "json")
      --jq string              jq 表达式过滤输出 (如: '.items[] | .name')
      --mock                   使用 Mock 数据 (开发调试用)
      --timeout int            HTTP 请求超时时间 (秒) (default 30)
  -v, --verbose                显示详细日志
  -y, --yes                    跳过确认提示 (AI Agent 模式)

Use "dws live [command] --help" for more information about a command.

