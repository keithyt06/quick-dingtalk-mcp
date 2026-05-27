# quick-dingtalk-mcp v0.2 — Plan 1: 基础与 Local 端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> *Human readers: the line above is for AI agents — you can skip it. The 18 tasks below are sequential by default; Task 3 (PoC 调研) 和 Task 5 (catalog 生成) 互不依赖，**可并行**。*

**Goal:** 把 v0.1（275 行单文件 stdio）改造成 monorepo + 共享层 + Local 子包；同时调研 Remote 端的 dws token 注入方案（D2/D1）。最终 Local v0.2 暴露 38 个工具（30 个 tier1 + 6 个 v0.1 alias + `dingtalk_discover` / `dingtalk_invoke` 兜底全部 ~159 个），smoke test 通过，README 含 v0.1→v0.2 迁移指引。

**Architecture:** 单 git repo + npm workspaces。`packages/shared` 是单源真理（catalog.json + 派发逻辑），`packages/local` 用 stdio MCP 调用 shared。catalog 由 build-time 脚本从 `dws --help` 递归抽取后 commit 到 git。tier1 + alias + scope-map 全部手写 JSON。

**Tech Stack:** Node.js 20+（用内置 `node --test`，不引入额外测试框架）；`@modelcontextprotocol/sdk`（沿用 v0.1）；纯 ESM `.mjs`（Local 不引入 TypeScript）。

**Spec：** `docs/superpowers/specs/2026-05-27-quick-dingtalk-mcp-remote-design.md`（§1-5、§8 PoC、§13 阶段 1-3）

**Out of scope（推迟到 Plan 2/3）：**
- Remote 容器 server.js / Lambda / CDK
- inject-token.mjs **实现**（Plan 1 只做调研，不写代码）
- 可观测、WAF、scripts/install.sh

---

## File Structure

新建：
- `package.json` ← 改成 npm workspaces 根（旧字段全搬到 `packages/local/package.json`）
- `tsconfig.json` 不建（Plan 1 全 .mjs）
- `packages/shared/package.json`
- `packages/shared/scope-map.json` — 手写
- `packages/shared/tier1.json` — 手写（30 名单 + 6 alias 映射）
- `packages/shared/generate-catalog.mjs` — build 脚本，递归抓 `dws --help`
- `packages/shared/catalog.json` — 上一步生成，commit 到 git
- `packages/shared/scripts/check-dws-version.sh`
- `packages/shared/src/schema.mjs`
- `packages/shared/src/dispatcher.mjs`
- `packages/shared/src/search.mjs`
- `packages/shared/src/annotations.mjs`
- `packages/shared/src/errors.mjs`
- `packages/shared/__tests__/schema.test.mjs`
- `packages/shared/__tests__/dispatcher.test.mjs`
- `packages/shared/__tests__/search.test.mjs`
- `packages/shared/__tests__/errors.test.mjs`
- `packages/local/package.json`
- `docs/superpowers/notes/2026-05-27-poc-token-injection.md` — PoC D2/D1 调研记录（Plan 2 接力）

迁移（用 `git mv` 保留历史）：
- `server.mjs` → `packages/local/server.mjs`（之后改写）
- `scripts/smoke.sh` → `packages/local/scripts/smoke.sh`
- `SETUP.md` → `packages/local/docs/setup.md`
- `VERIFICATION.md` → `packages/local/docs/verification.md`

修改：
- `README.md` — 顶部加 v0.1→v0.2 迁移块；项目结构图替换；Local 配置示例的路径更新

---

## Tasks

### Task 1: monorepo skeleton + 顶层 workspaces

把根 `package.json` 改成 npm workspaces 根，新建 `packages/{shared,local}` 目录。这一步只动配置，不动代码。

**Files:**
- Modify: `package.json`
- Create: `packages/shared/package.json`
- Create: `packages/local/package.json`

- [ ] **Step 1: 备份旧 package.json**

```bash
cp package.json /tmp/qdm-pkg-old.json
```

后面要把 v0.1 的字段（dependencies、bin、scripts）拆到 `packages/local/package.json`。

- [ ] **Step 2: 改写根 `package.json` 为 workspaces 根**

```json
{
  "name": "quick-dingtalk-mcp-monorepo",
  "version": "0.2.0-pre",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build:catalog": "node packages/shared/generate-catalog.mjs",
    "test": "node --test packages/shared/__tests__",
    "smoke": "bash packages/local/scripts/smoke.sh",
    "check:dws": "bash packages/shared/scripts/check-dws-version.sh"
  },
  "license": "MIT",
  "homepage": "https://github.com/keithyt06/quick-dingtalk-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/keithyt06/quick-dingtalk-mcp.git"
  },
  "bugs": { "url": "https://github.com/keithyt06/quick-dingtalk-mcp/issues" }
}
```

注意：`name` 改成 `quick-dingtalk-mcp-monorepo`、`private:true`、`engines` 升到 ≥20（要用 `node --test`）、`bin` / `dependencies` 都搬走。

- [ ] **Step 3: 建 `packages/shared/package.json`**

```json
{
  "name": "@quick-dingtalk-mcp/shared",
  "version": "0.2.0-pre",
  "private": true,
  "type": "module",
  "main": "./src/index.mjs",
  "exports": {
    ".": "./src/index.mjs",
    "./catalog": "./catalog.json",
    "./tier1": "./tier1.json",
    "./scope-map": "./scope-map.json",
    "./schema": "./src/schema.mjs",
    "./dispatcher": "./src/dispatcher.mjs",
    "./search": "./src/search.mjs",
    "./errors": "./src/errors.mjs",
    "./annotations": "./src/annotations.mjs"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 4: 建 `packages/local/package.json`**

```json
{
  "name": "quick-dingtalk-mcp",
  "version": "0.2.0-pre",
  "description": "Lightweight MCP server that wraps the official DingTalk Workspace CLI (dws), exposing user-identity DingTalk messaging to any MCP host.",
  "type": "module",
  "main": "./server.mjs",
  "bin": { "quick-dingtalk-mcp": "./server.mjs" },
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node server.mjs",
    "smoke": "bash scripts/smoke.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@quick-dingtalk-mcp/shared": "*"
  },
  "keywords": ["mcp", "model-context-protocol", "dingtalk", "钉钉", "amazon-q", "claude-desktop", "cursor", "dws"],
  "author": "Keith Yu (@keithyt06)",
  "license": "MIT",
  "homepage": "https://github.com/keithyt06/quick-dingtalk-mcp#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/keithyt06/quick-dingtalk-mcp.git",
    "directory": "packages/local"
  },
  "bugs": { "url": "https://github.com/keithyt06/quick-dingtalk-mcp/issues" }
}
```

- [ ] **Step 5: 跑 `npm install` 让 workspaces 链接生效**

Run: `rm -rf node_modules package-lock.json && npm install`
Expected: 末尾 `added N packages, audited N packages` 无 error；`ls node_modules/@quick-dingtalk-mcp/shared` 应是个 symlink 指向 `../../packages/shared`。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/shared/package.json packages/local/package.json
git commit -m "chore(mono): convert root to npm workspaces; scaffold packages/{shared,local}"
```

---

### Task 2: 把 v0.1 文件迁到 `packages/local/`

用 `git mv` 保留历史。这一步只搬不改，server.mjs 还在跑旧逻辑（Task 12 才改写）。

**Files:**
- Move: `server.mjs` → `packages/local/server.mjs`
- Move: `scripts/smoke.sh` → `packages/local/scripts/smoke.sh`
- Move: `SETUP.md` → `packages/local/docs/setup.md`
- Move: `VERIFICATION.md` → `packages/local/docs/verification.md`

- [ ] **Step 1: 建目标目录**

```bash
mkdir -p packages/local/scripts packages/local/docs
```

- [ ] **Step 2: 用 `git mv` 搬文件**

```bash
git mv server.mjs packages/local/server.mjs
git mv scripts/smoke.sh packages/local/scripts/smoke.sh
rmdir scripts
git mv SETUP.md packages/local/docs/setup.md
git mv VERIFICATION.md packages/local/docs/verification.md
```

- [ ] **Step 3: 改 smoke.sh 里的 `head -40` 行（无需路径变动）**

`packages/local/scripts/smoke.sh` 里现在是 `dws --dry-run` 直接调用，不依赖任何相对路径，**不用改内容**。打开确认后跳到 Step 4。

- [ ] **Step 4: 跑迁移后的 smoke 确认 v0.1 行为没坏**

Run: `bash packages/local/scripts/smoke.sh`
Expected: 7 段输出（send/list/search messages/search chats/search user/list topic replies），每段 dry-run JSON 含 `canonical_path`。**注意**：本地必须先跑过 `dws auth login --device` 才会出 canonical_path；没登录也至少 dws 不报 `command not found` 即可。

- [ ] **Step 5: 试启动 server.mjs（确认依赖路径还能解析到 SDK）**

