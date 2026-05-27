/**
 * 云盘 tools
 * 对应 dws drive 子命令树（文件 / 上传 / 下载 / 文件夹）
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 列出文件 ──────────────────────────────────────
  {
    name: "dingtalk_drive_list",
    description:
      "列出云盘文件列表。底层调用 dws drive list。可指定空间和父目录。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        parent_id: { type: "string", description: "父目录文件 ID（不传则为根目录）" },
        max: { type: "string", description: "每页返回数量" },
        next_token: { type: "string", description: "分页游标" },
        order: { type: "string", description: "排序方向（asc/desc）" },
        order_by: { type: "string", description: "排序字段（name/size/modifiedTime 等）" },
      },
      required: ["space_id"],
    },
    command: ["drive", "list"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--parent-id", a.parent_id],
        ["--max", a.max],
        ["--next-token", a.next_token],
        ["--order", a.order],
        ["--order-by", a.order_by],
      ];
    },
  },

  // ─── 列出空间 ──────────────────────────────────────
  {
    name: "dingtalk_drive_list_spaces",
    description: "列出云盘空间列表。底层调用 dws drive list-spaces。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["drive", "list-spaces"],
    args() {
      return [];
    },
  },

  // ─── 获取文件信息 ──────────────────────────────────
  {
    name: "dingtalk_drive_info",
    description: "获取云盘文件详细信息。底层调用 dws drive info。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        file_id: { type: "string", description: "文件 ID（必填）" },
      },
      required: ["space_id", "file_id"],
    },
    command: ["drive", "info"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--file-id", a.file_id],
      ];
    },
  },

  // ─── 下载文件 ──────────────────────────────────────
  {
    name: "dingtalk_drive_download",
    description: "下载云盘文件（返回下载链接或内容）。底层调用 dws drive download。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        file_id: { type: "string", description: "文件 ID（必填）" },
      },
      required: ["space_id", "file_id"],
    },
    command: ["drive", "download"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--file-id", a.file_id],
      ];
    },
  },

  // ─── 上传文件 ──────────────────────────────────────
  {
    name: "dingtalk_drive_upload",
    description: "上传本地文件到钉盘。底层调用 dws drive upload。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "本地文件路径（必填）" },
        space_id: { type: "string", description: "目标空间 ID（必填）" },
        parent_id: { type: "string", description: "目标父目录文件 ID" },
      },
      required: ["file", "space_id"],
    },
    command: ["drive", "upload"],
    args(a) {
      return [
        ["--file", a.file],
        ["--space-id", a.space_id],
        ["--parent-id", a.parent_id],
      ];
    },
  },

  // ─── 获取上传信息 ──────────────────────────────────
  {
    name: "dingtalk_drive_upload_info",
    description: "获取上传所需信息（用于分片上传场景）。底层调用 dws drive upload-info。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        parent_id: { type: "string", description: "父目录文件 ID（必填）" },
        file_name: { type: "string", description: "文件名（必填）" },
        file_size: { type: "string", description: "文件大小（字节）（必填）" },
      },
      required: ["space_id", "parent_id", "file_name", "file_size"],
    },
    command: ["drive", "upload-info"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--parent-id", a.parent_id],
        ["--file-name", a.file_name],
        ["--file-size", a.file_size],
      ];
    },
  },

  // ─── 提交上传 ──────────────────────────────────────
  {
    name: "dingtalk_drive_commit",
    description: "提交上传（分片上传完成后调用）。底层调用 dws drive commit。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        upload_key: { type: "string", description: "上传 key（必填，由 upload-info 返回）" },
      },
      required: ["space_id", "upload_key"],
    },
    command: ["drive", "commit"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--upload-key", a.upload_key],
      ];
    },
  },

  // ─── 创建文件夹 ────────────────────────────────────
  {
    name: "dingtalk_drive_mkdir",
    description: "在云盘创建文件夹。底层调用 dws drive mkdir。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        parent_id: { type: "string", description: "父目录文件 ID（必填）" },
        name: { type: "string", description: "文件夹名称（必填）" },
      },
      required: ["space_id", "parent_id", "name"],
    },
    command: ["drive", "mkdir"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--parent-id", a.parent_id],
        ["--name", a.name],
      ];
    },
  },

  // ─── 删除文件 ──────────────────────────────────────
  {
    name: "dingtalk_drive_delete",
    description: "删除云盘文件或文件夹（不可恢复）。底层调用 dws drive delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "空间 ID（必填）" },
        file_id: { type: "string", description: "文件 ID（必填）" },
      },
      required: ["space_id", "file_id"],
    },
    command: ["drive", "delete"],
    args(a) {
      return [
        ["--space-id", a.space_id],
        ["--file-id", a.file_id],
      ];
    },
  },
];
