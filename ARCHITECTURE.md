# quick-dingtalk-mcp 架构设计文档

> 版本：v0.3 重构方案  
> 更新时间：2026-05-26  
> 状态：待实施

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **模块化** | 按业务领域拆分，新增 tool 只需添加文件，不改框架 |
| **声明式** | 每个 tool 用一个对象定义一切（schema + 命令 + 参数映射 + annotations） |
| **自动发现** | 框架层自动扫描 `src/tools/` 目录，加载注册所有 tool |
| **MCP annotations** | 显式声明读写性质，让 Quick/Claude 等客户端正确判断执行策略 |
| **渐进迁移** | 现有 14 个 tool 迁移到新结构，对外 tool name 完全不变 |

---

## 2. 目录结构

```
quick-dingtalk-mcp/
├── package.json
├── server.mjs                    # 旧入口（迁移完成后删除）
├── src/
│   ├── index.mjs                 # 新入口：启动 MCP server，自动加载所有模块
│   ├── framework/
│   │   ├── registry.mjs          # Tool 注册表：扫描 tools/ 目录，收集所有定义
│   │   ├── runner.mjs            # dws CLI 执行器（封装 execFile，统一超时/buffer/格式）
│   │   ├── annotations.mjs      # 预设 annotation patterns（READ_ONLY / WRITE_* 等）
│   │   └── helpers.mjs          # 通用工具（InputError、errorResult、formatError）
│   └── tools/
│       ├── calendar/
│       │   ├── event.mjs         # 日程：create/update/delete/list/get/suggest
│       │   ├── participant.mjs   # 参与者：add/delete/list
│       │   └── room.mjs         # 会议室：list-groups/search/add/delete
│       ├── chat/
│       │   ├── message.mjs       # 消息：send/reply/forward/recall/search/list-mentions/...
│       │   └── group.mjs        # 群管理：create/dismiss/rename/members/invite-url/...
│       ├── todo/
│       │   └── task.mjs          # 待办：create/list/get/update/delete/done
│       ├── ding/
│       │   └── message.mjs       # DING：send/recall
│       └── contact/
│           └── user.mjs          # 通讯录：search/get/get-self/search-mobile/dept
```

### 后续版本扩展（只需添加目录）

```
│       ├── doc/                  # v0.4 文档
│       ├── drive/                # v0.4 云盘
│       ├── report/              # v0.4 日志
│       ├── oa/                   # v0.5 审批
│       ├── attendance/          # v0.5 考勤
│       ├── mail/                 # v0.5 邮箱
│       ├── aisearch/            # v0.5 AI搜索
│       ├── minutes/             # v0.5 听记
│       └── wiki/                 # v0.5 知识库
```

---

## 3. Tool 声明格式（核心约定）

每个 `.mjs` 文件 `export default` 一个 tool 定义数组：

```javascript
// src/tools/todo/task.mjs
import { READ_ONLY, WRITE_ADDITIVE, WRITE_DESTRUCTIVE, WRITE_IDEMPOTENT } from "../../framework/annotations.mjs";

export default [
  {
    // ---- MCP 协议字段 ----
    name: "dingtalk_list_todos",
    description: "查看当前用户的待办列表。返回作为执行者的待办任务，支持按完成状态筛选和分页。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        page:   { type: "string", description: "页码（默认 1）" },
        size:   { type: "string", description: "每页条数（默认 20，超过 20 自动分页）" },
        status: { type: "string", description: "完成状态筛选：true=已完成, false=未完成" },
      },
    },

    // ---- 框架扩展字段 ----
    command: ["todo", "task", "list"],       // dws 子命令路径
    args(a) {                                // 参数映射函数：入参 → dws CLI flags
      return [
        ["--page", a.page],
        ["--size", a.size],
        ["--status", a.status],
      ];
    },
  },

  {
    name: "dingtalk_delete_todo",
    description: "删除待办任务（不可恢复）。",
    annotations: WRITE_DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "待办任务 ID（必填）" },
      },
      required: ["task_id"],
    },
    command: ["todo", "task", "delete"],
    args(a) {
      return [["--task-id", a.task_id]];
    },
  },
];
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | MCP tool 名称，全局唯一，格式 `dingtalk_<动词>_<名词>` |
| `description` | string | ✅ | 给 LLM 看的功能说明 |
| `annotations` | object | ✅ | MCP annotations（使用预设常量） |
| `inputSchema` | object | ✅ | JSON Schema，定义输入参数 |
| `command` | string[] | ✅ | dws 子命令路径（不含 `dws` 本身） |
| `args` | function | ✅ | `(inputArgs) => [["--flag", value], ...]` 参数映射 |
| `validate` | function | ❌ | 可选自定义校验，抛 `InputError` 表示失败 |

### args 函数约定

- 返回二维数组 `[["--flag", value], ...]`
- 框架自动过滤 `value` 为 `undefined`/`null`/`""` 的项（不传给 dws）
- 布尔 flag 返回 `["--flag-name"]`（单元素数组，无 value）
- 框架自动追加 `-y -f json`

---

## 4. MCP Annotations 预设

```javascript
// src/framework/annotations.mjs