Run: `timeout 2 node packages/local/server.mjs || true`
Expected: 没有 `Cannot find module` 错；2 秒后 timeout 退出（stdin 没人连，正常）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(mono): move v0.1 files into packages/local/ (no logic change)"
```

---

### Task 3: PoC 调研 — dws token 注入（D2 优先）+ PAT 错误格式实测

> **执行顺序**：与 Task 5（catalog 生成）互不依赖，**可并行**。Task 10（errors.mjs）依赖本 Task 产出的 PAT 实测结果（Step 7）；Task 4（scope-map.json）也用得到。

按 spec §8.2，先探 D2（dws 是否暴露 import/restore/from-token 子命令），其次 D1（逆向 file-DEK 加密格式）。**Plan 1 只做调研，不写实现**。产出 `docs/superpowers/notes/2026-05-27-poc-token-injection.md`，给 Plan 2 接力。**追加 Step 7：实测 PAT 错误格式**——spec §4.4 标注的那份 JSON 是设计假设，错误格式直接决定 Task 10 errors.mjs 的实现与 fixture，必须在写测试前先抓一次实物。

**Files:**
- Create: `docs/superpowers/notes/2026-05-27-poc-token-injection.md`

- [ ] **Step 1: 确认 dws 已装并跑过登录**

Run: `dws --version && dws auth status -f json`
Expected: `dws version v1.0.x`；`auth status` 返回 `{"success": true, "authenticated": true, ...}`。
如果没登录：`dws auth login --device` 走完。

- [ ] **Step 2: 列 `~/.dws/` 目录结构**

Run: `ls -la ~/.dws/ && find ~/.dws -type f | head -30 && file ~/.dws/* 2>/dev/null`
Expected: 看到形如 `auth.json` / `oauth-token.enc` / `dek` / `cache/` 等。**记下文件名和文件类型**。

- [ ] **Step 3: D2 探索 — 查 `dws auth` 子命令**

Run: `dws auth --help`
观察输出里是否有 `import` / `restore` / `from-token` / `set-token` 等子命令。如果有任何一个：

```bash
# 例：探 import 子命令
dws auth import --help
```

把发现的子命令、required flag、accepts stdin 与否记到笔记。

- [ ] **Step 4: D2 探索 — 兜底查全部 auth 命令树**

Run: `dws auth --help 2>&1 | tee /tmp/dws-auth-help.txt`
Expected: 把整个 `dws auth` 帮助截图入笔记。如果没有 import/restore/from-token：标 D2 = 无路。

- [ ] **Step 5: D1 探索 — `~/.dws/` 加密文件格式**

Run（**不要打印 stdout 到终端**，可能含 token）：

```bash
ls -la ~/.dws/ > /tmp/dws-files.txt
for f in ~/.dws/*.enc ~/.dws/*.json; do
  [ -f "$f" ] || continue
  printf '%s | size=%s | hexdump head:\n' "$f" "$(wc -c < "$f")"
  xxd "$f" | head -3
  echo
done >> /tmp/dws-files.txt
```

把 `/tmp/dws-files.txt` 内容贴到笔记里（**手工核对没有 base64 token 残留**才贴）。
判断：是否有独立 DEK 文件、是否 magic bytes 看起来像 AES-GCM（前 12 byte 像 IV，末 16 byte 像 tag）。

- [ ] **Step 6: D1 探索 — 抓 dws 源码加密相关路径**

Run:

```bash
gh api repos/DingTalk-Real-AI/dingtalk-workspace-cli/git/trees/HEAD?recursive=1 \
  --jq '.tree[] | select(.path | test("keychain|auth|crypto|encrypt|dek")) | .path'
```

把命中的路径列表（如 `internal/keychain/file_dek.go` / `internal/auth/store.go`）记笔记。
**不下载源码内容**，只先列路径——避免 plan 1 阶段做太多。

- [ ] **Step 7: 实测 PAT 错误格式（决定 Task 10 实现与 fixture）**

Spec §4.4 给出的 PAT JSON（`{"error":"permission_required","missing_scopes":[...]}`）是**设计假设**，必须在写 Task 10 之前实测一次。

**触发方式**（任选一种能确实造成 scope 不足的方法）：

1. **优先**：登录时少勾 scope。`dws auth logout && dws auth login --device --force`，授权页只勾 IM 类、不勾 Calendar / Contact，登录完成后调一个**没勾**的 scope 命令：
   ```bash
   DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp \
     dws calendar event list -y -f json 2>/tmp/dws-pat-stderr.txt
   echo "exit=$?"
   ```
2. **兜底**：调一个本人本来就没权限的命令（如某些企业管理类 API），同样 set `DINGTALK_DWS_AGENTCODE` 后捕获 stderr。

**捕获以下信息**（贴进 Step 8 笔记的"PAT 错误格式实测"段）：

```bash
# exit code
echo "exit=$?"

# stderr 完整内容（手工核对没有 token 残留再贴）
cat /tmp/dws-pat-stderr.txt

# 是否 JSON、字段名是否含 error / missing_scopes / hint / authorize_url
jq . /tmp/dws-pat-stderr.txt 2>&1 | head -40
```

**判定**：
- 是否真是 exit=4？（不是的话记下实际值）
- stderr 是否 valid JSON？（不是 → errors.mjs 要先做文本-to-JSON 启发式解析）
- 字段名是否与 spec §4.4 一致？（不一致 → 把 spec §4.4 改成实测样子，errors.mjs 跟着）
- `missing_scopes` 数组里钉钉给的 scope 字符串具体长什么样？（如 `Cust.Message.Send` / `qyapi_chat_send` 等 — 直接抄进 Task 4 的 scope-map.json）

如果**没能触发到 PAT 错误**（如 dws 直接报"未登录"），在笔记里**显式记录 "未触发到"** + 已尝试的两条路径，并把 errors.mjs 的实现+fixture 改为"防御性解析任意非零 exit 的 stderr，先尝试 JSON.parse、失败则原样透传"——避免基于未验证的 JSON 形态写死代码。

- [ ] **Step 8: 写调研记录**

新建 `docs/superpowers/notes/2026-05-27-poc-token-injection.md`，按下面模板填：

````markdown
# dws Token 注入 PoC 调研记录

**日期**：2026-05-27
**目的**：为 Plan 2 的 inject-token.mjs 实现选定方案（D1 加密文件 / D2 子命令 / D3 fork）
**dws 版本**：v1.0.x（运行 `dws --version` 实际值填进来）

## D2：dws auth 子命令探索

`dws auth --help` 输出节选（来自 `/tmp/dws-auth-help.txt`）：
```
（贴 help 输出）
```

子命令 import/restore/from-token 是否存在：✅ / ❌
（若 ✅）签名：`dws auth <sub> --token=<jwt> --refresh-token=<jwt>` 等 — 列出来
（若 ❌）跳到 D1。

## D1：~/.dws/ 文件结构

`ls -la ~/.dws/`（来自 `/tmp/dws-files.txt`）：
```
（贴）
```

加密文件 hexdump head：
```
（贴 12-byte IV 候选）
```

dws 源码相关路径：
- `internal/keychain/file_dek.go`
- `internal/auth/store.go`
- ……

## 推荐路径（给 Plan 2）

- 首选：D2 / D1 / D3
- 理由：……
- 风险：……
- 待 Plan 2 第一步验证的细节：……

## PAT 错误格式实测（spec §4.4 验证）

**触发方式**：（少勾 scope 登录 / 调无权限命令 / 未触发——任选一种实际发生的）

**实际 exit code**：`?`

**实际 stderr**（手工核对无 token 残留后贴）：
```
（贴）
```

**判定**：
- valid JSON？✅ / ❌（若 ❌，errors.mjs 走文本启发式解析）
- 字段名匹配 spec §4.4 假设？✅ / 部分 / ❌（若不匹配，列实际字段名）
- `missing_scopes` 字符串实例：`...`（直接抄进 scope-map.json）

**给 Task 10 的指示**：fixture 直接用本节贴的实测 stderr，不再用 spec §4.4 的假设 JSON。

## 频繁用到的 dws 行为备忘

- `DWS_CONFIG_DIR=<path>` 改默认 `~/.dws` → 已确认
- `DWS_DISABLE_KEYCHAIN=1` → 强制走 file-based DEK，容器必备
- `DINGTALK_DWS_AGENTCODE=<id>` → 触发 host-owned PAT 模式，权限错走 stderr JSON + exit=4（**待 Step 7 实测确认**）
````

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/notes/2026-05-27-poc-token-injection.md
git commit -m "docs(qdm): PoC 调研记录 — dws token 注入 D2/D1 + PAT 错误格式实测 (Plan 2 接力)"
```

---

### Task 4: shared — tier1.json + scope-map.json（tier1 手写，scope-map 派生）

> **⚠️ 执行顺序**：本 Task 依赖 Task 5 生成的 `catalog.json` 来校验 30 个 tier1 名是否存在、key 风格是否对齐。**先跑 Task 5 再回来做 Task 4**。Task 5 与 Task 3（PoC）互不依赖，可并行；Task 4 必须在 Task 5 之后。

tier1 是 30 个工具名 + 6 个 v0.1 alias 映射（手写）；scope-map 把每条 catalog 命令路径映到钉钉 OpenAPI scope 名（错误重写要用），由 tier1 + catalog 派生。

**Files:**
- Create: `packages/shared/tier1.json`
- Create: `packages/shared/scope-map.json`

> **写顺序**：tier1.json 先写（Step 1）→ catalog 一致性校验（Step 2）→ 用 tier1 反推 scope-map（Step 3）。scope-map 的 30 个 key 跟 tier1 的 30 个工具名一一对应，tier1 是源、scope-map 派生。

- [ ] **Step 1: 写 `tier1.json`**

`tools` 是 30 个 spec §4.2 选定的工具名（基于 catalog 实测路径，下面是设计期猜测，**Step 2 必须用 catalog.json 校验过**）。`aliases` 是 6 个 v0.1 → catalog 名映射，**直接对照 spec §4.3 的表填**（spec 是 SoT）；plan 不再列一遍以避免双源走偏。

```json
{
  "_version": "1",
  "tools": [
    "dingtalk_chat_message_send",
    "dingtalk_chat_message_list",
    "dingtalk_chat_message_search",
    "dingtalk_chat_message_recall",
    "dingtalk_chat_message_list_topic_replies",
    "dingtalk_chat_message_send_card",
    "dingtalk_chat_message_list_at_me",
    "dingtalk_chat_message_mark_read",
    "dingtalk_contact_user_search",
    "dingtalk_contact_user_get_self",
    "dingtalk_contact_user_get",
    "dingtalk_contact_dept_list",
    "dingtalk_contact_dept_user_list",
    "dingtalk_chat_search",
    "dingtalk_chat_create",
    "dingtalk_chat_member_list",
    "dingtalk_chat_join",
    "dingtalk_calendar_event_list",
    "dingtalk_calendar_event_create",
    "dingtalk_calendar_event_update",
    "dingtalk_calendar_event_attendee_list",
    "dingtalk_drive_file_list",
    "dingtalk_drive_file_create",
    "dingtalk_drive_doc_read",
    "dingtalk_drive_doc_append",
    "dingtalk_todo_list",
    "dingtalk_todo_create",
    "dingtalk_todo_complete",
    "dingtalk_ding_send",
    "dingtalk_ding_list"
  ],
  "aliases": {
    "dingtalk_send_message": "dingtalk_chat_message_send",
    "dingtalk_get_messages": "dingtalk_chat_message_list",
    "dingtalk_search_messages": "dingtalk_chat_message_search",
    "dingtalk_list_chats": "dingtalk_chat_search",
    "dingtalk_search_user": "dingtalk_contact_user_search",
    "dingtalk_get_thread": "dingtalk_chat_message_list_topic_replies"
  },
  "_aliases_source": "spec §4.3 — 6 v0.1→catalog mappings; spec is SoT, do not edit here without updating spec"
}
```

> JSON 没注释，把"对照 spec §4.3"这句备忘塞到 `_aliases_source` 顶层 key 里。Step 2 的 `Object.keys(tier1.aliases).length` 不会算到它（它是顶层 key、不在 `aliases` 对象里）。

- [ ] **Step 2: 长度检查 + catalog 一致性校验（关键）**

```bash
node -e '
const tier1 = require("./packages/shared/tier1.json");
const catalog = require("./packages/shared/catalog.json");
const toToolName = (k) => "dingtalk_" + k.replace(/\./g, "_").replace(/-/g, "_");
const knownTools = new Set(Object.keys(catalog.commands).map(toToolName));

const missing = tier1.tools.filter(t => !knownTools.has(t));
const aliasMissing = Object.values(tier1.aliases).filter(t => !knownTools.has(t));

console.log("tools:", tier1.tools.length, "aliases:", Object.keys(tier1.aliases).length);
if (missing.length) {
  console.error("FAIL — tier1 tool not in catalog:", missing);
  process.exit(1);
}
if (aliasMissing.length) {
  console.error("FAIL — alias target not in catalog:", aliasMissing);
  process.exit(1);
}
console.log("OK — every tier1 tool and alias target resolves to a catalog command.");
'
```

Expected: `tools: 30 aliases: 6` 然后 `OK — every tier1 tool and alias target resolves to a catalog command.`

如果有 `FAIL`：说明设计期假设的命令路径与 dws 实际不符。两条修法择一：
1. **优先**：改 tier1.json 里那条命名以匹配真实 catalog key（多数情况）；
2. 或：发现 dws 命令树跟 spec §4.2 域分布严重不符 → 回 spec §4.2 修，再回来。

**不要靠改 `toToolName` 让测试过**——那是 Task 7 才定的转换函数，spec 里也已经定义。

- [ ] **Step 3: 写 `scope-map.json`（30 个 key 由 tier1.tools 派生，value 全部 `[]`）**

key 由 tier1.json 反推得到（tool name 去掉 `dingtalk_` 前缀、`_` → `.`），不再人工列。value 先全部留 `[]` —— scope 字符串等 Task 3 PoC Step 7 实测拿到钉钉真实 scope 名后回填。

```bash
node -e '
const tier1 = require("./packages/shared/tier1.json");
const fromToolName = (t) => t.replace(/^dingtalk_/, "").replace(/_/g, ".");
// 注意：这里假定 catalog key 里没有 hyphen-segment（如 list-topic-replies）。
// 如果 Task 5 的 catalog 显示有 hyphen，这条反推会错位 —— 改用从 catalog.json 直接查。
const catalog = require("./packages/shared/catalog.json");
const known = new Set(Object.keys(catalog.commands));

const map = {
  _version: "1",
  _note: "scope strings empty until Plan 1 Task 3 PAT PoC fills them with actual DingTalk scope names; keys must match catalog.json exactly",
};
const missingFromCatalog = [];
for (const tool of tier1.tools) {
  let key = fromToolName(tool);
  if (!known.has(key)) {
    // 试试把最后若干段当作 hyphen 拼接
    const parts = key.split(".");
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(0, i).join(".") + "." + parts.slice(i).join("-");
      if (known.has(candidate)) { key = candidate; break; }
    }
  }
  if (!known.has(key)) {
    missingFromCatalog.push({ tool, tried: key });
    continue;
  }
  map[key] = [];
}
if (missingFromCatalog.length) {
  console.error("FAIL — could not derive catalog key for:", missingFromCatalog);
  process.exit(1);
}
require("fs").writeFileSync(
  "packages/shared/scope-map.json",
  JSON.stringify(map, null, 2) + "\n"
);
console.log("OK — scope-map.json written with", Object.keys(map).filter(k => !k.startsWith("_")).length, "keys");
'
```

Expected: `OK — scope-map.json written with 30 keys`

> **关于占位空数组**：当前那份 spec 草案里的 scope 命名（`IM.Message.Send` / `Contact.User.Read` 等）是从飞书侧借来的占位、**不是**钉钉实际的 scope 命名约定。未经 Task 3 PoC 实测前写实值会让 errors.mjs 的 fixture 与 incremental-auth URL 拼接基于错误前提。

- [ ] **Step 4: Commit**

```bash
git add packages/shared/scope-map.json packages/shared/tier1.json
git commit -m "feat(shared): tier1.json (30 tools + 6 v0.1 aliases) + scope-map.json (30 keys, scopes empty pending PAT PoC)"
```

---

### Task 5: shared — generate-catalog.mjs（catalog 生成器）

> **执行顺序**：Task 4 依赖本 Task 产出的 `catalog.json`，**先跑 Task 5 再回 Task 4**。本 Task 与 Task 3（PoC 调研）互不依赖，可并行。

build-time 脚本：递归跑 `dws --help` → `dws <group> --help` → 叶子节点 `--help`，解析每个命令的 path、description、flags（name/type/required/description）。输出 `packages/shared/catalog.json` 含 `_dwsCliVersion` 头。

**Files:**
- Create: `packages/shared/generate-catalog.mjs`

- [ ] **Step 1: 写 generate-catalog.mjs（骨架）**

```javascript
#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const DWS = process.env.DWS_BIN || "dws";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "catalog.json");

async function dws(...args) {
  const { stdout, stderr } = await execFileAsync(DWS, args, {
    timeout: 10_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout || stderr;
}

async function getDwsVersion() {
  const out = await dws("--version");
  const m = out.match(/v(\d+\.\d+\.\d+(?:[\w.-]+)?)/);
  if (!m) throw new Error("can't parse dws version: " + out);
  return m[1];
}

// Cobra --help 输出结构（实测）：
//   Usage:
//     dws [command]
//   Available Commands:
//     chat        Manage chat ...
//     contact     ...
//     ...
//   Flags:
//     -h, --help   help for dws
function parseSubcommands(helpText) {
  const lines = helpText.split("\n");
  const start = lines.findIndex(l => /^Available Commands:/i.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    if (/^[A-Z]/.test(line)) break; // hit next section
    const m = line.match(/^\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const name = m[1];
    if (name === "help" || name === "completion") continue;
    out.push({ name, description: m[2].trim() });
  }
  return out;
}

// Flags: section parser
//       --foo string   description (default "x")
//   -y, --yes          description
function parseFlags(helpText) {
  const lines = helpText.split("\n");
  const start = lines.findIndex(l => /^Flags:/i.test(l));
  if (start < 0) return [];
  const flags = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    if (/^[A-Z]/.test(line)) break;
    // example: "      --topic-id string   xxx"
    const m = line.match(/^\s*(-(\w),\s*)?--([\w-]+)(?:\s+(\w+))?\s+(.+?)(?:\s+\(default .*\))?$/);
    if (!m) continue;
    const [, , short, name, type, desc] = m;
    if (name === "help") continue;
    flags.push({
      name,
      short: short || null,
      type: type || "bool",
      description: desc.trim(),
      required: /\brequired\b/i.test(desc),
    });
  }
  return flags;
}

// 递归 walk
async function walk(path) {
  const help = await dws(...path, "--help");
  const subs = parseSubcommands(help);
  if (subs.length === 0) {
    // leaf node
    return [{
      path,
      description: extractDescription(help),
      flags: parseFlags(help),
    }];
  }
  const out = [];
  for (const sub of subs) {
    const children = await walk([...path, sub.name]);
    out.push(...children);
  }
  return out;
}

function extractDescription(helpText) {
  // 第一段是命令的 long description
  const lines = helpText.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t && !/^Usage:/i.test(t)) return t;
  }
  return "";
}

function canonicalPath(pathArr) {
  return pathArr.join(".");
}

async function main() {
  const version = await getDwsVersion();
  console.error(`Generating catalog for dws ${version}...`);
  const top = await dws("--help");
  const groups = parseSubcommands(top);
  const commands = {};
  for (const g of groups) {
    console.error(`  ${g.name} ...`);
    const leaves = await walk([g.name]);
    for (const leaf of leaves) {
      commands[canonicalPath(leaf.path)] = leaf;
    }
  }
  const out = {
    _dwsCliVersion: version,
    _scopeMapVersion: "1",
    _generatedAt: new Date().toISOString(),
    commands,
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.error(`Wrote ${Object.keys(commands).length} commands → ${OUT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 试跑（产出文件先丢 /tmp 看格式）**

```bash
DWS_BIN=$(which dws) node packages/shared/generate-catalog.mjs
```
Expected: 控制台逐个 group 打名（`chat ...`、`contact ...` 等）；末尾 `Wrote N commands → packages/shared/catalog.json`。N 应该在 100-200 之间（spec 提到 ~159）。

- [ ] **Step 3: 抽查 catalog.json 形态**

Run:

```bash
jq '. | {version: ._dwsCliVersion, count: (.commands | length), sample: .commands["chat.message.send"]}' packages/shared/catalog.json
```
Expected:

```json
{
  "version": "1.0.x",
  "count": 159,  // 大致
  "sample": {
    "path": ["chat", "message", "send"],
    "description": "Send a message ...",
    "flags": [
      { "name": "group", "type": "string", ... },
      { "name": "user", "type": "string", ... },
      ...
    ]
  }
}
```

如果 `flags` 数组空了或 description 是空字符串，回 `parseFlags` / `extractDescription` 调正则。

- [ ] **Step 4: Commit catalog 进 git（spec §4.1 明确要 commit）**

```bash
git add packages/shared/generate-catalog.mjs packages/shared/catalog.json
git commit -m "feat(shared): catalog generator + initial catalog.json (~159 cmds, dws v1.0.x)"
```

---

### Task 6: shared — check-dws-version.sh

CI 脚本：对比 `packages/shared/catalog.json` 的 `_dwsCliVersion` 和当前环境 `dws --version` 输出。不匹配就 exit 1。

**Files:**
- Create: `packages/shared/scripts/check-dws-version.sh`

- [ ] **Step 1: 写脚本**

```bash
#!/usr/bin/env bash
# Verifies catalog.json was generated with the same dws version that's currently installed.
# CI runs this — mismatch fails the build, forcing the dev to run `npm run build:catalog`
# and commit the diff.
set -euo pipefail

CATALOG="$(dirname "$0")/../catalog.json"

if ! command -v dws >/dev/null 2>&1; then
  echo "FAIL: dws not in PATH" >&2
  exit 1
fi

CATALOG_VER=$(jq -r '._dwsCliVersion' "$CATALOG")
RUNTIME_VER=$(dws --version | sed -nE 's/.*v([0-9.]+).*/\1/p' | head -1)

