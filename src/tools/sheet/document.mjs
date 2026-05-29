/**
 * 钉钉表格 - 文档级操作 tools
 * 对应 dws sheet create/list/info/new 子命令
 */
import { READ_ONLY, WRITE_ADDITIVE } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_sheet_create",
    description: "创建钉钉表格文档。底层调用 dws sheet create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "表格标题（必填）" },
        workspace_id: { type: "string", description: "目标空间 ID" },
      },
      required: ["title"],
    },
    command: ["sheet", "create"],
    args(a) {
      return [
        ["--title", a.title],
        ["--workspace-id", a.workspace_id],
      ];
    },
  },

  {
    name: "dingtalk_sheet_list",
    description: "获取全部工作表列表。底层调用 dws sheet list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
      },
      required: ["node"],
    },
    command: ["sheet", "list"],
    args(a) {
      return [["--node", a.node]];
    },
  },


  {
    name: "dingtalk_sheet_info",
    description: "获取指定工作表详情。底层调用 dws sheet info。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        sheet_id: { type: "string", description: "工作表 ID（必填）" },
      },
      required: ["node", "sheet_id"],
    },
    command: ["sheet", "info"],
    args(a) {
      return [
        ["--node", a.node],
        ["--sheet-id", a.sheet_id],
      ];
    },
  },

  {
    name: "dingtalk_sheet_new",
    description: "新建工作表。底层调用 dws sheet new。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "表格文档 nodeId（必填）" },
        name: { type: "string", description: "工作表名称（必填）" },
      },
      required: ["node", "name"],
    },
    command: ["sheet", "new"],
    args(a) {
      return [
        ["--node", a.node],
        ["--name", a.name],
      ];
    },
  },
];
