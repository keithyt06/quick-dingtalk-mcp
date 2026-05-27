#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  catalog,
  tier1,
  toToolName,
  buildInputSchema,
  toCliArgs,
  InputError,
  searchCatalog,
  rewritePAT,
  parsePATError,
  isPATExitCode,
  annotationsFor,
} from "@quick-dingtalk-mcp/shared";

const execFileAsync = promisify(execFile);

const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 5 * 1024 * 1024;
const AGENTCODE = process.env.DINGTALK_DWS_AGENTCODE || "quick-dingtalk-mcp";

const aliasMap = tier1.aliases; // alias name → real tool name

// Pre-build canonical-key index so findCommandByToolName is O(1) instead of
// walking every catalog entry on every call.
const TOOL_NAME_TO_KEY = new Map();
for (const key of Object.keys(catalog.commands)) {
  TOOL_NAME_TO_KEY.set(toToolName(key), key);
}

function findCommandByToolName(name) {
  const realName = aliasMap[name] || name;
  const key = TOOL_NAME_TO_KEY.get(realName);
  if (!key) return null;
  return { key, cmd: catalog.commands[key], realName };
}

function buildToolList() {
  const tools = [];
  for (const toolName of tier1.tools) {
    const found = findCommandByToolName(toolName);
    if (!found) continue;
    tools.push({
      name: toolName,
      description: found.cmd.description,
      inputSchema: buildInputSchema(found.cmd),
      annotations: annotationsFor(found.cmd),
    });
  }
  for (const [aliasName, realName] of Object.entries(aliasMap)) {
    const found = findCommandByToolName(realName);
    if (!found) continue;
    tools.push({
      name: aliasName,
      description: `[deprecated, use ${realName}] ${found.cmd.description}`,
      inputSchema: buildInputSchema(found.cmd),
      annotations: annotationsFor(found.cmd),
    });
  }
  tools.push({
    name: "dingtalk_discover",
    description:
      "在 dws catalog 中按关键词搜索可用命令；返回 tool_name + 简介。先调这个、再用 dingtalk_invoke 执行。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "关键词,可空(返回 top-N)" },
        limit: { type: "number", description: "返回条数上限,默认 20" },
      },
    },
  });
  tools.push({
    name: "dingtalk_invoke",
    description:
      "按 dingtalk_discover 给出的 tool_name 调用对应命令。args 是该命令的参数对象(snake_case)。",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: {
          type: "string",
          description: "形如 dingtalk_xxx_yyy 的工具名",
        },
        args: {
          type: "object",
          description: "命令参数;具体 schema 看 discover 返回",
        },
      },
      required: ["tool_name"],
    },
  });
  return tools;
}

const TOOLS = buildToolList();

const server = new Server(
  { name: "quick-dingtalk-mcp", version: "0.2.0-pre" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === "dingtalk_discover") {
      const results = searchCatalog(catalog, args, { tier1: tier1.tools });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
    if (name === "dingtalk_invoke") {
      if (!args.tool_name) throw new InputError("tool_name 必填");
      return await dispatch(args.tool_name, args.args || {});
    }
    return await dispatch(name, args);
  } catch (err) {
    return errorResult(err);
  }
});

async function dispatch(toolName, callArgs) {
  const found = findCommandByToolName(toolName);
  if (!found) {
    return errorResult(new InputError(`未知工具: ${toolName}`));
  }
  const cliArgs = toCliArgs(found.cmd, callArgs);
  return await runDws(cliArgs);
}

async function runDws(cmdArgs) {
  try {
    const { stdout, stderr } = await execFileAsync(DWS_BIN, cmdArgs, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, DINGTALK_DWS_AGENTCODE: AGENTCODE },
    });
    const out = stdout.trim() || stderr.trim() || "(empty response)";
    return { content: [{ type: "text", text: out }] };
  } catch (err) {
    if (isPATExitCode(err.code)) {
      const pat = parsePATError(err.stderr);
      if (pat) {
        const rewritten = rewritePAT(pat, { mode: "local" });
        return {
          content: [{ type: "text", text: JSON.stringify(rewritten, null, 2) }],
          isError: true,
        };
      }
    }
    throw err;
  }
}

function errorResult(err) {
  if (err instanceof InputError) {
    return { content: [{ type: "text", text: err.message }], isError: true };
  }
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  if (err.stdout) parts.push(`stdout: ${err.stdout}`);
  return {
    content: [{ type: "text", text: `Error: ${parts.join("\n")}` }],
    isError: true,
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
