#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 5 * 1024 * 1024;

const server = new Server(
  { name: "quick-dingtalk-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "dingtalk_send_message",
    description:
      "以当前登录用户身份发送钉钉消息到群聊或个人。底层调用 dws chat message send（钉钉官方称为 chat.send_message_as_user）。注意：钉钉强制要求 title。",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "群聊 openConversationId（cid... 或 oc...）。chat_id / user_id / open_dingtalk_id 三选一。",
        },
        user_id: {
          type: "string",
          description: "接收人 userId（发单聊）。三选一。",
        },
        open_dingtalk_id: {
          type: "string",
          description: "接收人 openDingTalkId（三方应用场景，无 userId 时使用）。三选一。",
        },
        title: {
          type: "string",
          description: "消息标题（钉钉 API 强制必填，群聊和单聊都要）。",
        },
        text: {
          type: "string",
          description: "消息正文，支持 Markdown。",
        },
        at_all: {
          type: "boolean",
          description: "是否 @所有人（仅群聊生效）。需在 text 中包含 <@all> 占位符。",
        },
        at_users: {
          type: "string",
          description: "@指定 userId 列表（逗号分隔，仅群聊）。需在 text 中包含 <@userId> 占位符。",
        },
      },
      required: ["title", "text"],
    },
  },
  {
    name: "dingtalk_get_messages",
    description:
      "查看群聊或单聊的消息历史。底层调用 dws chat message list，按时间游标翻页。",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "群聊 openConversationId" },
        user_id: { type: "string", description: "单聊对方 userId" },
        open_dingtalk_id: { type: "string", description: "单聊对方 openDingTalkId" },
        time: {
          type: "string",
          description: "时间游标，格式 'YYYY-MM-DD HH:mm:ss'。默认拉之后的消息；forward=false 时拉之前。",
        },
        limit: { type: "number", description: "返回条数上限。" },
        forward: {
          type: "boolean",
          description: "true=向未来翻页（默认），false=向过去翻页。",
        },
      },
    },
  },
  {
    name: "dingtalk_search_messages",
    description:
      "按关键词跨会话搜索钉钉消息。底层调用 dws chat message search。注意 dws 用 keyword 参数。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "搜索关键词" },
        chat_id: { type: "string", description: "限定群聊（可选）" },
        start: { type: "string", description: "起始时间 'YYYY-MM-DD HH:mm:ss'" },
        end: { type: "string", description: "结束时间" },
        limit: { type: "number", description: "返回条数上限" },
      },
      required: ["keyword"],
    },
  },
  {
    name: "dingtalk_list_chats",
    description: "按名称搜索群会话列表。底层调用 dws chat search。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "群名关键词" },
        cursor: { type: "string", description: "分页游标（首页留空）" },
      },
      required: ["query"],
    },
  },
  {
    name: "dingtalk_search_user",
    description: "按姓名/花名搜索钉钉用户。底层调用 dws contact user search。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "用户姓名或花名关键词" },
      },
      required: ["query"],
    },
  },
  {
    name: "dingtalk_get_thread",
    description:
      "查看群话题（thread）的回复列表。底层调用 dws chat message list-topic-replies。需要 chat_id 和 topic_id 两个参数。",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: {
          type: "string",
          description: "话题所在的群 openConversationId（必填）",
        },
        topic_id: { type: "string", description: "话题/线程 ID（必填）" },
        time: { type: "string", description: "时间游标" },
        limit: { type: "number", description: "返回条数" },
        forward: { type: "boolean", description: "翻页方向" },
      },
      required: ["chat_id", "topic_id"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    switch (name) {
      case "dingtalk_send_message":
        return await runDws(buildSendArgs(args));
      case "dingtalk_get_messages":
        return await runDws(buildListArgs(args));
      case "dingtalk_search_messages":
        return await runDws(buildSearchArgs(args));
      case "dingtalk_list_chats":
        return await runDws(buildChatSearchArgs(args));
      case "dingtalk_search_user":
        return await runDws(buildUserSearchArgs(args));
      case "dingtalk_get_thread":
        return await runDws(buildThreadArgs(args));
      default:
        return errorResult(`未知工具: ${name}`);
    }
  } catch (err) {
    return errorResult(formatError(err));
  }
});

