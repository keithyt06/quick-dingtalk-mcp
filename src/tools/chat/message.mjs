/**
 * IM 消息操作 tools
 * 对应 dws chat message 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";
import { InputError } from "../../framework/helpers.mjs";

export default [
  // ─── 发送消息 ───────────────────────────────────────
  {
    name: "dingtalk_send_message",
    description:
      "以当前登录用户身份发送钉钉消息到群聊或个人。底层调用 dws chat message send。注意：钉钉强制要求 title，text 支持 Markdown。群聊场景可 @人。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "群聊 openConversationId（群聊时必填）。chat_id / user_id / open_dingtalk_id 三选一。",
        },
        user_id: {
          type: "string",
          description: "接收人 userId（发单聊）。三选一。",
        },
        open_dingtalk_id: {
          type: "string",
          description: "接收人 openDingTalkId（三方应用场景）。三选一。",
        },
        title: {
          type: "string",
          description: "消息标题（钉钉 API 强制必填）。",
        },
        text: {
          type: "string",
          description: "消息正文，支持 Markdown。",
        },
        at_all: {
          type: "boolean",
          description: "是否 @所有人（仅群聊生效）。需在 text 中包含 <@all>。",
        },
        at_users: {
          type: "string",
          description: "@指定 userId 列表（逗号分隔，仅群聊）。需在 text 中包含 <@userId>。",
        },

      },
      required: ["title", "text"],
    },
    command: ["chat", "message", "send"],
    validate(a) {
      const targets = [a.chat_id, a.user_id, a.open_dingtalk_id].filter(Boolean);
      if (targets.length !== 1) {
        throw new InputError("chat_id / user_id / open_dingtalk_id 必须恰好提供一个");
      }
    },
    args(a) {
      return [
        a.chat_id ? ["--group", a.chat_id] : null,
        a.user_id ? ["--user", a.user_id] : null,
        a.open_dingtalk_id ? ["--open-dingtalk-id", a.open_dingtalk_id] : null,
        ["--title", a.title],
        ["--text", a.text],
        a.at_all ? ["--at-all"] : null,
        ["--at-users", a.at_users],
      ];
    },
  },

  // ─── 查看消息历史 ───────────────────────────────────
  {
    name: "dingtalk_get_messages",
    description:
      "查看群聊的消息历史。底层调用 dws chat message list（仅支持群聊）。单聊请用 list-direct。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
        time: {
          type: "string",
          description: "时间游标，格式 'YYYY-MM-DD HH:mm:ss'。默认拉之后的消息。",
        },
        limit: { type: "number", description: "返回条数上限（默认 50）" },
        forward: {
          type: "boolean",
          description: "true=向未来翻页（默认），false=向过去翻页。",
        },
      },
      required: ["chat_id"],
    },
    command: ["chat", "message", "list"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--time", a.time],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        a.forward === false ? ["--forward", "false"] : null,
      ];
    },
  },

  // ─── 搜索消息 ──────────────────────────────────────
  {
    name: "dingtalk_search_messages",
    description:
      "按关键词跨会话搜索钉钉消息。底层调用 dws chat message search。支持按时间范围和群聊筛选。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词（必填）" },
        chat_id: { type: "string", description: "限定群聊 openConversationId（可选）" },
        start: { type: "string", description: "起始时间，ISO-8601 格式（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601 格式（必填）" },
        limit: { type: "number", description: "返回条数上限（默认 100）" },
        cursor: { type: "string", description: "分页游标" },
      },
      required: ["keyword", "start", "end"],
    },
    command: ["chat", "message", "search"],
    args(a) {
      return [
        ["--keyword", a.keyword],
        ["--group", a.chat_id],
        ["--start", a.start],
        ["--end", a.end],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 查看话题回复 ──────────────────────────────────
  {
    name: "dingtalk_get_thread",
    description:
      "查看群话题（thread）的回复列表。底层调用 dws chat message list-topic-replies。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "话题所在的群 openConversationId（必填）" },
        topic_id: { type: "string", description: "话题/线程 ID（必填）" },
        time: { type: "string", description: "时间游标" },
        limit: { type: "number", description: "返回条数" },
        forward: { type: "boolean", description: "翻页方向" },
      },
      required: ["chat_id", "topic_id"],
    },
    command: ["chat", "message", "list-topic-replies"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--topic-id", a.topic_id],
        ["--time", a.time],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        a.forward === false ? ["--forward", "false"] : null,
      ];
    },
  },

  // ─── 搜索群聊 ──────────────────────────────────────
  {
    name: "dingtalk_list_chats",
    description: "按名称搜索群会话列表。底层调用 dws chat search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "群名关键词（必填）" },
        cursor: { type: "string", description: "分页游标（首页留空）" },
        limit: { type: "number", description: "每页返回数量（默认 20）" },
      },
      required: ["query"],
    },
    command: ["chat", "search"],
    args(a) {
      return [
        ["--keyword", a.query],
        ["--cursor", a.cursor],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
      ];
    },
  },

  // ─── 引用回复消息 ──────────────────────────────────
  {
    name: "dingtalk_reply_message",
    description:
      "引用回复消息（支持单聊/群聊）。底层调用 dws chat message reply。需要提供被引用消息的 ID 和原发送者。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "会话 openConversationId（必填）" },
        ref_msg_id: { type: "string", description: "被引用的消息 openMessageId（必填）" },
        ref_sender: { type: "string", description: "被引用消息发送者 openDingTalkId（必填）" },
        text: { type: "string", description: "回复正文（必填）" },
      },
      required: ["conversation_id", "ref_msg_id", "ref_sender", "text"],
    },
    command: ["chat", "message", "reply"],
    args(a) {
      return [
        ["--conversation-id", a.conversation_id],
        ["--ref-msg-id", a.ref_msg_id],
        ["--ref-sender", a.ref_sender],
        ["--text", a.text],
      ];
    },
  },

  // ─── 转发消息 ──────────────────────────────────────
  {
    name: "dingtalk_forward_message",
    description: "转发消息到目标会话。底层调用 dws chat message forward。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        src_conversation_id: { type: "string", description: "源会话 openConversationId（必填）" },
        msg_id: { type: "string", description: "源消息 openMessageId（必填）" },
        dest_conversation_id: { type: "string", description: "目标会话 openConversationId（必填）" },
      },
      required: ["src_conversation_id", "msg_id", "dest_conversation_id"],
    },
    command: ["chat", "message", "forward"],
    args(a) {
      return [
        ["--src-conversation-id", a.src_conversation_id],
        ["--msg-id", a.msg_id],
        ["--dest-conversation-id", a.dest_conversation_id],
      ];
    },
  },

  // ─── 撤回消息 ──────────────────────────────────────
  {
    name: "dingtalk_recall_message",
    description: "撤回单条消息。底层调用 dws chat message recall。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群/会话 openConversationId（必填）" },
        msg_id: { type: "string", description: "消息 openMessageId（必填）" },
      },
      required: ["chat_id", "msg_id"],
    },
    command: ["chat", "message", "recall"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--msg-id", a.msg_id],
      ];
    },
  },

  // ─── 发送卡片消息 ──────────────────────────────────
  {
    name: "dingtalk_send_card",
    description: "创建并发送卡片消息。底层调用 dws chat message send-card。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群/会话 openConversationId（必填）" },
        card_template_id: { type: "string", description: "卡片模板 ID（必填）" },
        card_data: { type: "string", description: "卡片数据 JSON 字符串（必填）" },
        user: { type: "string", description: "接收人 openDingTalkId（单聊时使用）" },
      },
      required: ["chat_id", "card_template_id", "card_data"],
    },
    command: ["chat", "message", "send-card"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--card-template-id", a.card_template_id],
        ["--card-data", a.card_data],
        ["--user", a.user],
      ];
    },
  },

  // ─── 获取 @我 的消息 ────────────────────────────────
  {
    name: "dingtalk_get_mentions",
    description: "获取 @我 的消息列表。底层调用 dws chat message list-mentions。支持按时间范围和群聊筛选。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "开始时间，ISO-8601（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601（必填）" },
        chat_id: { type: "string", description: "限定群聊 openConversationId（可选）" },
        limit: { type: "number", description: "每页返回数量（默认 50）" },
        cursor: { type: "string", description: "分页游标（默认 0）" },
      },
      required: ["start", "end"],
    },
    command: ["chat", "message", "list-mentions"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
        ["--group", a.chat_id],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 未读会话列表 ──────────────────────────────────
  {
    name: "dingtalk_get_unread",
    description: "获取未读会话列表。底层调用 dws chat message list-unread-conversations。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "返回未读会话条数（可选）" },
      },
    },
    command: ["chat", "message", "list-unread-conversations"],
    args(a) {
      return [
        ["--count", a.count != null ? String(a.count) : undefined],
      ];
    },
  },

  // ─── 特别关注人的消息 ──────────────────────────────
  {
    name: "dingtalk_get_focused",
    description: "获取特别关注人的消息列表。底层调用 dws chat message list-focused。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "开始时间，ISO-8601" },
        end: { type: "string", description: "结束时间，ISO-8601" },
        limit: { type: "number", description: "每页返回数量" },
        cursor: { type: "string", description: "分页游标" },
      },
    },
    command: ["chat", "message", "list-focused"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 按发送者筛选消息 ──────────────────────────────
  {
    name: "dingtalk_list_by_sender",
    description: "按发送者拉取消息。底层调用 dws chat message list-by-sender。通过 sender_user_id 或 sender_open_dingtalk_id 指定发送者。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        sender_user_id: { type: "string", description: "发送者 userId（内部成员）。与 sender_open_dingtalk_id 二选一。" },
        sender_open_dingtalk_id: { type: "string", description: "发送者 openDingTalkId（外部成员）。与 sender_user_id 二选一。" },
        start: { type: "string", description: "开始时间" },
        end: { type: "string", description: "结束时间" },
        limit: { type: "number", description: "每页返回数量" },
        cursor: { type: "string", description: "分页游标" },
      },
    },
    command: ["chat", "message", "list-by-sender"],
    validate(a) {
      const targets = [a.sender_user_id, a.sender_open_dingtalk_id].filter(Boolean);
      if (targets.length !== 1) {
        throw new InputError("sender_user_id / sender_open_dingtalk_id 必须恰好提供一个");
      }
    },
    args(a) {
      return [
        ["--sender-user-id", a.sender_user_id],
        ["--sender-open-dingtalk-id", a.sender_open_dingtalk_id],
        ["--start", a.start],
        ["--end", a.end],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 多维度搜索消息 ────────────────────────────────
  {
    name: "dingtalk_search_advanced",
    description:
      "多维度搜索消息（支持按发送者、@对象、关键词、会话等维度组合筛选）。底层调用 dws chat message search-advanced。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词" },
        conversation_ids: { type: "string", description: "会话 ID 列表，逗号分隔" },
        sender_ids: { type: "string", description: "发送者 openDingTalkId 列表，逗号分隔" },
        at_ids: { type: "string", description: "被 @ 人的 openDingTalkId 列表，逗号分隔" },
        at_me: { type: "boolean", description: "是否只看 @我 的消息" },
        start: { type: "string", description: "开始时间" },
        end: { type: "string", description: "结束时间" },
        limit: { type: "number", description: "每页返回数量" },
        cursor: { type: "string", description: "分页游标" },
      },
    },
    command: ["chat", "message", "search-advanced"],
    args(a) {
      return [
        ["--keyword", a.keyword],
        ["--conversation-ids", a.conversation_ids],
        ["--sender-ids", a.sender_ids],
        ["--at-ids", a.at_ids],
        a.at_me ? ["--at-me"] : null,
        ["--start", a.start],
        ["--end", a.end],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 查询消息已读状态 ──────────────────────────────
  {
    name: "dingtalk_read_status",
    description: "查询消息已读状态（谁已读、谁未读）。底层调用 dws chat message query-read-status。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群/会话 openConversationId（必填）" },
        msg_id: { type: "string", description: "消息 openMessageId（必填）" },
      },
      required: ["chat_id", "msg_id"],
    },
    command: ["chat", "message", "query-read-status"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--msg-id", a.msg_id],
      ];
    },
  },

  // ─── 给消息添加表情 ────────────────────────────────
  {
    name: "dingtalk_add_emoji",
    description: "给消息添加表情回复。底层调用 dws chat message add-emoji。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群/会话 openConversationId（必填）" },
        msg_id: { type: "string", description: "消息 openMessageId（必填）" },
        emoji: { type: "string", description: "表情标识（必填）" },
      },
      required: ["chat_id", "msg_id", "emoji"],
    },
    command: ["chat", "message", "add-emoji"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--msg-id", a.msg_id],
        ["--emoji", a.emoji],
      ];
    },
  },
];
