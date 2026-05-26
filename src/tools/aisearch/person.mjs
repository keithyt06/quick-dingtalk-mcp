/**
 * AI 搜索 tools
 * 对应 dws aisearch 子命令树
 */
import { READ_ONLY } from "../../framework/annotations.mjs";

export default [
  // ─── 智能搜人 ──────────────────────────────────────
  {
    name: "dingtalk_ai_search_person",
    description:
      "AI 智能搜人。支持按姓名/部门/职位/职责/上下级/手机号/工号等维度搜索企业人员。底层调用 dws aisearch person。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词（必填，如人名、技能关键词等）" },
        dimension: {
          type: "string",
          description:
            "查询维度：all/name/department/position/duty/supervisor/subordinate/phone/jobNumber，多个用逗号分隔（默认 all）",
        },
      },
      required: ["keyword"],
    },
    command: ["aisearch", "person"],
    args(a) {
      return [
        ["--keyword", a.keyword],
        ["--dimension", a.dimension],
      ];
    },
  },
];