if [ "$CATALOG_VER" != "$RUNTIME_VER" ]; then
  cat >&2 <<EOF
FAIL: dws version mismatch
  catalog.json: $CATALOG_VER
  installed:    $RUNTIME_VER

To fix:
  1) make sure you have the dws version that catalog.json was generated against:
       npm install -g dingtalk-workspace-cli@$CATALOG_VER
  2) OR regenerate catalog:
       npm run build:catalog
       git add packages/shared/catalog.json
       git commit -m "chore: refresh catalog for dws \$RUNTIME_VER"
EOF
  exit 1
fi

echo "OK: dws $RUNTIME_VER matches catalog"
```

- [ ] **Step 2: chmod + 试跑**

```bash
chmod +x packages/shared/scripts/check-dws-version.sh
bash packages/shared/scripts/check-dws-version.sh
```
Expected: `OK: dws 1.0.x matches catalog`

- [ ] **Step 3: 验证负向 — 故意改 catalog 版本看脚本失败**

```bash
jq '._dwsCliVersion = "999.0.0"' packages/shared/catalog.json > /tmp/c.json && mv /tmp/c.json packages/shared/catalog.json
bash packages/shared/scripts/check-dws-version.sh; echo "exit=$?"
```
Expected: 输出 mismatch + 修复提示，`exit=1`

- [ ] **Step 4: 还原 catalog**

```bash
node packages/shared/generate-catalog.mjs
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/scripts/check-dws-version.sh
git commit -m "chore(shared): add check-dws-version.sh (CI guard against catalog/cli drift)"
```

---

### Task 7: shared — schema.mjs (with TDD)

把 catalog 的一条 command 转成 MCP `inputSchema`：dws flag 名 → JSON Schema property（kebab-case → snake_case，`group` → `chat_id` 之类的语义重命名）。tool name 派生：`dingtalk_<path_with_underscores>`。

**Files:**
- Create: `packages/shared/__tests__/schema.test.mjs`
- Create: `packages/shared/src/schema.mjs`

- [ ] **Step 1: 写失败测试**

```javascript
// packages/shared/__tests__/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toToolName, buildInputSchema, normalizeFlagName } from "../src/schema.mjs";

