/**
 * 通讯录 - 用户 / 部门查询 tools
 * 对应 dws contact user / contact dept 子命令树
 */
import { READ_ONLY } from "../../framework/annotations.mjs";

export default [
  // ─── 按姓名搜索用户 ────────────────────────────────
  {
    name: "dingtalk_search_user",
    description: "按姓名/花名搜索钉钉用户。底层调用 dws contact user search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "用户姓名或花名关键词（必填）" },
      },
      required: ["query"],
    },
    command: ["contact", "user", "search"],
    args(a) {
      return [["--query", a.query]];
    },
  },

  // ─── 按手机号搜索用户 ──────────────────────────────
  {
    name: "dingtalk_search_user_mobile",
    description: "按手机号搜索用户。底层调用 dws contact user search-mobile。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        mobile: { type: "string", description: "手机号（必填）" },
      },
      required: ["mobile"],
    },
    command: ["contact", "user", "search-mobile"],
    args(a) {
      return [["--mobile", a.mobile]];
    },
  },

  // ─── 批量获取用户详情 ──────────────────────────────
  {
    name: "dingtalk_get_user",
    description:
      "批量获取用户详情（姓名、部门、职位、手机号等）。底层调用 dws contact user get。支持逗号分隔多个 userId。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "string", description: "用户 userId 列表，逗号分隔（必填）" },
      },
      required: ["ids"],
    },
    command: ["contact", "user", "get"],
    args(a) {
      return [["--ids", a.ids]];
    },
  },

  // ─── 获取当前用户信息 ──────────────────────────────
  {
    name: "dingtalk_get_self",
    description: "获取当前登录用户的信息。底层调用 dws contact user get-self。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["contact", "user", "get-self"],
    args() {
      return [];
    },
  },

  // ─── 搜索部门 ──────────────────────────────────────
  {
    name: "dingtalk_search_dept",
    description: "按关键词搜索部门。底层调用 dws contact dept search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "部门名称关键词（必填）" },
      },
      required: ["query"],
    },
    command: ["contact", "dept", "search"],
    args(a) {
      return [["--query", a.query]];
    },
  },

  // ─── 查看部门成员 ──────────────────────────────────
  {
    name: "dingtalk_list_dept_members",
    description:
      "查看部门成员列表。底层调用 dws contact dept list-members。支持逗号分隔多个部门 ID。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "string", description: "部门 ID 列表，逗号分隔（必填）" },
      },
      required: ["ids"],
    },
    command: ["contact", "dept", "list-members"],
    args(a) {
      return [["--ids", a.ids]];
    },
  },
];
