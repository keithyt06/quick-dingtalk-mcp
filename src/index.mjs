#!/usr/bin/env node
/**
 * quick-dingtalk-mcp v1.0
 *
 * 模块化 MCP Server，支持混合模式：
 * - 手写 tools（src/tools/）优先加载，提供精确的参数映射和中文描述
 * - Schema-driven 自动发现补充未覆盖的 dws 命令（运行时调用 dws schema）
 *
 * 入口只负责启动 server 和路由请求，业务逻辑全在 src/tools/ 和 framework/ 中。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAllTools } from "./framework/registry.mjs";
import { executeTool } from "./framework/runner.mjs";
import { errorResult, formatError } from "./framework/helpers.mjs";

// 加载所有 tool 定义
const { mcpTools, handlers } = await loadAllTools();

const server = new Server(
  { name: "quick-dingtalk-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ListTools：返回所有已注册的 tool
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mcpTools,
}));

// CallTool：路由到对应 handler 执行
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const tool = handlers.get(name);
  if (!tool) {
    return errorResult(`未知工具: ${name}`);
  }
  try {
    return await executeTool(tool, args);
  } catch (err) {
    return errorResult(formatError(err));
  }
});

// 启动 stdio 传输
const transport = new StdioServerTransport();
await server.connect(transport);