test("toToolName: chat.message.send → dingtalk_chat_message_send", () => {
  assert.equal(toToolName("chat.message.send"), "dingtalk_chat_message_send");
});

test("toToolName: chat.message.list-topic-replies → dingtalk_chat_message_list_topic_replies", () => {
  assert.equal(toToolName("chat.message.list-topic-replies"),
    "dingtalk_chat_message_list_topic_replies");
});

test("normalizeFlagName: --group → chat_id; --user → user_id; default kebab→snake", () => {
  assert.equal(normalizeFlagName("group"), "chat_id");
  assert.equal(normalizeFlagName("user"), "user_id");
  assert.equal(normalizeFlagName("open-dingtalk-id"), "open_dingtalk_id");
  assert.equal(normalizeFlagName("topic-id"), "topic_id");
});

test("buildInputSchema: chat.message.send shape", () => {
  const cmd = {
    path: ["chat", "message", "send"],
    description: "Send a chat message",
    flags: [
      { name: "group", type: "string", description: "group conversation id" },
      { name: "user", type: "string", description: "single-chat user id" },
      { name: "title", type: "string", description: "message title", required: true },
      { name: "text", type: "string", description: "message body", required: true },
      { name: "at-all", type: "bool", description: "@everyone in group" },
    ],
  };
  const schema = buildInputSchema(cmd);
  assert.equal(schema.type, "object");
  assert.ok(schema.properties.chat_id);
  assert.equal(schema.properties.chat_id.type, "string");
  assert.ok(schema.properties.user_id);
  assert.ok(schema.properties.title);
  assert.ok(schema.properties.text);
  assert.ok(schema.properties.at_all);
  assert.equal(schema.properties.at_all.type, "boolean");
  assert.deepEqual(schema.required.sort(), ["text", "title"]);
});

