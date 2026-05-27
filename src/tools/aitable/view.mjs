/**
 * AI 表格 - 视图管理 tools
 * 对应 dws aitable view 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建视图 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_view_create",
    description:
      "在数据表中创建视图。底层调用 dws aitable view create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        name: { type: "string", description: "视图名称（必填）" },
        type: { type: "string", description: "视图类型" },
      },
      required: ["base_id", "table_id", "name"],
    },
    command: ["aitable", "view", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--name", a.name],
        ["--type", a.type],
      ];
    },
  },

  // ─── 列出视图 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_view_list",
    description:
      "列出数据表中的视图。底层调用 dws aitable view list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "view", "list"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
      ];
    },
  },

  // ─── 获取视图详情 ──────────────────────────────────
  {
    name: "dingtalk_aitable_view_get",
    description:
      "获取视图详情。底层调用 dws aitable view get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        view_id: { type: "string", description: "视图 ID（必填）" },
      },
      required: ["base_id", "table_id", "view_id"],
    },
    command: ["aitable", "view", "get"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--view-id", a.view_id],
      ];
    },
  },

  // ─── 删除视图 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_view_delete",
    description:
      "删除视图。底层调用 dws aitable view delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        view_id: { type: "string", description: "视图 ID（必填）" },
      },
      required: ["base_id", "table_id", "view_id"],
    },
    command: ["aitable", "view", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--view-id", a.view_id],
      ];
    },
  },
];
