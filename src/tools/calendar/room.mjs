/**
 * 会议室管理 tools
 * 对应 dws calendar room 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 列出会议室分组 ─────────────────────────────────
  {
    name: "dingtalk_list_rooms",
    description: "列出公司所有会议室分组。底层调用 dws calendar room list-groups。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["calendar", "room", "list-groups"],
    args() {
      return [];
    },
  },

  // ─── 搜索会议室 ─────────────────────────────────────
  {
    name: "dingtalk_search_rooms",
    description: "按条件搜索会议室（可筛选可用状态和分组）。底层调用 dws calendar room search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        group_id: { type: "string", description: "会议室分组 ID" },
        start: { type: "string", description: "查询空闲的起始时间，ISO-8601" },
        end: { type: "string", description: "查询空闲的结束时间，ISO-8601" },
        available: { type: "string", description: "是否只返回可用的会议室（true/false）" },
      },
    },
    command: ["calendar", "room", "search"],
    args(a) {
      return [
        ["--group-id", a.group_id],
        ["--start", a.start],
        ["--end", a.end],
        ["--available", a.available],
      ];
    },
  },

  // ─── 为日程添加会议室 ───────────────────────────────
  {
    name: "dingtalk_add_room",
    description: "为日程预定会议室。底层调用 dws calendar room add。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "日程 eventId（必填）" },
        rooms: { type: "string", description: "会议室 ID 列表，逗号分隔（必填）" },
      },
      required: ["event", "rooms"],
    },
    command: ["calendar", "room", "add"],
    args(a) {
      return [
        ["--event", a.event],
        ["--rooms", a.rooms],
      ];
    },
  },

  // ─── 从日程移除会议室 ───────────────────────────────
  {
    name: "dingtalk_delete_room",
    description: "从日程移除会议室。底层调用 dws calendar room delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "日程 eventId（必填）" },
        rooms: { type: "string", description: "会议室 ID 列表，逗号分隔（必填）" },
      },
      required: ["event", "rooms"],
    },
    command: ["calendar", "room", "delete"],
    args(a) {
      return [
        ["--event", a.event],
        ["--rooms", a.rooms],
      ];
    },
  },
];
