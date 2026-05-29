/**
 * 钉钉表格 - 数据读写 tools
 * 对应 dws sheet read/update/append/find/replace 子命令
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_sheet_read",
    description: "读取工作表数据。底层调用 dws sheet read (alias: range read)。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID" },
        range: { type: "string", description: "数据范围（如 A1:C10）" },
      },
      required: ["node"],
    },
    command: ["sheet", "read"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
      ];
    },
  },

  {
    name: "dingtalk_sheet_update",
    description: "更新工作表数据。底层调用 dws sheet update (alias: range update)。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        range: { type: "string", description: "数据范围（如 A1:C10）（必填）" },
        values: { type: "string", description: "数据 JSON 二维数组（必填）" },
      },
      required: ["node", "sheet_id", "range", "values"],
    },
    command: ["sheet", "update"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--range", a.range],
        ["--values", a.values],
      ];
    },
  },


  {
    name: "dingtalk_sheet_append",
    description: "在工作表末尾追加若干行数据。底层调用 dws sheet append。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        values: { type: "string", description: "追加数据 JSON 二维数组（必填）" },
      },
      required: ["node", "sheet_id", "values"],
    },
    command: ["sheet", "append"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--values", a.values],
      ];
    },
  },

  {
    name: "dingtalk_sheet_find",
    description:
      "在工作表中搜索单元格内容（支持子串/正则/整格匹配）。底层调用 dws sheet find。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        find: { type: "string", description: "搜索内容（必填）" },
        regex: { type: "string", description: "是否正则匹配：true/false" },
        match_case: { type: "string", description: "是否区分大小写：true/false" },
        match_cell: { type: "string", description: "是否整格匹配：true/false" },
        include_hidden: { type: "string", description: "是否包含隐藏行列：true/false" },
      },
      required: ["node", "sheet_id", "find"],
    },
    command: ["sheet", "find"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--find", a.find],
        ["--regex", a.regex],
        ["--match-case", a.match_case],
        ["--match-cell", a.match_cell],
        ["--include-hidden", a.include_hidden],
      ];
    },
  },

  {
    name: "dingtalk_sheet_replace",
    description:
      "全局查找替换（支持正则/整格匹配/区分大小写）。底层调用 dws sheet replace。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
        find: { type: "string", description: "搜索内容（必填）" },
        replacement: { type: "string", description: "替换内容（必填）" },
        regex: { type: "string", description: "是否正则匹配：true/false" },
        match_case: { type: "string", description: "是否区分大小写：true/false" },
        match_cell: { type: "string", description: "是否整格匹配：true/false" },
      },
      required: ["node", "sheet_id", "find", "replacement"],
    },
    command: ["sheet", "replace"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
        ["--find", a.find],
        ["--replacement", a.replacement],
        ["--regex", a.regex],
        ["--match-case", a.match_case],
        ["--match-cell", a.match_cell],
      ];
    },
  },
];
