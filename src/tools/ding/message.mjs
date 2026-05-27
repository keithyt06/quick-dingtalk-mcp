/**
 * DING 消息 tools
 * 对应 dws ding message 子命令树
 */
import { WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 发送 DING ─────────────────────────────────────
  {
    name: "dingtalk_send_ding",
    description: "发送 DING 消息。底层调用 dws ding message send。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        users: { type: "string", description: "接收人 userId 列表，逗号分隔（必填）" },
        content: { type: "string", description: "DING 内容（必填）" },
        type: { type: "string", description: "提醒类型（remindType）" },
        robot_code: { type: "string", description: "机器人编码" },
      },
      required: ["users", "content"],
    },
    command: ["ding", "message", "send"],
    args(a) {
      return [
        ["--users", a.users],
        ["--content", a.content],
        ["--type", a.type],
        ["--robot-code", a.robot_code],
      ];
    },
  },

  // ─── 撤回 DING ────────────────────────────────────
  {
    name: "dingtalk_recall_ding",
    description: "撤回已发送的 DING 消息。底层调用 dws ding message recall。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "DING 消息 openDingId（必填）" },
        robot_code: { type: "string", description: "机器人编码（必填）" },
      },
      required: ["id", "robot_code"],
    },
    command: ["ding", "message", "recall"],
    args(a) {
      return [
        ["--id", a.id],
        ["--robot-code", a.robot_code],
      ];
    },
  },
];