test("buildInputSchema: skips global cobra flags (-y, --dry-run, --help, -f)", () => {
  const cmd = {
    path: ["chat", "search"],
    description: "search chats",
    flags: [
      { name: "query", type: "string", required: true },
      { name: "yes", short: "y", type: "bool" },           // global
      { name: "dry-run", type: "bool" },                    // global
      { name: "help", type: "bool" },                       // global
      { name: "format", short: "f", type: "string" },       // global
    ],
  };
  const schema = buildInputSchema(cmd);
  assert.deepEqual(Object.keys(schema.properties), ["query"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test packages/shared/__tests__/schema.test.mjs`
Expected: 5 个 test 全 fail（`Cannot find module '../src/schema.mjs'`）。

- [ ] **Step 3: 实现 schema.mjs**

```javascript
// packages/shared/src/schema.mjs

const FLAG_RENAME = {
  "group": "chat_id",
  "user": "user_id",
};

const GLOBAL_FLAGS = new Set([
  "yes", "y",
  "dry-run",
  "help", "h",
  "format", "f",
  "verbose", "v",
  "config",
  "no-color",
  "quiet",
  "jq",
]);

export function toToolName(canonicalPath) {
  return "dingtalk_" + canonicalPath.replace(/\./g, "_").replace(/-/g, "_");
}

export function normalizeFlagName(dwsFlagName) {
  if (FLAG_RENAME[dwsFlagName]) return FLAG_RENAME[dwsFlagName];
  return dwsFlagName.replace(/-/g, "_");
}

function flagToJsonSchema(flag) {
  const map = {
    string: "string",
    int: "number",
    "int64": "number",
    "float64": "number",
    bool: "boolean",
    "stringArray": "array",
    "stringSlice": "array",
  };
  const baseType = map[flag.type] || "string";
  const prop = { type: baseType };
  if (flag.description) prop.description = flag.description;
  if (baseType === "array") {
    prop.items = { type: "string" };
  }
  return prop;
}

export function buildInputSchema(command) {
  const props = {};
  const required = [];
  for (const flag of command.flags || []) {
    if (GLOBAL_FLAGS.has(flag.name)) continue;
    const name = normalizeFlagName(flag.name);
    props[name] = flagToJsonSchema(flag);
    if (flag.required) required.push(name);
  }
  const schema = { type: "object", properties: props };
  if (required.length) schema.required = required;
  return schema;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test packages/shared/__tests__/schema.test.mjs`
Expected: 5 个 test 全 pass，no failures。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/__tests__/schema.test.mjs packages/shared/src/schema.mjs
git commit -m "feat(shared): schema.mjs — toToolName/buildInputSchema/normalizeFlagName + tests"
```

---

### Task 8: shared — dispatcher.mjs (with TDD)

把 MCP tool call 的 args 翻译成 dws 命令行参数（snake_case → kebab-case，`chat_id` → `--group` 反向映射，`-y -f json` 默认追加，bool/string/array 编码）。

**Files:**
- Create: `packages/shared/__tests__/dispatcher.test.mjs`
- Create: `packages/shared/src/dispatcher.mjs`

- [ ] **Step 1: 写失败测试**

```javascript
// packages/shared/__tests__/dispatcher.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCliArgs } from "../src/dispatcher.mjs";

const sendCmd = {
  path: ["chat", "message", "send"],
  flags: [
    { name: "group", type: "string" },
    { name: "user", type: "string" },
    { name: "title", type: "string", required: true },
    { name: "text", type: "string", required: true },
    { name: "at-all", type: "bool" },
    { name: "at-users", type: "string" },
  ],
};

test("toCliArgs: group send", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc_abc",
    title: "T",
    text: "hello",
  });
  assert.deepEqual(args, [
    "chat", "message", "send",
    "-y", "-f", "json",
    "--group", "oc_abc",
    "--title", "T",
    "--text", "hello",
  ]);
});

test("toCliArgs: single-chat send via user_id", () => {
  const args = toCliArgs(sendCmd, {
    user_id: "uid_x",
    title: "T",
    text: "hi",
  });
  assert.deepEqual(args, [
    "chat", "message", "send",
    "-y", "-f", "json",
    "--user", "uid_x",
    "--title", "T",
    "--text", "hi",
  ]);
});

test("toCliArgs: bool true → flag with no value; false → omitted", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc",
    title: "t", text: "x",
    at_all: true,
  });
  assert.ok(args.includes("--at-all"));
  assert.equal(args.indexOf("--at-all"),
    args.length - 1, "bool flag is appended without value");

  const args2 = toCliArgs(sendCmd, {
    chat_id: "oc", title: "t", text: "x", at_all: false,
  });
  assert.ok(!args2.includes("--at-all"));
});

test("toCliArgs: number args stringified", () => {
  const listCmd = {
    path: ["chat", "message", "list"],
    flags: [
      { name: "group", type: "string" },
      { name: "limit", type: "int" },
    ],
  };
  const args = toCliArgs(listCmd, { chat_id: "oc", limit: 50 });
  assert.deepEqual(args, [
    "chat", "message", "list",
    "-y", "-f", "json",
    "--group", "oc",
    "--limit", "50",
  ]);
});

test("toCliArgs: missing required flag throws InputError", () => {
  assert.throws(
    () => toCliArgs(sendCmd, { chat_id: "oc" }), // 缺 title + text
    /InputError/
  );
});

test("toCliArgs: unknown arg key is ignored, not passed", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc", title: "t", text: "x",
    unrelated_field: "junk",
  });
  assert.ok(!args.includes("--unrelated-field"));
  assert.ok(!args.includes("junk"));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test packages/shared/__tests__/dispatcher.test.mjs`
Expected: 全 fail (`Cannot find module`)。

- [ ] **Step 3: 实现 dispatcher.mjs**

```javascript
// packages/shared/src/dispatcher.mjs
import { normalizeFlagName } from "./schema.mjs";

export class InputError extends Error {
  constructor(message) {
    super(`InputError: ${message}`);
    this.name = "InputError";
  }
}

const ARG_TO_FLAG = {
  chat_id: "group",
  user_id: "user",
  open_dingtalk_id: "open-dingtalk-id",
};

function argKeyToFlagName(argKey) {
  if (ARG_TO_FLAG[argKey]) return ARG_TO_FLAG[argKey];
  return argKey.replace(/_/g, "-");
}

export function toCliArgs(command, args = {}) {
  const out = [...command.path, "-y", "-f", "json"];

  // Map flag -> definition for required-check + type-aware encoding
  const flagDef = new Map();
  for (const f of command.flags || []) {
    flagDef.set(f.name, f);
  }

  // missing required check
  for (const f of command.flags || []) {
    if (!f.required) continue;
    const argKey = normalizeFlagName(f.name);
    if (args[argKey] == null || args[argKey] === "") {
      throw new InputError(`missing required arg: ${argKey}`);
    }
  }

  // walk arg keys; only emit those that match a known flag
  for (const [argKey, val] of Object.entries(args)) {
    if (val == null) continue;
    const flagName = argKeyToFlagName(argKey);
    const def = flagDef.get(flagName);
    if (!def) continue; // unknown arg — silently drop

    const cliFlag = `--${flagName}`;
    if (def.type === "bool") {
      if (val === true) out.push(cliFlag);
      // false → omit
    } else if (def.type === "stringArray" || def.type === "stringSlice") {
      const arr = Array.isArray(val) ? val : [val];
      for (const v of arr) {
        out.push(cliFlag, String(v));
      }
    } else {
      out.push(cliFlag, String(val));
    }
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test packages/shared/__tests__/dispatcher.test.mjs`
Expected: 6 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/__tests__/dispatcher.test.mjs packages/shared/src/dispatcher.mjs
git commit -m "feat(shared): dispatcher.mjs — toCliArgs (args → dws cli args) + tests"
```

---

### Task 9: shared — search.mjs (with TDD)

`dingtalk_discover` 的实现：按 query 在 catalog 中关键词搜索 description / path，返回 top N 命中。tier1 工具优先，再补 catalog 其它的。

**Files:**
- Create: `packages/shared/__tests__/search.test.mjs`
- Create: `packages/shared/src/search.mjs`

- [ ] **Step 1: 写失败测试**

```javascript
// packages/shared/__tests__/search.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchCatalog } from "../src/search.mjs";

const fakeCatalog = {
  commands: {
    "chat.message.send": { path: ["chat","message","send"], description: "Send a chat message" },
    "chat.message.list": { path: ["chat","message","list"], description: "List messages" },
    "calendar.event.create": { path: ["calendar","event","create"], description: "Create calendar event" },
    "drive.file.create": { path: ["drive","file","create"], description: "Create drive file" },
  },
};

test("searchCatalog: keyword in description", () => {
  const r = searchCatalog(fakeCatalog, { query: "calendar" });
  assert.equal(r.length, 1);
  assert.equal(r[0].tool_name, "dingtalk_calendar_event_create");
});

test("searchCatalog: keyword matches multiple, sorted by tier1 then path length", () => {
  const r = searchCatalog(fakeCatalog, { query: "create" });
  assert.equal(r.length, 2);
  // both match "create"; tier1 ranking 不在 fixture 里，path-shorter 先
  assert.ok(r.find(x => x.tool_name === "dingtalk_calendar_event_create"));
  assert.ok(r.find(x => x.tool_name === "dingtalk_drive_file_create"));
});

test("searchCatalog: limit caps results", () => {
  const r = searchCatalog(fakeCatalog, { query: "" }, { limit: 2 });
  assert.equal(r.length, 2);
});

test("searchCatalog: empty query returns top-N", () => {
  const r = searchCatalog(fakeCatalog, {}, { limit: 100 });
  assert.equal(r.length, 4);
});

test("searchCatalog: result item shape", () => {
  const r = searchCatalog(fakeCatalog, { query: "send" });
  assert.equal(r[0].tool_name, "dingtalk_chat_message_send");
  assert.ok(r[0].description.includes("Send"));
  assert.deepEqual(r[0].path, ["chat","message","send"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test packages/shared/__tests__/search.test.mjs`
Expected: 全 fail (`Cannot find module`)。

- [ ] **Step 3: 实现 search.mjs**

```javascript
// packages/shared/src/search.mjs
import { toToolName } from "./schema.mjs";

const DEFAULT_LIMIT = 20;

export function searchCatalog(catalog, args = {}, opts = {}) {
  const query = (args.query || "").toLowerCase().trim();
  const limit = opts.limit ?? args.limit ?? DEFAULT_LIMIT;
  const tier1Set = new Set(opts.tier1 || []);

  const all = Object.entries(catalog.commands).map(([key, cmd]) => {
    const tool_name = toToolName(key);
    const haystack = (cmd.description + " " + key).toLowerCase();
    let score = 0;
    if (query) {
      if (haystack.includes(query)) score += 10;
      if (key.toLowerCase().includes(query)) score += 5;
    } else {
      score = 1;
    }
    if (tier1Set.has(tool_name)) score += 3;
    score -= cmd.path.length; // shorter paths preferred (tie-break)
    return {
      tool_name,
      path: cmd.path,
      description: cmd.description,
      _score: score,
    };
  });

  return all
    .filter(x => x._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test packages/shared/__tests__/search.test.mjs`
Expected: 5 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/__tests__/search.test.mjs packages/shared/src/search.mjs
git commit -m "feat(shared): search.mjs — catalog 关键词检索（dingtalk_discover 用） + tests"
```

---

### Task 10: shared — errors.mjs (with TDD)

> **依赖**：Task 3 Step 7 的 PAT 实测笔记。本 Task 的 `stderrJSON` fixture **必须**直接复制粘贴自 `docs/superpowers/notes/2026-05-27-poc-token-injection.md` 的"PAT 错误格式实测"段，而不是用 spec §4.4 的设计假设。如果 Task 3 标记"未触发到"，本 Task 改为只实现 `parsePATError` 防御性解析（任意 stderr 先 `JSON.parse`，失败 → null；不假设字段名）+ `rewritePAT` 在没结构化字段时透传原文，跳过依赖具体 scope 字符串的测试。

dws PAT 错误（exit=4 + stderr JSON）→ MCP 友好错误 message：Local 模式输出 `dws pat chmod` 提示，Remote 模式拼授权 URL（Plan 1 的 `rewritePAT` 接口先支持 mode 参数，URL 由 caller 传入）。

**Files:**
- Create: `packages/shared/__tests__/errors.test.mjs`
- Create: `packages/shared/src/errors.mjs`

- [ ] **Step 1: 写失败测试（fixture 来自 Task 3 实测笔记）**

> 下面 `stderrJSON` 占位用 spec §4.4 的假设格式，**写测试前必须替换**为 Task 3 Step 7 抓到的真实 stderr。fixture 一旦换为实测值，断言用结构性匹配（`assert.match` + 必含字段），不要把具体 scope 字符串硬编码到 `assert.deepEqual` ——scope 命名一旦后续 churn，断言不会跟着崩。

```javascript
// packages/shared/__tests__/errors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { rewritePAT, parsePATError, isPATExitCode } from "../src/errors.mjs";

// ⚠️ FIXTURE：从 docs/superpowers/notes/2026-05-27-poc-token-injection.md "PAT 错误格式实测" 段直接复制。
// 实测填入前下面是 spec §4.4 的占位假设，断言会过但与真实 dws 输出可能不符。
const stderrJSON = `{"error":"permission_required","missing_scopes":["Contact.User.Read","Calendar.Event.Write"],"hint":"原始 dws hint"}`;
const PAT_EXIT = 4; // 实测确认；不是 4 就改

test("isPATExitCode: PAT_EXIT → true; 其它 → false", () => {
  assert.equal(isPATExitCode(PAT_EXIT), true);
  assert.equal(isPATExitCode(0), false);
  assert.equal(isPATExitCode(1), false);
});

test("parsePATError: 结构化 stderr → 至少含 missing_scopes 字段", () => {
  const r = parsePATError(stderrJSON);
  assert.ok(r, "parsed result is not null");
  assert.ok(Array.isArray(r.missing_scopes), "missing_scopes is an array");
  assert.ok(r.missing_scopes.length > 0, "has at least one missing scope");
});

test("parsePATError: 非 JSON → null", () => {
  assert.equal(parsePATError("Error: random text"), null);
});

test("rewritePAT mode=local: 输出 dws pat chmod 提示且含 missing scopes", () => {
  const parsed = parsePATError(stderrJSON);
  const out = rewritePAT(parsed, { mode: "local" });
  assert.match(out.message, /dws pat chmod\s+\S+/, "message contains dws pat chmod cmd");
  for (const s of parsed.missing_scopes) {
    assert.ok(out.message.includes(s), `message contains scope ${s}`);
  }
  assert.deepEqual(out.missing_scopes, parsed.missing_scopes);
});

test("rewritePAT mode=remote: 输出授权 URL，scopes 透传给 builder", () => {
  const parsed = parsePATError(stderrJSON);
  let receivedScopes = null;
  const out = rewritePAT(parsed, {
    mode: "remote",
    authorizeUrlBuilder: (scopes) => {
      receivedScopes = scopes;
      return `https://auth.example.com/authorize?extra_scope=${scopes.join(",")}&t=hmac2`;
    },
  });
  assert.deepEqual(receivedScopes, parsed.missing_scopes,
    "builder receives scopes verbatim, no transformation");
  assert.match(out.authorize_url, /^https:\/\/auth\.example\.com\/authorize\?/);
  assert.match(out.message, /点击授权/);
});

test("rewritePAT: 没 missing_scopes 也别炸", () => {
  const out = rewritePAT({ error: "permission_required" }, { mode: "local" });
  assert.match(out.message, /权限/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test packages/shared/__tests__/errors.test.mjs`
Expected: 全 fail。

- [ ] **Step 3: 实现 errors.mjs**

```javascript
// packages/shared/src/errors.mjs

export function isPATExitCode(code) {
  return code === 4;
}

export function parsePATError(stderr) {
  if (!stderr) return null;
  try {
    const obj = JSON.parse(stderr.trim());
    if (obj && obj.error === "permission_required") return obj;
    return null;
  } catch {
    return null;
  }
}

export function rewritePAT(patObj, { mode, authorizeUrlBuilder } = {}) {
  const scopes = patObj?.missing_scopes || [];
  const scopeList = scopes.length ? scopes.join(" ") : "";

  if (mode === "local") {
    const cmd = scopes.length
      ? `dws pat chmod ${scopes.join(" ")}`
      : `dws pat chmod <scope>`;
    return {
      error: "permission_required",
      missing_scopes: scopes,
      message: `钉钉权限不足。请在终端运行：${cmd}\n完成后重试。`,
    };
  }

  if (mode === "remote") {
    if (typeof authorizeUrlBuilder !== "function") {
      throw new Error("rewritePAT(remote): authorizeUrlBuilder is required");
    }
    const authorize_url = authorizeUrlBuilder(scopes);
    const scopeText = scopeList || "<scope>";
    return {
      error: "permission_required",
      missing_scopes: scopes,
      authorize_url,
      message: `需要新增钉钉权限：${scopeText}\n点击授权后重试：${authorize_url}`,
    };
  }

  throw new Error(`rewritePAT: unknown mode ${mode}`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test packages/shared/__tests__/errors.test.mjs`
Expected: 6 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/shared/__tests__/errors.test.mjs packages/shared/src/errors.mjs
git commit -m "feat(shared): errors.mjs — PAT exit=4 解析 + local/remote 模式重写 + tests"
```

---

### Task 11: shared — annotations.mjs

按 MCP 2025-03-26 spec 给每个工具加 `destructiveHint` / `readOnlyHint`：send/create/recall/update/delete 是 destructive；list/search/get 是 readOnly。规则简单，不写 TDD（Task 12 集成会验）。

**Files:**
- Create: `packages/shared/src/annotations.mjs`

- [ ] **Step 1: 写实现**

```javascript
// packages/shared/src/annotations.mjs

const DESTRUCTIVE_VERBS = ["send", "create", "recall", "update", "delete", "join", "complete", "mark-read", "send-card", "ding"];
const READONLY_VERBS    = ["list", "get", "search", "read", "list-topic-replies", "list-at-me", "get-self", "user-list", "attendee-list", "member-list"];

export function annotationsFor(command) {
  const verb = command.path[command.path.length - 1].toLowerCase();
  if (DESTRUCTIVE_VERBS.some(v => verb === v || verb.startsWith(v + "-"))) {
    return { destructiveHint: true };
  }
  if (READONLY_VERBS.some(v => verb === v || verb.startsWith(v + "-"))) {
    return { readOnlyHint: true };
  }
  return {};
}
```

- [ ] **Step 2: 快速 sanity check**

Run:

```bash
node -e '
import("./packages/shared/src/annotations.mjs").then(({annotationsFor}) => {
  const cases = [
    {path:["chat","message","send"]},
    {path:["chat","message","list"]},
    {path:["chat","message","recall"]},
    {path:["chat","message","search"]},
    {path:["calendar","event","create"]},
  ];
  for (const c of cases) console.log(c.path.join("."), "→", annotationsFor(c));
});
'
```

Expected:
```
chat.message.send → { destructiveHint: true }
chat.message.list → { readOnlyHint: true }
chat.message.recall → { destructiveHint: true }
chat.message.search → { readOnlyHint: true }
calendar.event.create → { destructiveHint: true }
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/annotations.mjs
git commit -m "feat(shared): annotations.mjs — destructiveHint/readOnlyHint per MCP 2025-03-26"
```

---

### Task 12: shared — index.mjs（聚合导出）

让 `import { ... } from "@quick-dingtalk-mcp/shared"` 一行能拿到所有导出。

**Files:**
- Create: `packages/shared/src/index.mjs`

- [ ] **Step 1: 写实现**

```javascript
// packages/shared/src/index.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export { toToolName, normalizeFlagName, buildInputSchema } from "./schema.mjs";
export { toCliArgs, InputError } from "./dispatcher.mjs";
export { searchCatalog } from "./search.mjs";
export { rewritePAT, parsePATError, isPATExitCode } from "./errors.mjs";
export { annotationsFor } from "./annotations.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(join(__dirname, "..", rel), "utf8"));

export const catalog = readJson("catalog.json");
export const tier1 = readJson("tier1.json");
export const scopeMap = readJson("scope-map.json");
```

> **为什么不用 `import ... with {type:"json"}`**：Node 20.x 早期版本要 `--experimental-import-attributes` flag，跨 20/22 兼容性不稳。`fs.readFileSync` 在所有 Node 18+ 都行，启动时一次性同步读，对 stdio MCP server 这种长生命周期进程没有性能影响。

- [ ] **Step 2: 跑全部 shared 测试 + sanity import**

```bash
node --test packages/shared/__tests__/
```
Expected: 4 个测试文件全 pass，summary `# pass N`、`# fail 0`。

```bash
node -e '
import("@quick-dingtalk-mcp/shared").then(m => {
  console.log("exports:", Object.keys(m).sort());
  console.log("catalog cmds:", Object.keys(m.catalog.commands).length);
  console.log("tier1 tools:", m.tier1.tools.length);
});
'
```
Expected: exports 含全部函数 + catalog/tier1/scopeMap；catalog 数 ~159；tier1 30。

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.mjs
git commit -m "feat(shared): src/index.mjs — aggregate exports for downstream consumers"
```

---

### Task 13: local — server.mjs v0.2 改写（catalog-driven + alias）

把 v0.1 的 6 个手写工具替换成 catalog 驱动：30 tier1 + 6 alias + `dingtalk_discover` + `dingtalk_invoke`。tools/list 一次构造 38 项；tools/call 按工具名路由到 dispatcher。同时给子进程注入 `DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp` 让 PAT 错走结构化路径。

**Files:**
- Modify: `packages/local/server.mjs`（整体重写，v0.1 内容备份后丢弃）

- [ ] **Step 1: 备份 v0.1 server.mjs（参考用）**

```bash
cp packages/local/server.mjs /tmp/server-v0.1.mjs
```

- [ ] **Step 2: 重写 `packages/local/server.mjs`**

```javascript
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

const tier1Set = new Set(tier1.tools);
const aliasMap = tier1.aliases; // alias → real tool name

function findCommandByToolName(name) {
  const realName = aliasMap[name] || name;
  for (const [key, cmd] of Object.entries(catalog.commands)) {
    if (toToolName(key) === realName) return { key, cmd, realName };
  }
  return null;
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
    description: "在 dws catalog 中按关键词搜索可用命令；返回 tool_name + 简介。先调这个、再用 dingtalk_invoke 执行。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "关键词，可空（返回 top-N）" },
        limit: { type: "number", description: "返回条数上限，默认 20" },
      },
    },
  });
  tools.push({
    name: "dingtalk_invoke",
    description: "按 dingtalk_discover 给出的 tool_name 调用对应命令。args 是该命令的参数对象（snake_case）。",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string", description: "形如 dingtalk_xxx_yyy 的工具名" },
        args: { type: "object", description: "命令参数；具体 schema 看 discover 返回" },
      },
      required: ["tool_name"],
    },
  });
  return tools;
}

const TOOLS = buildToolList();

const server = new Server(
  { name: "quick-dingtalk-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === "dingtalk_discover") {
      const results = searchCatalog(catalog, args, { tier1: tier1.tools });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
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
```

- [ ] **Step 3: 启动并校验 tools/list**

启动 server，从另一个 shell 走 stdio 协议测一遍。最简办法是写个小辅助脚本：

```bash
# scripts/list-tools-once.sh — 不入 git，只是一次性测
cat > /tmp/list-tools.mjs <<'EOF'
import { spawn } from "node:child_process";

const proc = spawn("node", ["packages/local/server.mjs"]);

const initReq = JSON.stringify({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
}) + "\n";

const listReq = JSON.stringify({
  jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
}) + "\n";

proc.stdin.write(initReq);
proc.stdin.write(listReq);
proc.stdin.end();

let buf = "";
proc.stdout.on("data", d => buf += d);
proc.on("close", () => {
  const lines = buf.trim().split("\n");
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      if (r.id === 2) {
        console.log("tools count:", r.result.tools.length);
        console.log("first 5 names:", r.result.tools.slice(0, 5).map(t => t.name));
        console.log("last 2 names:", r.result.tools.slice(-2).map(t => t.name));
      }
    } catch {}
  }
});
EOF
node /tmp/list-tools.mjs
```

Expected:
```
tools count: 38
first 5 names: [ 'dingtalk_chat_message_send', 'dingtalk_chat_message_list', ... ]
last 2 names: [ 'dingtalk_discover', 'dingtalk_invoke' ]
```

- [ ] **Step 4: tools/call 烟测 — 打 discover**

类似上面写 `tools/call` request 调 `dingtalk_discover` 带 `{query: "calendar"}`。Expected：返回 tool_name 含 `dingtalk_calendar_event_*` 的多条。

直接命令一行：

```bash
cat > /tmp/call-discover.mjs <<'EOF'
import { spawn } from "node:child_process";
const proc = spawn("node", ["packages/local/server.mjs"]);
const reqs = [
  {jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"t",version:"1"}}},
  {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"dingtalk_discover",arguments:{query:"calendar"}}},
];
for (const r of reqs) proc.stdin.write(JSON.stringify(r) + "\n");
proc.stdin.end();
let buf = ""; proc.stdout.on("data", d => buf += d);
proc.on("close", () => {
  for (const line of buf.trim().split("\n")) {
    try { const r = JSON.parse(line); if (r.id === 2) console.log(r.result.content[0].text); } catch {}
  }
});
EOF
node /tmp/call-discover.mjs
```

Expected：JSON 数组含至少一个 `dingtalk_calendar_event_*` 工具。

- [ ] **Step 5: 删 v0.1 备份**

```bash
rm -f /tmp/server-v0.1.mjs /tmp/list-tools.mjs /tmp/call-discover.mjs
```

- [ ] **Step 6: Commit**

```bash
git add packages/local/server.mjs
git commit -m "feat(local): server.mjs v0.2 — catalog-driven tools/list (38) + alias + discover/invoke"
```

---

### Task 14: local — smoke test 通过

`packages/local/scripts/smoke.sh` 沿用 v0.1 的 dws dry-run 测试，确认 6 个 v0.1 命令的 dws 调用形态没坏。Plan 1 范围内不扩展 smoke，只确保现状通过。

**Files:**
- Verify: `packages/local/scripts/smoke.sh`

- [ ] **Step 1: 跑 smoke**

Run: `npm run smoke`
Expected: 7 段 dry-run 输出每段都打 canonical_path（要求 `dws auth status` 已登录；没登录则至少 dws 不报错）。

- [ ] **Step 2: 没问题就什么都不改**

如果有任何一段输出格式变了，对照 spec §13 "回归"标准修。Plan 1 范围内 smoke.sh 内容不动。

- [ ] **Step 3: （无需 commit，本任务无文件修改）**

---

### Task 15: local — docs/setup.md + docs/verification.md 路径更新

迁来的两份文档里有 `~/Downloads/quick-dingtalk-mcp/server.mjs` 老路径，要换成新路径 `~/Downloads/quick-dingtalk-mcp/packages/local/server.mjs` 或 `npx -y quick-dingtalk-mcp`。

**Files:**
- Modify: `packages/local/docs/setup.md`
- Modify: `packages/local/docs/verification.md`

- [ ] **Step 1: 全文替换 setup.md 里的路径**

打开 `packages/local/docs/setup.md`，把所有：
- `~/Downloads/quick-dingtalk-mcp/server.mjs` → `~/Downloads/quick-dingtalk-mcp/packages/local/server.mjs`
- `cd ~/Downloads/quick-dingtalk-mcp` → 保持不变（仓库根还是这里）
- `bash scripts/smoke.sh` → `npm run smoke`（或 `bash packages/local/scripts/smoke.sh`）
- `node server.mjs` → `node packages/local/server.mjs`

加一段 "v0.1 → v0.2 迁移" 块在文首（Step 0 之前）：

````markdown
## v0.1 → v0.2 迁移

如果你是 v0.1 用户、用的是 `args = ["/path/to/quick-dingtalk-mcp/server.mjs"]`，请改为：

```
args = ["/path/to/quick-dingtalk-mcp/packages/local/server.mjs"]
```

或者直接用 npx：

```json
{
  "command": "npx",
  "args": ["-y", "quick-dingtalk-mcp"]
}
```

旧 6 个工具名（`dingtalk_send_message` 等）作为 alias 保留至 v0.3，提示已带 `[deprecated, use ...]` 前缀；新代码请直接用 `dingtalk_chat_message_send` 等 catalog 名字。
````

- [ ] **Step 2: 在 setup.md 工具列表段落改成 38 个**

原 "暴露的 6 个工具" 段落整段替换成：

````markdown
## 暴露的工具（共 38 个）

- **30 个 tier1**：`dingtalk_chat_message_send` / `_list` / `_search` / `_recall` / `_list_topic_replies` / `_send_card` / `_list_at_me` / `_mark_read`、`dingtalk_contact_user_search` / `_get_self` / `_get` 等（覆盖 IM 8、Contact 5、Chat 4、Calendar 4、Drive 4、Todo 3、DING 2）
- **6 个 v0.1 alias**：`dingtalk_send_message` 等（保留向后兼容；建议切换到新名）
- **2 个兜底**：`dingtalk_discover`（关键词搜 catalog）+ `dingtalk_invoke`（执行 discover 找到的命令），覆盖 dws 全部 ~159 个命令
````

- [ ] **Step 3: verification.md 同样替换路径**

```bash
grep -n "server.mjs\|scripts/smoke" packages/local/docs/verification.md
```

如果有命中，按 Step 1 的规则替换。如果没命中，跳过。

- [ ] **Step 4: Commit**

```bash
git add packages/local/docs/setup.md packages/local/docs/verification.md
git commit -m "docs(local): setup.md/verification.md — v0.1→v0.2 迁移块 + 路径/工具列表更新"
```

---

### Task 16: 根 README.md v0.2 更新

顶部加 v0.1→v0.2 醒目迁移块；架构图换成 Local + 共享 + Remote 三层（Remote 标 Plan 2 推出）；工具表格从 6 改 38；Status 段从 v0.1 升级到 v0.2-pre。

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 顶部加迁移横幅**

紧贴第一行 `# quick-dingtalk-mcp` 之下、Tagline 之上插入：

```markdown
> **v0.2 升级提示（v0.1 用户必读）**：项目布局已改为 monorepo（`packages/local/server.mjs`）。v0.1 单文件 server.mjs 已不在仓库根。MCP host 配置里把 `args` 改成 `<repo>/packages/local/server.mjs`，或改用 `npx -y quick-dingtalk-mcp`。详见 [packages/local/docs/setup.md](./packages/local/docs/setup.md#v01--v02-迁移)。
```

- [ ] **Step 2: 替换"Architecture"块**

原 ASCII：

```
You speak              Your MCP host                    quick-dingtalk-mcp                  dws CLI                  DingTalk
...
"在 X 群发消息" ──→ Q Desktop / Claude / Cursor ──→ node server.mjs ──exec──→ dws chat message send ──→ mcp-gw.dingtalk.com
```

改成两栈并列（Local 已发、Remote Plan 2 推出）：

```
                   Local (v0.2 ready)                       Remote (v0.2 Plan 2 — coming)
MCP host ──stdio──→ packages/local/server.mjs              Quick Desktop ──HTTPS──→ AWS AgentCore + Lambda
                       │                                              │
                       │ uses → packages/shared/{catalog,             │ uses same packages/shared
                       │   dispatcher, errors, search}                │
                       ▼                                              ▼
                    dws CLI ──HTTPS──→ DingTalk             container running dws (per-user DWS_CONFIG_DIR)
                                                                       │
                                                                       ▼
                                                              DingTalk
```

- [ ] **Step 3: 替换"Tools (6)"段为"Tools (38)"**

```markdown
### Tools (38)

| Bucket | Count | Examples | Notes |
|---|---|---|---|
| **Tier1** | 30 | `dingtalk_chat_message_send`, `_list`, `_search`, `_recall`, `dingtalk_contact_user_search`, `dingtalk_calendar_event_create`, `dingtalk_drive_file_list`, `dingtalk_ding_send` | hand-picked, exposed by name |
| **v0.1 aliases** | 6 | `dingtalk_send_message` → `dingtalk_chat_message_send` etc. | `[deprecated, use <new>]` in description; will drop in v0.3 |
| **Discovery** | 2 | `dingtalk_discover` (keyword search the full catalog) + `dingtalk_invoke` (run anything from catalog) | covers all ~159 dws commands |

DingTalk requires every message to have a **title** (unlike Feishu). The catalog enforces this in `inputSchema.required`.
```

- [ ] **Step 4: 改"Configuration"中"Arguments"绝对路径 + npx 替代**

把 Quick Desktop / Claude Desktop / Cursor 三段配置示例里的 `<absolute path>/quick-dingtalk-mcp/server.mjs` 改成 `<absolute path>/quick-dingtalk-mcp/packages/local/server.mjs`，并在每段下面加一行 "Or use `npx -y quick-dingtalk-mcp` (no clone needed once published)"。

- [ ] **Step 5: 更新"Status"段**

把 `v0.1 — works, but young` 段整段替换：

```markdown
### Status

**v0.2-pre — under active migration to monorepo + remote.**

- ✅ **Local v0.2 (this release)**: monorepo refactor done; 38 tools (30 tier1 + 6 aliases + discover/invoke); shared catalog covers all ~159 dws commands; smoke test passes; v0.1 user-identity verification still holds.
- 🚧 **Remote v0.2 (next, Plan 2)**: AWS Bedrock AgentCore + per-user OAuth, multi-user shared deployment. PoC for dws token injection in progress (see `docs/superpowers/notes/2026-05-27-poc-token-injection.md`).
- 📅 **Production hardening (Plan 3)**: observability dashboard + 10 alarms + WAF + comprehensive docs.

Roadmap, in priority order:
1. Plan 2: Remote stack (container + 3 Lambdas + 3 CDK stacks + scripts)
2. Plan 3: Production hardening
3. v0.3: drop v0.1 aliases; image / file / interactive card support
```

- [ ] **Step 6: 改"5 步上手"中文段同样**

中文段的命令也要更新：
- `bash scripts/smoke.sh` → `npm run smoke`
- 在第 2 步 clone 之后加一行 `# v0.2: monorepo，依赖通过 workspaces 自动链接，无需子目录 cd`
- "暴露的 6 个工具" 表替换成 38 个（同 Step 3 英文版）

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs(readme): v0.2 — monorepo migration banner + Local/Remote split + 38 tools + v0.2-pre status"
```

---

### Task 17: 回归 — v0.1 用户场景在 v0.2 跑通

按 spec §13 step 11 "v0.1 用户场景在 v0.2 路径下全跑通"。

回归矩阵：

| 场景 | v0.1 调用 | v0.2 行为预期 |
|---|---|---|
| A | `dingtalk_send_message {chat_id, title, text}` | alias → 路由到 `dingtalk_chat_message_send` 同样行为 |
| B | `dingtalk_get_messages {chat_id}` | alias → `dingtalk_chat_message_list` |
| C | `dingtalk_search_messages {keyword}` | alias → `dingtalk_chat_message_search` |
| D | `dingtalk_list_chats {query}` | alias → `dingtalk_chat_search` |
| E | `dingtalk_search_user {query}` | alias → `dingtalk_contact_user_search` |
| F | `dingtalk_get_thread {chat_id, topic_id}` | alias → `dingtalk_chat_message_list_topic_replies` |

**用 dry-run 而非真实发送**避免污染钉钉测试群。

**Files:**
- 不改文件，只跑测试

- [ ] **Step 1: 写一次性回归脚本（不入 git）**

```bash
cat > /tmp/regression.mjs <<'EOF'
import { spawn } from "node:child_process";

const cases = [
  { tool: "dingtalk_send_message",   args: { chat_id: "oc_test", title: "T", text: "hello" } },
  { tool: "dingtalk_get_messages",   args: { chat_id: "oc_test" } },
  { tool: "dingtalk_search_messages",args: { keyword: "周报" } },
  { tool: "dingtalk_list_chats",     args: { query: "项目" } },
  { tool: "dingtalk_search_user",    args: { query: "Keith" } },
  { tool: "dingtalk_get_thread",     args: { chat_id: "oc_test", topic_id: "t1" } },
];

for (const c of cases) {
  process.stdout.write(`-- ${c.tool} ... `);
  await new Promise((resolve) => {
    const proc = spawn("node", ["packages/local/server.mjs"], {
      env: { ...process.env, DWS_BIN: "/tmp/dws-fake.sh" },
    });
    const reqs = [
      {jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"t",version:"1"}}},
      {jsonrpc:"2.0",id:2,method:"tools/call",params:{name:c.tool,arguments:c.args}},
    ];
    for (const r of reqs) proc.stdin.write(JSON.stringify(r) + "\n");
    proc.stdin.end();
    let buf = "";
    proc.stdout.on("data", d => buf += d);
    proc.on("close", (code) => {
      for (const line of buf.trim().split("\n")) {
        try {
          const r = JSON.parse(line);
          if (r.id === 2) {
            const text = r.result?.content?.[0]?.text || "";
            const ok = text.includes("FAKE-DWS-CALLED:");
            console.log(ok ? "PASS" : `FAIL (output: ${text.slice(0, 80)})`);
          }
        } catch {}
      }
      resolve();
    });
  });
}
EOF

