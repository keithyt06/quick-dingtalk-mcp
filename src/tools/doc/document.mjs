/**
 * 钉钉文档 tools
 * 对应 dws doc 子命令树（搜索 / 浏览 / 读写 / 上传下载 / 文件 / 文件夹 / 块级编辑 / 评论）
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 搜索文档 ──────────────────────────────────────
  {
    name: "dingtalk_search_doc",
    description:
      "搜索钉钉文档。底层调用 dws doc search。支持按关键词、创建者、文件类型、时间范围等维度搜索。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词（必填）" },
        page_size: { type: "string", description: "每页返回数量" },
        workspace_ids: { type: "string", description: "知识库 ID 列表，逗号分隔" },
        creator_uids: { type: "string", description: "创建者 userId 列表，逗号分隔" },
        extensions: { type: "string", description: "文件类型过滤（如 doc,sheet,pdf），逗号分隔" },
        created_from: { type: "string", description: "创建时间起始，ISO-8601" },
        created_to: { type: "string", description: "创建时间结束，ISO-8601" },
        visited_from: { type: "string", description: "访问时间起始，ISO-8601" },
        visited_to: { type: "string", description: "访问时间结束，ISO-8601" },
      },
      required: ["query"],
    },
    command: ["doc", "search"],
    args(a) {
      return [
        ["--query", a.query],
        ["--page-size", a.page_size],
        ["--workspace-ids", a.workspace_ids],
        ["--creator-uids", a.creator_uids],
        ["--extensions", a.extensions],
        ["--created-from", a.created_from],
        ["--created-to", a.created_to],
        ["--visited-from", a.visited_from],
        ["--visited-to", a.visited_to],
      ];
    },
  },

  // ─── 读取文档内容 ──────────────────────────────────
  {
    name: "dingtalk_read_doc",
    description: "读取文档内容。底层调用 dws doc read。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
      },
      required: ["node"],
    },
    command: ["doc", "read"],
    args(a) {
      return [["--node", a.node]];
    },
  },

  // ─── 列出文档 ──────────────────────────────────────
  {
    name: "dingtalk_list_docs",
    description: "列出文档列表。底层调用 dws doc list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string", description: "知识库/空间 ID" },
        parent_node_id: { type: "string", description: "父节点 ID（用于列出子文档）" },
        max_results: { type: "string", description: "每页返回数量" },
        next_token: { type: "string", description: "分页游标" },
      },
    },
    command: ["doc", "list"],
    args(a) {
      return [
        ["--workspace-id", a.workspace_id],
        ["--parent-node-id", a.parent_node_id],
        ["--max-results", a.max_results],
        ["--next-token", a.next_token],
      ];
    },
  },

  // ─── 获取文档信息 ──────────────────────────────────
  {
    name: "dingtalk_doc_info",
    description: "获取文档详细信息（标题、类型、创建者、修改时间等）。底层调用 dws doc info。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
      },
      required: ["node"],
    },
    command: ["doc", "info"],
    args(a) {
      return [["--node", a.node]];
    },
  },

  // ─── 创建文档 ──────────────────────────────────────
  {
    name: "dingtalk_create_doc",
    description: "创建钉钉文档。底层调用 dws doc create。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "文档标题（必填）" },
        workspace_id: { type: "string", description: "目标知识库/空间 ID" },
        parent_node_id: { type: "string", description: "父节点 ID" },
        doc_type: { type: "string", description: "文档类型（如 alidoc, sheet 等）" },
      },
      required: ["title"],
    },
    command: ["doc", "create"],
    args(a) {
      return [
        ["--title", a.title],
        ["--workspace-id", a.workspace_id],
        ["--parent-node-id", a.parent_node_id],
        ["--doc-type", a.doc_type],
      ];
    },
  },

  // ─── 更新文档 ──────────────────────────────────────
  {
    name: "dingtalk_update_doc",
    description: "更新文档内容。底层调用 dws doc update。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
        content: { type: "string", description: "新内容" },
      },
      required: ["node"],
    },
    command: ["doc", "update"],
    args(a) {
      return [
        ["--node", a.node],
        ["--content", a.content],
      ];
    },
  },

  // ─── 上传文件 ──────────────────────────────────────
  {
    name: "dingtalk_upload_doc",
    description: "上传文件到钉钉文档空间。底层调用 dws doc upload。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "本地文件路径（必填）" },
        workspace_id: { type: "string", description: "目标知识库/空间 ID" },
        parent_node_id: { type: "string", description: "父节点 ID" },
      },
      required: ["file"],
    },
    command: ["doc", "upload"],
    args(a) {
      return [
        ["--file", a.file],
        ["--workspace-id", a.workspace_id],
        ["--parent-node-id", a.parent_node_id],
      ];
    },
  },

  // ─── 下载文件 ──────────────────────────────────────
  {
    name: "dingtalk_download_doc",
    description: "下载钉钉文档。底层调用 dws doc download。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
        output: { type: "string", description: "输出路径" },
      },
      required: ["node"],
    },
    command: ["doc", "download"],
    args(a) {
      return [
        ["--node", a.node],
        ["--output", a.output],
      ];
    },
  },

  // ─── 复制文档 ──────────────────────────────────────
  {
    name: "dingtalk_copy_doc",
    description: "复制文档到指定位置。底层调用 dws doc copy。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "源文档 nodeId（必填）" },
        target_workspace_id: { type: "string", description: "目标知识库/空间 ID" },
        target_parent_node_id: { type: "string", description: "目标父节点 ID" },
      },
      required: ["node"],
    },
    command: ["doc", "copy"],
    args(a) {
      return [
        ["--node", a.node],
        ["--target-workspace-id", a.target_workspace_id],
        ["--target-parent-node-id", a.target_parent_node_id],
      ];
    },
  },

  // ─── 移动文档 ──────────────────────────────────────
  {
    name: "dingtalk_move_doc",
    description: "移动文档到指定位置。底层调用 dws doc move。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "源文档 nodeId（必填）" },
        target_workspace_id: { type: "string", description: "目标知识库/空间 ID" },
        target_parent_node_id: { type: "string", description: "目标父节点 ID" },
      },
      required: ["node"],
    },
    command: ["doc", "move"],
    args(a) {
      return [
        ["--node", a.node],
        ["--target-workspace-id", a.target_workspace_id],
        ["--target-parent-node-id", a.target_parent_node_id],
      ];
    },
  },

  // ─── 重命名文档 ────────────────────────────────────
  {
    name: "dingtalk_rename_doc",
    description: "重命名文档。底层调用 dws doc rename。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
        name: { type: "string", description: "新文档名称（必填）" },
      },
      required: ["node", "name"],
    },
    command: ["doc", "rename"],
    args(a) {
      return [
        ["--node", a.node],
        ["--name", a.name],
      ];
    },
  },

  // ─── 块级编辑 ──────────────────────────────────────
  {
    name: "dingtalk_doc_block",
    description: "文档块级编辑（读取/插入/更新/删除块）。底层调用 dws doc block。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
        action: { type: "string", description: "操作类型：read/insert/update/delete" },
        block_id: { type: "string", description: "块 ID（更新/删除时需要）" },
        content: { type: "string", description: "块内容 JSON（插入/更新时需要）" },
        index: { type: "string", description: "插入位置索引（insert 时可选）" },
      },
      required: ["node"],
    },
    command: ["doc", "block"],
    args(a) {
      return [
        ["--node", a.node],
        ["--action", a.action],
        ["--block-id", a.block_id],
        ["--content", a.content],
        ["--index", a.index],
      ];
    },
  },

  // ─── 文档评论 ──────────────────────────────────────
  {
    name: "dingtalk_doc_comment",
    description: "文档评论操作（列出/添加/回复评论）。底层调用 dws doc comment。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "文档 nodeId（必填）" },
        action: { type: "string", description: "操作类型：list/add/reply" },
        comment_id: { type: "string", description: "评论 ID（reply 时需要）" },
        content: { type: "string", description: "评论内容（add/reply 时需要）" },
      },
      required: ["node"],
    },
    command: ["doc", "comment"],
    args(a) {
      return [
        ["--node", a.node],
        ["--action", a.action],
        ["--comment-id", a.comment_id],
        ["--content", a.content],
      ];
    },
  },

  // ─── 文件操作 ──────────────────────────────────────
  {
    name: "dingtalk_doc_file",
    description: "文档空间文件操作（列出/删除/移动文件）。底层调用 dws doc file。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作类型：list/delete/move" },
        workspace_id: { type: "string", description: "知识库/空间 ID" },
        node: { type: "string", description: "文件 nodeId" },
        target_parent_node_id: { type: "string", description: "目标父节点 ID（move 时需要）" },
      },
    },
    command: ["doc", "file"],
    args(a) {
      return [
        ["--action", a.action],
        ["--workspace-id", a.workspace_id],
        ["--node", a.node],
        ["--target-parent-node-id", a.target_parent_node_id],
      ];
    },
  },

  // ─── 文件夹操作 ────────────────────────────────────
  {
    name: "dingtalk_doc_folder",
    description: "文档空间文件夹操作（创建/列出/删除文件夹）。底层调用 dws doc folder。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "操作类型：create/list/delete" },
        workspace_id: { type: "string", description: "知识库/空间 ID" },
        parent_node_id: { type: "string", description: "父节点 ID" },
        name: { type: "string", description: "文件夹名称（create 时需要）" },
        node: { type: "string", description: "文件夹 nodeId（delete 时需要）" },
      },
    },
    command: ["doc", "folder"],
    args(a) {
      return [
        ["--action", a.action],
        ["--workspace-id", a.workspace_id],
        ["--parent-node-id", a.parent_node_id],
        ["--name", a.name],
        ["--node", a.node],
      ];
    },
  },
];
