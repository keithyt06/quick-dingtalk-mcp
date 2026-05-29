/**
 * AI 听记 tools
 * 对应 dws minutes 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 全部听记列表 ──────────────────────────────────
  {
    name: "dingtalk_list_minutes_all",
    description:
      "列出全部听记。底层调用 dws minutes list all。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", description: "页码" },
        size: { type: "string", description: "每页条数" },
      },
    },
    command: ["minutes", "list", "all"],
    args(a) {
      return [
        ["--page", a.page],
        ["--size", a.size],
      ];
    },
  },

  // ─── 我的听记列表 ──────────────────────────────────
  {
    name: "dingtalk_list_minutes_mine",
    description:
      "列出我的听记。底层调用 dws minutes list mine。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", description: "页码" },
        size: { type: "string", description: "每页条数" },
      },
    },
    command: ["minutes", "list", "mine"],
    args(a) {
      return [
        ["--page", a.page],
        ["--size", a.size],
      ];
    },
  },

  // ─── 共享给我的听记 ────────────────────────────────
  {
    name: "dingtalk_list_minutes_shared",
    description:
      "列出共享给我的听记。底层调用 dws minutes list shared。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", description: "页码" },
        size: { type: "string", description: "每页条数" },
      },
    },
    command: ["minutes", "list", "shared"],
    args(a) {
      return [
        ["--page", a.page],
        ["--size", a.size],
      ];
    },
  },

  // ─── 听记基本信息 ──────────────────────────────────
  {
    name: "dingtalk_minutes_info",
    description:
      "获取听记基本信息。底层调用 dws minutes get info。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "get", "info"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 听记摘要 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_summary",
    description:
      "获取听记摘要。底层调用 dws minutes get summary。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "get", "summary"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 听记待办 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_todos",
    description:
      "获取听记中的待办事项。底层调用 dws minutes get todos。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "get", "todos"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 听记文字稿 ────────────────────────────────────
  {
    name: "dingtalk_minutes_transcription",
    description:
      "获取听记文字稿（完整逐字稿）。底层调用 dws minutes get transcription。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "get", "transcription"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 听记关键词 ────────────────────────────────────
  {
    name: "dingtalk_minutes_keywords",
    description:
      "获取听记关键词。底层调用 dws minutes get keywords。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "get", "keywords"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 批量获取听记 ──────────────────────────────────
  {
    name: "dingtalk_minutes_batch",
    description:
      "批量获取多个听记信息。底层调用 dws minutes get batch。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "string", description: "听记 ID 列表，逗号分隔（必填）" },
      },
      required: ["ids"],
    },
    command: ["minutes", "get", "batch"],
    args(a) {
      return [["--ids", a.ids]];
    },
  },

  // ─── 思维导图 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_mind_graph",
    description:
      "获取听记思维导图。底层调用 dws minutes mind-graph。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "mind-graph"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 发言人 ────────────────────────────────────────
  {
    name: "dingtalk_minutes_speaker",
    description:
      "获取/管理听记发言人信息。底层调用 dws minutes speaker。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
      },
      required: ["id"],
    },
    command: ["minutes", "speaker"],
    args(a) {
      return [["--id", a.id]];
    },
  },

  // ─── 个人热词 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_hot_word",
    description:
      "获取个人热词列表。底层调用 dws minutes hot-word。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["minutes", "hot-word"],
    args() {
      return [];
    },
  },

  // ─── 更新听记 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_update",
    description:
      "更新听记信息（如标题）。底层调用 dws minutes update。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
        title: { type: "string", description: "新标题" },
      },
      required: ["id"],
    },
    command: ["minutes", "update"],
    args(a) {
      return [
        ["--id", a.id],
        ["--title", a.title],
      ];
    },
  },

  // ─── 上传音频 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_upload",
    description:
      "上传音频文件创建听记。底层调用 dws minutes upload。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "本地音频文件路径（必填）" },
        title: { type: "string", description: "听记标题" },
      },
      required: ["file"],
    },
    command: ["minutes", "upload"],
    args(a) {
      return [
        ["--file", a.file],
        ["--title", a.title],
      ];
    },
  },

  // ─── 替换文本 ──────────────────────────────────────
  {
    name: "dingtalk_minutes_replace_text",
    description:
      "替换听记中的文本内容。底层调用 dws minutes replace-text。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "听记 ID（必填）" },
        old_text: { type: "string", description: "要替换的原始文本（必填）" },
        new_text: { type: "string", description: "替换后的新文本（必填）" },
      },
      required: ["id", "old_text", "new_text"],
    },
    command: ["minutes", "replace-text"],
    args(a) {
      return [
        ["--id", a.id],
        ["--old-text", a.old_text],
        ["--new-text", a.new_text],
      ];
    },
  },
];
