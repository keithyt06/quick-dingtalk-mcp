/**
 * Tool 注册表：混合模式
 *
 * 1. 扫描 src/tools/ 目录下手写的 .mjs 文件（优先）
 * 2. 调用 dws schema 自动发现补充未覆盖的命令
 *
 * 手写 tools 始终优先——如果手写定义了某个 tool name，
 * schema 中同名的 tool 会被跳过（手写的 description 和参数更精确）。
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSchemaTools } from "./schema-loader.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TOOLS_DIR = resolve(__dirname, "../tools");

/**
 * 加载全部 tools（手写 + schema 自动发现）
 * @returns {{ mcpTools: Array, handlers: Map<string, object> }}
 */
export async function loadAllTools() {
  const mcpTools = [];
  const handlers = new Map();

  // ─── Phase 1: 加载手写 tools（优先级高）────────────
  const modules = await discoverModules(TOOLS_DIR);
  for (const modulePath of modules) {
    const mod = await import(pathToFileURL(modulePath).href);
    const tools = mod.default;
    if (!Array.isArray(tools)) continue;

    for (const tool of tools) {
      // 自定义执行器只需 name + execute，普通 tool 需要 command + args
      const isCustom = tool._customExecutor && typeof tool.execute === "function";
      if (!tool.name || (!isCustom && (!tool.command || !tool.args))) {
        console.error(`[registry] 跳过无效 tool 定义 in ${modulePath}:`, tool.name || "(unnamed)");
        continue;
      }

      mcpTools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      });

      handlers.set(tool.name, tool);
    }
  }

  const manualCount = mcpTools.length;

  // ─── Phase 2: Schema 自动发现（补充未覆盖的）────────
  const schemaTools = await loadSchemaTools();
  let schemaAdded = 0;

  for (const tool of schemaTools) {
    // 跳过手写已覆盖的 tool
    if (handlers.has(tool.name)) continue;

    mcpTools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    });

    handlers.set(tool.name, tool);
    schemaAdded++;
  }

  console.error(
    `[registry] 已加载 ${mcpTools.length} 个 tools` +
    `（手写 ${manualCount} + schema 自动发现 ${schemaAdded}）` +
    `，来自 ${modules.length} 个模块`
  );

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
  return results.sort();
}
