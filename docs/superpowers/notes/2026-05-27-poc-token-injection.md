# dws Token 注入 PoC 调研记录

**日期**:2026-05-27
**目的**:为 Plan 2 的 inject-token.mjs 实现选定方案(D1 加密文件 / D2 子命令 / D3 fork) + 为 Plan 1 Task 10 errors.mjs 提供 PAT 错误格式实测 fixture
**dws 版本**:`v1.0.32` (b86ff7e2, 2026-05-25)

---

## 状态

⏳ **未完成** — 需要在装有 dws 且能登录钉钉的机器上跑下面 7 个步骤,并把结果填回本文档。

填完后:
1. `git add docs/superpowers/notes/2026-05-27-poc-token-injection.md`
2. 把 "PAT 错误格式实测" 段贴到的实测 stderr 替换 `packages/shared/__tests__/errors.test.mjs` 顶部 `stderrJSON` 常量
3. `git commit -m "docs(qdm): PoC 调研记录 (D2/D1 + PAT 实测) + errors fixture 替换"`
4. 通知 Claude 继续 Task 4 / 13-18

---

## 命令清单

### Step 1:确认 dws 已装并跑过登录

```bash
dws --version && dws auth status -f json
```

如果没登录:`dws auth login --device`

### Step 2:列 ~/.dws/ 目录结构

```bash
ls -la ~/.dws/ && find ~/.dws -type f | head -30 && file ~/.dws/* 2>/dev/null
```

### Step 3:D2 探索 — 查 dws auth 子命令

```bash
dws auth --help
```

观察输出里是否有 `import` / `restore` / `from-token` / `set-token` 等。如果有任何一个,跑 `dws auth <sub> --help` 记下签名。

### Step 4:D2 兜底查全部 auth 命令树

```bash
dws auth --help 2>&1 | tee /tmp/dws-auth-help.txt
```

### Step 5:D1 探索 — ~/.dws/ 加密文件格式

```bash
ls -la ~/.dws/ > /tmp/dws-files.txt
for f in ~/.dws/*.enc ~/.dws/*.json; do
  [ -f "$f" ] || continue
  printf '%s | size=%s | hexdump head:\n' "$f" "$(wc -c < "$f")"
  xxd "$f" | head -3
  echo
done >> /tmp/dws-files.txt
```

> ⚠️ 手工核对 `/tmp/dws-files.txt` 内容**没有 base64 token 残留**才贴到本文档。

### Step 6:D1 — 抓 dws 源码加密相关路径

```bash
gh api repos/DingTalk-Real-AI/dingtalk-workspace-cli/git/trees/HEAD?recursive=1 \
  --jq '.tree[] | select(.path | test("keychain|auth|crypto|encrypt|dek")) | .path'
```

只列路径,不下载源码内容。

### Step 7:**实测 PAT 错误格式**(决定 Task 10 fixture)

最关键的一步。任选一种触发方式:

**优先**:登录时少勾 scope。

```bash
dws auth logout && dws auth login --device --force
# 授权页只勾 IM 类、不勾 Calendar / Contact
```

登录完成后调一个**没勾**的 scope 命令:

```bash
DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp \
  dws calendar event list -y -f json 2>/tmp/dws-pat-stderr.txt
echo "exit=$?"
```

**兜底**:调一个本人本来就没权限的命令(企业管理类),同样 set `DINGTALK_DWS_AGENTCODE` 后捕获 stderr。

捕获:

```bash
echo "exit=$?"
cat /tmp/dws-pat-stderr.txt
jq . /tmp/dws-pat-stderr.txt 2>&1 | head -40
```

**判定**:
- 是否真是 exit=4?(不是的话记下实际值)
- stderr 是否 valid JSON?(不是 → errors.mjs 要先做文本启发式解析)
- 字段名是否与 spec §4.4 一致?(不一致 → 把 spec §4.4 改成实测样子,errors.mjs 跟着)
- `missing_scopes` 数组里钉钉给的 scope 字符串具体长什么样?(直接抄进 scope-map.json)

如果**没能触发到 PAT 错误**:在下面"PAT 错误格式实测"段**显式记录"未触发到"** + 已尝试的两条路径。errors.mjs 的实现保持现状(防御性 JSON.parse),Task 10 fixture 保留 spec §4.4 占位标注。