/**
 * 只读操作 - 客户端可自动执行，无需用户确认
 * 适用：list、get、search、info 等查询类
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * 写操作（增量/可逆）- 客户端需用户确认
 * 适用：send、create、add、reply、forward 等新增类
 */
export const WRITE_ADDITIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * 写操作（破坏性/不可逆）- 客户端需强确认
 * 适用：delete、dismiss、recall、remove 等删除类
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
```

### 分类规则速查

| annotation 预设 | 动词模式 | Quick 行为 |
|----------------|---------|-----------|
| `READ_ONLY` | list, get, search, info, check, suggest | 自动执行 |
| `WRITE_ADDITIVE` | send, create, add, reply, forward, upload | 需确认 |
| `WRITE_DESTRUCTIVE` | delete, dismiss, recall, remove, revoke | 强确认 |
| `WRITE_IDEMPOTENT` | update, rename, set, done, mute, move | 需确认（重试安全） |

---

## 5. 框架核心模块设计

### 5.1 registry.mjs — 自动发现与注册

```javascript
// src/framework/registry.mjs
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TOOLS_DIR = resolve(__dirname, "../tools");

/**
 * 扫描 src/tools/ 下所有 .mjs 文件，收集 tool 定义
 * @returns {{ mcpTools: Array, handlers: Map<string, ToolDef> }}
 */
export async function loadAllTools() {
  const mcpTools = [];
  const handlers = new Map();

  const modules = await discoverModules(TOOLS_DIR);
  for (const modulePath of modules) {
    const { default: tools } = await import(modulePath);
    for (const tool of tools) {
      // 注册到 MCP 协议层（只暴露 name/description/inputSchema/annotations）
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

  return { mcpTools, handlers };
}

async function discoverModules(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      results.push(join(entry.parentPath || entry.path, entry.name));
    }
  }
  return results;
}
```

### 5.2 runner.mjs — dws 执行器

```javascript
// src/framework/runner.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = Number(process.env.DWS_TIMEOUT_MS) || 60_000;
const MAX_BUFFER = 5 * 1024 * 1024;

/**
 * 执行一个 tool 定义
 * @param {ToolDef} tool - tool 声明对象
 * @param {object} inputArgs - 用户传入的参数
 * @returns MCP CallToolResult
 */
export async function executeTool(tool, inputArgs) {
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

  const out = stdout.trim() || stderr.trim() || "(empty response)";
  return { content: [{ type: "text", text: out }] };
}

/**
 * 将 args 函数返回的二维数组平铺为一维，过滤空值
 * [["--flag", "value"], ["--bool"]] → ["--flag", "value", "--bool"]
 */
function flattenArgs(pairs) {
  const result = [];
  for (const pair of pairs) {
    if (!pair) continue;
    const [flag, value] = pair;
    if (value === undefined || value === null || value === "") continue;
    result.push(flag);
    if (value !== true && pair.length > 1) {
      result.push(String(value));
    }
  }
  return result;
}
```

### 5.3 helpers.mjs — 错误处理

```javascript
// src/framework/helpers.mjs

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
  }
}

export function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

export function formatError(err) {
  if (err instanceof InputError) return err.message;
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  if (err.stdout) parts.push(`stdout: ${err.stdout}`);
  return parts.join("\n");
}
```

### 5.4 index.mjs — 入口

```javascript
// src/index.mjs
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadAllTools } from "./framework/registry.mjs";
import { executeTool } from "./framework/runner.mjs";
import { errorResult, formatError } from "./framework/helpers.mjs";

const { mcpTools, handlers } = await loadAllTools();

