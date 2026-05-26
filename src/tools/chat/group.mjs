/**
 * 群管理 + 会话管理 tools
 * 对应 dws chat group / chat search-common / chat list-top-conversations 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 创建群 ────────────────────────────────────────
  {
    name: "dingtalk_create_group",
    description: "创建群聊。底层调用 dws chat group create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "群名称（必填）" },
        users: { type: "string", description: "群成员 userId 列表，逗号分隔（必填）" },
      },
      required: ["name", "users"],
    },
    command: ["chat", "group", "create"],
    args(a) {
      return [
        ["--name", a.name],
        ["--users", a.users],
      ];
    },
  },

  // ─── 解散群 ────────────────────────────────────────
  {
    name: "dingtalk_dismiss_group",
    description: "解散群聊（不可恢复，仅群主可用）。底层调用 dws chat group dismiss。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
      },
      required: ["chat_id"],
    },
    command: ["chat", "group", "dismiss"],
    args(a) {
      return [["--group", a.chat_id]];
    },
  },

  // ─── 改群名 ────────────────────────────────────────
  {
    name: "dingtalk_rename_group",
    description: "更新群名称。底层调用 dws chat group rename。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
        name: { type: "string", description: "新群名称（必填）" },
      },
      required: ["chat_id", "name"],
    },
    command: ["chat", "group", "rename"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--name", a.name],
      ];
    },
  },

  // ─── 列出群成员 ────────────────────────────────────
  {
    name: "dingtalk_list_group_members",
    description: "列出群聊所有成员。底层调用 dws chat group members list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
      },
      required: ["chat_id"],
    },
    command: ["chat", "group", "members", "list"],
    args(a) {
      return [["--group", a.chat_id]];
    },
  },

  // ─── 添加群成员 ────────────────────────────────────
  {
    name: "dingtalk_add_group_members",
    description: "向群中添加成员。底层调用 dws chat group members add。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
        users: { type: "string", description: "要添加的 userId 列表，逗号分隔（必填）" },
      },
      required: ["chat_id", "users"],
    },
    command: ["chat", "group", "members", "add"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--users", a.users],
      ];
    },
  },

  // ─── 获取群邀请链接 ────────────────────────────────
  {
    name: "dingtalk_group_invite_url",
    description: "获取群邀请链接。底层调用 dws chat group invite-url。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
      },
      required: ["chat_id"],
    },
    command: ["chat", "group", "invite-url"],
    args(a) {
      return [["--group", a.chat_id]];
    },
  },

  // ─── 群全员禁言 ────────────────────────────────────
  {
    name: "dingtalk_mute_group",
    description: "群全员禁言（开启/关闭）。底层调用 dws chat group-mute。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
        status: { type: "string", description: "禁言状态：true=开启禁言, false=关闭禁言（必填）" },
      },
      required: ["chat_id", "status"],
    },
    command: ["chat", "group-mute"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--status", a.status],
      ];
    },
  },

  // ─── 设置管理员 ────────────────────────────────────
  {
    name: "dingtalk_set_admin",
    description: "设置/取消群管理员。底层调用 dws chat group set-admin。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId（必填）" },
        user_id: { type: "string", description: "目标用户 userId（必填）" },
        role: { type: "string", description: "角色：admin=设为管理员, member=取消管理员" },
      },
      required: ["chat_id", "user_id"],
    },
    command: ["chat", "group", "set-admin"],
    args(a) {
      return [
        ["--group", a.chat_id],
        ["--user", a.user_id],
        ["--role", a.role],
      ];
    },
  },

  // ─── 搜索共同群 ────────────────────────────────────
  {
    name: "dingtalk_search_common",
    description:
      "搜索共同群（指定昵称列表，查询共同所在的群聊）。底层调用 dws chat search-common。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        nicks: { type: "string", description: "要搜索的昵称列表，逗号分隔（必填）" },
        match_mode: { type: "string", description: "匹配模式：AND=所有人都在, OR=任一人在（默认 AND）" },
        limit: { type: "number", description: "每页返回数量（默认 20）" },
        cursor: { type: "string", description: "分页游标" },
      },
      required: ["nicks"],
    },
    command: ["chat", "search-common"],
    args(a) {
      return [
        ["--nicks", a.nicks],
        ["--match-mode", a.match_mode],
        ["--limit", a.limit != null ? String(a.limit) : undefined],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 置顶会话列表 ──────────────────────────────────
  {
    name: "dingtalk_top_conversations",
    description: "获取置顶会话列表。底层调用 dws chat list-top-conversations。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["chat", "list-top-conversations"],
    args() {
      return [];
    },
  },
];
