# dws Token 注入 PoC 调研记录

**日期**:2026-05-27
**目的**:为 Plan 2 的 inject-token.mjs 实现选定方案(D1 加密文件 / D2 子命令 / D3 fork) + 为 Plan 1 Task 10 errors.mjs 提供 PAT 错误格式实测 fixture
**dws 版本**:`?`(运行 `dws --version` 后填实际值)

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

**触发方式**:(少勾 scope 登录 / 调无权限命令 / 未触发——任选一种实际发生的)

**实际 exit code**:`?`

**实际 stderr**(手工核对无 token 残留后贴):

```
(贴)
```

**判定**:
- valid JSON?✅ / ❌(若 ❌,errors.mjs 走文本启发式解析)
- 字段名匹配 spec §4.4 假设?✅ / 部分 / ❌(若不匹配,列实际字段名)
- `missing_scopes` 字符串实例:`...`(直接抄进 scope-map.json)

**给 Task 10 的指示**:fixture 直接用本节贴的实测 stderr,不再用 spec §4.4 的假设 JSON。

---

## 频繁用到的 dws 行为备忘

- `DWS_CONFIG_DIR=<path>` 改默认 `~/.dws` → 已确认
- `DWS_DISABLE_KEYCHAIN=1` → 强制走 file-based DEK,容器必备
- `DINGTALK_DWS_AGENTCODE=<id>` → 触发 host-owned PAT 模式,权限错走 stderr JSON + exit=4(**待 Step 7 实测确认**)
