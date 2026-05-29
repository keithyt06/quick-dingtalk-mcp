/**
 * AI 表格 - 记录管理 tools
 * 对应 dws aitable record 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建记录 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_record_create",
    description:
      "在数据表中创建记录。底层调用 dws aitable record create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        fields: { type: "string", description: "记录字段数据 JSON（必填）" },
      },
      required: ["base_id", "table_id", "fields"],
    },
    command: ["aitable", "record", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--fields", a.fields],
      ];
    },
  },

  // ─── 查询记录 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_record_query",
    description:
      "查询数据表中的记录。底层调用 dws aitable record query。支持筛选、排序、分页。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        filter: { type: "string", description: "筛选条件 JSON" },
        sort: { type: "string", description: "排序条件 JSON" },
        max_results: { type: "string", description: "每页返回数量" },
        next_token: { type: "string", description: "分页游标" },
        view_id: { type: "string", description: "视图 ID（可选，按视图过滤）" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "record", "query"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--filter", a.filter],
        ["--sort", a.sort],
        ["--max-results", a.max_results],
        ["--next-token", a.next_token],
        ["--view-id", a.view_id],
      ];
    },
  },

  // ─── 更新记录 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_record_update",
    description:
      "更新数据表中的记录。底层调用 dws aitable record update。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        record_id: { type: "string", description: "记录 ID（必填）" },
        fields: { type: "string", description: "更新的字段数据 JSON（必填）" },
      },
      required: ["base_id", "table_id", "record_id", "fields"],
    },
    command: ["aitable", "record", "update"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--record-id", a.record_id],
        ["--fields", a.fields],
      ];
    },
  },

  // ─── 删除记录 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_record_delete",
    description:
      "删除数据表中的记录。底层调用 dws aitable record delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        record_id: { type: "string", description: "记录 ID（必填）" },
      },
      required: ["base_id", "table_id", "record_id"],
    },
    command: ["aitable", "record", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--record-id", a.record_id],
      ];
    },
  },
];
