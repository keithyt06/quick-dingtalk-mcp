/**
 * AI 表格 - Base 管理 tools
 * 对应 dws aitable base 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 创建 Base ─────────────────────────────────────
  {
    name: "dingtalk_aitable_base_create",
    description:
      "创建 AI 表格 Base。底层调用 dws aitable base create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Base 名称（必填）" },
      },
      required: ["name"],
    },
    command: ["aitable", "base", "create"],
    args(a) {
      return [["--name", a.name]];
    },
  },

  // ─── 列出 Base ─────────────────────────────────────
  {
    name: "dingtalk_aitable_base_list",
    description:
      "列出用户可访问的 AI 表格 Base 列表。底层调用 dws aitable base list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        next_token: { type: "string", description: "分页游标" },
        max_results: { type: "string", description: "每页返回数量" },
      },
    },
    command: ["aitable", "base", "list"],
    args(a) {
      return [
        ["--next-token", a.next_token],
        ["--max-results", a.max_results],
      ];
    },
  },

  // ─── 获取 Base 详情 ────────────────────────────────
  {
    name: "dingtalk_aitable_base_get",
    description:
      "获取 AI 表格 Base 详情。底层调用 dws aitable base get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
      },
      required: ["base_id"],
    },
    command: ["aitable", "base", "get"],
    args(a) {
      return [["--base-id", a.base_id]];
    },
  },

  // ─── 删除 Base ─────────────────────────────────────
  {
    name: "dingtalk_aitable_base_delete",
    description:
      "删除 AI 表格 Base（不可恢复）。底层调用 dws aitable base delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
      },
      required: ["base_id"],
    },
    command: ["aitable", "base", "delete"],
    args(a) {
      return [["--base-id", a.base_id]];
    },
  },
];
