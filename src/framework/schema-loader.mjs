/**
 * Schema-driven 自动发现
 *
 * 启动时调用 `dws schema` 获取全部产品的 tool 定义，
 * 将每个 dws tool 转换为标准的 MCP tool 对象（与手写 tool 结构一致）。
 *
 * 转换规则：
 * - tool name: `dingtalk_<product>_<toolName>` (点号→下划线)
 * - command: 从 schema 的 commandPath 拆分
 * - args: 根据 parameters 动态生成映射函数
 * - annotations: 根据 tool 的 readOnly/destructive 标记推断
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "./annotations.mjs";

const execFileAsync = promisify(execFile);
const DWS_BIN = process.env.DWS_BIN || "dws";
const MAX_BUFFER = 10 * 1024 * 1024;
const SCHEMA_TIMEOUT_MS = Number(process.env.DWS_SCHEMA_TIMEOUT_MS) || 30_000;

/**
 * 从 dws schema 加载全部 tool 定义
 * @returns {Array<object>} tool 对象数组（与手写 tool 结构一致）
 */
export async function loadSchemaTools() {
  let schemaJson;
  try {
    const { stdout } = await execFileAsync(DWS_BIN, ["schema", "-f", "json"], {
      timeout: SCHEMA_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    schemaJson = JSON.parse(stdout);
  } catch (err) {
    // dws 不可用或版本不支持 schema 命令时，静默降级
    console.error(`[schema-loader] dws schema 调用失败，跳过自动发现: ${err.message}`);
    return [];
  }

  const tools = [];
  const products = schemaJson.products || schemaJson;

  // 支持两种可能的 schema 结构:
  // 结构 A: { products: [ { id, tools: [ { name, description, parameters, commandPath, ... } ] } ] }
  // 结构 B: [ { id, tools: [...] } ]
  const productList = Array.isArray(products) ? products : Object.values(products);

  for (const product of productList) {
    const productId = product.id || product.name || "unknown";
    const productTools = product.tools || [];

    for (const schemaTool of productTools) {
      try {
        const tool = convertSchemaTool(productId, schemaTool);
        if (tool) tools.push(tool);
      } catch (err) {
        console.error(`[schema-loader] 转换 tool 失败 (${productId}.${schemaTool.name}): ${err.message}`);
      }
    }
  }

  console.error(`[schema-loader] 从 dws schema 发现 ${tools.length} 个 tools`);
  return tools;
}

/**
 * 将单个 schema tool 转换为标准 MCP tool 对象
 */
function convertSchemaTool(productId, schemaTool) {
  const { name, description, parameters, commandPath, readOnly, destructive, idempotent } = schemaTool;

  if (!name || !commandPath) return null;

  // 生成 MCP tool name: dingtalk_<product>_<name>
  const mcpName = `dingtalk_${productId}_${name}`.replace(/[.\-]/g, "_");

  // 解析 command path: "calendar event create" → ["calendar", "event", "create"]
  const command = commandPath.split(/\s+/);

  // 推断 annotations
  const annotations = inferAnnotations({ readOnly, destructive, idempotent, name });

  // 构建 inputSchema
  const inputSchema = buildInputSchema(parameters);

  // 构建动态 args 函数
  const paramMappings = buildParamMappings(parameters);

  return {
    name: mcpName,
    description: description || `${productId}.${name}`,
    annotations,
    inputSchema,
    command,
    // schema-driven 标记，便于 runner 识别
    _schemaSource: true,
    _paramMappings: paramMappings,
    args(inputArgs) {
      return paramMappings.map(({ paramKey, cliFlag }) => [cliFlag, inputArgs[paramKey]]);
    },
  };
}

/**
 * 根据 tool 元信息推断 MCP annotations
 */
function inferAnnotations({ readOnly, destructive, idempotent, name }) {
  if (readOnly) return READ_ONLY;
  if (destructive) return WRITE_DESTRUCTIVE;
  if (idempotent) return WRITE_IDEMPOTENT;

  // 根据命名约定推断
  const n = name.toLowerCase();
  if (/^(list|get|search|query|info|check|suggest|read|find)/.test(n)) return READ_ONLY;
  if (/^(delete|remove|dismiss|recall|revoke|drop)/.test(n)) return WRITE_DESTRUCTIVE;
  if (/^(update|rename|set|done|mute|move|replace)/.test(n)) return WRITE_IDEMPOTENT;
  return WRITE_ADDITIVE;
}

/**
 * 将 schema parameters 转换为 JSON Schema（MCP inputSchema）
 */
function buildInputSchema(parameters) {
  if (!parameters || (!Array.isArray(parameters) && !parameters.properties)) {
    return { type: "object", properties: {} };
  }

  // 如果 parameters 已经是 JSON Schema 格式，直接使用
  if (parameters.type === "object" && parameters.properties) {
    return parameters;
  }

  // 如果是数组格式的参数列表
  if (Array.isArray(parameters)) {
    const properties = {};
    const required = [];

    for (const param of parameters) {
      const key = normalizeParamKey(param.name || param.flag);
      properties[key] = {
        type: param.type || "string",
        description: param.description || param.name || key,
      };
      if (param.required) {
        required.push(key);
      }
    }

    const schema = { type: "object", properties };
    if (required.length > 0) schema.required = required;
    return schema;
  }

  return { type: "object", properties: {} };
}

/**
 * 从 parameters 构建参数映射 [{ paramKey, cliFlag }]
 */
function buildParamMappings(parameters) {
  if (!parameters) return [];

  // JSON Schema 格式
  if (parameters.type === "object" && parameters.properties) {
    return Object.keys(parameters.properties).map((key) => ({
      paramKey: key,
      cliFlag: `--${key.replace(/_/g, "-")}`,
    }));
  }

  // 数组格式
  if (Array.isArray(parameters)) {
    return parameters.map((param) => {
      const key = normalizeParamKey(param.name || param.flag);
      const flag = param.flag || `--${key.replace(/_/g, "-")}`;
      return { paramKey: key, cliFlag: flag };
    });
  }

  return [];
}

/**
 * 规范化参数名：--kebab-case → snake_case
 */
function normalizeParamKey(name) {
  if (!name) return "unknown";
  return name.replace(/^-+/, "").replace(/-/g, "_");
}
