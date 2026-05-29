/**
 * AI 表格 - 数据表管理 tools
 * 对应 dws aitable table 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建数据表 ────────────────────────────────────
  {
    name: "dingtalk_aitable_table_create",
    description:
      "在 Base 中创建数据表。底层调用 dws aitable table create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        name: { type: "string", description: "数据表名称（必填）" },
      },
      required: ["base_id", "name"],
    },
    command: ["aitable", "table", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--name", a.name],
      ];
    },
  },

  // ─── 列出数据表 ────────────────────────────────────
  {
    name: "dingtalk_aitable_table_list",
    description:
      "列出 Base 中的数据表。底层调用 dws aitable table list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
      },
      required: ["base_id"],
    },
    command: ["aitable", "table", "list"],
    args(a) {
      return [["--base-id", a.base_id]];
    },
  },

  // ─── 获取数据表详情 ────────────────────────────────
  {
    name: "dingtalk_aitable_table_get",
    description:
      "获取数据表详情。底层调用 dws aitable table get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "table", "get"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
      ];
    },
  },

  // ─── 删除数据表 ────────────────────────────────────
  {
    name: "dingtalk_aitable_table_delete",
    description:
      "删除数据表（不可恢复）。底层调用 dws aitable table delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "table", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
      ];
    },
  },
];
