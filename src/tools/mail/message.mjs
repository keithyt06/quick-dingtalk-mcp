/**
 * 邮箱 tools
 * 对应 dws mail 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 发送邮件 ──────────────────────────────────────
  {
    name: "dingtalk_send_mail",
    description:
      "发送邮件。底层调用 dws mail message send。需提供发件人、收件人、标题和正文。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "发件人邮箱地址（必填）。可通过 dingtalk_list_mailboxes 获取。" },
        to: { type: "string", description: "收件人邮箱列表，逗号分隔（必填）" },
        subject: { type: "string", description: "邮件标题（必填）" },
        body: { type: "string", description: "邮件正文（必填）" },
        cc: { type: "string", description: "抄送人邮箱列表，逗号分隔" },
      },
      required: ["from", "to", "subject", "body"],
    },
    command: ["mail", "message", "send"],
    args(a) {
      return [
        ["--from", a.from],
        ["--to", a.to],
        ["--subject", a.subject],
        ["--body", a.body],
        ["--cc", a.cc],
      ];
    },
  },

  // ─── 搜索邮件 ──────────────────────────────────────
  {
    name: "dingtalk_search_mail",
    description:
      "搜索邮件（KQL 语法）。底层调用 dws mail message search。示例 query: subject:\"周报\" 或 from:alice AND date>2025-06-01。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "搜索目标邮箱地址（必填）" },
        query: { type: "string", description: "KQL 查询表达式（必填）" },
        size: { type: "string", description: "每页返回数量 1-100（默认 20）" },
        cursor: { type: "string", description: "分页游标（首页留空）" },
      },
      required: ["email", "query"],
    },
    command: ["mail", "message", "search"],
    args(a) {
      return [
        ["--email", a.email],
        ["--query", a.query],
        ["--size", a.size],
        ["--cursor", a.cursor],
      ];
    },
  },

  // ─── 查看邮件内容 ──────────────────────────────────
  {
    name: "dingtalk_get_mail",
    description:
      "查看邮件完整内容。底层调用 dws mail message get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "邮箱地址（必填）" },
        message_id: { type: "string", description: "邮件 ID（必填）。可通过 dingtalk_search_mail 获取。" },
      },
      required: ["email", "message_id"],
    },
    command: ["mail", "message", "get"],
    args(a) {
      return [
        ["--email", a.email],
        ["--message-id", a.message_id],
      ];
    },
  },

  // ─── 邮箱地址列表 ──────────────────────────────────
  {
    name: "dingtalk_list_mailboxes",
    description:
      "列出当前用户的邮箱地址。底层调用 dws mail mailbox list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["mail", "mailbox", "list"],
    args() {
      return [];
    },
  },
];