function buildSendArgs(a) {
  const targets = ["chat_id", "user_id", "open_dingtalk_id"].filter((k) => a[k]);
  if (targets.length !== 1) {
    throw new InputError(
      "chat_id / user_id / open_dingtalk_id 必须恰好提供一个"
    );
  }
  if (!a.title) throw new InputError("title 必填（钉钉 API 强制要求）");
  if (!a.text) throw new InputError("text 必填");

  const cmd = ["chat", "message", "send", "-y", "-f", "json"];
  if (a.chat_id) cmd.push("--group", a.chat_id);
  else if (a.user_id) cmd.push("--user", a.user_id);
  else cmd.push("--open-dingtalk-id", a.open_dingtalk_id);
  cmd.push("--title", a.title);
  cmd.push("--text", a.text);
  if (a.at_all === true) cmd.push("--at-all");
  if (a.at_users) cmd.push("--at-users", a.at_users);
  return cmd;
}

function buildListArgs(a) {
  const targets = ["chat_id", "user_id", "open_dingtalk_id"].filter((k) => a[k]);
  if (targets.length !== 1) {
    throw new InputError(
      "chat_id / user_id / open_dingtalk_id 必须恰好提供一个"
    );
  }
  const cmd = ["chat", "message", "list", "-f", "json"];
  if (a.chat_id) cmd.push("--group", a.chat_id);
  else if (a.user_id) cmd.push("--user", a.user_id);
  else cmd.push("--open-dingtalk-id", a.open_dingtalk_id);
  if (a.time) cmd.push("--time", a.time);
  if (a.limit != null) cmd.push("--limit", String(a.limit));
  if (a.forward === false) cmd.push("--forward", "false");
  return cmd;
}

function buildSearchArgs(a) {
  if (!a.keyword) throw new InputError("keyword 必填");
  const cmd = ["chat", "message", "search", "-f", "json", "--keyword", a.keyword];
  if (a.chat_id) cmd.push("--group", a.chat_id);
  if (a.start) cmd.push("--start", a.start);
  if (a.end) cmd.push("--end", a.end);
  if (a.limit != null) cmd.push("--limit", String(a.limit));
  return cmd;
}

function buildChatSearchArgs(a) {
  if (!a.query) throw new InputError("query 必填");
  const cmd = ["chat", "search", "-f", "json", "--query", a.query];
  if (a.cursor) cmd.push("--cursor", a.cursor);
  return cmd;
}

function buildUserSearchArgs(a) {
  if (!a.query) throw new InputError("query 必填");
  return ["contact", "user", "search", "-f", "json", "--query", a.query];
}

function buildThreadArgs(a) {
  if (!a.chat_id) throw new InputError("chat_id 必填（钉钉话题查询需要群 ID）");
  if (!a.topic_id) throw new InputError("topic_id 必填");
  const cmd = [
    "chat",
    "message",
    "list-topic-replies",
    "-f",
    "json",
    "--group",
    a.chat_id,
    "--topic-id",
    a.topic_id,
  ];
  if (a.time) cmd.push("--time", a.time);
  if (a.limit != null) cmd.push("--limit", String(a.limit));
  if (a.forward === false) cmd.push("--forward", "false");
  return cmd;
}

async function runDws(cmdArgs) {
  const { stdout, stderr } = await execFileAsync(DWS_BIN, cmdArgs, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  const out = stdout.trim() || stderr.trim() || "(empty response)";
  return { content: [{ type: "text", text: out }] };
}

class InputError extends Error {}

function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

function formatError(err) {
  if (err instanceof InputError) return err.message;
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  if (err.stdout) parts.push(`stdout: ${err.stdout}`);
  return parts.join("\n");
}

const transport = new StdioServerTransport();
await server.connect(transport);
