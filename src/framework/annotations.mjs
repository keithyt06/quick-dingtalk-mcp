/**
 * MCP Tool Annotations 预设
 *
 * 这些 annotations 告诉 MCP 客户端（Quick/Claude Desktop/Cursor 等）
 * 每个 tool 的读写性质，客户端据此决定是否需要用户确认再执行。
 *
 * 参考：https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */

/**
 * 只读操作 - 客户端可自动执行，无需用户确认
 * 适用：list、get、search、info、check、suggest 等查询类
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * 写操作（增量/可逆）- 客户端需用户确认
 * 适用：send、create、add、reply、forward、upload 等新增类
 */
export const WRITE_ADDITIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * 写操作（破坏性/不可逆）- 客户端需强确认
 * 适用：delete、dismiss、recall、remove、revoke 等删除类
 */
export const WRITE_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * 写操作（幂等/可重试）- 客户端需确认，但重试安全
 * 适用：update、rename、set-admin、done、mute 等修改类
 */
export const WRITE_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
