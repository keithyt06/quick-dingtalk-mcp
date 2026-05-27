/**
 * 日程参与者管理 tools
 * 对应 dws calendar participant 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 添加参与者 ─────────────────────────────────────
  {
    name: "dingtalk_add_participant",
    description: "向日程添加参与者。底层调用 dws calendar participant add。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "日程 eventId（必填）" },
        users: { type: "string", description: "要添加的 userId 列表，逗号分隔（必填）" },
        optional: { type: "string", description: "是否可选参加（true/false）" },
      },
      required: ["event", "users"],
    },
    command: ["calendar", "participant", "add"],
    args(a) {
      return [
        ["--event", a.event],
        ["--users", a.users],
        ["--optional", a.optional],
      ];
    },
  },

  // ─── 移除参与者 ─────────────────────────────────────
  {
    name: "dingtalk_remove_participant",
    description: "从日程移除参与者。底层调用 dws calendar participant delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "日程 eventId（必填）" },
        users: { type: "string", description: "要移除的 userId 列表，逗号分隔（必填）" },
      },
      required: ["event", "users"],
    },
    command: ["calendar", "participant", "delete"],
    args(a) {
      return [
        ["--event", a.event],
        ["--users", a.users],
      ];
    },
  },

  // ─── 列出参与者 ─────────────────────────────────────
  {
    name: "dingtalk_list_participants",
    description: "列出日程的所有参与者。底层调用 dws calendar participant list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "日程 eventId（必填）" },
      },
      required: ["event"],
    },
    command: ["calendar", "participant", "list"],
    args(a) {
      return [["--event", a.event]];
    },
  },
];
