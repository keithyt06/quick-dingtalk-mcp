/**
 * 日历日程 tools
 * 对应 dws calendar event / busy 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 创建日程 ──────────────────────────────────────
  {
    name: "dingtalk_create_event",
    description: "创建日历日程。底层调用 dws calendar event create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "日程标题（必填）" },
        start: { type: "string", description: "开始时间，ISO-8601（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601（必填）" },
        attendees: { type: "string", description: "参与者 userId 列表，逗号分隔" },
        open_dingtalk_ids: { type: "string", description: "参与者 openDingTalkId 列表，逗号分隔" },
        desc: { type: "string", description: "日程描述" },
        timezone: { type: "string", description: "时区（如 Asia/Shanghai）" },
      },
      required: ["title", "start", "end"],
    },
    command: ["calendar", "event", "create"],
    args(a) {
      return [
        ["--title", a.title],
        ["--start", a.start],
        ["--end", a.end],
        ["--attendees", a.attendees],
        ["--open-dingtalk-ids", a.open_dingtalk_ids],
        ["--desc", a.desc],
        ["--timezone", a.timezone],
      ];
    },
  },

  // ─── 查看日程列表 ──────────────────────────────────
  {
    name: "dingtalk_list_events",
    description: "查看日程列表。底层调用 dws calendar event list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "起始时间，ISO-8601" },
        end: { type: "string", description: "结束时间，ISO-8601" },
      },
    },
    command: ["calendar", "event", "list"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
      ];
    },
  },

  // ─── 获取日程详情 ──────────────────────────────────
  {
    name: "dingtalk_get_event",
    description: "获取日程详情。底层调用 dws calendar event get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "日程 eventId（必填）" },
      },
      required: ["id"],
    },
    command: ["calendar", "event", "get"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 删除日程 ──────────────────────────────────────
  {
    name: "dingtalk_delete_event",
    description: "删除日程（不可恢复）。底层调用 dws calendar event delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "日程 eventId（必填）" },
      },
      required: ["id"],
    },
    command: ["calendar", "event", "delete"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 更新日程 ──────────────────────────────────────
  {
    name: "dingtalk_update_event",
    description: "更新日程信息。底层调用 dws calendar event update。只需传要修改的字段。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "日程 eventId（必填）" },
        title: { type: "string", description: "新标题" },
        start: { type: "string", description: "新开始时间，ISO-8601" },
        end: { type: "string", description: "新结束时间，ISO-8601" },
        desc: { type: "string", description: "新描述" },
        timezone: { type: "string", description: "时区" },
      },
      required: ["id"],
    },
    command: ["calendar", "event", "update"],
    args(a) {
      return [
        ["--id", a.id],
        ["--title", a.title],
        ["--start", a.start],
        ["--end", a.end],
        ["--desc", a.desc],
        ["--timezone", a.timezone],
      ];
    },
  },

  // ─── 推荐可用时间 ──────────────────────────────────
  {
    name: "dingtalk_suggest_time",
    description: "推荐多人都可用的会议时间段。底层调用 dws calendar event suggest。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        users: { type: "string", description: "参与者 userId 列表，逗号分隔（必填）" },
        start: { type: "string", description: "搜索范围起始时间，ISO-8601（必填）" },
        end: { type: "string", description: "搜索范围结束时间，ISO-8601（必填）" },
        duration: { type: "string", description: "会议时长（分钟）（必填）" },
        timezone: { type: "string", description: "时区（如 Asia/Shanghai）" },
      },
      required: ["users", "start", "end", "duration"],
    },
    command: ["calendar", "event", "suggest"],
    args(a) {
      return [
        ["--users", a.users],
        ["--start", a.start],
        ["--end", a.end],
        ["--duration", a.duration],
        ["--timezone", a.timezone],
      ];
    },
  },

  // ─── 查询闲忙 ──────────────────────────────────────
  {
    name: "dingtalk_check_busy",
    description: "查询用户闲忙状态。底层调用 dws calendar busy search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        users: { type: "string", description: "用户 userId 列表，逗号分隔（必填）" },
        start: { type: "string", description: "起始时间，ISO-8601（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601（必填）" },
      },
      required: ["users", "start", "end"],
    },
    command: ["calendar", "busy", "search"],
    args(a) {
      return [
        ["--users", a.users],
        ["--start", a.start],
        ["--end", a.end],
      ];
    },
  },
];