const server = new Server(
  { name: "quick-dingtalk-mcp", version: "0.3.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: mcpTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const tool = handlers.get(name);
  if (!tool) return errorResult(`未知工具: ${name}`);
  try {
    return await executeTool(tool, args);
  } catch (err) {
    return errorResult(formatError(err));
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 6. 新增 Tool 的标准流程

> 新增一个 tool 只需要 **1 个文件、1 个对象**，无需修改框架代码。

### 步骤

1. **确认命令** — 运行 `dws <service> <command> --help` 获取参数
2. **选择文件** — 在 `src/tools/<module>/` 下找到或新建 `.mjs`
3. **添加 tool 对象** — 按声明格式写一个对象，push 到 export default 数组
4. **选择 annotation** — 根据操作类型选预设（READ_ONLY / WRITE_*）
5. **测试** — `dws <command> --dry-run` 验证参数拼装

### 示例：新增 `dingtalk_recall_ding`

```javascript
// 在 src/tools/ding/message.mjs 中追加：
{
  name: "dingtalk_recall_ding",
  description: "撤回已发送的 DING 消息。",
  annotations: WRITE_DESTRUCTIVE,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "DING 消息 openDingId（必填）" },
      robot_code: { type: "string", description: "机器人编码（必填）" },
    },
    required: ["id", "robot_code"],
  },
  command: ["ding", "message", "recall"],
  args(a) {
    return [
      ["--id", a.id],
      ["--robot-code", a.robot_code],
    ];
  },
},
```

完成。不需要改 `index.mjs`、不需要改 `registry.mjs`、不需要注册路由。

---

## 7. 迁移计划

### Phase 1：搭建框架骨架
- 创建 `src/framework/` 四个文件
- 创建 `src/index.mjs` 入口
- 更新 `package.json` 的 `bin` / `main` 指向

### Phase 2：迁移现有 14 个 tools
- 将 `server.mjs` 中已有的 6 个 chat tool 迁移到 `src/tools/chat/message.mjs`
- 将 5 个 calendar tool 迁移到 `src/tools/calendar/event.mjs`
- 将 2 个 todo tool 迁移到 `src/tools/todo/task.mjs`
- 将 1 个 ding tool 迁移到 `src/tools/ding/message.mjs`
- 将 1 个 contact tool 迁移到 `src/tools/contact/user.mjs`
- 验证所有 tool 功能不变

### Phase 3：实现 v0.3 新增 34 个 tools
- 日历补全 9 个
- 待办补全 4 个
- DING 补全 1 个
- IM 增强 20 个

### Phase 4：清理
- 删除旧 `server.mjs`
- 更新 README

---

## 8. 注意事项

### 8.1 args 函数中的布尔参数处理

```javascript
// 布尔 flag（如 --at-all）：值为 true 时传 flag，否则不传
args(a) {
  return [
    ["--group", a.chat_id],
    a.at_all ? ["--at-all"] : null,  // null 会被 flattenArgs 过滤
  ];
}
```

### 8.2 互斥参数校验

使用 `validate` 函数：

```javascript
{
  name: "dingtalk_send_message",
  validate(a) {
    const targets = [a.chat_id, a.user_id, a.open_dingtalk_id].filter(Boolean);
    if (targets.length !== 1) {
      throw new InputError("chat_id / user_id / open_dingtalk_id 必须恰好提供一个");
    }
  },
  // ...
}
```

### 8.3 命名约定

| 项目 | 约定 |
|------|------|
| tool name | `dingtalk_<verb>_<noun>`，下划线分隔，如 `dingtalk_list_events` |
| 文件名 | 按 dws 子命令分组，如 `event.mjs`、`message.mjs`、`group.mjs` |
| inputSchema 属性名 | snake_case，与 dws flag 对应但去掉 `--` 前缀 |
| description | 中文描述 + 关键约束说明 |

### 8.4 权限错误统一处理

框架层（runner.mjs）检测 stderr 中的授权错误，提取 `authorizationUrl` 返回：

```javascript
// runner.mjs 中增加授权错误检测
if (stderr.includes("PAT_MEDIUM_RISK_NO_PERMISSION") || stderr.includes("PAT_HIGH_RISK_NO_PERMISSION")) {
  const urlMatch = stderr.match(/authorizationUrl['":\s]+(https?:\/\/[^\s'"]+)/);
  const hint = urlMatch ? `\n请在浏览器打开授权: ${urlMatch[1]}` : "";
  return errorResult(`需要额外授权${hint}\n\n原始错误: ${stderr}`);
}
```

---

## 9. 参考

- [MCP Tool Annotations 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Tool Annotations as Risk Vocabulary](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
- [Salesforce MCP Best Practices](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/general-best-practices.html)
- dws CLI `--help` 全输出：见 `.kiro/dws-raw-help-output.md`
- 需求文档：见 `.kiro/requirements.md`
