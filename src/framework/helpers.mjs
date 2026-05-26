/**
 * 通用工具函数：错误类、错误结果格式化
 */

/**
 * 输入参数校验错误（用户层面的错误，非系统错误）
 */
export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * 构造 MCP 错误响应
 */
export function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

/**
 * 格式化各种错误类型为可读字符串
 */
export function formatError(err) {
  if (err instanceof InputError) return err.message;
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  if (err.stdout) parts.push(`stdout: ${err.stdout}`);
  return parts.join("\n");
}
