/**
 * AI 表格 - 图表管理 tools
 * 对应 dws aitable chart 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_aitable_chart_create",
    description: "创建图表。底层调用 dws aitable chart create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
        name: { type: "string", description: "图表名称（必填）" },
        type: { type: "string", description: "图表类型" },
      },
      required: ["base_id", "dashboard_id", "name"],
    },
    command: ["aitable", "chart", "create"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
        ["--name", a.name],
        ["--type", a.type],
      ];
    },
  },


  {
    name: "dingtalk_aitable_chart_list",
    description: "列出仪表盘中的图表。底层调用 dws aitable chart list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
      },
      required: ["base_id", "dashboard_id"],
    },
    command: ["aitable", "chart", "list"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
      ];
    },
  },

  {
    name: "dingtalk_aitable_chart_get",
    description: "获取图表详情。底层调用 dws aitable chart get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
        chart_id: { type: "string", description: "图表 ID（必填）" },
      },
      required: ["base_id", "dashboard_id", "chart_id"],
    },
    command: ["aitable", "chart", "get"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
        ["--chart-id", a.chart_id],
      ];
    },
  },

  {
    name: "dingtalk_aitable_chart_delete",
    description: "删除图表。底层调用 dws aitable chart delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        dashboard_id: { type: "string", description: "仪表盘 ID（必填）" },
        chart_id: { type: "string", description: "图表 ID（必填）" },
      },
      required: ["base_id", "dashboard_id", "chart_id"],
    },
    command: ["aitable", "chart", "delete"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--dashboard-id", a.dashboard_id],
        ["--chart-id", a.chart_id],
      ];
    },
  },
];