# 用 fake dws 替身：吃所有参数、打个固定标记
cat > /tmp/dws-fake.sh <<'EOF'
#!/usr/bin/env bash
echo "FAKE-DWS-CALLED: $*"
EOF
chmod +x /tmp/dws-fake.sh

node /tmp/regression.mjs
```

Expected: 6 段全 PASS，每段 fake dws 收到的命令以 `chat message send` / `chat message list` / `chat message search` / `chat search` / `contact user search` / `chat message list-topic-replies` 开头（不是 v0.1 alias 名）。

- [ ] **Step 2: 清理临时文件**

```bash
rm -f /tmp/regression.mjs /tmp/dws-fake.sh
```

- [ ] **Step 3: （无需 commit）**

---

### Task 18: 收尾 — root .gitignore + 版本号 bump 到 0.2.0

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`、`packages/shared/package.json`、`packages/local/package.json`

- [ ] **Step 1: .gitignore 增项**

打开 `.gitignore`，确认含：

```
node_modules/
*.log
.DS_Store
/tmp-*/
/dist/
/.cache/
```

如果缺，加上。

- [ ] **Step 2: 版本号统一 bump 到 0.2.0**

3 处 `package.json` 的 `version` 从 `0.2.0-pre` 改成 `0.2.0`。

- [ ] **Step 3: lockfile 同步**

