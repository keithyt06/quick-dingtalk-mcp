/**
 * AI 表格 - 仪表盘管理 tools
 * 对应 dws aitable dashboard 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建仪表盘 ────────────────────────────────────
  {
    name: "dingtalk_aitable_dashboard_create",
    description:
      "创建仪表盘。底层调用 dws aitable dashboard create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        name: { type: "string", description: "仪表盘名称（必填）" },
      },
      required: ["base_id", "name"],
    },
    command: ["aitable", "dashboard", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--name", a.name],
      ];
    },
  },

  // ─── 列出仪表盘 ────────────────────────────────────
  {
    name: "dingtalk_aitable_dashboard_list",
    description:
      "列出 Base 中的仪表盘。底层调用 dws aitable dashboard list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
      },
      required: ["base_id"],
    },
    command: ["aitable", "dashboard", "list"],
    args(a) {
      return [["--base-id", a.base_id]];
    },
  },

  // ─── 获取仪表盘详情 ────────────────────────────────
  {
    name: "dingtalk_aitable_dashboard_get",
    description:
      "获取仪表盘详情。底层调用 dws aitable dashboard get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
      },
      required: ["base_id", "dashboard_id"],
    },
    command: ["aitable", "dashboard", "get"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
      ];
    },
  },

  // ─── 删除仪表盘 ────────────────────────────────────
  {
    name: "dingtalk_aitable_dashboard_delete",
    description:
      "删除仪表盘。底层调用 dws aitable dashboard delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
      },
      required: ["base_id", "dashboard_id"],
    },
    command: ["aitable", "dashboard", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
      ];
    },
  },
];
