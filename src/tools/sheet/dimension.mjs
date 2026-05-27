/**
 * 钉钉表格 - 行列操作 tools
 * 对应 dws sheet add-dimension/insert-dimension/delete-dimension/
 *   move-dimension/update-dimension/merge-cells/unmerge-cells 子命令
 */
import { WRITE_ADDITIVE, WRITE_IDEMPOTENT, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_sheet_add_dimension",
    description:
      "在工作表末尾追加空行或空列。底层调用 dws sheet add-dimension。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        dimension: { type: "string", description: "维度：ROW 或 COLUMN（必填）" },
        count: { type: "string", description: "追加数量（必填）" },
      },
      required: ["node", "sheet_id", "dimension", "count"],
    },
    command: ["sheet", "add-dimension"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--dimension", a.dimension],
        ["--count", a.count],
      ];
    },
  },

  {
    name: "dingtalk_sheet_insert_dimension",
    description:
      "在指定位置插入空行或空列。底层调用 dws sheet insert-dimension。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        dimension: { type: "string", description: "维度：ROW 或 COLUMN（必填）" },
        index: { type: "string", description: "插入位置索引，0-based（必填）" },
        count: { type: "string", description: "插入数量（必填）" },
      },
      required: ["node", "sheet_id", "dimension", "index", "count"],
    },
    command: ["sheet", "insert-dimension"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--dimension", a.dimension],
        ["--index", a.index],
        ["--count", a.count],
      ];
    },
  },


  {
    name: "dingtalk_sheet_delete_dimension",
    description:
      "删除指定位置起的若干行或列。底层调用 dws sheet delete-dimension。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        dimension: { type: "string", description: "维度：ROW 或 COLUMN（必填）" },
        index: { type: "string", description: "起始位置索引，0-based（必填）" },
        count: { type: "string", description: "删除数量（必填）" },
      },
      required: ["node", "sheet_id", "dimension", "index", "count"],
    },
    command: ["sheet", "delete-dimension"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--dimension", a.dimension],
        ["--index", a.index],
        ["--count", a.count],
      ];
    },
  },

  {
    name: "dingtalk_sheet_move_dimension",
    description:
      "移动行或列到指定位置（0-based 索引）。底层调用 dws sheet move-dimension。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        dimension: { type: "string", description: "维度：ROW 或 COLUMN（必填）" },
        source: { type: "string", description: "源位置索引（必填）" },
        destination: { type: "string", description: "目标位置索引（必填）" },
      },
      required: ["node", "sheet_id", "dimension", "source", "destination"],
    },
    command: ["sheet", "move-dimension"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--dimension", a.dimension],
        ["--source", a.source],
        ["--destination", a.destination],
      ];
    },
  },

  {
    name: "dingtalk_sheet_update_dimension",
    description:
      "更新行/列属性（显隐 hidden、行高/列宽 pixel-size）。底层调用 dws sheet update-dimension。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        dimension: { type: "string", description: "维度：ROW 或 COLUMN（必填）" },
        index: { type: "string", description: "起始位置索引（必填）" },
        count: { type: "string", description: "影响数量（必填）" },
        hidden: { type: "string", description: "是否隐藏：true/false" },
        pixel_size: { type: "string", description: "行高或列宽（像素）" },
      },
      required: ["node", "sheet_id", "dimension", "index", "count"],
    },
    command: ["sheet", "update-dimension"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--dimension", a.dimension],
        ["--index", a.index],
        ["--count", a.count],
        ["--hidden", a.hidden],
        ["--pixel-size", a.pixel_size],
      ];
    },
  },

  {
    name: "dingtalk_sheet_merge_cells",
    description:
      "合并指定范围的单元格（mergeAll/mergeRows/mergeColumns）。底层调用 dws sheet merge-cells。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        range: { type: "string", description: "合并范围（如 A1:C3）（必填）" },
        merge_type: { type: "string", description: "合并类型：mergeAll/mergeRows/mergeColumns" },
      },
      required: ["node", "sheet_id", "range"],
    },
    command: ["sheet", "merge-cells"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
        ["--merge-type", a.merge_type],
      ];
    },
  },

  {
    name: "dingtalk_sheet_unmerge_cells",
    description:
      "取消指定范围的合并单元格。底层调用 dws sheet unmerge-cells。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        range: { type: "string", description: "取消合并范围（如 A1:C3）（必填）" },
      },
      required: ["node", "sheet_id", "range"],
    },
    command: ["sheet", "unmerge-cells"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
      ];
    },
  },
];