Run: `npm install`
Expected: `package-lock.json` 更新；无 error。

- [ ] **Step 4: 全套 sanity**

Run:

```bash
npm run check:dws && npm test && npm run smoke
```

Expected:
- `OK: dws 1.0.x matches catalog`
- shared 测试 `# pass N` `# fail 0`
- smoke 7 段 dry-run 输出全 OK

另外再跑一次 tier1 ↔ catalog 一致性校验（Task 4 Step 2 同款），防止后续 dws 升级让 tier1 命中失效：

```bash
node -e '
const tier1 = require("./packages/shared/tier1.json");
const catalog = require("./packages/shared/catalog.json");
const toToolName = (k) => "dingtalk_" + k.replace(/\./g, "_").replace(/-/g, "_");
const known = new Set(Object.keys(catalog.commands).map(toToolName));
const missing = [
  ...tier1.tools.filter(t => !known.has(t)),
  ...Object.values(tier1.aliases).filter(v => typeof v === "string" && v.startsWith("dingtalk_")).filter(t => !known.has(t)),
];
if (missing.length) { console.error("FAIL —", missing); process.exit(1); }
console.log("OK — tier1/aliases all resolve in catalog");
'
```

Expected: `OK — tier1/aliases all resolve in catalog`

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json packages/shared/package.json packages/local/package.json
git commit -m "chore(release): bump v0.2.0 — Plan 1 done (foundation + Local)"
```

- [ ] **Step 6: tag**

```bash
git tag -a v0.2.0 -m "v0.2.0 — Plan 1 (foundation + Local) complete"
```

不要 `git push --tags`，等 user 确认。

---

## Done criteria for Plan 1

- [x] monorepo（`packages/{shared,local}`）
- [x] catalog.json 有 ~159 命令、commit 进 git
- [x] tier1.json 30 + 6 alias
- [x] shared 5 模块（schema / dispatcher / search / errors / annotations）测试通过
- [x] Local v0.2 server.mjs 暴露 38 工具，smoke pass
- [x] v0.1 用户场景全 alias 路由通过
- [x] README + setup.md + verification.md 含 v0.1→v0.2 迁移指引
- [x] PoC 调研笔记 commit，给 Plan 2 接力
- [x] v0.2.0 tag

---

## 不属本 plan 范围（明确推迟）

- `packages/remote/` 目录及子内容（docker / lambda / infra / scripts）— Plan 2
- `inject-token.mjs` 实现（Plan 1 只调研）— Plan 2
- `config/` 根目录配置（i18n / alarm-thresholds / oauth-scopes）— Plan 2
- 可观测、WAF — Plan 3
- `.claude/skills/bump-dws-version.md` — Plan 3
