/**
 * 考勤 tools
 * 对应 dws attendance 子命令树
 */
import { READ_ONLY } from "../../framework/annotations.mjs";

export default [
  // ─── 打卡记录 ──────────────────────────────────────
  {
    name: "dingtalk_attendance_record",
    description:
      "查看指定用户的考勤打卡记录。底层调用 dws attendance record get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "用户 userId（必填）" },
        date: { type: "string", description: "日期 YYYY-MM-DD（必填）" },
      },
      required: ["user", "date"],
    },
    command: ["attendance", "record", "get"],
    args(a) {
      return [
        ["--user", a.user],
        ["--date", a.date],
      ];
    },
  },

  // ─── 考勤汇总 ──────────────────────────────────────
  {
    name: "dingtalk_attendance_summary",
    description:
      "查询用户考勤汇总统计（周/月维度）。底层调用 dws attendance summary。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        user: { type: "string", description: "用户 userId（必填）" },
        date: { type: "string", description: "日期 YYYY-MM-DD（必填）" },
        stats_type: { type: "string", description: "统计类型：week 或 month（必填）" },
      },
      required: ["user", "date", "stats_type"],
    },
    command: ["attendance", "summary"],
    args(a) {
      return [
        ["--user", a.user],
        ["--date", a.date],
        ["--stats-type", a.stats_type],
      ];
    },
  },

  // ─── 考勤规则 ──────────────────────────────────────
  {
    name: "dingtalk_attendance_rules",
    description:
      "查询考勤组与考勤规则。底层调用 dws attendance rules。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["attendance", "rules"],
    args() {
      return [];
    },
  },

  // ─── 排班管理 ──────────────────────────────────────
  {
    name: "dingtalk_attendance_shift",
    description:
      "查看排班信息。底层调用 dws attendance shift。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["attendance", "shift"],
    args() {
      return [];
    },
  },
];
