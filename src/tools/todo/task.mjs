/**
 * 待办任务 tools
 * 对应 dws todo task 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  // ─── 创建待办 ──────────────────────────────────────
  {
    name: "dingtalk_create_todo",
    description:
      "创建待办任务。底层调用 dws todo task create。优先级：10=低/20=普通/30=高/40=紧急。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "待办标题（必填）" },
        executors: { type: "string", description: "执行者 userId 列表，逗号分隔（必填）" },
        due: { type: "string", description: "截止时间 ISO-8601（如 2026-03-10T18:00:00+08:00）" },
        priority: { type: "string", description: "优先级：10=低/20=普通/30=高/40=紧急" },
        recurrence: { type: "string", description: "循环规则（需配合 --due），格式如 DTSTART:...\\nRRULE:FREQ=DAILY;INTERVAL=1" },
      },
      required: ["title", "executors"],
    },
    command: ["todo", "task", "create"],
    args(a) {
      return [
        ["--title", a.title],
        ["--executors", a.executors],
        ["--due", a.due],
        ["--priority", a.priority],
        ["--recurrence", a.recurrence],
      ];
    },
  },

  // ─── 查看待办列表 ──────────────────────────────────
  {
    name: "dingtalk_list_todos",
    description:
      "查看当前用户的待办列表。返回作为执行者的待办任务。底层调用 dws todo task list。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", description: "页码（默认 1）" },
        size: { type: "string", description: "每页条数（默认 20，超过 20 自动分页）" },
        status: { type: "string", description: "完成状态：true=已完成, false=未完成" },
      },
    },
    command: ["todo", "task", "list"],
    args(a) {
      return [
        ["--page", a.page],
        ["--size", a.size],
        ["--status", a.status],
      ];
    },
  },

  // ─── 获取待办详情 ──────────────────────────────────
  {
    name: "dingtalk_get_todo",
    description:
      "获取待办任务详情。底层调用 dws todo task get。返回标题、执行者、截止时间、完成状态等。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务 ID（必填）。可通过 dingtalk_list_todos 获取。" },
      },
      required: ["task_id"],
    },
    command: ["todo", "task", "get"],
    args(a) {
      return [["--task-id", a.task_id]];
    },
  },

  // ─── 更新待办 ──────────────────────────────────────
  {
    name: "dingtalk_update_todo",
    description:
      "更新待办任务信息（标题/优先级/截止时间/完成状态）。底层调用 dws todo task update。只需传要修改的字段。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务 ID（必填）" },
        title: { type: "string", description: "新标题" },
        priority: { type: "string", description: "新优先级：10=低/20=普通/30=高/40=紧急" },
        due: { type: "string", description: "新截止时间 ISO-8601" },
        done: { type: "string", description: "完成状态：true/false" },
      },
      required: ["task_id"],
    },
    command: ["todo", "task", "update"],
    args(a) {
      return [
        ["--task-id", a.task_id],
        ["--title", a.title],
        ["--priority", a.priority],
        ["--due", a.due],
        ["--done", a.done],
      ];
    },
  },

  // ─── 删除待办 ──────────────────────────────────────
  {
    name: "dingtalk_delete_todo",
    description: "删除待办任务（不可恢复）。底层调用 dws todo task delete。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务 ID（必填）" },
      },
      required: ["task_id"],
    },
    command: ["todo", "task", "delete"],
    args(a) {
      return [["--task-id", a.task_id]];
    },
  },

  // ─── 标记完成/未完成 ───────────────────────────────
  {
    name: "dingtalk_done_todo",
    description:
      "标记待办为已完成或未完成。底层调用 dws todo task done。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务 ID（必填）" },
        status: { type: "string", description: "完成状态：true=已完成, false=未完成（必填）" },
      },
      required: ["task_id", "status"],
    },
    command: ["todo", "task", "done"],
    args(a) {
      return [
        ["--task-id", a.task_id],
        ["--status", a.status],
      ];
    },
  },
];
