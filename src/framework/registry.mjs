/**
 * Tool 注册表：自动扫描 src/tools/ 目录下所有 .mjs 文件
 * 收集 tool 定义，构建 MCP tools 列表和内部 handler 映射
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TOOLS_DIR = resolve(__dirname, "../tools");

/**
 * 扫描 src/tools/ 下所有 .mjs 文件，收集 tool 定义
 * @returns {{ mcpTools: Array, handlers: Map<string, object> }}
 */
export async function loadAllTools() {
  const mcpTools = [];
  const handlers = new Map();

  const modules = await discoverModules(TOOLS_DIR);
  for (const modulePath of modules) {
    const mod = await import(modulePath);
    const tools = mod.default;
    if (!Array.isArray(tools)) continue;

    for (const tool of tools) {
      if (!tool.name || !tool.command || !tool.args) {
        console.error(`[registry] 跳过无效 tool 定义 in ${modulePath}:`, tool.name || "(unnamed)");
        continue;
      }

      // 注册到 MCP 协议层（只暴露标准字段）
      mcpTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });

      // 注册到内部 handler 映射
      handlers.set(tool.name, tool);
    }
  }

  console.error(`[registry] 已加载 ${mcpTools.length} 个 tools，来自 ${modules.length} 个模块`);
  return { mcpTools, handlers };
}

/**
 * 递归发现 tools 目录下所有 .mjs 文件
 */
async function discoverModules(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      const parentPath = entry.parentPath || entry.path;
      results.push(join(parentPath, entry.name));
    }
  }
  return results.sort(); // 保证加载顺序确定性
}
