/**
 * 直播 tools
 * 对应 dws live stream 子命令树
 */
import { READ_ONLY } from "../../framework/annotations.mjs";

export default [
  // ─── 直播列表 ──────────────────────────────────────
  {
    name: "dingtalk_list_live",
    description: "获取直播列表。底层调用 dws live stream list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "直播状态筛选（如 living/ended）" },
        limit: { type: "string", description: "返回数量" },
        cursor: { type: "string", description: "分页游标" },
      },
    },
    command: ["live", "stream", "list"],
    args(a) {
      return [
        ["--status", a.status],
        ["--limit", a.limit],
        ["--cursor", a.cursor],
      ];
    },
  },
];
