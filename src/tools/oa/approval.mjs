/**
 * OA 审批 tools
 * 对应 dws oa approval 子命令树
 */
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE } from "../../framework/annotations.mjs";

export default [
  // ─── 待审批列表 ────────────────────────────────────
  {
    name: "dingtalk_oa_list_pending",
    description:
      "查看当前用户的待审批列表。底层调用 dws oa approval list-pending。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "开始时间，ISO-8601 格式" },
        end: { type: "string", description: "结束时间，ISO-8601 格式" },
        page: { type: "string", description: "页码" },
        size: { type: "string", description: "每页条数" },
      },
    },
    command: ["oa", "approval", "list-pending"],
    args(a) {
      return [
        ["--start", a.start],
        ["--end", a.end],
        ["--page", a.page],
        ["--size", a.size],
      ];
    },
  },

  // ─── 已发起列表 ────────────────────────────────────
  {
    name: "dingtalk_oa_list_initiated",
    description:
      "查询当前用户已发起的审批实例列表。底层调用 dws oa approval list-initiated。需提供 process-code 和 start 时间。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        process_code: { type: "string", description: "审批流程 code（必填）。可通过 dingtalk_oa_list_forms 获取。" },
        start: { type: "string", description: "开始时间，ISO-8601 格式（必填）" },
        end: { type: "string", description: "结束时间，ISO-8601 格式" },
        max_results: { type: "string", description: "每页返回数量" },
        next_token: { type: "string", description: "分页游标" },
      },
      required: ["process_code", "start"],
    },
    command: ["oa", "approval", "list-initiated"],
    args(a) {
      return [
        ["--process-code", a.process_code],
        ["--start", a.start],
        ["--end", a.end],
        ["--max-results", a.max_results],
        ["--next-token", a.next_token],
      ];
    },
  },

  // ─── 列出审批表单 ──────────────────────────────────
  {
    name: "dingtalk_oa_list_forms",
    description:
      "列出组织内的审批表单模板（获取 process-code）。底层调用 dws oa approval list-forms。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
    },
    command: ["oa", "approval", "list-forms"],
    args() {
      return [];
    },
  },

  // ─── 审批详情 ──────────────────────────────────────
  {
    name: "dingtalk_oa_detail",
    description:
      "获取审批实例详情。底层调用 dws oa approval detail。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
      },
      required: ["instance_id"],
    },
    command: ["oa", "approval", "detail"],
    args(a) {
      return [["--instance-id", a.instance_id]];
    },
  },

  // ─── 同意审批 ──────────────────────────────────────
  {
    name: "dingtalk_oa_approve",
    description:
      "同意审批任务。底层调用 dws oa approval approve。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
        task_id: { type: "string", description: "审批任务 ID（必填）" },
        remark: { type: "string", description: "审批意见" },
      },
      required: ["instance_id", "task_id"],
    },
    command: ["oa", "approval", "approve"],
    args(a) {
      return [
        ["--instance-id", a.instance_id],
        ["--task-id", a.task_id],
        ["--remark", a.remark],
      ];
    },
  },

  // ─── 拒绝审批 ──────────────────────────────────────
  {
    name: "dingtalk_oa_reject",
    description:
      "拒绝审批任务。底层调用 dws oa approval reject。",
    annotations: WRITE_ADDITIVE,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
        task_id: { type: "string", description: "审批任务 ID（必填）" },
        remark: { type: "string", description: "拒绝原因" },
      },
      required: ["instance_id", "task_id"],
    },
    command: ["oa", "approval", "reject"],
    args(a) {
      return [
        ["--instance-id", a.instance_id],
        ["--task-id", a.task_id],
        ["--remark", a.remark],
      ];
    },
  },

  // ─── 撤销审批 ──────────────────────────────────────
  {
    name: "dingtalk_oa_revoke",
    description:
      "撤销审批实例（仅发起人可操作）。底层调用 dws oa approval revoke。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
      },
      required: ["instance_id"],
    },
    command: ["oa", "approval", "revoke"],
    args(a) {
      return [["--instance-id", a.instance_id]];
    },
  },

  // ─── 审批记录 ──────────────────────────────────────
  {
    name: "dingtalk_oa_records",
    description:
      "查看审批操作记录（审批流水）。底层调用 dws oa approval records。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
      },
      required: ["instance_id"],
    },
    command: ["oa", "approval", "records"],
    args(a) {
      return [["--instance-id", a.instance_id]];
    },
  },

  // ─── 审批任务 ──────────────────────────────────────
  {
    name: "dingtalk_oa_tasks",
    description:
      "查看审批实例中的任务列表（含待处理/已处理）。底层调用 dws oa approval tasks。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        instance_id: { type: "string", description: "审批实例 ID（必填）" },
      },
      required: ["instance_id"],
    },
    command: ["oa", "approval", "tasks"],
    args(a) {
      return [["--instance-id", a.instance_id]];
    },
  },
];
