/**
 * 通讯录 - 用户查询 tools
 * 对应 dws contact user 子命令树
 */
import { READ_ONLY } from "../../framework/annotations.mjs";

export default [
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
];
