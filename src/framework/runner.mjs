/**
 * dws CLI 执行器
 *
 * 统一处理：
 * - 命令拼装（command + args + 全局 flags）
 * - 超时控制
 * - 权限错误检测与提示
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { InputError } from "./helpers.mjs";

const execFileAsync = promisify(execFile);

const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = Number(process.env.DWS_TIMEOUT_MS) || 60_000;
const MAX_BUFFER = 5 * 1024 * 1024;

/**
 * 执行一个 tool 定义
 * @param {object} tool - tool 声明对象
 * @param {object} inputArgs - 用户传入的参数
 * @returns MCP CallToolResult
 */
export async function executeTool(tool, inputArgs) {
  // 0. 自定义执行器（不走 dws CLI，如 system/update）
  if (tool._customExecutor && typeof tool.execute === "function") {
    return await tool.execute(inputArgs);
  }

  // 1. 可选自定义校验
  if (tool.validate) {
    tool.validate(inputArgs);
  }

  // 2. 构建 CLI 参数
  const cmdArgs = [
    ...tool.command,
    "-y",
    "-f", "json",
    ...flattenArgs(tool.args(inputArgs)),
  ];

  // 3. 执行
  const { stdout, stderr } = await execFileAsync(DWS_BIN, cmdArgs, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });

  // 4. 权限错误检测
  const combined = (stderr || "") + (stdout || "");
  if (combined.includes("PAT_MEDIUM_RISK_NO_PERMISSION") || combined.includes("PAT_HIGH_RISK_NO_PERMISSION")) {
    const urlMatch = combined.match(/authorizationUrl['":\s]+(https?:\/\/[^\s'"}\]]+)/);
    const hint = urlMatch ? `\n请在浏览器打开授权: ${urlMatch[1]}` : "";
    return {
      content: [{ type: "text", text: `需要额外授权${hint}\n\n原始输出: ${combined.trim()}` }],
      isError: true,
    };
  }

  const out = stdout.trim() || stderr.trim() || "(empty response)";
  return { content: [{ type: "text", text: out }] };
}

/**
 * 将 args 函数返回的二维数组平铺为一维，过滤空值
 *
 * 输入格式：
 *   [["--flag", "value"], ["--bool"], null, ["--empty", undefined]]
 *
 * 输出：
 *   ["--flag", "value", "--bool"]
 *
 * 规则：
 * - null/undefined 的 pair 整个跳过
 * - value 为 undefined/null/"" 的 pair 跳过
 * - 单元素数组 ["--flag"] 视为布尔 flag，只输出 flag 名
 * - 其他情况输出 flag + String(value)
 */
function flattenArgs(pairs) {
  const result = [];
  for (const pair of pairs) {
    if (!pair) continue;
    const [flag, value] = pair;
    // 单元素布尔 flag
    if (pair.length === 1) {
      result.push(flag);
      continue;
    }
    // 值为空则跳过
    if (value === undefined || value === null || value === "") continue;
    // 布尔 true 视为布尔 flag
    if (value === true) {
      result.push(flag);
      continue;
    }
    // 布尔 false 跳过（不传该 flag）
    if (value === false) continue;
    result.push(flag, String(value));
  }
  return result;
}
