/**
 * 知识库 tools
 * 对应 dws wiki space 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 创建知识库 ────────────────────────────────────
  {
    name: "dingtalk_wiki_create",
    description:
      "创建知识库。底层调用 dws wiki space create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "知识库名称（必填）" },
        desc: { type: "string", description: "知识库描述" },
      },
      required: ["name"],
    },
    command: ["wiki", "space", "create"],
    args(a) {
      return [
        ["--name", a.name],
        ["--desc", a.desc],
      ];
    },
  },

  // ─── 查看知识库详情 ────────────────────────────────
  {
    name: "dingtalk_wiki_get",
    description:
      "查看知识库详情。底层调用 dws wiki space get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "知识库 workspaceId（必填）" },
      },
      required: ["id"],
    },
    command: ["wiki", "space", "get"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 列出知识库 ────────────────────────────────────
  {
    name: "dingtalk_wiki_list",
    description:
      "列出用户可访问的知识库列表。底层调用 dws wiki space list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["wiki", "space", "list"],
    args() {
      return [];
    },
  },

  // ─── 搜索知识库 ────────────────────────────────────
  {
    name: "dingtalk_wiki_search",
    description:
      "搜索知识库。底层调用 dws wiki space search。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词（必填）" },
      },
      required: ["keyword"],
    },
    command: ["wiki", "space", "search"],
    args(a) {
      return [["--keyword", a.keyword]];
    },
  },

  // ─── 知识库成员管理 ────────────────────────────────
  {
    name: "dingtalk_wiki_member",
    description:
      "管理知识库成员（列出/添加/移除成员）。底层调用 dws wiki member。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "知识库 workspaceId（必填）" },
        action: { type: "string", description: "操作类型：list/add/remove" },
        users: { type: "string", description: "用户 userId 列表，逗号分隔（add/remove 时需要）" },
        role: { type: "string", description: "成员角色（add 时可选）" },
      },
      required: ["id"],
    },
    command: ["wiki", "member"],
    args(a) {
      return [
        ["--id", a.id],
        ["--action", a.action],
        ["--users", a.users],
        ["--role", a.role],
      ];
    },
  },
];
