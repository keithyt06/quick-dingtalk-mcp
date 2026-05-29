/**
 * 日志 tools
 * 对应 dws report 子命令树（创建 / 查询 / 统计 / 模板）
 */
import { READ_ONLY, WRITE_ADDITIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建日志 ──────────────────────────────────────
  {
    name: "dingtalk_create_report",
    description:
      "创建日志。底层调用 dws report create。需指定模板 ID 和内容。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "日志模板 ID（必填）。可通过 dingtalk_report_template 获取。" },
        contents: { type: "string", description: "日志内容 JSON 字符串（必填）。格式为模板字段的键值对数组。" },
        to_chat: { type: "string", description: "发送到群聊 openConversationId" },
        to_user_ids: { type: "string", description: "发送给用户 userId 列表，逗号分隔" },
      },
      required: ["template_id", "contents"],
    },
    command: ["report", "create"],
    args(a) {
      return [
        ["--template-id", a.template_id],
        ["--contents", a.contents],
        ["--to-chat", a.to_chat],
        ["--to-user-ids", a.to_user_ids],
      ];
    },
  },

  // ─── 查看收到的日志 ────────────────────────────────
  {
    name: "dingtalk_list_reports",
    description:
      "查看当前用户收到的日志列表。底层调用 dws report list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "起始时间，ISO-8601（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601（必填）" },
        cursor: { type: "string", description: "分页游标" },
        size: { type: "string", description: "每页返回数量" },
      },
      required: ["start", "end"],
    },
    command: ["report", "list"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
        ["--cursor", a.cursor],
        ["--size", a.size],
      ];
    },
  },

  // ─── 查看已发送的日志 ──────────────────────────────
  {
    name: "dingtalk_list_sent_reports",
    description: "查看当前用户已发送（创建）的日志列表。底层调用 dws report sent。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "起始时间，ISO-8601" },
        end: { type: "string", description: "结束时间，ISO-8601" },
        cursor: { type: "string", description: "分页游标" },
        size: { type: "string", description: "每页返回数量" },
      },
    },
    command: ["report", "sent"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
        ["--cursor", a.cursor],
        ["--size", a.size],
      ];
    },
  },

  // ─── 获取日志详情 ──────────────────────────────────
  {
    name: "dingtalk_report_detail",
    description: "获取日志详情内容。底层调用 dws report detail。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        report_id: { type: "string", description: "日志 ID（必填）" },
      },
      required: ["report_id"],
    },
    command: ["report", "detail"],
    args(a) {
      return [["--report-id", a.report_id]];
    },
  },

  // ─── 日志统计 ──────────────────────────────────────
  {
    name: "dingtalk_report_stats",
    description: "获取日志统计数据。底层调用 dws report stats。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "日志模板 ID" },
        start: { type: "string", description: "起始时间，ISO-8601" },
        end: { type: "string", description: "结束时间，ISO-8601" },
      },
    },
    command: ["report", "stats"],
    args(a) {
      return [
        ["--template-id", a.template_id],
        ["--start", a.start],
        ["--end", a.end],
      ];
    },
  },

  // ─── 获取日志模板 ──────────────────────────────────
  {
    name: "dingtalk_report_template",
    description: "获取可用的日志模板列表。底层调用 dws report template。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["report", "template"],
    args() {
      return [];
    },
  },
];
