/**
 * AI 表格 - 字段管理 tools
 * 对应 dws aitable field 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建字段 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_field_create",
    description:
      "在数据表中创建字段。底层调用 dws aitable field create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        name: { type: "string", description: "字段名称（必填）" },
        type: { type: "string", description: "字段类型（必填）" },
        property: { type: "string", description: "字段属性 JSON" },
      },
      required: ["base_id", "table_id", "name", "type"],
    },
    command: ["aitable", "field", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--name", a.name],
        ["--type", a.type],
        ["--property", a.property],
      ];
    },
  },

  // ─── 列出字段 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_field_list",
    description:
      "列出数据表中的字段。底层调用 dws aitable field list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "field", "list"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
      ];
    },
  },

  // ─── 获取字段详情 ──────────────────────────────────
  {
    name: "dingtalk_aitable_field_get",
    description:
      "获取字段详情。底层调用 dws aitable field get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        field_id: { type: "string", description: "字段 ID（必填）" },
      },
      required: ["base_id", "table_id", "field_id"],
    },
    command: ["aitable", "field", "get"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--field-id", a.field_id],
      ];
    },
  },

  // ─── 更新字段 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_field_update",
    description:
      "更新字段属性。底层调用 dws aitable field update。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        field_id: { type: "string", description: "字段 ID（必填）" },
        name: { type: "string", description: "新字段名称" },
        property: { type: "string", description: "新字段属性 JSON" },
      },
      required: ["base_id", "table_id", "field_id"],
    },
    command: ["aitable", "field", "update"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--field-id", a.field_id],
        ["--name", a.name],
        ["--property", a.property],
      ];
    },
  },

  // ─── 删除字段 ──────────────────────────────────────
  {
    name: "dingtalk_aitable_field_delete",
    description:
      "删除字段（不可恢复）。底层调用 dws aitable field delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        field_id: { type: "string", description: "字段 ID（必填）" },
      },
      required: ["base_id", "table_id", "field_id"],
    },
    command: ["aitable", "field", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--field-id", a.field_id],
      ];
    },
  },
];
