/**
 * AI 表格 - 导入导出/附件/模板 tools
 * 对应 dws aitable import/export/attachment/template 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE } from "../../framework/annotations.mjs";

export default [
  {
    name: "dingtalk_aitable_import",
    description: "导入数据到 AI 表格。底层调用 dws aitable import。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        file: { type: "string", description: "本地文件路径（必填）" },
      },
      required: ["base_id", "table_id", "file"],
    },
    command: ["aitable", "import"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--file", a.file],
      ];
    },
  },


  {
    name: "dingtalk_aitable_export",
    description: "从 AI 表格导出数据。底层调用 dws aitable export。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        table_id: { type: "string", description: "数据表 ID（必填）" },
        output: { type: "string", description: "输出文件路径" },
      },
      required: ["base_id", "table_id"],
    },
    command: ["aitable", "export"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--table-id", a.table_id],
        ["--output", a.output],
      ];
    },
  },

  {
    name: "dingtalk_aitable_attachment_upload",
    description: "上传附件到 AI 表格。底层调用 dws aitable attachment upload。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        file: { type: "string", description: "本地文件路径（必填）" },
      },
      required: ["base_id", "file"],
    },
    command: ["aitable", "attachment", "upload"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--file", a.file],
      ];
    },
  },

  {
    name: "dingtalk_aitable_attachment_download",
    description: "下载 AI 表格附件。底层调用 dws aitable attachment download。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        base_id: { type: "string", description: "Base ID（必填）" },
        attachment_id: { type: "string", description: "附件 ID（必填）" },
        output: { type: "string", description: "输出路径" },
      },
      required: ["base_id", "attachment_id"],
    },
    command: ["aitable", "attachment", "download"],
    args(a) {
      return [
        ["--base-id", a.base_id],
        ["--attachment-id", a.attachment_id],
        ["--output", a.output],
      ];
    },
  },

  {
    name: "dingtalk_aitable_template_list",
    description: "列出 AI 表格模板。底层调用 dws aitable template list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["aitable", "template", "list"],
    args() {
      return [];
    },
  },

  {
    name: "dingtalk_aitable_template_get",
    description: "获取 AI 表格模板详情。底层调用 dws aitable template get。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "模板 ID（必填）" },
      },
      required: ["template_id"],
    },
    command: ["aitable", "template", "get"],
    args(a) {
      return [["--template-id", a.template_id]];
    },
  },
];