---

## 实测结果(待填)

### D2:dws auth 子命令探索

`dws auth --help` 输出节选(来自 `/tmp/dws-auth-help.txt`):

```
(贴 help 输出)
```

子命令 import/restore/from-token 是否存在:✅ / ❌
(若 ✅)签名:`dws auth <sub> --token=<jwt> --refresh-token=<jwt>` 等 — 列出来
(若 ❌)跳到 D1。

### D1:~/.dws/ 文件结构

`ls -la ~/.dws/`(来自 `/tmp/dws-files.txt`):

```
(贴)
```

加密文件 hexdump head:

```
(贴 12-byte IV 候选)
```

dws 源码相关路径:
- `internal/keychain/file_dek.go`
- `internal/auth/store.go`
- ……

### 推荐路径(给 Plan 2)

- 首选:D2 / D1 / D3
- 理由:……
- 风险:……
- 待 Plan 2 第一步验证的细节:……

### PAT 错误格式实测(spec §4.4 验证)

**实测部分完成** — 在沙箱机器上实测了**未认证状态**下的错误形态(用 `DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp dws calendar event list`)。已认证状态下的真 PAT 错误(scope 不足)需要在你本人钉钉账号上跑,目前**未触发**。

#### 已实测:未认证错误(不是 PAT 但同源结构)

**触发方式**:沙箱机器装了 dws v1.0.32 但未登录,直接调一个钉钉命令。

**实际 exit code**:**2**(不是 spec 假设的 4)

**实际 stderr**(valid JSON,嵌套结构):

```json
{
  "error": {
    "actions": ["dws auth login"],
    "category": "auth",
    "code": 2,
    "hint": "运行 'dws auth login' 完成登录后重试",
    "message": "未登录，请先执行 dws auth login",
    "reason": "not_authenticated"
  }
}
```

#### 待实测:PAT scope 不足错误

需要在登录态下触发(`dws auth login --device --force` 时少勾某 scope,然后调那个 scope 的命令),把 stderr 贴回这里。

**强烈推测**(基于上面已实测的同源结构):PAT 错误大概率也是嵌套形态:

```json
{
  "error": {
    "category": "permission",
    "code": <某个值,可能是 4 也可能不是>,
    "reason": "permission_required" | "missing_scope" | ...,
    "message": "...",
    "hint": "...",
    "missing_scopes": ["..."],   // 字段名待确认
    "actions": [...]
  }
}
```

#### 判定(基于已实测部分)

- valid JSON?**✅**
- 字段名匹配 spec §4.4 假设?**❌** — spec 是扁平 `{error: "permission_required", missing_scopes: [...]}`,实测是嵌套 `{error: {category, code, reason, message, hint, actions, ...}}`
- `missing_scopes` 字符串实例:**未拿到**(需登录态触发 PAT)

#### 给 Task 10 的指示

errors.mjs **已**改为防御性双形态适配 (commit `<待补>`):
- `parsePATError` 既识别 spec §4.4 的扁平格式(后向兼容,万一某些 dws 版本是这样),也识别实测的嵌套 `{error: {reason: "permission_required"|"missing_scope", missing_scopes: [...]}}` 格式。
- `isPATExitCode` 改为接受任意非 0 的 exit code,从 `parsePATError` 解出来的内容里看 `category === "permission"` 来判定是否是真 PAT。
- fixture 替换为这份实测的未认证 JSON 作为 sanity 基线;PAT 真触发到时再加一条 fixture。

---

## 频繁用到的 dws 行为备忘

- `DWS_CONFIG_DIR=<path>` 改默认 `~/.dws` → 已确认
- `DWS_DISABLE_KEYCHAIN=1` → 强制走 file-based DEK,容器必备
- `DINGTALK_DWS_AGENTCODE=<id>` → 触发 host-owned PAT 模式,权限错走 stderr JSON。**实测**:exit code 不是固定 4,unauthenticated 是 2,PAT 不足待登录态确认。stderr 是嵌套 `{error: {category, code, reason, message, hint, actions}}` 而非 spec §4.4 的扁平假设。
