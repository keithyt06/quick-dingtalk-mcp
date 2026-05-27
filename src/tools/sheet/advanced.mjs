/**
 * 钉钉表格 - 高级操作 tools
 * 对应 dws sheet filter-view/write-image/range 子命令
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_sheet_filter_view",
    description:
      "筛选视图管理（创建/查看/删除筛选视图）。底层调用 dws sheet filter-view。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        action: { type: "string", description: "操作：create/list/get/delete" },
        filter_view_id: { type: "string", description: "筛选视图 ID（get/delete 时需要）" },
        name: { type: "string", description: "筛选视图名称（create 时需要）" },
        range: { type: "string", description: "筛选范围（create 时需要）" },
      },
      required: ["node", "sheet_id"],
    },
    command: ["sheet", "filter-view"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--action", a.action],
        ["--filter-view-id", a.filter_view_id],
        ["--name", a.name],
        ["--range", a.range],
      ];
    },
  },

  {
    name: "dingtalk_sheet_write_image",
    description:
      "将已上传图片资源写入指定单元格。底层调用 dws sheet write-image。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        range: { type: "string", description: "目标单元格（如 A1）（必填）" },
        image_id: { type: "string", description: "图片资源 ID（必填）" },
      },
      required: ["node", "sheet_id", "range", "image_id"],
    },
    command: ["sheet", "write-image"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
        ["--image-id", a.image_id],
      ];
    },
  },


  {
    name: "dingtalk_sheet_range",
    description:
      "数据区域操作（读取/更新/清除指定区域）。底层调用 dws sheet range。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        range: { type: "string", description: "数据范围（如 A1:C10）（必填）" },
        action: { type: "string", description: "操作类型：read/update/clear" },
        values: { type: "string", description: "数据 JSON 二维数组（update 时需要）" },
      },
      required: ["node", "sheet_id", "range"],
    },
    command: ["sheet", "range"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
        ["--action", a.action],
        ["--values", a.values],
      ];
    },
  },
];
