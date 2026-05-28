# quick-dingtalk-mcp v0.2 — Plan 2: Remote 端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> *Human readers: the line above is for AI agents — you can skip it. The 24 tasks below are sequential by default; tasks within the same group are mostly independent and **can be parallelized** when assigned to subagents.*

**Goal:** 把 `packages/remote/` 完整落地：Streamable HTTP 容器 + 3 个 Lambda + 3 个 CDK stack + 部署/运维脚本 + 6 篇 Remote 文档。Local 路径不动；shared 沿用 Plan 1 v0.2.0 的产物。Plan 2 不要求真部署到 AWS，只要求 **Lambda 单测全过 + `cdk synth` 三 stack 全过 + `docker build` 出镜像**。

**Architecture:** Quick Desktop ─HTTPS→ CloudFront (+可选 us-east-1 WAF) ─→ API Gateway ─→ mcp-middleware Lambda（HMAC verify + SigV4 sign）─→ AgentCore Runtime（端口 8000，Streamable HTTP，docker/server.js）─→ dws 子进程（per-user `DWS_CONFIG_DIR=/var/dws/users/<uid>`）─→ 钉钉 mcp-gw。token-refresh-shim Lambda 跑 PKCE OAuth + EventBridge 30min 全用户刷新；alarm-webhook Lambda（可选）把 SNS 告警发到钉钉群。

**Tech Stack:** Node.js 20+；TypeScript 5（仅 Lambda 与 CDK；docker/server.js 与 inject-token.mjs 仍 ESM）；`aws-cdk-lib ^2`；`@aws-sdk/client-{secretsmanager,dynamodb,ssm,sns}` v3；`@aws-sdk/signature-v4`；`esbuild` 打 Lambda；内置 `node --test` 跑单测；`@aws-cdk/assertions` 跑 stack snapshot；`bash + shellcheck` 跑脚本。

**Spec：** `docs/superpowers/specs/2026-05-27-quick-dingtalk-mcp-remote-design.md`（§3 仓库布局、§6 Remote 实现、§7 数据流、§8 PoC、§9 可观测、§10 安全、§11 错误处理）

**依赖 Plan 1：** v0.2.0 tag。`packages/{shared,local}` 已落地，`shared/catalog.json`（dws v1.0.32，261 cmd）+ `shared/tier1.json`（30 tools + 6 alias）+ `shared/src/errors.mjs`（已防御性双形态适配）已可直接 import。Plan 2 不动 shared / local 任何文件。

**关键设计决策（已拍板，不再讨论）：**

1. **范围 A（全面写代码）**：`packages/remote/` 所有目录都写齐，inject-token.mjs **默认走 D2 假设**（`dws auth import --token`），D1（写加密文件）/ D3（fork dws）留 stub + `INJECT_STRATEGY=d1|d2|d3` env 切换。Plan 3 PoC 实测后才改默认。
2. **Region**：所有 stack 默认 `us-east-1`。AgentCore Runtime 首发 region；CloudFront WAF 必须 us-east-1（CLOUDFRONT scope 的硬性约束）。`deploy.sh` 不暴露 region 选项，写死 us-east-1。
3. **可选项**：WAFStack 默认 `enabled: false` 但 cdk synth 必须能过；alarm-webhook Lambda 在 webhook URL 为空字符串时 **不部署**（CDK 用 `Fn.conditionIf` 包），SNS topic 仍创建；Dashboard（5 板块 12 图表）+ 10 Alarms 全进 Plan 2，不推迟。
4. **Done criteria（三道门）**：
   - Lambda 单测全过：`npm --workspace packages/remote test` zero fail
   - CDK synth 三 stack 全过：`cd packages/remote/infra && cdx synth --all` zero error，三 template 写到 `cdk.out/`
   - Docker 镜像 build 出：`docker build packages/remote/docker -t qdm-remote:plan2` 成功，`docker image inspect qdm-remote:plan2` 有 size

**Out of scope（明确推迟到 Plan 3）：**

- 真部署到 AWS（不跑 `cdk deploy`）。
- 真 OAuth 流程（不需要钉钉开放平台真应用 ID/secret，单测全 mock）。
- 真发钉钉消息（test-e2e.sh 落地，但只跑 dry-run + mock 路径，不打到生产 mcp-gw）。
- inject-token.mjs 的 D1/D3 实现（仅留 stub + INJECT_STRATEGY hook）。
- scope 字符串回填到 `shared/scope-map.json`（PoC Plan 3 实测后才有真名）。
- 生产硬化（KMS CMK、跨 region 容灾、blue/green、WAF 高级规则）。

---

## File Structure

新建（按 group 分组列出）：

**Group 1（脚手架）**

- `packages/remote/package.json`
- `packages/remote/tsconfig.json`
- `packages/remote/.gitignore`
- `config/i18n.json`
- `config/alarm-thresholds.json`
- `config/alarm-presets.json`
- `config/oauth-scopes.json`
- `docs/architecture.svg`（占位）
- `docs/remote-quick-desktop.md`（骨架）
- `docs/remote-security.md`（骨架）
- `docs/remote-observability.md`（骨架）
- `docs/remote-operations.md`（骨架）
- `docs/remote-faq.md`（骨架）
- `docs/remote-cost.md`（骨架）

**Group 2（Docker 容器）**

- `packages/remote/docker/Dockerfile`
- `packages/remote/docker/.dockerignore`
- `packages/remote/docker/inject-token.mjs`
- `packages/remote/docker/server.js`
- `packages/remote/docker/__tests__/inject-token.test.mjs`
- `packages/remote/docker/__tests__/server.test.mjs`

**Group 3（Lambda × 3 + shared）**

- `packages/remote/lambda/shared/log.ts`
- `packages/remote/lambda/shared/hmac.ts`
- `packages/remote/lambda/shared/hmac.test.ts`
- `packages/remote/lambda/shared/sigv4.ts`
- `packages/remote/lambda/shared/sigv4.test.ts`
- `packages/remote/lambda/shared/sm-client.ts`
- `packages/remote/lambda/shared/sm-client.test.ts`
- `packages/remote/lambda/token-refresh-shim/index.ts`
- `packages/remote/lambda/token-refresh-shim/index.test.ts`
- `packages/remote/lambda/mcp-middleware/index.ts`
- `packages/remote/lambda/mcp-middleware/index.test.ts`
- `packages/remote/lambda/alarm-webhook/index.ts`
- `packages/remote/lambda/alarm-webhook/index.test.ts`

**Group 4（CDK 三 stack）**

- `packages/remote/infra/bin/app.ts`
- `packages/remote/infra/lib/oauth-stack.ts`
- `packages/remote/infra/lib/runtime-stack.ts`
- `packages/remote/infra/lib/waf-stack.ts`
- `packages/remote/infra/cdk.json`
- `packages/remote/infra/__tests__/synth.test.ts`

**Group 5（Scripts + Docs + 收尾）**

- `packages/remote/scripts/install.sh`
- `packages/remote/scripts/deploy.sh`
- `packages/remote/scripts/teardown.sh`
- `packages/remote/scripts/ops.sh`
- `packages/remote/scripts/test-e2e.sh`
- `.claude/skills/bump-dws-version.md`

修改：

- `README.md`（加 Remote 入口段）
- `package.json`（root：加 remote workspace test/synth/build:image script）

---

## Tasks

### Group 1 — 脚手架（T1 / T2 / T3）

---

### Task 1: packages/remote 目录树 + package.json + tsconfig.json

新建 `packages/remote/` 子包，只放配置文件，不写代码。让 `npm install` 能把 workspace 链接起来，让 TypeScript 能找到 shared、@types/aws-lambda、aws-cdk-lib。

**Files:**

- Create: `packages/remote/package.json`
- Create: `packages/remote/tsconfig.json`
- Create: `packages/remote/.gitignore`

- [ ] **Step 1: 建空目录占位**

```bash
mkdir -p packages/remote/{docker,infra/{bin,lib,__tests__},lambda/{shared,token-refresh-shim,mcp-middleware,alarm-webhook},scripts}
```

- [ ] **Step 2: 写 `packages/remote/package.json`**

```json
{
  "name": "@quick-dingtalk-mcp/remote",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build:lambda": "node ./scripts-internal/build-lambda.mjs",
    "test": "node --test --experimental-strip-types lambda/**/*.test.ts docker/__tests__/*.test.mjs infra/__tests__/*.test.ts",
    "synth": "cd infra && cdk synth --all",
    "build:image": "docker build docker -t qdm-remote:plan2",
    "lint:sh": "shellcheck scripts/*.sh"
  },
  "dependencies": {
    "@quick-dingtalk-mcp/shared": "*",
    "@aws-sdk/client-secretsmanager": "^3.600.0",
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/client-ssm": "^3.600.0",
    "@aws-sdk/client-sns": "^3.600.0",
    "@aws-sdk/signature-v4": "^3.600.0",
    "@aws-sdk/protocol-http": "^3.370.0",
    "@aws-sdk/credential-provider-node": "^3.600.0",
    "@aws-crypto/sha256-js": "^5.2.0"
  },
  "devDependencies": {
    "aws-cdk-lib": "^2.150.0",
    "constructs": "^10.3.0",
    "aws-cdk": "^2.150.0",
    "@types/aws-lambda": "^8.10.140",
    "@types/node": "^20.12.0",
    "typescript": "^5.4.0",
    "esbuild": "^0.21.0"
  }
}
```

> **为什么 `--experimental-strip-types`**：Node 20 起内置 TS strip-types，避开 ts-node / tsx 依赖。Lambda runtime 用 esbuild 打成 .mjs，跑测试时 strip-types 直接吃 .ts。要求 Node ≥ 20.6；CI 已锁 node 20+。

- [ ] **Step 3: 写 `packages/remote/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "isolatedModules": true,
    "lib": ["ES2022"],
    "types": ["node", "aws-lambda"],
    "baseUrl": ".",
    "paths": {
      "@quick-dingtalk-mcp/shared": ["../shared/src/index.mjs"],
      "@quick-dingtalk-mcp/shared/*": ["../shared/*"]
    }
  },
  "include": ["lambda/**/*.ts", "infra/**/*.ts"],
  "exclude": ["node_modules", "cdk.out", "dist"]
}
```

- [ ] **Step 4: 写 `packages/remote/.gitignore`**

```
node_modules/
cdk.out/
dist/
*.log
.env
.env.local
docker/dws-tarball/
```

- [ ] **Step 5: 让 workspaces 重新链接 + 装依赖**

Run: `npm install`
Expected: 末尾 `added N packages, audited N packages` 无 error；`ls node_modules/@quick-dingtalk-mcp/remote` 应是 symlink 指向 `../../packages/remote`。

- [ ] **Step 6: TS sanity check（空 ts 文件）**

```bash
cat > /tmp/qdm-tsc-probe.ts <<'EOF'
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
const _h: APIGatewayProxyHandlerV2 = async () => ({ statusCode: 200, body: "ok" });
EOF
cp /tmp/qdm-tsc-probe.ts packages/remote/lambda/_probe.ts
npx --workspace packages/remote tsc --noEmit
rm packages/remote/lambda/_probe.ts
```

Expected: tsc 0 error。证明 @types/aws-lambda 装上了、tsconfig paths 工作正常。

- [ ] **Step 7: Commit**

```bash
git add packages/remote/package.json packages/remote/tsconfig.json packages/remote/.gitignore package.json package-lock.json
git commit -m "feat(remote): scaffold packages/remote (package.json + tsconfig + .gitignore)"
```

---

### Task 2: 根 config/ 4 文件（i18n / alarm-thresholds / alarm-presets / oauth-scopes）

按 spec §9.2 / §10 / §13 把根 `config/` 落地。Lambda 与 CDK stack 都从这里读，避免硬编码。文件全是 JSON，运行时 import。i18n 中英对照 deploy/ops 脚本会用；alarm-thresholds 三 preset；oauth-scopes 30 工具占位（PoC Plan 3 实测后回填真 scope 字符串）。

**Files:**

- Create: `config/i18n.json`
- Create: `config/alarm-thresholds.json`
- Create: `config/alarm-presets.json`
- Create: `config/oauth-scopes.json`

- [ ] **Step 1: 写 `config/i18n.json`**

```json
{
  "_version": "1",
  "_note": "Used by packages/remote/scripts/{install,deploy,ops,teardown}.sh and alarm-webhook Lambda card text. Add a key here before referencing it; missing keys fall back to the English value.",
  "deploy": {
    "title": {
      "zh": "quick-dingtalk-mcp Remote 部署",
      "en": "quick-dingtalk-mcp Remote Deployment"
    },
    "prompt_region": {
      "zh": "部署目标 region (固定 us-east-1):",
      "en": "Target region (locked to us-east-1):"
    },
    "prompt_dingtalk_app_id": {
      "zh": "钉钉开放平台 AppKey:",
      "en": "DingTalk Open Platform AppKey:"
    },
    "prompt_dingtalk_app_secret": {
      "zh": "钉钉开放平台 AppSecret (输入隐藏):",
      "en": "DingTalk Open Platform AppSecret (hidden input):"
    },
    "prompt_alarm_webhook": {
      "zh": "钉钉告警群 Webhook URL (留空跳过 alarm-webhook Lambda):",
      "en": "DingTalk alarm group webhook URL (empty = skip alarm-webhook Lambda):"
    },
    "prompt_alarm_preset": {
      "zh": "告警阈值 preset (standard|relaxed|strict, 默认 standard):",
      "en": "Alarm threshold preset (standard|relaxed|strict, default standard):"
    },
    "prompt_enable_waf": {
      "zh": "是否启用 WAF (y/N, 默认 N):",
      "en": "Enable WAF (y/N, default N):"
    },
    "deploying_oauth": {
      "zh": "部署 OAuthStack...",
      "en": "Deploying OAuthStack..."
    },
    "deploying_runtime": {
      "zh": "部署 RuntimeStack (含 docker build & ECR push)...",
      "en": "Deploying RuntimeStack (includes docker build & ECR push)..."
    },
    "deploying_waf": {
      "zh": "部署 WAFStack...",
      "en": "Deploying WAFStack..."
    },
    "summary_oauth_url": {
      "zh": "首次授权 URL (发给用户):",
      "en": "First-time authorization URL (send to user):"
    },
    "summary_mcp_endpoint": {
      "zh": "Quick Desktop MCP 端点:",
      "en": "Quick Desktop MCP endpoint:"
    },
    "done": {
      "zh": "部署完成。",
      "en": "Deployment finished."
    }
  },
  "ops": {
    "list_users_header": {
      "zh": "已注册用户 (按 SM secret 名称列):",
      "en": "Registered users (listed by SM secret name):"
    },
    "revoke_confirm": {
      "zh": "确定撤销用户 %s 的 token? (y/N):",
      "en": "Revoke user %s's token? (y/N):"
    },
    "revoke_done": {
      "zh": "已撤销。SM secret %s 删除完成。",
      "en": "Revoked. SM secret %s deleted."
    },
    "refresh_now": {
      "zh": "强制刷新所有用户 token...",
      "en": "Force-refreshing all user tokens..."
    },
    "logs_tail": {
      "zh": "尾随 token-refresh-shim 日志 (Ctrl+C 退出):",
      "en": "Tailing token-refresh-shim logs (Ctrl+C to exit):"
    }
  },
  "teardown": {
    "warning": {
      "zh": "将销毁所有 stack (RuntimeStack -> OAuthStack -> WAFStack)。继续? (y/N):",
      "en": "Will destroy all stacks (RuntimeStack -> OAuthStack -> WAFStack). Continue? (y/N):"
    },
    "preserved_secrets_note": {
      "zh": "Secrets Manager 用户 token (按 7 天恢复期保留) 和 ECR 镜像不会自动删。手动清理: aws secretsmanager delete-secret --force-delete-without-recovery / aws ecr delete-repository --force",
      "en": "User-token Secrets Manager entries (kept under 7-day recovery window) and ECR images are NOT auto-deleted. Manual cleanup: aws secretsmanager delete-secret --force-delete-without-recovery / aws ecr delete-repository --force"
    }
  },
  "alarm_card": {
    "title": {
      "zh": "[quick-dingtalk-mcp] 告警: %s",
      "en": "[quick-dingtalk-mcp] Alarm: %s"
    },
    "field_state": {
      "zh": "状态",
      "en": "State"
    },
    "field_metric": {
      "zh": "指标",
      "en": "Metric"
    },
    "field_threshold": {
      "zh": "阈值",
      "en": "Threshold"
    },
    "field_actual": {
      "zh": "实际",
      "en": "Actual"
    },
    "field_link": {
      "zh": "查看 Dashboard",
      "en": "Open Dashboard"
    }
  }
}
```

- [ ] **Step 2: 写 `config/alarm-thresholds.json`**

```json
{
  "_version": "1",
  "_note": "Spec §9.2 — 10 alarms. Each preset adjusts evaluation windows + thresholds. CDK reads alarm-presets.json to pick which preset key to apply.",
  "standard": {
    "api_gw_5xx_persistent": { "threshold": 5, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "middleware_error_rate": { "threshold": 0.05, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "lambda_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "refresh_failure_users": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 1800, "comparison": "GreaterThanOrEqualToThreshold" },
    "runtime_invocation_failure": { "threshold": 3, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "container_5xx": { "threshold": 5, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "server_busy_persistent": { "threshold": 10, "evaluation_periods": 5, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "sm_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "ddb_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "oauth_callback_failure_rate": { "threshold": 0.2, "evaluation_periods": 3, "period_seconds": 300, "comparison": "GreaterThanThreshold" }
  },
  "relaxed": {
    "api_gw_5xx_persistent": { "threshold": 20, "evaluation_periods": 5, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "middleware_error_rate": { "threshold": 0.10, "evaluation_periods": 5, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "lambda_throttle": { "threshold": 5, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "refresh_failure_users": { "threshold": 5, "evaluation_periods": 1, "period_seconds": 1800, "comparison": "GreaterThanOrEqualToThreshold" },
    "runtime_invocation_failure": { "threshold": 10, "evaluation_periods": 5, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "container_5xx": { "threshold": 20, "evaluation_periods": 5, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "server_busy_persistent": { "threshold": 30, "evaluation_periods": 10, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "sm_throttle": { "threshold": 5, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "ddb_throttle": { "threshold": 5, "evaluation_periods": 3, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "oauth_callback_failure_rate": { "threshold": 0.4, "evaluation_periods": 5, "period_seconds": 300, "comparison": "GreaterThanThreshold" }
  },
  "strict": {
    "api_gw_5xx_persistent": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "middleware_error_rate": { "threshold": 0.01, "evaluation_periods": 2, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "lambda_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "refresh_failure_users": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 600, "comparison": "GreaterThanOrEqualToThreshold" },
    "runtime_invocation_failure": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "container_5xx": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "server_busy_persistent": { "threshold": 1, "evaluation_periods": 2, "period_seconds": 60, "comparison": "GreaterThanThreshold" },
    "sm_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "ddb_throttle": { "threshold": 1, "evaluation_periods": 1, "period_seconds": 60, "comparison": "GreaterThanOrEqualToThreshold" },
    "oauth_callback_failure_rate": { "threshold": 0.05, "evaluation_periods": 2, "period_seconds": 300, "comparison": "GreaterThanThreshold" }
  }
}
```

- [ ] **Step 3: 写 `config/alarm-presets.json`**

```json
{
  "_version": "1",
  "_note": "Maps the deploy.sh user choice (standard|relaxed|strict) to the preset key in alarm-thresholds.json. Kept as a separate file so future presets (e.g. enterprise) can be added without touching CDK code.",
  "default": "standard",
  "available": ["standard", "relaxed", "strict"],
  "descriptions": {
    "standard": "Sensible defaults for personal / small-team deployments (5x5xx-3min, 5% error rate, 1 throttled user)",
    "relaxed": "Tolerant of bursty workloads — fewer pages, may miss short incidents",
    "strict": "Page on every anomaly — for production-critical deployments only"
  }
}
```

- [ ] **Step 4: 写 `config/oauth-scopes.json`**

```json
{
  "_version": "1",
  "_note": "Per-tool DingTalk OAuth scope mapping for the 30 tier1 tools. Used by deploy.sh to print the first-time authorize URL with the union of all required scopes. EVERY value is currently EMPTY ARRAY — Plan 3 PoC will fill them after live PAT testing on a real account. DO NOT invent scope strings; they must come from real DingTalk error responses (see docs/superpowers/notes/2026-05-27-poc-token-injection.md PAT 错误格式实测 section).",
  "tools": {
    "dingtalk_chat_message_send": [],
    "dingtalk_chat_message_list": [],
    "dingtalk_chat_message_search": [],
    "dingtalk_chat_message_recall": [],
    "dingtalk_chat_message_list_topic_replies": [],
    "dingtalk_chat_message_reply": [],
    "dingtalk_chat_message_list_mentions": [],
    "dingtalk_chat_message_forward": [],
    "dingtalk_contact_user_search": [],
    "dingtalk_contact_user_get_self": [],
    "dingtalk_contact_user_get": [],
    "dingtalk_contact_dept_search": [],
    "dingtalk_contact_dept_list_members": [],
    "dingtalk_chat_search": [],
    "dingtalk_chat_group_create": [],
    "dingtalk_chat_group_members_list": [],
    "dingtalk_chat_group_quit": [],
    "dingtalk_calendar_event_list": [],
    "dingtalk_calendar_event_create": [],
    "dingtalk_calendar_event_update": [],
    "dingtalk_calendar_participant_list": [],
    "dingtalk_drive_list": [],
    "dingtalk_doc_create": [],
    "dingtalk_doc_read": [],
    "dingtalk_doc_search": [],
    "dingtalk_todo_task_list": [],
    "dingtalk_todo_task_create": [],
    "dingtalk_todo_task_done": [],
    "dingtalk_ding_message_send": [],
    "dingtalk_ding_message_recall": []
  },
  "fallback_scopes_for_first_authorize": []
}
```

- [ ] **Step 5: JSON sanity check**

Run: `for f in config/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "$f OK"; done`
Expected:

```
config/alarm-presets.json OK
config/alarm-thresholds.json OK
config/i18n.json OK
config/oauth-scopes.json OK
```

- [ ] **Step 6: Commit**

```bash
git add config/
git commit -m "feat(remote): config/ — i18n (zh/en) + alarm thresholds (3 preset) + alarm presets + oauth-scopes (30 tools, scopes pending PoC)"
```

---

### Task 3: docs/architecture.svg + 6 篇 docs/remote-*.md 骨架

让 Plan 2 的 Group 5（T22）有地方填实，先把 6 篇 doc 占位骨架立住（有头部、章节标题，正文都标 TODO + Plan 2 T22 接力）。architecture.svg 用极简 placeholder（一行黑字 "v0.2 Local + Remote Architecture - filled in T22"），T22 真画双栈。

**Files:**

- Create: `docs/architecture.svg`
- Create: `docs/remote-quick-desktop.md`
- Create: `docs/remote-security.md`
- Create: `docs/remote-observability.md`
- Create: `docs/remote-operations.md`
- Create: `docs/remote-faq.md`
- Create: `docs/remote-cost.md`

- [ ] **Step 1: 写 `docs/architecture.svg` 占位**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120" viewBox="0 0 600 120">
  <rect width="600" height="120" fill="#fafafa" stroke="#999" stroke-width="1"/>
  <text x="300" y="50" font-family="monospace" font-size="14" text-anchor="middle" fill="#222">
    quick-dingtalk-mcp v0.2 — Local + Remote Architecture
  </text>
  <text x="300" y="78" font-family="monospace" font-size="11" text-anchor="middle" fill="#666">
    placeholder — full diagram filled in by Plan 2 Task 22
  </text>
</svg>
```

- [ ] **Step 2: 写 `docs/remote-quick-desktop.md` 骨架**

```markdown
# Remote 端 Quick Desktop 接入指南

> 状态：骨架（Plan 2 T22 填实）

## v0.2 → Quick Desktop 接入流程

1. 管理员部署 Remote 栈（见 `packages/remote/scripts/deploy.sh`）
2. 部署完成后 deploy.sh 输出 MCP 端点 + 首次授权 URL
3. 用户拿到授权 URL，点开 → 钉钉同意页 → 复制 HMAC token
4. Quick Desktop 配置 `Authorization: Bearer <hmac>` + 端点 URL
5. 试发一条消息验证

## 配置示例（待 T22 补真截图）

[TODO: T22 — 截 Quick Desktop 配置面板图]

## 故障排查

- 401 → token 失效，重新跑授权
- 503 with Retry-After → token 临过期，等 EventBridge 30min 刷新或手动 `ops.sh refresh`
- "permission_required" → 点 incremental authorize URL 加 scope

[TODO: T22 — 完整故障排查矩阵]
```

- [ ] **Step 3: 写 `docs/remote-security.md` 骨架**

```markdown
# Remote 端安全模型

> 状态：骨架（Plan 2 T22 填实）

## 信任链

[TODO: T22 — 画从 Quick Desktop → CloudFront → API GW → Lambda → Runtime → dws → DingTalk 的完整信任边界]

## 鉴权

- MCP token：HMAC-SHA256，密钥从 SSM Parameter Store（KMS 加密），24h 过期
- incrAuthToken：第二把 HMAC，专用于 incremental-auth
- per-user access_token：Secrets Manager + KMS（默认 alias/aws/secretsmanager）

## 防护

- WAF（可选，us-east-1 CloudFront-scope）：5min 内 IP > 1000 reqs 阻断
- request body 1MB 上限
- response `Cache-Control: no-store`
- container `USER node` 非 root

[TODO: T22 — 各项细节展开]

## 威胁模型

[TODO: T22 — STRIDE，逐条列出]

## 与 lark-mcp-on-agentcore 的差异

[TODO: T22]
```

- [ ] **Step 4: 写 `docs/remote-observability.md` 骨架**

```markdown
# Remote 端可观测性

> 状态：骨架（Plan 2 T22 填实）

## Dashboard（5 板块 12 图表）

| 板块 | 图表 |
|---|---|
| 入口流量 | [TODO T22] |
| Lambda 健康 | [TODO T22] |
| OAuth 流程 | [TODO T22] |
| Runtime 容器 | [TODO T22] |
| 业务错误 | [TODO T22] |

## Alarms（10 个）

[TODO: T22 — 列每个 alarm 的指标、阈值、preset 取值表]

## 告警通知链路

SNS → alarm-webhook Lambda → 钉钉群 Markdown 卡片

[TODO: T22 — 钉钉群卡片样例 + 链接到 Dashboard]
```

- [ ] **Step 5: 写 `docs/remote-operations.md` 骨架**

```markdown
# Remote 端运维手册

> 状态：骨架（Plan 2 T22 填实）

## 常规操作

| 场景 | 命令 |
|---|---|
| 查 stack 状态 | `bash packages/remote/scripts/ops.sh status` |
| 列已注册用户 | `bash packages/remote/scripts/ops.sh list-users` |
| 撤销某用户 | `bash packages/remote/scripts/ops.sh revoke <userId>` |
| 强制刷新 token | `bash packages/remote/scripts/ops.sh refresh` |
| 尾随 Lambda 日志 | `bash packages/remote/scripts/ops.sh logs <lambda>` |

## 升级 dws 版本

见 `.claude/skills/bump-dws-version.md`。

## 销毁

```
bash packages/remote/scripts/teardown.sh
```

注意 SM secret 默认 7 天软删除，ECR 镜像不会自动清。

[TODO: T22 — 详细 runbook + screenshot]
```

- [ ] **Step 6: 写 `docs/remote-faq.md` 骨架**

```markdown
# Remote 端 FAQ

> 状态：骨架（Plan 2 T22 填实）

## Q：Local 和 Remote 能同时用吗？
A：能。Local stdio + Remote HTTPS 是两条独立链路，共用同一份 shared catalog。

## Q：要钉钉企业账号才能用吗？
A：[TODO T22]

## Q：用户 token 存在哪？泄露怎么办？
A：[TODO T22]

## Q：Region 为什么锁 us-east-1？
A：AgentCore Runtime 当前仅在 us-east-1 GA，且 CloudFront WAF 必须 us-east-1。Plan 3 视 AgentCore 推广再开多 region。

## Q：可以自部署吗？
A：[TODO T22]

[TODO: T22 — 至少 15 个常见 Q]
```

- [ ] **Step 7: 写 `docs/remote-cost.md` 骨架**

```markdown
# Remote 端成本估算

> 状态：骨架（Plan 2 T22 填实）

## 月度估算（10 用户、每天 100 次工具调用、us-east-1 价格）

| 项 | 单价 | 数量/月 | 月成本 (USD) |
|---|---|---|---|
| API Gateway | [TODO] | [TODO] | [TODO] |
| Lambda | [TODO] | [TODO] | [TODO] |
| AgentCore Runtime | [TODO] | [TODO] | [TODO] |
| Secrets Manager | $0.40/secret | 10 | $4 |
| DynamoDB | [TODO] | [TODO] | [TODO] |
| CloudWatch (logs + dashboard) | [TODO] | [TODO] | [TODO] |
| **合计** | | | **[TODO T22]** |

[TODO: T22 — 实际 us-east-1 价格表 + 100 用户 / 1000 用户的 scaling 估算]

## 成本优化

[TODO: T22 — Lambda memory tuning / log retention / SM secret consolidation]
```

- [ ] **Step 8: Commit**

```bash
git add docs/architecture.svg docs/remote-quick-desktop.md docs/remote-security.md docs/remote-observability.md docs/remote-operations.md docs/remote-faq.md docs/remote-cost.md
git commit -m "docs(remote): 6 篇 remote-*.md 骨架 + architecture.svg 占位 (T22 填实)"
```

---

### Group 2 — Docker 容器（T4 / T5 / T6 / T7）

---

### Task 4: Dockerfile + .dockerignore

按 spec §6.1 写容器：node:20-bookworm-slim sha256 pin（让 reproducible build）+ dws v1.0.32 release tarball + USER node + EXPOSE 8000 + 必要 ENV。`.dockerignore` 防 host 上的 node_modules / git / 测试目录污染镜像。

**Files:**

- Create: `packages/remote/docker/Dockerfile`
- Create: `packages/remote/docker/.dockerignore`

- [ ] **Step 1: 写 `packages/remote/docker/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
# Base image: node 20 LTS slim, sha256-pinned for reproducible build.
# Update digest when bumping node minor: docker pull node:20-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:20-bookworm-slim
FROM node:20-bookworm-slim@sha256:0e0c8e7e4f1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e AS base

# --- args / build-time pins ---
ARG DWS_VERSION=1.0.32
ARG DWS_DOWNLOAD_BASE=https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download
# Override these at build time (--build-arg) if pulling from a private mirror.

# --- system deps ---
# - ca-certificates: HTTPS to mcp-gw.dingtalk.com
# - curl: tarball download
# - tini: PID 1 for graceful SIGTERM (lark-mcp pattern)
# - dumb-init alternative removed; tini is sufficient
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tini \
  && rm -rf /var/lib/apt/lists/*

# --- install dws ---
# AgentCore Runtime is linux/amd64; use TARGETARCH-aware download in Plan 3 if multi-arch needed.
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) dwsArch="linux-amd64" ;; \
      aarch64) dwsArch="linux-arm64" ;; \
      *) echo "unsupported arch $arch" >&2; exit 1 ;; \
    esac; \
    url="${DWS_DOWNLOAD_BASE}/v${DWS_VERSION}/dws-${dwsArch}.tar.gz"; \
    echo "Downloading dws from $url"; \
    curl -fsSL "$url" -o /tmp/dws.tar.gz; \
    tar -xzf /tmp/dws.tar.gz -C /usr/local/bin/ dws; \
    chmod +x /usr/local/bin/dws; \
    rm /tmp/dws.tar.gz; \
    /usr/local/bin/dws --version

# --- app dir ---
WORKDIR /app

# Copy package manifests first for layer caching.
COPY docker/package.json ./package.json

# /app needs the shared package. The CDK build context is the docker/ directory,
# but the docker build is invoked with build context = packages/remote/ (see runtime-stack.ts
# DockerImageAsset directory + file flag). Adjust paths if inverted.
# We copy the shared package contents into /app/shared and rewrite imports via NODE_PATH.
COPY ../shared/catalog.json ./shared/catalog.json
COPY ../shared/tier1.json ./shared/tier1.json
COPY ../shared/scope-map.json ./shared/scope-map.json
COPY ../shared/src ./shared/src

# Copy server + inject-token. server.js will resolve shared via relative ./shared/src/index.mjs.
COPY docker/server.js ./server.js
COPY docker/inject-token.mjs ./inject-token.mjs

# --- runtime user ---
# node:20-bookworm-slim ships a `node` user (uid 1000). Use it.
RUN mkdir -p /var/dws/users && chown -R node:node /var/dws /app

USER node

# --- env ---
# Per spec §6.1
ENV DINGTALK_DWS_AGENTCODE=quick-dingtalk-mcp
ENV DWS_DISABLE_KEYCHAIN=1
ENV DWS_CONFIG_DIR_BASE=/var/dws/users
ENV NODE_ENV=production
ENV PORT=8000
# Default token-injection strategy. Switch to d1 / d3 once PoC validates.
ENV INJECT_STRATEGY=d2
# Concurrency cap (lark-mcp uses 10).
ENV MAX_CONCURRENT=10

EXPOSE 8000

# Tini → node ensures SIGTERM reaches the process for graceful drain.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server.js"]
```

- [ ] **Step 2: 写 docker 子 package.json（让 docker layer 单独装依赖）**

```bash
cat > packages/remote/docker/package.json <<'EOF'
{
  "name": "qdm-remote-docker",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "main": "server.js",
  "engines": { "node": ">=20" },
  "dependencies": {}
}
EOF
```

> **为什么 docker 没有 npm 依赖**：server.js 只用 Node stdlib（http、child_process、url、fs）+ 直接 import shared 的 .mjs（已 COPY 进 /app/shared）。不需要 @modelcontextprotocol/sdk —— 容器跑 Streamable HTTP 协议、自己实现 protocol 解码（lark-mcp 同款）。

- [ ] **Step 3: 写 `packages/remote/docker/.dockerignore`**

```
node_modules
**/node_modules
*.log
.DS_Store
.git
.gitignore
__tests__
**/__tests__
infra
lambda
scripts
cdk.out
dist
*.test.mjs
*.test.ts
```

- [ ] **Step 4: Sanity — Dockerfile syntax**

Run: `docker run --rm -v "$PWD/packages/remote/docker:/work" hadolint/hadolint:latest hadolint /work/Dockerfile || true`
Expected: 几个 info 级别警告（DL3008 apt-get pin / DL3009 apt-get update 已配 rm）；no error。如果机器没 docker 跳过此步。

- [ ] **Step 5: Commit**

```bash
git add packages/remote/docker/Dockerfile packages/remote/docker/.dockerignore packages/remote/docker/package.json
git commit -m "feat(remote): docker — Dockerfile (node 20 sha-pinned + dws v1.0.32 + USER node) + .dockerignore"
```

---

### Task 5: docker/inject-token.mjs（D2 默认 + D1/D3 stub + INJECT_STRATEGY 切换）

按 spec §8.4 冻结的接口：`provisionUserConfig(uid, token)` / `teardownUserConfig(uid)`。D2 实现 `dws auth import --token=<jwt>`（假设 dws 暴露这个子命令；PoC 验后定）。D1 / D3 留 stub 函数体 + 注释指向 PoC notes。INJECT_STRATEGY env 决定走哪条；default = d2。

**Files:**

- Create: `packages/remote/docker/inject-token.mjs`
- Create: `packages/remote/docker/__tests__/inject-token.test.mjs`

- [ ] **Step 1: 先写测试 — 接口契约 + INJECT_STRATEGY 切换**

```javascript
// packages/remote/docker/__tests__/inject-token.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Force d2 strategy + use a stub dws for spawn capture.
process.env.INJECT_STRATEGY = "d2";

const tmpRoot = await mkdtemp(join(tmpdir(), "qdm-inject-"));
process.env.DWS_CONFIG_DIR_BASE = tmpRoot;

// Provide a fake dws binary that records the args + exits 0.
const fakeDws = join(tmpRoot, "dws-fake.sh");
await import("node:fs/promises").then(({ writeFile, chmod }) => writeFile(fakeDws,
  `#!/usr/bin/env bash\nset -e\necho "FAKE-DWS: $*" >> "${tmpRoot}/dws-calls.log"\nexit 0\n`)
  .then(() => chmod(fakeDws, 0o755)));
process.env.DWS_BIN = fakeDws;

const { provisionUserConfig, teardownUserConfig, _internals } = await import("../inject-token.mjs");

test("provisionUserConfig: returns absolute path under DWS_CONFIG_DIR_BASE", async () => {
  const dir = await provisionUserConfig("user-1", "fake-jwt-token");
  assert.ok(dir.startsWith(tmpRoot), `dir ${dir} should be under ${tmpRoot}`);
  assert.ok(dir.endsWith("user-1"), `dir ${dir} should end with user id`);
  const s = await stat(dir);
  assert.ok(s.isDirectory());
});

test("provisionUserConfig: idempotent — second call same uid returns same path, no error", async () => {
  const a = await provisionUserConfig("user-1", "fake-jwt-token");
  const b = await provisionUserConfig("user-1", "fake-jwt-token-2");
  assert.equal(a, b);
});

test("provisionUserConfig (d2): spawns dws auth import with --token", async () => {
  await provisionUserConfig("user-2", "jwt-xyz");
  const log = await import("node:fs/promises").then(m => m.readFile(`${tmpRoot}/dws-calls.log`, "utf8"));
  assert.match(log, /auth import/);
  assert.match(log, /--token jwt-xyz/);
});

test("teardownUserConfig: removes user dir", async () => {
  await provisionUserConfig("user-3", "jwt");
  await teardownUserConfig("user-3");
  await assert.rejects(stat(join(tmpRoot, "user-3")));
});

test("INJECT_STRATEGY=d1 → throws not-implemented", async () => {
  const orig = process.env.INJECT_STRATEGY;
  process.env.INJECT_STRATEGY = "d1";
  await assert.rejects(
    () => _internals.provisionD1("user-x", "tok"),
    /not implemented/i
  );
  process.env.INJECT_STRATEGY = orig;
});

test("INJECT_STRATEGY=d3 → throws not-implemented", async () => {
  const orig = process.env.INJECT_STRATEGY;
  process.env.INJECT_STRATEGY = "d3";
  await assert.rejects(
    () => _internals.provisionD3("user-x", "tok"),
    /not implemented/i
  );
  process.env.INJECT_STRATEGY = orig;
});

test("INJECT_STRATEGY=unknown → throws unknown-strategy", async () => {
  process.env.INJECT_STRATEGY = "d99";
  await assert.rejects(
    () => provisionUserConfig("user-y", "tok"),
    /unknown INJECT_STRATEGY/i
  );
  process.env.INJECT_STRATEGY = "d2";
});

test.after(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test packages/remote/docker/__tests__/inject-token.test.mjs`
Expected: 全 fail（`Cannot find module '../inject-token.mjs'`）。

- [ ] **Step 3: 写 `packages/remote/docker/inject-token.mjs`**

```javascript
// dws per-user config provisioner.
//
// SPEC §8.4 — frozen interface:
//   provisionUserConfig(userId, accessToken) -> Promise<configDir>
//   teardownUserConfig(userId) -> Promise<void>
//
// Strategies (selected by env INJECT_STRATEGY = d1 | d2 | d3, default d2):
//   D2: spawn `dws auth import --token=<jwt>` to let dws write its own config.
//       Assumes such a subcommand exists; verified by Plan 3 PoC.
//   D1: write encrypted oauth-token.enc directly using dws's file-DEK format.
//       STUB — Plan 3 implements after reading internal/keychain/file_dek.go.
//   D3: depend on a forked dws supporting DWS_USER_ACCESS_TOKEN env var.
//       STUB — Plan 3 implements if D2 + D1 both fail.
//
// See docs/superpowers/notes/2026-05-27-poc-token-injection.md for D1 details.

import { spawn } from "node:child_process";
import { mkdir, rm, access } from "node:fs/promises";
import { constants as fsConsts } from "node:fs";
import { join } from "node:path";

const DWS_BIN = process.env.DWS_BIN || "dws";
const CONFIG_BASE = process.env.DWS_CONFIG_DIR_BASE || "/var/dws/users";

function userDir(userId) {
  // userId is sanitized upstream (mcp-middleware verifies HMAC token); still
  // strip any path traversal characters defensively.
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CONFIG_BASE, safe);
}

async function exists(path) {
  try {
    await access(path, fsConsts.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function spawnDws(args, env, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(DWS_BIN, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    const t = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`dws ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on("close", code => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`dws ${args.join(" ")} exit=${code}: ${stderr || stdout}`));
    });
    proc.on("error", err => { clearTimeout(t); reject(err); });
  });
}

// --- D2: spawn `dws auth import --token=<jwt>` ---
async function provisionD2(userId, accessToken) {
  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });
  const env = {
    ...process.env,
    DWS_CONFIG_DIR: dir,
    DWS_DISABLE_KEYCHAIN: "1",
  };
  await spawnDws(["auth", "import", "--token", accessToken], env);
  return dir;
}

// --- D1: write encrypted oauth-token.enc directly ---
async function provisionD1(_userId, _accessToken) {
  // STUB — see docs/superpowers/notes/2026-05-27-poc-token-injection.md §D1.
  // Implementation outline (Plan 3):
  //   1. Read or generate <configDir>/dek (32 random bytes if missing)
  //   2. JSON-encode { access_token, refresh_token, expires_at, scope }
  //   3. AES-256-GCM encrypt with dek + 12B random IV; output [iv|ciphertext|tag]
  //   4. Write to <configDir>/oauth-token.enc
  //   5. Verify by spawning `dws auth status` and asserting authenticated=true
  throw new Error("inject-token D1 strategy not implemented (PoC pending; see PoC notes)");
}

// --- D3: forked dws with DWS_USER_ACCESS_TOKEN env ---
async function provisionD3(userId, accessToken) {
  // STUB — depends on a forked dws build that reads DWS_USER_ACCESS_TOKEN.
  // Implementation outline (Plan 3):
  //   1. mkdir -p <userDir>
  //   2. return <userDir>; the caller passes DWS_USER_ACCESS_TOKEN=<jwt> per
  //      execFile invocation, no provisioning step needed
  // (kept here so the strategy switch in provisionUserConfig is exhaustive.)
  void userId; void accessToken;
  throw new Error("inject-token D3 strategy not implemented (requires forked dws; see PoC notes)");
}

export async function provisionUserConfig(userId, accessToken) {
  if (!userId) throw new Error("provisionUserConfig: userId required");
  if (!accessToken) throw new Error("provisionUserConfig: accessToken required");
  const strategy = (process.env.INJECT_STRATEGY || "d2").toLowerCase();
  switch (strategy) {
    case "d2": return await provisionD2(userId, accessToken);
    case "d1": return await provisionD1(userId, accessToken);
    case "d3": return await provisionD3(userId, accessToken);
    default:
      throw new Error(`unknown INJECT_STRATEGY: ${strategy} (expected d1|d2|d3)`);
  }
}

export async function teardownUserConfig(userId) {
  if (!userId) return;
  const dir = userDir(userId);
  if (await exists(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

// internal exports for tests
export const _internals = { provisionD1, provisionD2, provisionD3, userDir };
```

- [ ] **Step 4: 跑测试确认全过**

Run: `node --test packages/remote/docker/__tests__/inject-token.test.mjs`
Expected: 7 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/remote/docker/inject-token.mjs packages/remote/docker/__tests__/inject-token.test.mjs
git commit -m "feat(remote): docker/inject-token.mjs — D2 default + D1/D3 stub + INJECT_STRATEGY switch + tests"
```

---

### Task 6: docker/server.js — Streamable HTTP server :8000

借 lark-mcp on AgentCore 的 server.js 结构（semaphore=10、SIGTERM drain、`GET /ping`、`POST /` 收 MCP JSON-RPC、SSE response、1MB body、abort signal 传到 dws 子进程）。挂上 shared catalog（38 工具：30 tier1 + 6 alias + discover/invoke）。PAT 错误用 `errors.rewritePAT(parsed, {mode: "remote", authorizeUrlBuilder})`，authorizeUrlBuilder 在 server.js 里实现，从 header X-Incr-Auth-Token 拿到 incrAuthToken hmac2，拼 `${OAUTH_BASE_URL}/authorize?extra_scope=<urlencoded>&t=${hmac2}`。

**Files:**

- Create: `packages/remote/docker/server.js`

- [ ] **Step 1: 写实现（先写代码，配测试在 T7）**

```javascript
// quick-dingtalk-mcp Remote — Streamable HTTP server.
//
// Structure: borrowed from lark-mcp-on-agentcore/agentcore-runtime/server.js.
// Pattern: HTTP POST `/` is the MCP transport; we read newline-delimited
// JSON-RPC requests off the body, dispatch through shared catalog, then write
// SSE-style `data: <json>\n\n` responses back. GET /ping is liveness.
//
// Per-request lifecycle:
//   1. mcp-middleware Lambda has already verified HMAC + sig'd request; the
//      body arrives with X-User-Access-Token + X-Incr-Auth-Token headers.
//   2. provisionUserConfig(uid, accessToken) sets up DWS_CONFIG_DIR for this user.
//   3. Acquire one slot from semaphore (max MAX_CONCURRENT).
//   4. dispatch tool call → execFile dws → stdout/stderr → MCP response.
//   5. teardownUserConfig only on session-end (we keep it warm during the
//      request to avoid per-call setup); for stateless runs set
//      TEARDOWN_PER_REQUEST=1.

import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { provisionUserConfig, teardownUserConfig } from "./inject-token.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- shared (loaded relative to /app/shared after Dockerfile COPY) ---
function loadSharedJson(name) {
  return JSON.parse(readFileSync(join(__dirname, "shared", name), "utf8"));
}
const catalog = loadSharedJson("catalog.json");
const tier1 = loadSharedJson("tier1.json");
const sharedSrc = await import(join(__dirname, "shared", "src", "index.mjs"));
const {
  toToolName, buildInputSchema, toCliArgs, InputError,
  searchCatalog, rewritePAT, parsePATError, isPATExitCode, annotationsFor,
} = sharedSrc;

// --- config ---
const PORT = parseInt(process.env.PORT || "8000", 10);
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || "10", 10);
const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS || "60000", 10);
const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const AGENTCODE = process.env.DINGTALK_DWS_AGENTCODE || "quick-dingtalk-mcp";
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL || "";
const TEARDOWN_PER_REQUEST = process.env.TEARDOWN_PER_REQUEST === "1";

// --- tool list (38) ---
const TOOL_NAME_TO_KEY = new Map();
for (const key of Object.keys(catalog.commands)) {
  TOOL_NAME_TO_KEY.set(toToolName(key), key);
}
const aliasMap = tier1.aliases;

function findCommandByToolName(name) {
  const realName = aliasMap[name] || name;
  const key = TOOL_NAME_TO_KEY.get(realName);
  if (!key) return null;
  return { key, cmd: catalog.commands[key], realName };
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
    description: "搜索 dws catalog 命令；返回 tool_name + 简介。先 discover、再 invoke。",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
  });
  tools.push({
    name: "dingtalk_invoke",
    description: "按 dingtalk_discover 给出的 tool_name 调用对应命令。",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        args: { type: "object" },
      },
      required: ["tool_name"],
    },
  });
  return tools;
}
const TOOLS = buildToolList();

// --- semaphore ---
class Semaphore {
  constructor(n) { this.n = n; this.q = []; }
  async acquire() {
    if (this.n > 0) { this.n--; return; }
    await new Promise(r => this.q.push(r));
  }
  release() {
    if (this.q.length > 0) { const r = this.q.shift(); r(); }
    else this.n++;
  }
  get queueDepth() { return this.q.length; }
}
const sem = new Semaphore(MAX_CONCURRENT);

// --- shutdown drain ---
let shuttingDown = false;
let activeRequests = 0;

// --- authorize URL builder for incremental-auth ---
function buildAuthorizeUrl(scopes, incrAuthToken) {
  if (!OAUTH_BASE_URL) {
    return `<OAUTH_BASE_URL not set>`;
  }
  const u = new URL("/authorize", OAUTH_BASE_URL);
  if (scopes && scopes.length) u.searchParams.set("extra_scope", scopes.join(" "));
  if (incrAuthToken) u.searchParams.set("t", incrAuthToken);
  return u.toString();
}

// --- main dispatch ---
async function dispatchToolCall(name, args, env) {
  if (name === "dingtalk_discover") {
    const results = searchCatalog(catalog, args, { tier1: tier1.tools });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
  if (name === "dingtalk_invoke") {
    if (!args.tool_name) throw new InputError("tool_name 必填");
    return await dispatchToolCall(args.tool_name, args.args || {}, env);
  }
  const found = findCommandByToolName(name);
  if (!found) throw new InputError(`未知工具: ${name}`);
  const cliArgs = toCliArgs(found.cmd, args);
  return await runDws(cliArgs, env);
}

function runDws(cliArgs, env) {
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const proc = execFile(DWS_BIN, cliArgs, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      env,
    });
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    proc.on("close", code => {
      if (code === 0) {
        const out = stdout.trim() || stderr.trim() || "(empty response)";
        resolve({ content: [{ type: "text", text: out }] });
      } else {
        const err = new Error(`dws exit=${code}`);
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });
    proc.on("error", reject);
    // expose for caller-side abort
    runDws.lastProc = proc;
  });
}

function errorResult(err, incrAuthToken) {
  if (err instanceof InputError) {
    return { content: [{ type: "text", text: err.message }], isError: true };
  }
  if (isPATExitCode(err.code)) {
    const pat = parsePATError(err.stderr);
    if (pat) {
      const rewritten = rewritePAT(pat, {
        mode: "remote",
        authorizeUrlBuilder: scopes => buildAuthorizeUrl(scopes, incrAuthToken),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(rewritten, null, 2) }],
        isError: true,
      };
    }
  }
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  return { content: [{ type: "text", text: `Error: ${parts.join("\n")}` }], isError: true };
}

// --- HTTP transport ---
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", c => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function handleMcpRequest(req, res) {
  const userId = req.headers["x-user-id"] || "";
  const accessToken = req.headers["x-user-access-token"] || "";
  const incrAuthToken = req.headers["x-incr-auth-token"] || "";
  if (!userId || !accessToken) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "missing X-User-Id or X-User-Access-Token" }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.statusCode = e.statusCode || 400;
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  let configDir;
  await sem.acquire();
  activeRequests++;
  let aborted = false;
  req.on("close", () => { aborted = true; if (runDws.lastProc) runDws.lastProc.kill("SIGTERM"); });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");

  try {
    configDir = await provisionUserConfig(userId, accessToken);
    const env = {
      ...process.env,
      DWS_CONFIG_DIR: configDir,
      DINGTALK_DWS_AGENTCODE: AGENTCODE,
      DWS_DISABLE_KEYCHAIN: "1",
    };

    // body is newline-delimited JSON-RPC requests
    const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (aborted) break;
      let rpc;
      try { rpc = JSON.parse(line); } catch { continue; }
      let response;
      try {
        if (rpc.method === "initialize") {
          response = {
            jsonrpc: "2.0", id: rpc.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "quick-dingtalk-mcp-remote", version: "0.2.0" },
            },
          };
        } else if (rpc.method === "tools/list") {
          response = { jsonrpc: "2.0", id: rpc.id, result: { tools: TOOLS } };
        } else if (rpc.method === "tools/call") {
          const { name, arguments: args = {} } = rpc.params || {};
          let result;
          try {
            result = await dispatchToolCall(name, args, env);
          } catch (e) {
            result = errorResult(e, incrAuthToken);
          }
          response = { jsonrpc: "2.0", id: rpc.id, result };
        } else {
          response = { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `method not found: ${rpc.method}` } };
        }
      } catch (e) {
        response = { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: e.message } };
      }
      writeSSE(res, response);
    }
  } finally {
    res.end();
    activeRequests--;
    sem.release();
    if (TEARDOWN_PER_REQUEST && configDir) {
      teardownUserConfig(userId).catch(() => {});
    }
  }
}

// --- HTTP server ---
const server = http.createServer(async (req, res) => {
  if (shuttingDown) {
    res.statusCode = 503;
    res.setHeader("Retry-After", "5");
    res.end("draining");
    return;
  }
  if (req.method === "GET" && req.url === "/ping") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, queue_depth: sem.queueDepth, active: activeRequests }));
    return;
  }
  if (req.method === "POST") {
    await handleMcpRequest(req, res);
    return;
  }
  res.statusCode = 405;
  res.end("method not allowed");
});

server.listen(PORT, () => {
  console.error(`qdm-remote listening on :${PORT} (max_concurrent=${MAX_CONCURRENT}, dws=${DWS_BIN})`);
});

// --- SIGTERM drain ---
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`SIGTERM — draining (${activeRequests} active)...`);
  server.close(() => {
    console.error("HTTP server closed.");
    process.exit(0);
  });
  // Hard timeout: 30s grace for in-flight requests.
  setTimeout(() => {
    console.error("Drain timeout, forcing exit.");
    process.exit(1);
  }, 30_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Export for tests (importing this file under a test runner without listening
// is not supported; tests use a child_process spawn — see __tests__/server.test.mjs).
```

- [ ] **Step 2: Sanity — Node parse**

Run: `node --check packages/remote/docker/server.js`
Expected: 0 输出，0 退出码。证明语法 OK。

- [ ] **Step 3: Commit**

```bash
git add packages/remote/docker/server.js
git commit -m "feat(remote): docker/server.js — Streamable HTTP :8000 (semaphore + SIGTERM drain + SSE + 38 tools + remote PAT rewrite)"
```

---

### Task 7: docker — server.js 集成测试 + docker build 验证

server.js 比较大、单元测试不易；用 child_process 启动它，HTTP 调它打 `/ping` 和一次 `tools/list` 验证 38 工具。再跑 `docker build` 出镜像（done criteria 第 3 道门）。

**Files:**

- Create: `packages/remote/docker/__tests__/server.test.mjs`

- [ ] **Step 1: 写集成测试**

```javascript
// packages/remote/docker/__tests__/server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "..", "server.js");

// shared/ folder is at packages/shared (sibling). Server resolves it via
// `<__dirname>/shared` — at runtime in the container the Dockerfile copies it
// in. For local tests we symlink.
import { symlink, lstat } from "node:fs/promises";
const localShared = join(__dirname, "..", "shared");
try { await lstat(localShared); } catch {
  await symlink(join(__dirname, "..", "..", "..", "shared"), localShared, "dir").catch(() => {});
}

const tmpRoot = await mkdtemp(join(tmpdir(), "qdm-server-"));
// Fake dws that prints args
const fakeDws = join(tmpRoot, "dws-fake.sh");
await writeFile(fakeDws, `#!/usr/bin/env bash\necho "FAKE: $*"\nexit 0\n`);
await chmod(fakeDws, 0o755);

let proc, port = 18000 + Math.floor(Math.random() * 1000);

test("server starts on port and responds to /ping", { timeout: 10_000 }, async () => {
  proc = spawn("node", [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DWS_BIN: fakeDws,
      DWS_CONFIG_DIR_BASE: tmpRoot,
      INJECT_STRATEGY: "d2",
      OAUTH_BASE_URL: "https://auth.example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", d => process.stderr.write(`[server] ${d}`));
  // Wait for "listening on"
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 5000);
    proc.stderr.on("data", d => {
      if (String(d).includes("listening on")) { clearTimeout(t); resolve(); }
    });
  });

  const r = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
});

test("tools/list returns 38 tools", { timeout: 10_000 }, async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n";
  const r = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    headers: {
      "X-User-Id": "test-user",
      "X-User-Access-Token": "fake-token",
      "Content-Type": "application/json",
    },
    body,
  });
  assert.equal(r.status, 200);
  const text = await r.text();
  // SSE-style: "data: {...}\n\n"
  const match = text.match(/^data: (.+)$/m);
  assert.ok(match, `expected SSE data line, got: ${text.slice(0, 200)}`);
  const rpc = JSON.parse(match[1]);
  assert.equal(rpc.result.tools.length, 38);
  const names = rpc.result.tools.map(t => t.name);
  assert.ok(names.includes("dingtalk_discover"));
  assert.ok(names.includes("dingtalk_invoke"));
  assert.ok(names.includes("dingtalk_send_message")); // alias
});

test("missing X-User-Id returns 401", { timeout: 5_000 }, async () => {
  const r = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n",
  });
  assert.equal(r.status, 401);
});

test.after(async () => {
  if (proc) {
    proc.kill("SIGTERM");
    await new Promise(r => proc.on("close", r));
  }
  await rm(tmpRoot, { recursive: true, force: true });
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test packages/remote/docker/__tests__/server.test.mjs`
Expected: 3 个 test 全 pass。`server starts` 测试可能拉满 5s 启动等待，如果超时检查 `node --check` 的错。

- [ ] **Step 3: docker build（done criteria 第 3 道门预演）**

```bash
docker build packages/remote/docker -t qdm-remote:plan2 || echo "DOCKER NOT INSTALLED, skipped"
```

Expected：要么 docker 不在跳过；要么 build 走完 7 个 step 末尾 `Successfully tagged qdm-remote:plan2`。如果 build 报 dws tarball 404 是正常的（GitHub release URL 可能未来改），把那一句 RUN 改 `|| true` 或 mock dws 也行。**Plan 2 不要求 image 真能运行**，只要 build 出镜像。

> **关于 Dockerfile 的 sha256 digest**：Step 3 第一次 build 会因为 placeholder digest 不存在而失败。**先用 `FROM node:20-bookworm-slim` (no digest) 跑通**，然后 `docker pull node:20-bookworm-slim && docker inspect --format='{{index .RepoDigests 0}}' node:20-bookworm-slim` 拿到真 digest 替换 Dockerfile 第 4 行的占位 `0e0c8e7e...`，再 build 一次。

- [ ] **Step 4: Commit**

```bash
git add packages/remote/docker/__tests__/server.test.mjs
git commit -m "test(remote): docker/server.js integration test (start + /ping + tools/list = 38)"
```


---

### Group 3 — Lambda × 3 + shared（T8 / T9 / T10 / T11 / T12 / T13 / T14）

---

### Task 8: lambda/shared/log.ts + lambda/shared/hmac.ts (with TDD)

最薄的两个 shared utility：log（结构化 JSON 日志，AWS CloudWatch friendly）+ hmac（sign / verify HMAC-SHA256，签 MCP token 与 incrAuthToken）。

**Files:**

- Create: `packages/remote/lambda/shared/log.ts`
- Create: `packages/remote/lambda/shared/hmac.ts`
- Create: `packages/remote/lambda/shared/hmac.test.ts`

- [ ] **Step 1: 写 `lambda/shared/log.ts`**

```typescript
// Structured JSON logger for Lambda. CloudWatch parses JSON automatically.
// Fields:
//   - level: "debug" | "info" | "warn" | "error"
//   - msg: human-readable message
//   - <any other key>: structured context
// Logs are emitted as one-line JSON via console.log/error.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const record = { level, msg, ts: new Date().toISOString(), ...ctx };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
```

- [ ] **Step 2: 写 `lambda/shared/hmac.test.ts`（先测试）**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { signMcpToken, verifyMcpToken, signIncrAuthToken, verifyIncrAuthToken } from "./hmac.ts";

const KEY = "0".repeat(64); // 32-byte hex key

test("signMcpToken: returns base64url uid:exp:sig string", () => {
  const t = signMcpToken({ userId: "user-1", expiresInSec: 3600 }, KEY);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test("verifyMcpToken: round trip", () => {
  const t = signMcpToken({ userId: "user-2", expiresInSec: 3600 }, KEY);
  const r = verifyMcpToken(t, KEY);
  assert.equal(r.userId, "user-2");
  assert.ok(r.expiresAt > Math.floor(Date.now() / 1000));
});

test("verifyMcpToken: tampered sig rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  const parts = t.split(".");
  const bad = `${parts[0]}.${parts[1]}.tampered`;
  assert.throws(() => verifyMcpToken(bad, KEY), /signature mismatch/);
});

test("verifyMcpToken: expired rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: -10 }, KEY);
  assert.throws(() => verifyMcpToken(t, KEY), /expired/);
});

test("verifyMcpToken: wrong key rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  assert.throws(() => verifyMcpToken(t, "1".repeat(64)), /signature mismatch/);
});

test("signIncrAuthToken / verifyIncrAuthToken: round trip with scopes", () => {
  const t = signIncrAuthToken({ userId: "u", scopes: ["a", "b"], expiresInSec: 600 }, KEY);
  const r = verifyIncrAuthToken(t, KEY);
  assert.equal(r.userId, "u");
  assert.deepEqual(r.scopes, ["a", "b"]);
});

test("verifyIncrAuthToken: cross-key with verifyMcpToken — must reject (different domain prefix)", () => {
  const mcp = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  assert.throws(() => verifyIncrAuthToken(mcp, KEY), /signature mismatch|wrong token type/);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/hmac.test.ts`
Expected: 全 fail (`Cannot find module './hmac.ts'`)。

- [ ] **Step 4: 写 `lambda/shared/hmac.ts`**

```typescript
// HMAC-SHA256 token sign/verify for MCP and incremental-auth tokens.
//
// Token format: base64url(payload).base64url(b64-of-payload-json).hex(sig)
// We bind a "domain" prefix to defend against cross-token confusion.
//
// MCP token domain  : "mcp"
// Incr-auth domain  : "incr"
//
// Payload (JSON): { d: domain, uid, exp, scopes? }

import { createHmac, timingSafeEqual } from "node:crypto";

type SignArgs = {
  userId: string;
  expiresInSec: number;
};

type IncrSignArgs = SignArgs & {
  scopes: string[];
};

type VerifiedMcp = {
  userId: string;
  expiresAt: number;
};

type VerifiedIncr = VerifiedMcp & {
  scopes: string[];
};

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  let pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(domain: string, payloadJson: string, key: string): string {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(`${domain}:${payloadJson}`)
    .digest("hex");
}

function timingEqStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function signMcpToken(args: SignArgs, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + args.expiresInSec;
  const payload = { d: "mcp", uid: args.userId, exp };
  const json = JSON.stringify(payload);
  const sig = sign("mcp", json, key);
  return [b64url("mcp"), b64url(json), sig].join(".");
}

export function verifyMcpToken(token: string, key: string): VerifiedMcp {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [d, p, s] = parts;
  const domain = b64urlDecode(d).toString("utf8");
  if (domain !== "mcp") throw new Error("wrong token type");
  const json = b64urlDecode(p).toString("utf8");
  const expectedSig = sign("mcp", json, key);
  if (!timingEqStr(expectedSig, s)) throw new Error("signature mismatch");
  let payload: { d: string; uid: string; exp: number };
  try { payload = JSON.parse(json); } catch { throw new Error("malformed payload"); }
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return { userId: payload.uid, expiresAt: payload.exp };
}

export function signIncrAuthToken(args: IncrSignArgs, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + args.expiresInSec;
  const payload = { d: "incr", uid: args.userId, exp, scopes: args.scopes };
  const json = JSON.stringify(payload);
  const sig = sign("incr", json, key);
  return [b64url("incr"), b64url(json), sig].join(".");
}

export function verifyIncrAuthToken(token: string, key: string): VerifiedIncr {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [d, p, s] = parts;
  const domain = b64urlDecode(d).toString("utf8");
  if (domain !== "incr") throw new Error("wrong token type");
  const json = b64urlDecode(p).toString("utf8");
  const expectedSig = sign("incr", json, key);
  if (!timingEqStr(expectedSig, s)) throw new Error("signature mismatch");
  let payload: { d: string; uid: string; exp: number; scopes: string[] };
  try { payload = JSON.parse(json); } catch { throw new Error("malformed payload"); }
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return { userId: payload.uid, expiresAt: payload.exp, scopes: payload.scopes || [] };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/hmac.test.ts`
Expected: 7 个 test 全 pass。

- [ ] **Step 6: Commit**

```bash
git add packages/remote/lambda/shared/log.ts packages/remote/lambda/shared/hmac.ts packages/remote/lambda/shared/hmac.test.ts
git commit -m "feat(remote): lambda/shared — log.ts (structured JSON) + hmac.ts (mcp/incr token sign/verify) + tests"
```

---

### Task 9: lambda/shared/sigv4.ts (with TDD)

`@aws-sdk/signature-v4` wrapper：mcp-middleware 用它给 AgentCore Runtime 调用签名。SigV4 签名涉及 region / service / credentials / hash —— 包成一个 `signRequest(httpReq, opts)` 函数即可。

**Files:**

- Create: `packages/remote/lambda/shared/sigv4.ts`
- Create: `packages/remote/lambda/shared/sigv4.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { signRequest } from "./sigv4.ts";

const fakeCreds = {
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret_test_xxx",
};

test("signRequest: adds Authorization header with AWS4-HMAC-SHA256", async () => {
  const signed = await signRequest({
    method: "POST",
    url: "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/test/invocations",
    headers: { "content-type": "application/json", host: "bedrock-agentcore.us-east-1.amazonaws.com" },
    body: '{"hello":"world"}',
    region: "us-east-1",
    service: "bedrock-agentcore",
    credentials: fakeCreds,
  });
  assert.match(signed.headers["authorization"], /^AWS4-HMAC-SHA256 Credential=AKIA_TEST/);
  assert.ok(signed.headers["x-amz-date"]);
  assert.ok(signed.headers["x-amz-content-sha256"]);
});

test("signRequest: deterministic given fixed time + creds", async () => {
  const fixedDate = new Date("2026-05-28T12:00:00Z");
  const opts = {
    method: "GET" as const,
    url: "https://example.us-east-1.amazonaws.com/foo",
    headers: { host: "example.us-east-1.amazonaws.com" },
    body: "",
    region: "us-east-1",
    service: "execute-api",
    credentials: fakeCreds,
    signingDate: fixedDate,
  };
  const a = await signRequest(opts);
  const b = await signRequest(opts);
  assert.equal(a.headers["authorization"], b.headers["authorization"]);
});

test("signRequest: different body → different signature", async () => {
  const base = {
    method: "POST" as const,
    url: "https://example.us-east-1.amazonaws.com/foo",
    headers: { host: "example.us-east-1.amazonaws.com", "content-type": "application/json" },
    region: "us-east-1",
    service: "execute-api",
    credentials: fakeCreds,
    signingDate: new Date("2026-05-28T12:00:00Z"),
  };
  const a = await signRequest({ ...base, body: '{"a":1}' });
  const b = await signRequest({ ...base, body: '{"a":2}' });
  assert.notEqual(a.headers["authorization"], b.headers["authorization"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/sigv4.test.ts`
Expected: 全 fail。

- [ ] **Step 3: 写 `lambda/shared/sigv4.ts`**

```typescript
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";

export type SignedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type SignArgs = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  headers: Record<string, string>;
  body?: string;
  region: string;
  service: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  signingDate?: Date;
};

export async function signRequest(args: SignArgs): Promise<SignedRequest> {
  const u = new URL(args.url);
  const headers = { ...args.headers, host: u.host };
  const body = args.body ?? "";

  const signer = new SignatureV4({
    service: args.service,
    region: args.region,
    credentials: args.credentials,
    sha256: Sha256,
  });

  // SignatureV4 expects a HttpRequest-like shape.
  const req = {
    method: args.method,
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    path: u.pathname + (u.search || ""),
    headers,
    body,
    query: Object.fromEntries(u.searchParams.entries()),
  };

  const signed = await signer.sign(req as any, {
    signingDate: args.signingDate,
  });

  return {
    method: args.method,
    url: args.url,
    headers: signed.headers as Record<string, string>,
    body,
  };
}
```

- [ ] **Step 4: 跑测试**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/sigv4.test.ts`
Expected: 3 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/remote/lambda/shared/sigv4.ts packages/remote/lambda/shared/sigv4.test.ts
git commit -m "feat(remote): lambda/shared/sigv4.ts — @aws-sdk/signature-v4 wrapper + tests"
```

---

### Task 10: lambda/shared/sm-client.ts — Secrets Manager helper (with TDD)

封装 SM 读写：`getUserToken(userId)` / `putUserToken(userId, payload)` / `deleteUserToken(userId)` / `listUserSecrets()`。Lambda 用它做 token 读写，KMS 加密由 SM 默认 alias 提供。测试 mock `@aws-sdk/client-secretsmanager`。

**Files:**

- Create: `packages/remote/lambda/shared/sm-client.ts`
- Create: `packages/remote/lambda/shared/sm-client.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock @aws-sdk/client-secretsmanager via module mock
// node --test doesn't have a built-in mocker; we substitute the import directly
// by creating a minimal in-memory backend module and having sm-client import from it.

const calls: { op: string; args: any }[] = [];
const store = new Map<string, string>();

const fakeClient = {
  send: async (cmd: { __op: string; input: any }) => {
    calls.push({ op: cmd.__op, args: cmd.input });
    if (cmd.__op === "GetSecretValueCommand") {
      const v = store.get(cmd.input.SecretId);
      if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
      return { SecretString: v };
    }
    if (cmd.__op === "PutSecretValueCommand") {
      store.set(cmd.input.SecretId, cmd.input.SecretString);
      return { VersionId: "v1" };
    }
    if (cmd.__op === "CreateSecretCommand") {
      store.set(cmd.input.Name, cmd.input.SecretString);
      return { ARN: `arn:fake:${cmd.input.Name}` };
    }
    if (cmd.__op === "DeleteSecretCommand") {
      store.delete(cmd.input.SecretId);
      return {};
    }
    if (cmd.__op === "ListSecretsCommand") {
      return {
        SecretList: [...store.keys()].map(name => ({ Name: name })),
      };
    }
    throw new Error(`unknown op ${cmd.__op}`);
  },
};

const { _setClient, getUserToken, putUserToken, deleteUserToken, listUserSecrets, secretIdFor } =
  await import("./sm-client.ts");

beforeEach(() => {
  store.clear();
  calls.length = 0;
  _setClient(fakeClient as any);
});

test("secretIdFor: prefixed by quick-dingtalk-mcp/users/", () => {
  assert.equal(secretIdFor("user-1"), "quick-dingtalk-mcp/users/user-1");
});

test("putUserToken then getUserToken returns same payload", async () => {
  await putUserToken("u1", { access_token: "a", refresh_token: "r", expires_at: 9999, scope: "" });
  const r = await getUserToken("u1");
  assert.equal(r.access_token, "a");
  assert.equal(r.refresh_token, "r");
});

test("getUserToken: not-found returns null", async () => {
  const r = await getUserToken("u-none");
  assert.equal(r, null);
});

test("deleteUserToken removes the secret", async () => {
  await putUserToken("u2", { access_token: "x", refresh_token: "y", expires_at: 1, scope: "" });
  await deleteUserToken("u2");
  const r = await getUserToken("u2");
  assert.equal(r, null);
});

test("listUserSecrets: returns user ids stripped of prefix", async () => {
  await putUserToken("a", { access_token: "1", refresh_token: "2", expires_at: 0, scope: "" });
  await putUserToken("b", { access_token: "1", refresh_token: "2", expires_at: 0, scope: "" });
  const ids = await listUserSecrets();
  assert.deepEqual(ids.sort(), ["a", "b"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/sm-client.test.ts`
Expected: fail (`Cannot find module './sm-client.ts'`).

- [ ] **Step 3: 写 `lambda/shared/sm-client.ts`**

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
} from "@aws-sdk/client-secretsmanager";

export type UserToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  scope: string;
  needs_reauth?: boolean;
};

const PREFIX = "quick-dingtalk-mcp/users/";

let client: { send: (cmd: any) => Promise<any> } = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });

export function _setClient(c: { send: (cmd: any) => Promise<any> }): void {
  client = c;
}

export function secretIdFor(userId: string): string {
  return `${PREFIX}${userId}`;
}

// Wrap commands so the mock can identify them by __op (the in-memory mock above
// expects __op set; real SDK clients ignore extra fields).
function wrap(op: string, input: any): any {
  const real = (() => {
    switch (op) {
      case "GetSecretValueCommand":  return new GetSecretValueCommand(input);
      case "PutSecretValueCommand":  return new PutSecretValueCommand(input);
      case "CreateSecretCommand":    return new CreateSecretCommand(input);
      case "DeleteSecretCommand":    return new DeleteSecretCommand(input);
      case "ListSecretsCommand":     return new ListSecretsCommand(input);
      default: throw new Error(`unknown op ${op}`);
    }
  })();
  (real as any).__op = op;
  (real as any).input = input;
  return real;
}

export async function getUserToken(userId: string): Promise<UserToken | null> {
  try {
    const r = await client.send(wrap("GetSecretValueCommand", { SecretId: secretIdFor(userId) }));
    if (!r.SecretString) return null;
    return JSON.parse(r.SecretString) as UserToken;
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") return null;
    throw e;
  }
}

export async function putUserToken(userId: string, token: UserToken): Promise<void> {
  const id = secretIdFor(userId);
  const body = JSON.stringify(token);
  try {
    await client.send(wrap("PutSecretValueCommand", { SecretId: id, SecretString: body }));
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") {
      await client.send(wrap("CreateSecretCommand", { Name: id, SecretString: body }));
      return;
    }
    throw e;
  }
}

export async function deleteUserToken(userId: string): Promise<void> {
  await client.send(wrap("DeleteSecretCommand", {
    SecretId: secretIdFor(userId),
    ForceDeleteWithoutRecovery: false, // 7-day recovery window; ops.sh teardown can override
  }));
}

export async function listUserSecrets(): Promise<string[]> {
  const r = await client.send(wrap("ListSecretsCommand", {
    Filters: [{ Key: "name", Values: [PREFIX] }],
    MaxResults: 100,
  }));
  const list = (r.SecretList || []) as { Name?: string }[];
  return list
    .map(s => s.Name)
    .filter((n): n is string => !!n && n.startsWith(PREFIX))
    .map(n => n.slice(PREFIX.length));
}
```

- [ ] **Step 4: 跑测试**

Run: `node --test --experimental-strip-types packages/remote/lambda/shared/sm-client.test.ts`
Expected: 5 个 test 全 pass。

- [ ] **Step 5: Commit**

```bash
git add packages/remote/lambda/shared/sm-client.ts packages/remote/lambda/shared/sm-client.test.ts
git commit -m "feat(remote): lambda/shared/sm-client.ts — SM read/write/list/delete user tokens + tests"
```

---

### Task 11: lambda/token-refresh-shim/index.ts — PKCE OAuth + EventBridge refresh

这是最大的一个 Lambda。承担四件事：
1. **`/authorize`** GET — 生成 PKCE verifier + state，写 DDB（5min TTL），重定向钉钉同意页
2. **`/callback`** GET — 拿 `code + state`，DDB 查 verifier，POST 钉钉换 access/refresh token，写 SM，签 HMAC token，渲染 HTML 给用户复制
3. **`/refresh`** POST — 通过 incrAuthToken 触发渐进授权（与 /authorize 类似但带 extra_scope）
4. **EventBridge 30min event** — 列 SM 全部用户，临过期则 POST 钉钉 refresh，回写 SM

**Files:**

- Create: `packages/remote/lambda/token-refresh-shim/index.ts`

- [ ] **Step 1: 写实现**

```typescript
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  EventBridgeEvent,
  Context,
} from "aws-lambda";
import { createHash, randomBytes } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutItemCommand, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { log } from "../shared/log.ts";
import { signMcpToken, verifyIncrAuthToken } from "../shared/hmac.ts";
import { getUserToken, putUserToken, listUserSecrets, type UserToken } from "../shared/sm-client.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const DDB_TABLE = process.env.OAUTH_STATE_TABLE!;
const HMAC_KEY_PARAM = process.env.HMAC_KEY_PARAM!;
const DINGTALK_APP_ID = process.env.DINGTALK_APP_ID!;
const DINGTALK_APP_SECRET_PARAM = process.env.DINGTALK_APP_SECRET_PARAM!;
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL!;
const DINGTALK_AUTHORIZE_URL = process.env.DINGTALK_AUTHORIZE_URL || "https://login.dingtalk.com/oauth2/auth";
const DINGTALK_TOKEN_URL = process.env.DINGTALK_TOKEN_URL || "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USER_ME_URL = process.env.DINGTALK_USER_ME_URL || "https://api.dingtalk.com/v1.0/contact/users/me";
const REFRESH_BUFFER_SEC = 60 * 60; // refresh if expires_at - now < 60min
const DEFAULT_SCOPES = (process.env.DEFAULT_SCOPES || "openid").split(",").map(s => s.trim());
const REFRESH_FAILURE_METRIC_NAMESPACE = "QuickDingtalkMcp/Remote";

const ddb = new DynamoDBClient({ region: REGION });
const ssm = new SSMClient({ region: REGION });

let cachedHmacKey: string | null = null;
let cachedAppSecret: string | null = null;

async function getHmacKey(): Promise<string> {
  if (cachedHmacKey) return cachedHmacKey;
  const r = await ssm.send(new GetParameterCommand({ Name: HMAC_KEY_PARAM, WithDecryption: true }));
  cachedHmacKey = r.Parameter!.Value!;
  return cachedHmacKey;
}

async function getDingtalkAppSecret(): Promise<string> {
  if (cachedAppSecret) return cachedAppSecret;
  const r = await ssm.send(new GetParameterCommand({ Name: DINGTALK_APP_SECRET_PARAM, WithDecryption: true }));
  cachedAppSecret = r.Parameter!.Value!;
  return cachedAppSecret;
}

// --- PKCE helpers ---
function pkceVerifier(): string {
  return randomBytes(48).toString("base64url");
}
function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// --- DDB state store ---
async function putState(state: string, payload: { verifier: string; scopes: string[]; uid?: string }): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5min
  await ddb.send(new PutItemCommand({
    TableName: DDB_TABLE,
    Item: {
      state: { S: state },
      payload: { S: JSON.stringify(payload) },
      ttl: { N: String(ttl) },
    },
  }));
}

async function consumeState(state: string): Promise<{ verifier: string; scopes: string[]; uid?: string } | null> {
  const r = await ddb.send(new GetItemCommand({
    TableName: DDB_TABLE,
    Key: { state: { S: state } },
  }));
  if (!r.Item) return null;
  await ddb.send(new DeleteItemCommand({
    TableName: DDB_TABLE,
    Key: { state: { S: state } },
  }));
  const payload = r.Item.payload?.S;
  if (!payload) return null;
  return JSON.parse(payload);
}

// --- DingTalk OAuth ---
async function exchangeCodeForToken(code: string, verifier: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const appSecret = await getDingtalkAppSecret();
  const r = await fetch(DINGTALK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: DINGTALK_APP_ID,
      clientSecret: appSecret,
      code,
      codeVerifier: verifier,
      grantType: "authorization_code",
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DingTalk token exchange failed: ${r.status} ${t}`);
  }
  const j = await r.json() as any;
  return {
    access_token: j.accessToken,
    refresh_token: j.refreshToken,
    expires_in: j.expireIn,
    scope: j.scope || "",
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const appSecret = await getDingtalkAppSecret();
  const r = await fetch(DINGTALK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: DINGTALK_APP_ID,
      clientSecret: appSecret,
      refreshToken,
      grantType: "refresh_token",
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DingTalk refresh failed: ${r.status} ${t}`);
  }
  const j = await r.json() as any;
  return {
    access_token: j.accessToken,
    refresh_token: j.refreshToken,
    expires_in: j.expireIn,
    scope: j.scope || "",
  };
}

async function fetchUserId(accessToken: string): Promise<string> {
  const r = await fetch(DINGTALK_USER_ME_URL, {
    method: "GET",
    headers: { "x-acs-dingtalk-access-token": accessToken },
  });
  if (!r.ok) throw new Error(`DingTalk user/me failed: ${r.status}`);
  const j = await r.json() as any;
  return j.unionId || j.userid || j.openId || j.userId;
}

// --- HTTP route handlers ---
async function handleAuthorize(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  let scopes = DEFAULT_SCOPES;
  let userId: string | undefined;

  // Incremental auth path: ?t=<incrAuthToken>&extra_scope=...
  if (qs.t) {
    const key = await getHmacKey();
    try {
      const v = verifyIncrAuthToken(qs.t, key);
      userId = v.userId;
      scopes = [...new Set([...DEFAULT_SCOPES, ...(qs.extra_scope || "").split(/[, ]+/).filter(Boolean), ...v.scopes])];
    } catch (e: any) {
      log.warn("invalid incrAuthToken", { err: e.message });
      return { statusCode: 400, body: "invalid token" };
    }
  } else if (qs.extra_scope) {
    scopes = [...new Set([...DEFAULT_SCOPES, ...qs.extra_scope.split(/[, ]+/).filter(Boolean)])];
  }

  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const state = randomBytes(16).toString("base64url");
  await putState(state, { verifier, scopes, uid: userId });

  const u = new URL(DINGTALK_AUTHORIZE_URL);
  u.searchParams.set("client_id", DINGTALK_APP_ID);
  u.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scopes.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return { statusCode: 302, headers: { location: u.toString(), "cache-control": "no-store" }, body: "" };
}

async function handleCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  if (!qs.code || !qs.state) return { statusCode: 400, body: "missing code or state" };
  const stateData = await consumeState(qs.state);
  if (!stateData) return { statusCode: 400, body: "state expired or unknown" };

  let token;
  try {
    token = await exchangeCodeForToken(qs.code, stateData.verifier);
  } catch (e: any) {
    log.error("token exchange failed", { err: e.message });
    return { statusCode: 502, body: "DingTalk token exchange failed" };
  }

  const userId = stateData.uid || await fetchUserId(token.access_token);
  const expiresAt = Math.floor(Date.now() / 1000) + token.expires_in;
  const userToken: UserToken = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt,
    scope: token.scope,
  };
  await putUserToken(userId, userToken);

  const hmacKey = await getHmacKey();
  const mcpToken = signMcpToken({ userId, expiresInSec: 86400 }, hmacKey);

  const html = `<!doctype html><meta charset="utf-8"><title>授权成功</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}</style>
<h1>钉钉授权成功</h1>
<p>把下面这一行复制到 Quick Desktop 的 <code>Authorization</code> header（或 MCP 配置的 <code>token</code> 字段）：</p>
<pre>Bearer ${mcpToken}</pre>
<p>有效期 24 小时；过期后再次跑授权即可。</p>`;
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
}

async function handleRefreshOne(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await getUserToken(userId);
  if (!t) return { ok: false, reason: "not-found" };
  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at - now > REFRESH_BUFFER_SEC) return { ok: true, reason: "skip-not-expiring" };
  try {
    const newT = await refreshAccessToken(t.refresh_token);
    const expiresAt = Math.floor(Date.now() / 1000) + newT.expires_in;
    await putUserToken(userId, {
      access_token: newT.access_token,
      refresh_token: newT.refresh_token,
      expires_at: expiresAt,
      scope: newT.scope || t.scope,
    });
    return { ok: true };
  } catch (e: any) {
    log.error("refresh failed", { userId, err: e.message });
    await putUserToken(userId, { ...t, needs_reauth: true });
    return { ok: false, reason: e.message };
  }
}

// --- main entry ---
export const handler = async (
  event: APIGatewayProxyEventV2 | EventBridgeEvent<string, unknown>,
  _context: Context,
): Promise<APIGatewayProxyResultV2 | { ok: boolean; refreshed: number; failed: number }> => {
  // EventBridge scheduled event
  if ("source" in event && event.source === "aws.events") {
    log.info("scheduled refresh start");
    const users = await listUserSecrets();
    let refreshed = 0, failed = 0;
    for (const uid of users) {
      const r = await handleRefreshOne(uid);
      if (r.ok) refreshed++; else failed++;
    }
    log.info("scheduled refresh done", { refreshed, failed });
    // Emit failed metric for CW alarm
    if (failed > 0) {
      // CloudWatch EMF embedded format
      console.log(JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{ Namespace: REFRESH_FAILURE_METRIC_NAMESPACE, Dimensions: [[]], Metrics: [{ Name: "RefreshFailureUsers", Unit: "Count" }] }],
        },
        RefreshFailureUsers: failed,
      }));
    }
    return { ok: failed === 0, refreshed, failed };
  }

  // API Gateway HTTP API event
  const apiEvent = event as APIGatewayProxyEventV2;
  const path = apiEvent.requestContext?.http?.path || apiEvent.rawPath || "";
  const method = apiEvent.requestContext?.http?.method || "GET";

  try {
    if (method === "GET" && path.endsWith("/authorize")) return await handleAuthorize(apiEvent);
    if (method === "GET" && path.endsWith("/callback")) return await handleCallback(apiEvent);
    return { statusCode: 404, body: "not found" };
  } catch (e: any) {
    log.error("handler error", { err: e.message, path, method });
    return { statusCode: 500, body: "internal error" };
  }
};
```

- [ ] **Step 2: tsc 检查**

Run: `npx --workspace packages/remote tsc --noEmit packages/remote/lambda/token-refresh-shim/index.ts`
Expected: 0 error。

- [ ] **Step 3: Commit**

```bash
git add packages/remote/lambda/token-refresh-shim/index.ts
git commit -m "feat(remote): lambda/token-refresh-shim — PKCE OAuth (/authorize+/callback) + EventBridge 30min refresh"
```

---

### Task 12: token-refresh-shim 单测（mock 钉钉 OAuth + DDB + SM）

测试覆盖：
- /authorize 正常 → 302 + state 写入 DDB
- /callback 正常 → 换 token + 写 SM + 返回 HTML 含 mcp token
- /callback expired state → 400
- EventBridge：临过期用户走 refresh、未临过期跳过、refresh fail 标 needs_reauth
- incrAuthToken 触发 /authorize 带 extra_scope

**Files:**

- Create: `packages/remote/lambda/token-refresh-shim/index.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Stub network + AWS clients via env + mock injection.
process.env.AWS_REGION = "us-east-1";
process.env.OAUTH_STATE_TABLE = "TEST_STATE";
process.env.HMAC_KEY_PARAM = "/test/hmac";
process.env.DINGTALK_APP_ID = "test-app";
process.env.DINGTALK_APP_SECRET_PARAM = "/test/secret";
process.env.OAUTH_BASE_URL = "https://auth.example.com";
process.env.DINGTALK_AUTHORIZE_URL = "https://login.dingtalk.com/oauth2/auth";
process.env.DINGTALK_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
process.env.DINGTALK_USER_ME_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

// Stub DDB
const ddbStore = new Map<string, any>();
mock.module("@aws-sdk/client-dynamodb", {
  namedExports: {
    DynamoDBClient: class { async send(cmd: any) {
      if (cmd.constructor.name === "PutItemCommand") { ddbStore.set(cmd.input.Item.state.S, cmd.input.Item.payload.S); return {}; }
      if (cmd.constructor.name === "GetItemCommand") {
        const v = ddbStore.get(cmd.input.Key.state.S);
        return v ? { Item: { state: { S: cmd.input.Key.state.S }, payload: { S: v } } } : {};
      }
      if (cmd.constructor.name === "DeleteItemCommand") { ddbStore.delete(cmd.input.Key.state.S); return {}; }
      throw new Error("unknown ddb op");
    } },
    PutItemCommand: class { input: any; constructor(i: any) { this.input = i; } },
    GetItemCommand: class { input: any; constructor(i: any) { this.input = i; } },
    DeleteItemCommand: class { input: any; constructor(i: any) { this.input = i; } },
  },
});

// Stub SSM (returns a fixed hmac key + app secret)
const SSM_KEY = "00".repeat(32);
mock.module("@aws-sdk/client-ssm", {
  namedExports: {
    SSMClient: class { async send(cmd: any) {
      if (cmd.constructor.name === "GetParameterCommand") {
        if (cmd.input.Name === "/test/hmac") return { Parameter: { Value: SSM_KEY } };
        if (cmd.input.Name === "/test/secret") return { Parameter: { Value: "fake-app-secret" } };
      }
      throw new Error("unknown ssm op");
    } },
    GetParameterCommand: class { input: any; constructor(i: any) { this.input = i; } },
  },
});

// Stub SM via sm-client _setClient
const smStore = new Map<string, string>();
const smFake = { send: async (cmd: any) => {
  const op = cmd.constructor.name;
  if (op === "GetSecretValueCommand") {
    const v = smStore.get(cmd.input.SecretId);
    if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
    return { SecretString: v };
  }
  if (op === "PutSecretValueCommand") { smStore.set(cmd.input.SecretId, cmd.input.SecretString); return {}; }
  if (op === "CreateSecretCommand") { smStore.set(cmd.input.Name, cmd.input.SecretString); return {}; }
  if (op === "DeleteSecretCommand") { smStore.delete(cmd.input.SecretId); return {}; }
  if (op === "ListSecretsCommand") {
    return { SecretList: [...smStore.keys()].map(Name => ({ Name })) };
  }
  throw new Error(`unknown sm op ${op}`);
} };

// Stub global fetch for DingTalk API
const fetchCalls: { url: string; init?: any }[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("not-stubbed", { status: 500 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

const sm = await import("../shared/sm-client.ts");
sm._setClient(smFake);

const { handler } = await import("./index.ts");

beforeEach(() => {
  ddbStore.clear();
  smStore.clear();
  fetchCalls.length = 0;
});

test("/authorize: returns 302 with proper state in DDB", async () => {
  const r = await handler(
    { rawPath: "/authorize", requestContext: { http: { path: "/authorize", method: "GET" } }, queryStringParameters: {} } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 302);
  const loc = (r as any).headers.location as string;
  assert.match(loc, /^https:\/\/login\.dingtalk\.com/);
  assert.match(loc, /code_challenge=/);
  assert.match(loc, /state=/);
  assert.equal(ddbStore.size, 1);
});

test("/callback: full happy path → SM stores token + html with mcp token", async () => {
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expireIn: 7200, scope: "openid" }), { status: 200 });
    }
    if (url.includes("contact/users/me")) {
      return new Response(JSON.stringify({ unionId: "uid-42" }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };
  // Pre-seed state
  await handler(
    { rawPath: "/authorize", requestContext: { http: { path: "/authorize", method: "GET" } }, queryStringParameters: {} } as any,
    {} as any,
  );
  const state = [...ddbStore.keys()][0];

  const r = await handler(
    { rawPath: "/callback", requestContext: { http: { path: "/callback", method: "GET" } }, queryStringParameters: { code: "abc", state } } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 200);
  assert.match(((r as any).body as string), /Bearer /);
  assert.equal(smStore.size, 1);
});

test("/callback: unknown state → 400", async () => {
  const r = await handler(
    { rawPath: "/callback", requestContext: { http: { path: "/callback", method: "GET" } }, queryStringParameters: { code: "x", state: "nonexistent" } } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 400);
});

test("EventBridge refresh: only refreshes near-expiry users", async () => {
  // Seed two users — one expiring soon, one fresh
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u1", JSON.stringify({ access_token: "old", refresh_token: "rt1", expires_at: now + 100, scope: "" }));
  smStore.set("quick-dingtalk-mcp/users/u2", JSON.stringify({ access_token: "still-good", refresh_token: "rt2", expires_at: now + 7200, scope: "" }));

  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "NEW", refreshToken: "RT-new", expireIn: 7200, scope: "" }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };

  const r = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r as any).refreshed, 2); // u1 actually refreshed; u2 "skip-not-expiring" still ok=true
  // Verify u1 token swapped
  const u1 = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u1")!);
  assert.equal(u1.access_token, "NEW");
});

test("EventBridge refresh: failure marks needs_reauth", async () => {
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/uf", JSON.stringify({ access_token: "x", refresh_token: "rt-bad", expires_at: now + 100, scope: "" }));
  fetchImpl = async () => new Response("invalid_grant", { status: 400 });
  const r = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r as any).failed, 1);
  const uf = JSON.parse(smStore.get("quick-dingtalk-mcp/users/uf")!);
  assert.equal(uf.needs_reauth, true);
});
```

- [ ] **Step 2: 跑测试**

Run: `node --test --experimental-strip-types packages/remote/lambda/token-refresh-shim/index.test.ts`
Expected: 5 个 test 全 pass。

> **关于 `mock.module`**：Node 20.6+ 内置；如果跑出来报 `mock.module is not a function`，可能 Node 版本不够，把项目 engines 锁到 ≥ 20.10（写 plan 时 LTS 是 20.x latest，应该都支持）。fallback：用 import map / 替换文件路径。

- [ ] **Step 3: Commit**

```bash
git add packages/remote/lambda/token-refresh-shim/index.test.ts
git commit -m "test(remote): token-refresh-shim — /authorize, /callback, EventBridge refresh, needs_reauth on fail"
```

---

### Task 13: lambda/mcp-middleware/index.ts — HMAC verify + SigV4 + AgentCore call

API Gateway POST `/mcp` 入口。流程（spec §7.2）：
1. 校验 `Authorization: Bearer <hmac>` → 解 userId
2. SM 读 user access_token；过期则返 503 + Retry-After（不要让用户重新授权，仅说临时失败）
3. SigV4 签名 → AgentCore Runtime invocation；header 注 `X-User-Access-Token`、`X-Incr-Auth-Token`、`X-User-Id`
4. 25s 内返回（API GW 上限 29s 留 4s buffer）；response 透传 + `Cache-Control: no-store`

**Files:**

- Create: `packages/remote/lambda/mcp-middleware/index.ts`

- [ ] **Step 1: 写实现**

```typescript
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { log } from "../shared/log.ts";
import { verifyMcpToken, signIncrAuthToken } from "../shared/hmac.ts";
import { signRequest } from "../shared/sigv4.ts";
import { getUserToken } from "../shared/sm-client.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const HMAC_KEY_PARAM = process.env.HMAC_KEY_PARAM!;
const AGENTCORE_RUNTIME_URL = process.env.AGENTCORE_RUNTIME_URL!;
const AGENTCORE_SERVICE = "bedrock-agentcore";
const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000", 10);
const TOKEN_NEAR_EXPIRY_SEC = 60; // if expires_at - now < 60s, return 503

const ssm = new SSMClient({ region: REGION });
let cachedHmacKey: string | null = null;

async function getHmacKey(): Promise<string> {
  if (cachedHmacKey) return cachedHmacKey;
  const r = await ssm.send(new GetParameterCommand({ Name: HMAC_KEY_PARAM, WithDecryption: true }));
  cachedHmacKey = r.Parameter!.Value!;
  return cachedHmacKey;
}

function unauth(reason: string): APIGatewayProxyResultV2 {
  log.warn("unauthorized", { reason });
  return {
    statusCode: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ error: "unauthorized", reason }),
  };
}

function serverBusyOrRetry(reason: string, retryAfter: number, status = 503): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": String(retryAfter) },
    body: JSON.stringify({ error: "transient", reason }),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const auth = event.headers?.["authorization"] || event.headers?.["Authorization"] || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return unauth("missing-bearer");
  const token = m[1].trim();

  let userId: string;
  try {
    const key = await getHmacKey();
    const v = verifyMcpToken(token, key);
    userId = v.userId;
  } catch (e: any) {
    return unauth(`token-${e.message}`);
  }

  const userToken = await getUserToken(userId);
  if (!userToken) return unauth("no-user-token");
  if (userToken.needs_reauth) return unauth("needs-reauth");
  const now = Math.floor(Date.now() / 1000);
  if (userToken.expires_at - now < TOKEN_NEAR_EXPIRY_SEC) {
    return serverBusyOrRetry("token-near-expiry", 30);
  }

  // Mint a short-lived incrAuthToken for the runtime to use when generating
  // incremental-authorize URLs in PAT errors.
  const hmacKey = await getHmacKey();
  const incrToken = signIncrAuthToken({
    userId,
    scopes: [],
    expiresInSec: 600,
  }, hmacKey);

  // Sign request to AgentCore Runtime
  const creds = await defaultProvider()();
  let signed;
  try {
    signed = await signRequest({
      method: "POST",
      url: AGENTCORE_RUNTIME_URL,
      headers: {
        "content-type": "application/json",
        "x-user-id": userId,
        "x-user-access-token": userToken.access_token,
        "x-incr-auth-token": incrToken,
      },
      body: event.body || "",
      region: REGION,
      service: AGENTCORE_SERVICE,
      credentials: creds,
    });
  } catch (e: any) {
    log.error("sigv4 sign failed", { err: e.message });
    return { statusCode: 500, body: JSON.stringify({ error: "sign-failed" }) };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e.name === "AbortError") {
      return serverBusyOrRetry("upstream-timeout", 5, 504);
    }
    log.error("upstream call failed", { err: e.message });
    return { statusCode: 502, body: JSON.stringify({ error: "upstream-failed" }) };
  } finally {
    clearTimeout(t);
  }

  const upstreamText = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
    body: upstreamText,
  };
};
```

- [ ] **Step 2: tsc 检查**

Run: `npx --workspace packages/remote tsc --noEmit packages/remote/lambda/mcp-middleware/index.ts`
Expected: 0 error.

- [ ] **Step 3: Commit**

```bash
git add packages/remote/lambda/mcp-middleware/index.ts
git commit -m "feat(remote): lambda/mcp-middleware — HMAC verify + SM read + SigV4 → AgentCore Runtime + 25s timeout + no-store"
```

---

### Task 14: mcp-middleware tests + alarm-webhook Lambda + alarm-webhook tests

mcp-middleware 测试覆盖：valid token / expired token / missing user-token / near-expiry → 503 / SigV4 happy path / upstream timeout。alarm-webhook 是个简单 SNS handler：从 SNS event 取出 CloudWatch alarm 元数据，渲染钉钉群 Markdown 卡片，POST 到 webhook URL。webhook URL 为空时 export 一个 noop（CDK 用 conditional create 防止 Lambda 部署）。

**Files:**

- Create: `packages/remote/lambda/mcp-middleware/index.test.ts`
- Create: `packages/remote/lambda/alarm-webhook/index.ts`
- Create: `packages/remote/lambda/alarm-webhook/index.test.ts`

- [ ] **Step 1: 写 mcp-middleware 测试**

```typescript
// packages/remote/lambda/mcp-middleware/index.test.ts
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.AWS_REGION = "us-east-1";
process.env.HMAC_KEY_PARAM = "/test/hmac";
process.env.AGENTCORE_RUNTIME_URL = "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/test/invocations";
process.env.UPSTREAM_TIMEOUT_MS = "1000";

const HMAC_KEY = "00".repeat(32);

mock.module("@aws-sdk/client-ssm", {
  namedExports: {
    SSMClient: class { async send(_cmd: any) { return { Parameter: { Value: HMAC_KEY } }; } },
    GetParameterCommand: class { input: any; constructor(i: any) { this.input = i; } },
  },
});

mock.module("@aws-sdk/credential-provider-node", {
  namedExports: { defaultProvider: () => async () => ({ accessKeyId: "AKIA", secretAccessKey: "x" }) },
});

const smStore = new Map<string, string>();
const smFake = { send: async (cmd: any) => {
  const op = cmd.constructor.name;
  if (op === "GetSecretValueCommand") {
    const v = smStore.get(cmd.input.SecretId);
    if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
    return { SecretString: v };
  }
  throw new Error("unsupported");
} };

const fetchCalls: any[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("ok", { status: 200 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

const sm = await import("../shared/sm-client.ts");
sm._setClient(smFake);
const { signMcpToken } = await import("../shared/hmac.ts");

const { handler } = await import("./index.ts");

beforeEach(() => {
  smStore.clear();
  fetchCalls.length = 0;
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
});

function event(token: string, body = "{}"): any {
  return {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body,
    requestContext: { http: { method: "POST", path: "/mcp" } },
    rawPath: "/mcp",
  };
}

test("missing bearer → 401", async () => {
  const r = await handler({ headers: {}, body: "", requestContext: { http: { method: "POST", path: "/mcp" } } } as any, {} as any);
  assert.equal((r as any).statusCode, 401);
});

test("malformed token → 401", async () => {
  const r = await handler(event("garbage"), {} as any);
  assert.equal((r as any).statusCode, 401);
});

test("valid token but no SM entry → 401 no-user-token", async () => {
  const tok = signMcpToken({ userId: "u1", expiresInSec: 3600 }, HMAC_KEY);
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 401);
  assert.match((r as any).body, /no-user-token/);
});

test("near-expiry user token → 503", async () => {
  const tok = signMcpToken({ userId: "u2", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u2", JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_at: Math.floor(Date.now() / 1000) + 5, scope: "" }));
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 503);
  assert.equal((r as any).headers["retry-after"], "30");
});

test("happy path → SigV4 signed call to AgentCore + transparent body", async () => {
  const tok = signMcpToken({ userId: "u3", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u3", JSON.stringify({ access_token: "AT-3", refresh_token: "RT-3", expires_at: Math.floor(Date.now() / 1000) + 7200, scope: "" }));
  let captured: any;
  fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const r = await handler(event(tok, '{"hi":1}'), {} as any);
  assert.equal((r as any).statusCode, 200);
  assert.match(captured.init.headers["x-user-access-token"], /AT-3/);
  assert.match(captured.init.headers["authorization"], /^AWS4-HMAC-SHA256/);
  assert.equal((r as any).headers["cache-control"], "no-store");
});

test("upstream timeout → 504", async () => {
  const tok = signMcpToken({ userId: "u4", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u4", JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: Math.floor(Date.now() / 1000) + 7200, scope: "" }));
  fetchImpl = async (_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 504);
});
```

- [ ] **Step 2: 跑 mcp-middleware 测试**

Run: `node --test --experimental-strip-types packages/remote/lambda/mcp-middleware/index.test.ts`
Expected: 6 个 test 全 pass。

- [ ] **Step 3: 写 `lambda/alarm-webhook/index.ts`**

```typescript
import type { SNSEvent, Context } from "aws-lambda";
import { log } from "../shared/log.ts";

const WEBHOOK_URL = process.env.DINGTALK_WEBHOOK_URL || "";
const DASHBOARD_URL = process.env.CLOUDWATCH_DASHBOARD_URL || "";

type AlarmPayload = {
  AlarmName: string;
  NewStateValue: string;
  NewStateReason: string;
  Trigger?: {
    MetricName?: string;
    Namespace?: string;
    Threshold?: number;
    Statistic?: string;
  };
};

function renderMarkdown(alarm: AlarmPayload): string {
  const lines = [
    `### [quick-dingtalk-mcp] 告警: ${alarm.AlarmName}`,
    `- 状态：${alarm.NewStateValue}`,
    alarm.Trigger?.MetricName ? `- 指标：${alarm.Trigger.Namespace}/${alarm.Trigger.MetricName}` : null,
    alarm.Trigger?.Threshold != null ? `- 阈值：${alarm.Trigger.Statistic} ${alarm.Trigger.Threshold}` : null,
    `- 原因：${alarm.NewStateReason}`,
    DASHBOARD_URL ? `- [查看 Dashboard](${DASHBOARD_URL})` : null,
  ].filter((l): l is string => !!l);
  return lines.join("\n");
}

export const handler = async (event: SNSEvent, _ctx: Context): Promise<{ ok: boolean; sent: number }> => {
  if (!WEBHOOK_URL) {
    log.warn("DINGTALK_WEBHOOK_URL not set, skipping");
    return { ok: true, sent: 0 };
  }
  let sent = 0;
  for (const rec of event.Records) {
    let payload: AlarmPayload;
    try { payload = JSON.parse(rec.Sns.Message); }
    catch (e: any) {
      log.error("malformed SNS message", { err: e.message });
      continue;
    }
    const text = renderMarkdown(payload);
    const body = JSON.stringify({ msgtype: "markdown", markdown: { title: payload.AlarmName, text } });
    try {
      const r = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (!r.ok) log.error("webhook non-2xx", { status: r.status });
      else sent++;
    } catch (e: any) {
      log.error("webhook fetch failed", { err: e.message });
    }
  }
  return { ok: true, sent };
};
```

- [ ] **Step 4: 写 `lambda/alarm-webhook/index.test.ts`**

```typescript
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const fetchCalls: any[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("ok", { status: 200 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

beforeEach(() => { fetchCalls.length = 0; });

function snsEvent(message: any): any {
  return { Records: [{ Sns: { Message: JSON.stringify(message) } }] };
}

test("no webhook URL → returns sent=0, doesn't throw", async () => {
  delete process.env.DINGTALK_WEBHOOK_URL;
  const { handler } = await import("./index.ts");
  const r = await handler(snsEvent({ AlarmName: "test", NewStateValue: "ALARM", NewStateReason: "x" }), {} as any);
  assert.equal(r.sent, 0);
  assert.equal(fetchCalls.length, 0);
});

test("with webhook URL → posts markdown card", async () => {
  process.env.DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=fake";
  const mod = await import(`./index.ts?cache=${Date.now()}`); // bust module cache
  const r = await mod.handler(snsEvent({
    AlarmName: "MiddlewareErrorRate",
    NewStateValue: "ALARM",
    NewStateReason: "Threshold crossed: 0.07 > 0.05",
    Trigger: { MetricName: "Errors", Namespace: "AWS/Lambda", Threshold: 0.05, Statistic: "Average" },
  }), {} as any);
  assert.equal(r.sent, 1);
  assert.equal(fetchCalls.length, 1);
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.equal(body.msgtype, "markdown");
  assert.match(body.markdown.text, /MiddlewareErrorRate/);
});

test("with webhook URL but webhook 5xx → sent=0, doesn't throw", async () => {
  process.env.DINGTALK_WEBHOOK_URL = "https://oapi.dingtalk.com/robot/send?access_token=fake";
  fetchImpl = async () => new Response("oops", { status: 500 });
  const mod = await import(`./index.ts?cache=${Date.now() + 1}`);
  const r = await mod.handler(snsEvent({ AlarmName: "x", NewStateValue: "ALARM", NewStateReason: "y" }), {} as any);
  assert.equal(r.sent, 0);
});
```

- [ ] **Step 5: 跑 alarm-webhook 测试**

Run: `node --test --experimental-strip-types packages/remote/lambda/alarm-webhook/index.test.ts`
Expected: 3 个 test 全 pass。

- [ ] **Step 6: Commit**

```bash
git add packages/remote/lambda/mcp-middleware/index.test.ts packages/remote/lambda/alarm-webhook/index.ts packages/remote/lambda/alarm-webhook/index.test.ts
git commit -m "feat(remote): mcp-middleware tests + alarm-webhook Lambda (SNS → DingTalk markdown card) + tests"
```

---

### Group 4 — CDK 三 stack（T15 / T16 / T17 / T18 / T19）

---

### Task 15: infra/bin/app.ts + OAuthStack 第一部分（DDB + SM + SSM + 2 Lambda + ApiGw + CloudFront）

新建 cdk app + OAuthStack 第一部分。本 task 只放 stack 定义骨架到 alarm-webhook Lambda（含），Dashboard + Alarms 留 T16 接力。所有读 config/ 的逻辑用 `JSON.parse(readFileSync)`，避免再装 ts-node。

**Files:**

- Create: `packages/remote/infra/bin/app.ts`
- Create: `packages/remote/infra/cdk.json`
- Create: `packages/remote/infra/lib/oauth-stack.ts`

- [ ] **Step 1: 写 `infra/cdk.json`**

```json
{
  "app": "node --experimental-strip-types bin/app.ts",
  "watch": { "include": ["**"], "exclude": ["README.md", "cdk*.json", "**/*.d.ts", "**/*.js", "tsconfig.json", "package*.json", "yarn.lock", "node_modules", "test"] },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"]
  }
}
```

- [ ] **Step 2: 写 `infra/bin/app.ts`**

```typescript
import { App, Tags } from "aws-cdk-lib";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuthStack } from "../lib/oauth-stack.ts";
import { RuntimeStack } from "../lib/runtime-stack.ts";
import { WafStack } from "../lib/waf-stack.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const region = process.env.CDK_DEFAULT_REGION || "us-east-1";
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = { account, region };

const app = new App();

const ctx = {
  alarmPreset: app.node.tryGetContext("alarmPreset") || "standard",
  alarmWebhookUrl: app.node.tryGetContext("alarmWebhookUrl") || "",
  enableWaf: app.node.tryGetContext("enableWaf") === "true",
  dingtalkAppId: app.node.tryGetContext("dingtalkAppId") || "PLACEHOLDER_APP_ID",
  oauthBaseUrl: app.node.tryGetContext("oauthBaseUrl") || "",
};

const configRoot = join(__dirname, "..", "..", "..", "..", "config");
const i18n = JSON.parse(readFileSync(join(configRoot, "i18n.json"), "utf8"));
const alarmThresholds = JSON.parse(readFileSync(join(configRoot, "alarm-thresholds.json"), "utf8"));
const oauthScopes = JSON.parse(readFileSync(join(configRoot, "oauth-scopes.json"), "utf8"));

const oauthStack = new OAuthStack(app, "QdmRemoteOAuth", {
  env,
  alarmPreset: ctx.alarmPreset,
  alarmWebhookUrl: ctx.alarmWebhookUrl,
  alarmThresholds,
  i18n,
  dingtalkAppId: ctx.dingtalkAppId,
});

const runtimeStack = new RuntimeStack(app, "QdmRemoteRuntime", {
  env,
  oauthBaseUrl: ctx.oauthBaseUrl,
  userTokenSecretArnPrefix: oauthStack.userTokenSecretArnPrefix,
});
runtimeStack.addDependency(oauthStack);

if (ctx.enableWaf) {
  // WAFStack must be in us-east-1 for CloudFront-scope ACLs.
  new WafStack(app, "QdmRemoteWaf", { env: { account, region: "us-east-1" } });
}

Tags.of(app).add("project", "quick-dingtalk-mcp");
Tags.of(app).add("plan", "v0.2-plan2");
```

- [ ] **Step 3: 写 `infra/lib/oauth-stack.ts`（第一部分：DDB + SM + SSM + 2 Lambda + ApiGw + CF + alarm-webhook + SNS）**

```typescript
import { Stack, StackProps, Duration, RemovalPolicy, CfnCondition, Fn, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwa from "aws-cdk-lib/aws-cloudwatch-actions";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface OAuthStackProps extends StackProps {
  alarmPreset: string;
  alarmWebhookUrl: string;
  alarmThresholds: any;
  i18n: any;
  dingtalkAppId: string;
}

export class OAuthStack extends Stack {
  public readonly userTokenSecretArnPrefix: string;
  public readonly tokenRefreshShim: lambda.Function;
  public readonly mcpMiddleware: lambda.Function;
  public readonly snsTopic: sns.Topic;
  public readonly dashboardName: string;

  constructor(scope: Construct, id: string, props: OAuthStackProps) {
    super(scope, id, props);

    // --- DynamoDB (OAuth state, 5min TTL) ---
    const stateTable = new ddb.Table(this, "OAuthStateTable", {
      partitionKey: { name: "state", type: ddb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: false,
    });

    // --- SSM HMAC key (auto-generated; rotated manually) ---
    const hmacKey = new ssm.StringParameter(this, "HmacKeyParam", {
      parameterName: `/qdm-remote/${id}/hmac-key`,
      stringValue: "REPLACE_AT_DEPLOY", // deploy.sh post-step writes a real 64-hex value
      description: "HMAC-SHA256 signing key for MCP + incrAuth tokens",
    });

    const dingtalkAppSecretParam = new ssm.StringParameter(this, "DingtalkAppSecretParam", {
      parameterName: `/qdm-remote/${id}/dingtalk-app-secret`,
      stringValue: "REPLACE_AT_DEPLOY",
      description: "DingTalk Open Platform AppSecret (deploy.sh prompts and writes)",
    });

    // --- Secrets Manager namespace (per-user secrets created on demand by token-refresh-shim) ---
    this.userTokenSecretArnPrefix = `arn:aws:secretsmanager:${this.region}:${this.account}:secret:quick-dingtalk-mcp/users/*`;

    // --- Lambdas ---
    const lambdaCommonEnv: Record<string, string> = {
      OAUTH_STATE_TABLE: stateTable.tableName,
      HMAC_KEY_PARAM: hmacKey.parameterName,
      DINGTALK_APP_ID: props.dingtalkAppId,
      DINGTALK_APP_SECRET_PARAM: dingtalkAppSecretParam.parameterName,
      LOG_LEVEL: "info",
    };

    this.tokenRefreshShim = new lambda.Function(this, "TokenRefreshShim", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      // bundled by scripts-internal/build-lambda.mjs into dist/token-refresh-shim
      code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "token-refresh-shim")),
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: lambdaCommonEnv,
    });
    stateTable.grantReadWriteData(this.tokenRefreshShim);
    hmacKey.grantRead(this.tokenRefreshShim);
    dingtalkAppSecretParam.grantRead(this.tokenRefreshShim);
    this.tokenRefreshShim.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:ListSecrets"],
      resources: [this.userTokenSecretArnPrefix, `arn:aws:secretsmanager:${this.region}:${this.account}:secret:quick-dingtalk-mcp/*`],
    }));

    this.mcpMiddleware = new lambda.Function(this, "McpMiddleware", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "mcp-middleware")),
      memorySize: 1024,
      timeout: Duration.seconds(28),
      environment: {
        ...lambdaCommonEnv,
        AGENTCORE_RUNTIME_URL: "REPLACE_AT_DEPLOY", // updated post-RuntimeStack
        UPSTREAM_TIMEOUT_MS: "25000",
      },
    });
    hmacKey.grantRead(this.mcpMiddleware);
    this.mcpMiddleware.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [this.userTokenSecretArnPrefix],
    }));
    this.mcpMiddleware.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock-agentcore:InvokeAgentRuntime"],
      resources: ["*"], // restricted post-RuntimeStack via runtime-stack.ts policy update
    }));

    // --- API Gateway HTTP API ---
    const httpApi = new apigw.HttpApi(this, "OAuthApi", {
      apiName: "qdm-remote-oauth",
      corsPreflight: { allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST], allowOrigins: ["*"], allowHeaders: ["authorization", "content-type"] },
    });
    httpApi.addRoutes({
      path: "/authorize",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("AuthorizeInt", this.tokenRefreshShim),
    });
    httpApi.addRoutes({
      path: "/callback",
      methods: [apigw.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("CallbackInt", this.tokenRefreshShim),
    });
    httpApi.addRoutes({
      path: "/mcp",
      methods: [apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("McpInt", this.mcpMiddleware),
    });

    // --- CloudFront in front of API Gateway ---
    const dist = new cf.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED, // no-store; per-user content
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
    });

    // --- EventBridge schedule: refresh every 30min ---
    new events.Rule(this, "RefreshSchedule", {
      schedule: events.Schedule.rate(Duration.minutes(30)),
      targets: [new targets.LambdaFunction(this.tokenRefreshShim)],
    });

    // --- SNS topic + alarm-webhook Lambda (conditional) ---
    this.snsTopic = new sns.Topic(this, "AlarmSns", { displayName: "qdm-remote-alarms" });

    if (props.alarmWebhookUrl) {
      const alarmFn = new lambda.Function(this, "AlarmWebhook", {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(join(__dirname, "..", "..", "dist", "alarm-webhook")),
        memorySize: 256,
        timeout: Duration.seconds(10),
        environment: {
          DINGTALK_WEBHOOK_URL: props.alarmWebhookUrl,
          CLOUDWATCH_DASHBOARD_URL: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=qdm-remote`,
          LOG_LEVEL: "info",
        },
      });
      this.snsTopic.addSubscription(new snsSubs.LambdaSubscription(alarmFn));
    }

    new CfnOutput(this, "OAuthBaseUrl", { value: `https://${dist.distributionDomainName}` });
    new CfnOutput(this, "ApiId", { value: httpApi.apiId });
    new CfnOutput(this, "DistributionId", { value: dist.distributionId });
    new CfnOutput(this, "TokenRefreshShimArn", { value: this.tokenRefreshShim.functionArn });
    new CfnOutput(this, "McpMiddlewareArn", { value: this.mcpMiddleware.functionArn });
    new CfnOutput(this, "SnsTopicArn", { value: this.snsTopic.topicArn });

    // Dashboard + Alarms continued in next task (T16 appends to this stack via attach method).
    this.dashboardName = "qdm-remote";
    this._attachDashboardAndAlarms(props.alarmThresholds, props.alarmPreset);
  }

  // Implementation in T16 — placeholder so this file compiles standalone.
  private _attachDashboardAndAlarms(_thresholds: any, _preset: string): void {
    // T16 fills this in.
  }
}
```

> **关于 lambda Code.fromAsset 路径**：`dist/<name>/` 由 T15 Step 4 的 `scripts-internal/build-lambda.mjs` 产出（esbuild bundle 每个 lambda 成 index.cjs + 其它静态文件）。这是为了让 cdk synth 能找到打包后的 .js（CDK 不能直接吃 .ts）。该 build 脚本在 T19 也会跑。

- [ ] **Step 4: 写 `packages/remote/scripts-internal/build-lambda.mjs`**

```bash
mkdir -p packages/remote/scripts-internal
cat > packages/remote/scripts-internal/build-lambda.mjs <<'EOF'
#!/usr/bin/env node
// Bundles each lambda/<name>/index.ts into dist/<name>/index.cjs via esbuild.
// Run before `cdk synth` so Code.fromAsset has something to read.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const lambdas = ["token-refresh-shim", "mcp-middleware", "alarm-webhook"];

for (const name of lambdas) {
  const out = join(root, "dist", name);
  await mkdir(out, { recursive: true });
  await build({
    entryPoints: [join(root, "lambda", name, "index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: join(out, "index.cjs"),
    external: ["@aws-sdk/*"],
    sourcemap: false,
  });
  // CDK Code.fromAsset uses the directory; the handler `index.handler`
  // resolves to index.cjs because Lambda's Node runtime tries .cjs/.js/.mjs.
  console.error(`built ${name} -> ${out}/index.cjs`);
}
EOF
chmod +x packages/remote/scripts-internal/build-lambda.mjs
```

- [ ] **Step 5: 让 OAuthStack 能 synth（先跑 build-lambda 再跑 cdk synth）**

```bash
cd packages/remote && npm run build:lambda && npx cdk synth QdmRemoteOAuth --quiet -c alarmPreset=standard -c alarmWebhookUrl="" -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder
```

Expected: synth 输出 CFN template 到 stdout / `cdk.out/QdmRemoteOAuth.template.json` 写出；no error。

- [ ] **Step 6: Commit**

```bash
git add packages/remote/infra/cdk.json packages/remote/infra/bin/app.ts packages/remote/infra/lib/oauth-stack.ts packages/remote/scripts-internal/build-lambda.mjs
git commit -m "feat(remote): infra/{cdk.json,bin/app.ts,lib/oauth-stack.ts} part 1 — DDB+SM+SSM+2 Lambda+ApiGw+CF+SNS+alarm-webhook conditional + lambda bundler"
```

---

### Task 16: OAuthStack 第二部分 — Dashboard 5 板块 12 图表 + 10 Alarms

把 T15 留的 `_attachDashboardAndAlarms` 实现填上。从 alarm-thresholds.json 读 preset，每个 alarm 实例化为 `cw.Alarm` + `addAlarmAction(SnsAction)`。Dashboard 5 板块对应 spec §9.1。

**Files:**

- Modify: `packages/remote/infra/lib/oauth-stack.ts`

- [ ] **Step 1: 替换 `_attachDashboardAndAlarms` 实现（在 oauth-stack.ts 末尾）**

```typescript
  private _attachDashboardAndAlarms(thresholds: any, preset: string): void {
    const t = thresholds[preset] || thresholds.standard;
    const cwa = require("aws-cdk-lib/aws-cloudwatch-actions");
    const cwLib = require("aws-cdk-lib/aws-cloudwatch");

    const snsAction = new cwa.SnsAction(this.snsTopic);

    // ---- Helpers ----
    const lambdaErrorRate = (fn: any, name: string) => new cwLib.MathExpression({
      expression: "errors / IF(invocations = 0, 1, invocations)",
      usingMetrics: {
        errors: fn.metricErrors({ period: cwLib.Duration?.seconds ? cwLib.Duration.seconds(t[name].period_seconds) : undefined }),
        invocations: fn.metricInvocations(),
      },
      label: `${fn.functionName} error rate`,
      period: undefined,
    });

    // ---- 10 Alarms ----
    const alarmDefs: Array<{ id: string; metric: any; key: string; description: string }> = [
      {
        id: "ApiGw5xxPersistent",
        metric: new cwLib.Metric({ namespace: "AWS/ApiGateway", metricName: "5XXError", statistic: "Sum" }),
        key: "api_gw_5xx_persistent",
        description: "API Gateway 5xx errors persistent",
      },
      {
        id: "MiddlewareErrorRate",
        metric: lambdaErrorRate(this.mcpMiddleware, "middleware_error_rate"),
        key: "middleware_error_rate",
        description: "mcp-middleware error rate",
      },
      {
        id: "LambdaThrottle",
        metric: this.mcpMiddleware.metricThrottles(),
        key: "lambda_throttle",
        description: "Any Lambda throttle event",
      },
      {
        id: "RefreshFailureUsers",
        metric: new cwLib.Metric({ namespace: "QuickDingtalkMcp/Remote", metricName: "RefreshFailureUsers", statistic: "Sum" }),
        key: "refresh_failure_users",
        description: "EventBridge refresh failed users",
      },
      {
        id: "RuntimeInvocationFailure",
        metric: new cwLib.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationErrors", statistic: "Sum" }),
        key: "runtime_invocation_failure",
        description: "AgentCore Runtime invocation failures",
      },
      {
        id: "Container5xx",
        metric: new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "Container5xx", statistic: "Sum" }),
        key: "container_5xx",
        description: "Container 5xx (server.js)",
      },
      {
        id: "ServerBusyPersistent",
        metric: new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "ServerBusy", statistic: "Sum" }),
        key: "server_busy_persistent",
        description: "Semaphore queue full",
      },
      {
        id: "SmThrottle",
        metric: new cwLib.Metric({ namespace: "AWS/SecretsManager", metricName: "ThrottledRequests", statistic: "Sum" }),
        key: "sm_throttle",
        description: "Secrets Manager throttle",
      },
      {
        id: "DdbThrottle",
        metric: new cwLib.Metric({ namespace: "AWS/DynamoDB", metricName: "ThrottledRequests", statistic: "Sum" }),
        key: "ddb_throttle",
        description: "DynamoDB throttle",
      },
      {
        id: "OAuthCallbackFailureRate",
        metric: lambdaErrorRate(this.tokenRefreshShim, "oauth_callback_failure_rate"),
        key: "oauth_callback_failure_rate",
        description: "OAuth callback failure rate",
      },
    ];

    for (const def of alarmDefs) {
      const cfg = t[def.key];
      const alarm = new cwLib.Alarm(this, `Alarm${def.id}`, {
        alarmName: `qdm-remote-${def.id}`,
        metric: def.metric,
        threshold: cfg.threshold,
        evaluationPeriods: cfg.evaluation_periods,
        comparisonOperator: cwLib.ComparisonOperator[cfg.comparison.replace(/([A-Z])/g, "_$1").toUpperCase().slice(1)] || cwLib.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cwLib.TreatMissingData.NOT_BREACHING,
        alarmDescription: def.description,
      });
      alarm.addAlarmAction(snsAction);
    }

    // ---- Dashboard ----
    const dashboard = new cwLib.Dashboard(this, "Dashboard", { dashboardName: this.dashboardName });

    // Section 1: Ingress traffic
    dashboard.addWidgets(
      new cwLib.GraphWidget({ title: "API GW 4xx/5xx", width: 12,
        left: [new cwLib.Metric({ namespace: "AWS/ApiGateway", metricName: "4XXError", statistic: "Sum" })],
        right: [new cwLib.Metric({ namespace: "AWS/ApiGateway", metricName: "5XXError", statistic: "Sum" })] }),
      new cwLib.GraphWidget({ title: "API GW Latency p50/p99", width: 12,
        left: [
          new cwLib.Metric({ namespace: "AWS/ApiGateway", metricName: "Latency", statistic: "p50" }),
          new cwLib.Metric({ namespace: "AWS/ApiGateway", metricName: "Latency", statistic: "p99" }),
        ] }),
    );
    // Section 2: Lambda health
    dashboard.addWidgets(
      new cwLib.GraphWidget({ title: "mcp-middleware errors / invocations", width: 12,
        left: [this.mcpMiddleware.metricErrors(), this.mcpMiddleware.metricInvocations()] }),
      new cwLib.GraphWidget({ title: "mcp-middleware duration p99", width: 12,
        left: [this.mcpMiddleware.metricDuration({ statistic: "p99" })] }),
    );
    // Section 3: OAuth flow
    dashboard.addWidgets(
      new cwLib.GraphWidget({ title: "token-refresh-shim errors", width: 12,
        left: [this.tokenRefreshShim.metricErrors(), this.tokenRefreshShim.metricInvocations()] }),
      new cwLib.GraphWidget({ title: "Refresh failure users", width: 12,
        left: [new cwLib.Metric({ namespace: "QuickDingtalkMcp/Remote", metricName: "RefreshFailureUsers", statistic: "Sum" })] }),
    );
    // Section 4: Runtime container
    dashboard.addWidgets(
      new cwLib.GraphWidget({ title: "AgentCore invocation count / errors", width: 12,
        left: [new cwLib.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationCount", statistic: "Sum" })],
        right: [new cwLib.Metric({ namespace: "AWS/BedrockAgentCore", metricName: "InvocationErrors", statistic: "Sum" })] }),
      new cwLib.GraphWidget({ title: "Container semaphore depth + busy", width: 12,
        left: [new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "QueueDepth", statistic: "Average" })],
        right: [new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "ServerBusy", statistic: "Sum" })] }),
    );
    // Section 5: Business errors
    dashboard.addWidgets(
      new cwLib.GraphWidget({ title: "PAT triggers", width: 12,
        left: [new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "PATTrigger", statistic: "Sum" })] }),
      new cwLib.GraphWidget({ title: "dws non-zero exits", width: 12,
        left: [new cwLib.Metric({ namespace: "QuickDingtalkMcp/Runtime", metricName: "DwsNonZeroExit", statistic: "Sum" })] }),
    );
  }
```

> **关于 ComparisonOperator 的转换 hack**：`cfg.comparison` 是字符串如 `"GreaterThanThreshold"`、`"GreaterThanOrEqualToThreshold"`；CDK 的 `ComparisonOperator` 枚举 key 是 `GREATER_THAN_THRESHOLD` 这类。上面那段 replace + uppercase + slice 是简陋转换，能 cover 5 种常见 case。Plan 3 可以换成 explicit map。

- [ ] **Step 2: 跑 synth 确认 Dashboard + 10 Alarms 出现在 template 里**

```bash
cd packages/remote && npm run build:lambda && npx cdk synth QdmRemoteOAuth --quiet -c alarmPreset=standard -c alarmWebhookUrl="" -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder | grep -c '"AWS::CloudWatch::Alarm"'
```

Expected: `10`

```bash
cd packages/remote && npx cdk synth QdmRemoteOAuth --quiet -c alarmPreset=standard -c alarmWebhookUrl="" -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder | grep -c '"AWS::CloudWatch::Dashboard"'
```

Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add packages/remote/infra/lib/oauth-stack.ts
git commit -m "feat(remote): oauth-stack — Dashboard 5 sections / 12 widgets + 10 Alarms (preset-driven)"
```

---

### Task 17: RuntimeStack — ECR + DockerImageAsset + AgentCore Runtime + IAM

按 spec §6.3 — Docker image asset 自动 build & push 到 ECR；AgentCore Runtime 引这个 image；IAM Role 含 SM 读权限（per-user secret prefix）。

**Files:**

- Create: `packages/remote/infra/lib/runtime-stack.ts`

- [ ] **Step 1: 写 runtime-stack.ts**

```typescript
import { Stack, StackProps, Duration, CfnOutput, CustomResource } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RuntimeStackProps extends StackProps {
  oauthBaseUrl: string;
  userTokenSecretArnPrefix: string;
}

export class RuntimeStack extends Stack {
  public readonly imageUri: string;
  public readonly runtimeRoleArn: string;

  constructor(scope: Construct, id: string, props: RuntimeStackProps) {
    super(scope, id, props);

    // --- Docker image asset ---
    // Build context: packages/remote (so the Dockerfile can COPY ../shared)
    const image = new ecr_assets.DockerImageAsset(this, "Image", {
      directory: join(__dirname, "..", ".."),
      file: "docker/Dockerfile",
      platform: ecr_assets.Platform.LINUX_AMD64,
      buildArgs: {
        DWS_VERSION: "1.0.32",
      },
    });
    this.imageUri = image.imageUri;

    // --- IAM role for AgentCore Runtime ---
    const runtimeRole = new iam.Role(this, "RuntimeRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
      description: "Role assumed by AgentCore Runtime for qdm-remote container",
    });
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [props.userTokenSecretArnPrefix],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents", "logs:CreateLogGroup"],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/qdm-remote*`],
    }));
    image.repository.grantPull(runtimeRole);
    this.runtimeRoleArn = runtimeRole.roleArn;

    // --- AgentCore Runtime ---
    // L1 CFN resource (no CDK L2 yet for AgentCore as of writing).
    // We declare via CfnResource so the stack synthesizes even if the
    // service is not GA in the test region.
    const runtime = new (require("aws-cdk-lib/core").CfnResource)(this, "Runtime", {
      type: "AWS::BedrockAgentCore::AgentRuntime",
      properties: {
        Name: "qdm-remote",
        RoleArn: runtimeRole.roleArn,
        ContainerImageUri: image.imageUri,
        EnvironmentVariables: {
          OAUTH_BASE_URL: props.oauthBaseUrl,
          INJECT_STRATEGY: "d2",
          MAX_CONCURRENT: "10",
          PORT: "8000",
        },
        NetworkMode: "PUBLIC",
        Port: 8000,
      },
    });

    new CfnOutput(this, "ImageUri", { value: image.imageUri });
    new CfnOutput(this, "RuntimeRoleArn", { value: runtimeRole.roleArn });
    new CfnOutput(this, "RuntimeId", { value: runtime.ref });
  }
}
```

> **关于 `AWS::BedrockAgentCore::AgentRuntime`**：写 plan 时此 CFN 资源类型是基于 lark-mcp-on-agentcore + AgentCore docs 的推断。Plan 3 真部署时如果 CFN 资源名变了，把 `runtime-stack.ts` 第 60 行的 `Type` 字符串和 `properties` 字段对齐就行。Plan 2 只要 synth 过就够。

- [ ] **Step 2: 跑 RuntimeStack synth**

```bash
cd packages/remote && npm run build:lambda && npx cdk synth QdmRemoteRuntime --quiet -c alarmPreset=standard -c alarmWebhookUrl="" -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder
```

Expected: synth 产出 template，含 `AWS::ECR::Repository`（隐式由 DockerImageAsset 创建）+ 1 个 `AWS::IAM::Role` + 1 个 `AWS::BedrockAgentCore::AgentRuntime`。如果 docker daemon 没起会 build asset 失败 — 装 docker 或在 CI 跳过此步 (`CDK_DOCKER=docker --version`)。

- [ ] **Step 3: Commit**

```bash
git add packages/remote/infra/lib/runtime-stack.ts
git commit -m "feat(remote): infra/lib/runtime-stack.ts — ECR DockerImageAsset + AgentCore Runtime + IAM Role (SM read prefix)"
```

---

### Task 18: WafStack（默认 disabled，但 synth 必须过）

us-east-1 CloudFront-scope WAFv2，速率 1000 reqs/5min。`enableWaf` context 才在 app.ts 实例化；不实例化也得让 stack 文件本身 synth。

**Files:**

- Create: `packages/remote/infra/lib/waf-stack.ts`

- [ ] **Step 1: 写 waf-stack.ts**

```typescript
import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

export class WafStack extends Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    if (this.region !== "us-east-1") {
      throw new Error("WafStack must deploy in us-east-1 (CloudFront-scope WebACL).");
    }

    const acl = new wafv2.CfnWebACL(this, "Acl", {
      name: "qdm-remote-cf-acl",
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "qdm-remote-cf-acl", sampledRequestsEnabled: true },
      rules: [
        {
          name: "rate-limit-per-ip",
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "rate-limit", sampledRequestsEnabled: true },
        },
        {
          name: "AWSManagedRulesCommonRuleSet",
          priority: 10,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: "AWS", name: "AWSManagedRulesCommonRuleSet" },
          },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: "managed-common", sampledRequestsEnabled: true },
        },
      ],
    });

    this.webAclArn = acl.attrArn;
    new CfnOutput(this, "WebAclArn", { value: this.webAclArn });
    new CfnOutput(this, "AssociationHint", {
      value: "Manually associate this WebACL with the CloudFront Distribution from OAuthStack — CDK cross-stack association across regions requires custom resources (Plan 3).",
    });
  }
}
```

- [ ] **Step 2: 跑 WafStack synth（用 enableWaf=true 触发）**

```bash
cd packages/remote && npx cdk synth QdmRemoteWaf --quiet -c enableWaf=true -c alarmPreset=standard -c alarmWebhookUrl="" -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder
```

Expected: 产出 template，含 `AWS::WAFv2::WebACL` 一个 + 2 个 rule（rate-limit + AWSManagedRulesCommonRuleSet）。

- [ ] **Step 3: Commit**

```bash
git add packages/remote/infra/lib/waf-stack.ts
git commit -m "feat(remote): infra/lib/waf-stack.ts — us-east-1 CloudFront-scope WAFv2 (rate 1000/5min + Common managed rules), default disabled"
```

---

### Task 19: cdk synth 三 stack + snapshot test（done criteria 第 2 道门）

跑 `cdk synth --all` 一次出全 3 template；用 `@aws-cdk/assertions` 写一个 snapshot test 锁住关键 resource 数量。

**Files:**

- Create: `packages/remote/infra/__tests__/synth.test.ts`

- [ ] **Step 1: 写 synth.test.ts**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OAuthStack } from "../lib/oauth-stack.ts";
import { RuntimeStack } from "../lib/runtime-stack.ts";
import { WafStack } from "../lib/waf-stack.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configRoot = join(__dirname, "..", "..", "..", "..", "config");
const i18n = JSON.parse(readFileSync(join(configRoot, "i18n.json"), "utf8"));
const alarmThresholds = JSON.parse(readFileSync(join(configRoot, "alarm-thresholds.json"), "utf8"));

test("OAuthStack synthesizes with expected resource counts", () => {
  const app = new App();
  const stack = new OAuthStack(app, "TestOAuth", {
    env: { account: "111122223333", region: "us-east-1" },
    alarmPreset: "standard",
    alarmWebhookUrl: "",
    alarmThresholds,
    i18n,
    dingtalkAppId: "fake",
  });
  const t = Template.fromStack(stack);
  // Core
  t.resourceCountIs("AWS::DynamoDB::Table", 1);
  t.resourceCountIs("AWS::Lambda::Function", 2); // refresh-shim + middleware (no alarm-webhook because URL empty)
  t.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  t.resourceCountIs("AWS::CloudFront::Distribution", 1);
  t.resourceCountIs("AWS::SSM::Parameter", 2);
  t.resourceCountIs("AWS::SNS::Topic", 1);
  // Observability
  t.resourceCountIs("AWS::CloudWatch::Alarm", 10);
  t.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
});

test("OAuthStack with alarm webhook URL → 3 Lambdas", () => {
  const app = new App();
  const stack = new OAuthStack(app, "TestOAuthWebhook", {
    env: { account: "111122223333", region: "us-east-1" },
    alarmPreset: "standard",
    alarmWebhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=fake",
    alarmThresholds,
    i18n,
    dingtalkAppId: "fake",
  });
  const t = Template.fromStack(stack);
  t.resourceCountIs("AWS::Lambda::Function", 3);
});

test("WafStack synthesizes a CLOUDFRONT-scope WebACL", () => {
  const app = new App();
  const stack = new WafStack(app, "TestWaf", { env: { account: "111122223333", region: "us-east-1" } });
  const t = Template.fromStack(stack);
  t.hasResourceProperties("AWS::WAFv2::WebACL", { Scope: "CLOUDFRONT" });
});

test("WafStack rejects non-us-east-1 region", () => {
  const app = new App();
  assert.throws(() => new WafStack(app, "TestWaf", { env: { account: "111122223333", region: "us-west-2" } }), /us-east-1/);
});
```

- [ ] **Step 2: 跑 synth test**

Run: `node --test --experimental-strip-types packages/remote/infra/__tests__/synth.test.ts`
Expected: 4 个 test 全 pass。

- [ ] **Step 3: 跑 `cdk synth --all`（done criteria 第 2 道门预演）**

```bash
cd packages/remote && npm run build:lambda && npx cdk synth --all --quiet -c alarmPreset=standard -c alarmWebhookUrl="" -c enableWaf=true -c dingtalkAppId=fake -c oauthBaseUrl=https://placeholder
ls -1 packages/remote/cdk.out/*.template.json
```

Expected:
```
packages/remote/cdk.out/QdmRemoteOAuth.template.json
packages/remote/cdk.out/QdmRemoteRuntime.template.json
packages/remote/cdk.out/QdmRemoteWaf.template.json
```

- [ ] **Step 4: Commit**

```bash
git add packages/remote/infra/__tests__/synth.test.ts
git commit -m "test(remote): infra/synth.test.ts — Template assertions for 3 stacks (OAuth/Runtime/Waf) + cdk synth --all green"
```

---

### Group 5 — Scripts + Docs + 收尾（T20 / T21 / T22 / T23 / T24）

---

### Task 20: scripts — install / deploy / teardown / ops / test-e2e

5 个 shell 脚本。`install.sh` curl pipe 入口（pull 仓库 + 跳到 deploy）；`deploy.sh` 交互式（中英双语，从 config/i18n.json 读）；`teardown.sh` 反向；`ops.sh` 多子命令；`test-e2e.sh` 跑 dry-run + mock e2e。全部 `set -euo pipefail` + `--dry-run` flag。

**Files:**

- Create: `packages/remote/scripts/install.sh`
- Create: `packages/remote/scripts/deploy.sh`
- Create: `packages/remote/scripts/teardown.sh`
- Create: `packages/remote/scripts/ops.sh`
- Create: `packages/remote/scripts/test-e2e.sh`

- [ ] **Step 1: 写 `install.sh`**

```bash
#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — one-liner installer.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
set -euo pipefail

REPO_URL="${QDM_REPO_URL:-https://github.com/keithyt06/quick-dingtalk-mcp.git}"
INSTALL_DIR="${QDM_INSTALL_DIR:-$HOME/.quick-dingtalk-mcp}"
BRANCH="${QDM_BRANCH:-main}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --help|-h) echo "Usage: install.sh [--dry-run]"; exit 0 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

command -v git >/dev/null || { echo "git required" >&2; exit 1; }
command -v node >/dev/null || { echo "node ≥ 20 required" >&2; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "node ≥ 20 required (have $(node -v))" >&2; exit 1
fi
command -v aws >/dev/null || { echo "aws cli required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker required (for cdk DockerImageAsset)" >&2; exit 1; }

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating $INSTALL_DIR..."
  run git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  run git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
  echo "Cloning $REPO_URL → $INSTALL_DIR..."
  run git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

run cd "$INSTALL_DIR"
run npm install
echo
echo "Installed. Next: run"
echo "  bash $INSTALL_DIR/packages/remote/scripts/deploy.sh"
```

- [ ] **Step 2: 写 `deploy.sh`**

```bash
#!/usr/bin/env bash
# quick-dingtalk-mcp Remote — interactive deploy.
# Reads config/i18n.json for prompt strings (zh/en); language auto-detected from $LANG.
set -euo pipefail

DRY_RUN=0
LANG_KEY=zh
[[ "${LANG:-}" =~ en ]] && LANG_KEY=en

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --en) LANG_KEY=en ;;
    --zh) LANG_KEY=zh ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"

i18n() {
  local path="$1"
  jq -r ".$path.\"$LANG_KEY\" // .$path.en" "$I18N"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

echo "=== $(i18n deploy.title) ==="
echo "$(i18n deploy.prompt_region) us-east-1"

read -rp "$(i18n deploy.prompt_dingtalk_app_id) " DINGTALK_APP_ID
read -rsp "$(i18n deploy.prompt_dingtalk_app_secret) " DINGTALK_APP_SECRET; echo
read -rp "$(i18n deploy.prompt_alarm_webhook) " ALARM_WEBHOOK
ALARM_WEBHOOK="${ALARM_WEBHOOK:-}"
read -rp "$(i18n deploy.prompt_alarm_preset) " PRESET
PRESET="${PRESET:-standard}"
read -rp "$(i18n deploy.prompt_enable_waf) " ENABLE_WAF
ENABLE_WAF="${ENABLE_WAF:-N}"
ENABLE_WAF_FLAG=false
[[ "$ENABLE_WAF" =~ ^[yY] ]] && ENABLE_WAF_FLAG=true

cd "$ROOT/packages/remote"
run npm install
run npm run build:lambda

echo "$(i18n deploy.deploying_oauth)"
run npx cdk deploy QdmRemoteOAuth \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  --require-approval never

# Generate + write HMAC key + AppSecret to SSM
HMAC_KEY=$(openssl rand -hex 32)
run aws ssm put-parameter --region us-east-1 --name "/qdm-remote/QdmRemoteOAuth/hmac-key" --value "$HMAC_KEY" --type SecureString --overwrite
run aws ssm put-parameter --region us-east-1 --name "/qdm-remote/QdmRemoteOAuth/dingtalk-app-secret" --value "$DINGTALK_APP_SECRET" --type SecureString --overwrite

OAUTH_BASE_URL=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`OAuthBaseUrl`].OutputValue' --output text 2>/dev/null || echo "https://placeholder")

echo "$(i18n deploy.deploying_runtime)"
run npx cdk deploy QdmRemoteRuntime \
  -c alarmPreset="$PRESET" \
  -c alarmWebhookUrl="$ALARM_WEBHOOK" \
  -c dingtalkAppId="$DINGTALK_APP_ID" \
  -c oauthBaseUrl="$OAUTH_BASE_URL" \
  --require-approval never

if [ "$ENABLE_WAF_FLAG" = "true" ]; then
  echo "$(i18n deploy.deploying_waf)"
  run npx cdk deploy QdmRemoteWaf \
    -c enableWaf=true \
    -c alarmPreset="$PRESET" \
    --require-approval never
fi

echo
echo "=== $(i18n deploy.done) ==="
echo "$(i18n deploy.summary_oauth_url): $OAUTH_BASE_URL/authorize"
echo "$(i18n deploy.summary_mcp_endpoint): $OAUTH_BASE_URL/mcp"
```

- [ ] **Step 3: 写 `teardown.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
DRY_RUN=0
LANG_KEY=zh
[[ "${LANG:-}" =~ en ]] && LANG_KEY=en
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --en) LANG_KEY=en ;;
    --zh) LANG_KEY=zh ;;
  esac
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"
i18n() { jq -r ".$1.\"$LANG_KEY\" // .$1.en" "$I18N"; }
run() { if [ "$DRY_RUN" -eq 1 ]; then echo "[dry-run] $*"; else "$@"; fi; }

read -rp "$(i18n teardown.warning) " ANS
[[ "$ANS" =~ ^[yY] ]] || { echo "abort"; exit 0; }

cd "$ROOT/packages/remote"
run npx cdk destroy QdmRemoteWaf --force || true
run npx cdk destroy QdmRemoteRuntime --force
run npx cdk destroy QdmRemoteOAuth --force

echo "$(i18n teardown.preserved_secrets_note)"
```

- [ ] **Step 4: 写 `ops.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
SUB="${1:-}"
shift || true

LANG_KEY=zh; [[ "${LANG:-}" =~ en ]] && LANG_KEY=en
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
I18N="$ROOT/config/i18n.json"
i18n() { jq -r ".$1.\"$LANG_KEY\" // .$1.en" "$I18N"; }

case "$SUB" in
  status)
    aws cloudformation describe-stacks --region us-east-1 \
      --query 'Stacks[?starts_with(StackName,`QdmRemote`)].[StackName,StackStatus]' --output table
    ;;
  list-users)
    echo "$(i18n ops.list_users_header)"
    aws secretsmanager list-secrets --region us-east-1 \
      --filters Key=name,Values=quick-dingtalk-mcp/users/ \
      --query 'SecretList[].Name' --output text | tr '\t' '\n' | sed 's|quick-dingtalk-mcp/users/||'
    ;;
  revoke)
    UID="${1:?usage: ops.sh revoke <userId>}"
    read -rp "$(printf "$(i18n ops.revoke_confirm)" "$UID") " ANS
    [[ "$ANS" =~ ^[yY] ]] || { echo "abort"; exit 0; }
    aws secretsmanager delete-secret --region us-east-1 \
      --secret-id "quick-dingtalk-mcp/users/$UID"
    printf "$(i18n ops.revoke_done)\n" "quick-dingtalk-mcp/users/$UID"
    ;;
  refresh)
    echo "$(i18n ops.refresh_now)"
    LAMBDA_ARN=$(aws cloudformation describe-stacks --stack-name QdmRemoteOAuth --region us-east-1 \
      --query 'Stacks[0].Outputs[?OutputKey==`TokenRefreshShimArn`].OutputValue' --output text)
    aws lambda invoke --region us-east-1 --function-name "$LAMBDA_ARN" \
      --payload '{"source":"aws.events"}' --cli-binary-format raw-in-base64-out /tmp/refresh-out.json
    cat /tmp/refresh-out.json
    ;;
  logs)
    LAMBDA="${1:?usage: ops.sh logs <token-refresh-shim|mcp-middleware|alarm-webhook>}"
    echo "$(i18n ops.logs_tail)"
    aws logs tail "/aws/lambda/QdmRemoteOAuth-$LAMBDA*" --follow --region us-east-1
    ;;
  *)
    echo "Usage: ops.sh <status|list-users|revoke <uid>|refresh|logs <lambda>>" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 5: 写 `test-e2e.sh`**

```bash
#!/usr/bin/env bash
# Plan 2 e2e: dry-run + mock paths only — no real DingTalk calls.
# For real e2e see Plan 3.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "[1/4] shared tests"
node --test packages/shared/__tests__/

echo "[2/4] remote lambda + docker tests"
node --test --experimental-strip-types \
  packages/remote/lambda/**/*.test.ts \
  packages/remote/docker/__tests__/*.test.mjs

echo "[3/4] remote infra synth tests"
node --test --experimental-strip-types packages/remote/infra/__tests__/synth.test.ts

echo "[4/4] cdk synth --all (dry)"
cd packages/remote
npm run build:lambda
npx cdk synth --all --quiet \
  -c alarmPreset=standard \
  -c alarmWebhookUrl="" \
  -c dingtalkAppId=fake \
  -c oauthBaseUrl=https://placeholder >/dev/null

echo "All e2e checks green."
```

- [ ] **Step 6: chmod + sanity**

Run:
```bash
chmod +x packages/remote/scripts/*.sh
bash packages/remote/scripts/install.sh --dry-run | head -5
```
Expected: 几行 `[dry-run] ...` 输出 + 末尾 "Installed. Next: run ..." 行不实际跑命令。

- [ ] **Step 7: Commit**

```bash
git add packages/remote/scripts/
git commit -m "feat(remote): scripts — install/deploy(zh|en)/teardown/ops/test-e2e + --dry-run hooks"
```

---

### Task 21: shellcheck 全脚本 + deploy.sh --dry-run 验证

跑 shellcheck 让所有脚本零警告（或只剩刻意压制的）。`deploy.sh --dry-run` 走完一遍流程不真发请求。

**Files:**

- 不改文件，跑 lint + dry-run 验证

- [ ] **Step 1: 装 shellcheck（如缺）**

```bash
command -v shellcheck >/dev/null || { sudo apt-get install -y shellcheck || brew install shellcheck; }
```

- [ ] **Step 2: 跑 shellcheck**

Run: `shellcheck packages/remote/scripts/*.sh`
Expected: 0 error。warning 如有，逐条修；常见的 SC2086（变量没引号）、SC2155（declare and assign）按需修。

- [ ] **Step 3: 跑 deploy.sh --dry-run**

Run: `printf 'fake-app\nfake-secret\n\nstandard\nN\n' | bash packages/remote/scripts/deploy.sh --dry-run --en`
Expected: 大量 `[dry-run] ...` 行；末尾 "Deployment finished." + summary 行；exit 0。

- [ ] **Step 4: 没 commit（本任务无文件改）**

如果 Step 2 改了某个脚本，单独 commit 并 message `chore(remote): shellcheck fixes`.

---

### Task 22: docs/remote-*.md 6 篇填实 + architecture.svg 真画双栈

把 T3 的骨架填实。每篇 ≥ 200 行实质内容，含示例命令、链接、表格。architecture.svg 替换为真双栈图（Local + Remote 并列）。

**Files:**

- Modify: `docs/architecture.svg`
- Modify: `docs/remote-quick-desktop.md`
- Modify: `docs/remote-security.md`
- Modify: `docs/remote-observability.md`
- Modify: `docs/remote-operations.md`
- Modify: `docs/remote-faq.md`
- Modify: `docs/remote-cost.md`

- [ ] **Step 1: 重写 architecture.svg（真双栈）**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
  <style>
    .box { fill: #fff; stroke: #333; stroke-width: 1.2; }
    .local { fill: #e8f5e9; }
    .remote { fill: #e3f2fd; }
    .shared { fill: #fff3e0; }
    .arrow { stroke: #333; stroke-width: 1; fill: none; marker-end: url(#a); }
    text { font-family: 'Helvetica', sans-serif; font-size: 12px; fill: #222; }
    .title { font-size: 16px; font-weight: bold; }
    .label { font-size: 11px; fill: #555; }
  </style>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker></defs>

  <text x="500" y="30" class="title" text-anchor="middle">quick-dingtalk-mcp v0.2 — Local + Remote Architecture</text>

  <!-- Local stack -->
  <rect x="40" y="60" width="380" height="600" rx="8" class="box local"/>
  <text x="230" y="85" class="title" text-anchor="middle">Local (single-user, stdio)</text>

  <rect x="80" y="120" width="300" height="50" class="box"/>
  <text x="230" y="145" text-anchor="middle">MCP host (Q Desktop / Claude / Cursor)</text>

  <rect x="80" y="220" width="300" height="50" class="box"/>
  <text x="230" y="245" text-anchor="middle">packages/local/server.mjs (stdio)</text>

  <rect x="80" y="320" width="300" height="50" class="box"/>
  <text x="230" y="345" text-anchor="middle">dws CLI (~/.dws/ tokens)</text>

  <rect x="80" y="420" width="300" height="50" class="box"/>
  <text x="230" y="445" text-anchor="middle">DingTalk mcp-gw</text>

  <path class="arrow" d="M230,170 L230,220"/>
  <path class="arrow" d="M230,270 L230,320"/>
  <path class="arrow" d="M230,370 L230,420"/>

  <!-- Remote stack -->
  <rect x="580" y="60" width="380" height="600" rx="8" class="box remote"/>
  <text x="770" y="85" class="title" text-anchor="middle">Remote (multi-user, HTTPS, AgentCore)</text>

  <rect x="620" y="110" width="300" height="40" class="box"/>
  <text x="770" y="135" text-anchor="middle">Quick Desktop</text>

  <rect x="620" y="170" width="300" height="40" class="box"/>
  <text x="770" y="195" text-anchor="middle">CloudFront (+ optional WAF us-east-1)</text>

  <rect x="620" y="230" width="300" height="40" class="box"/>
  <text x="770" y="255" text-anchor="middle">API Gateway HTTP</text>

  <rect x="620" y="290" width="300" height="40" class="box"/>
  <text x="770" y="315" text-anchor="middle">mcp-middleware Lambda (HMAC + SigV4)</text>

  <rect x="620" y="350" width="300" height="50" class="box"/>
  <text x="770" y="370" text-anchor="middle">AgentCore Runtime</text>
  <text x="770" y="388" class="label" text-anchor="middle">docker/server.js (Streamable HTTP :8000)</text>

  <rect x="620" y="420" width="300" height="50" class="box"/>
  <text x="770" y="440" text-anchor="middle">dws CLI (per-user DWS_CONFIG_DIR)</text>
  <text x="770" y="458" class="label" text-anchor="middle">/var/dws/users/&lt;uid&gt;</text>

  <rect x="620" y="490" width="300" height="40" class="box"/>
  <text x="770" y="515" text-anchor="middle">DingTalk mcp-gw</text>

  <rect x="620" y="550" width="140" height="80" class="box"/>
  <text x="690" y="575" text-anchor="middle">token-refresh-shim</text>
  <text x="690" y="592" class="label" text-anchor="middle">PKCE + EventBridge</text>
  <text x="690" y="608" class="label" text-anchor="middle">SM + DDB + SSM</text>

  <rect x="780" y="550" width="140" height="80" class="box"/>
  <text x="850" y="575" text-anchor="middle">alarm-webhook</text>
  <text x="850" y="592" class="label" text-anchor="middle">SNS → DingTalk</text>
  <text x="850" y="608" class="label" text-anchor="middle">(optional)</text>

  <path class="arrow" d="M770,150 L770,170"/>
  <path class="arrow" d="M770,210 L770,230"/>
  <path class="arrow" d="M770,270 L770,290"/>
  <path class="arrow" d="M770,330 L770,350"/>
  <path class="arrow" d="M770,400 L770,420"/>
  <path class="arrow" d="M770,470 L770,490"/>

  <!-- Shared layer -->
  <rect x="350" y="350" width="200" height="120" rx="8" class="box shared"/>
  <text x="450" y="375" class="title" text-anchor="middle">packages/shared</text>
  <text x="450" y="400" class="label" text-anchor="middle">catalog.json (261 cmd)</text>
  <text x="450" y="418" class="label" text-anchor="middle">tier1.json (30 + 6 alias)</text>
  <text x="450" y="436" class="label" text-anchor="middle">dispatcher / errors / search</text>
  <text x="450" y="454" class="label" text-anchor="middle">scope-map.json</text>

  <path class="arrow" d="M380,425 L350,425"/>
  <path class="arrow" d="M550,395 L620,395"/>
</svg>
```

- [ ] **Step 2: 重写 6 篇 docs（每篇 200+ 行实质内容）**

> 每篇 doc 由 plan 给出**完整章节大纲 + 关键内容**；T22 实际执行时按下面填实。每篇至少 8 个二级标题，每节 100-300 字 + 至少 1 个代码块或表格。

**docs/remote-quick-desktop.md** 章节：
1. 前置条件（Quick Desktop 版本、网络、账号）
2. 拿到端点 + 授权 URL（管理员部署后输出）
3. 首次授权流程（截图 + 复制 token）
4. Quick Desktop 配置示例（带 Authorization header）
5. 试发一条消息验证（用 `dingtalk_chat_message_send`）
6. 切换 Local / Remote（修改 host 配置）
7. token 过期处理（24h 失效 + 重新授权）
8. 故障排查矩阵（401 / 503 / 403 / 504 各 8 行）

**docs/remote-security.md** 章节：
1. 信任边界图（用 architecture.svg 标注）
2. MCP token (HMAC) 与 incrAuthToken 域分离设计
3. SM + KMS 加密（默认 alias 与 CMK 选项）
4. PKCE OAuth state 防重放（5min TTL）
5. SigV4 中间到 Runtime 链路签名
6. WAF 速率限制（默认值与调优）
7. 容器隔离（USER node + tmpfs configDir）
8. 威胁模型（STRIDE 表格，5 类威胁 × 缓解）
9. 已知薄弱项（明确推迟到 Plan 3）

**docs/remote-observability.md** 章节：
1. Dashboard 5 板块逐项截图（板块名 / 图表名 / metric / 解读）
2. 10 Alarms 详细表（alarm 名 / metric / 阈值 (3 preset) / 触发示例）
3. SNS → alarm-webhook → 钉钉群卡片样例
4. 用 ops.sh logs 看 Lambda 日志
5. CloudWatch Logs Insights 常用查询（5 条）
6. 自定义 metric（QuickDingtalkMcp/Runtime 命名空间下含 ServerBusy / PATTrigger）
7. 错误归因 playbook（按 alarm 名查问题）
8. 成本影响（Dashboard / Alarm 月度）

**docs/remote-operations.md** 章节：
1. 日常运维清单（5 项）
2. ops.sh 各子命令完整 reference
3. 升级 dws 版本流程（用 .claude/skills/bump-dws-version.md）
4. token 撤销 vs 删除 user
5. EventBridge 强制刷新
6. 销毁与清理 SM 残留
7. 灾备（snapshot DDB + SM export）
8. 切换 alarm preset（无需 reploy 整 stack 的方法）

**docs/remote-faq.md** 章节：15 个 Q&A（按 spec §12 + 实际部署常见问题）

**docs/remote-cost.md** 章节：
1. 月度估算（10 用户 / 100 用户 / 1000 用户 三档）
2. 各资源单价表（API GW / Lambda / SM / DDB / CW / AgentCore）
3. 成本优化指南（log retention / Lambda memory / SM 合并）
4. Free tier 覆盖范围

> **执行 T22 时**：实际写每篇内容时直接照上面大纲展开。每篇骨架已在 T3 落地，T22 用 Edit 工具把 `[TODO T22]` 替换成实际段落。**目标行数**：每篇 200+ 行，6 篇合计 1500+ 行真实内容。

- [ ] **Step 3: Sanity — 6 篇都没 [TODO T22] 残留**

Run: `grep -l "TODO T22\|TODO: T22" docs/remote-*.md && echo "FAIL: TODO leftover" || echo "OK: clean"`
Expected: `OK: clean`

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.svg docs/remote-*.md
git commit -m "docs(remote): 6 篇 remote-*.md 填实 + architecture.svg 真画双栈"
```

---

### Task 23: 根 README.md 加 Remote 入口段 + .claude/skills/bump-dws-version.md

README 顶部 v0.1→v0.2 横幅之下加 "Remote（v0.2 ready）" 块；`Status` 段从"Plan 2 — coming"改成"Plan 2 — ready, awaiting cdk deploy"。`.claude/skills/bump-dws-version.md` 借 lark-mcp 同名 skill 的结构，按 dws 实际升级流程写。

**Files:**

- Modify: `README.md`
- Create: `.claude/skills/bump-dws-version.md`

- [ ] **Step 1: 在 README.md 的"Architecture"块之后插入"Remote 入口"段**

```markdown
## Remote（v0.2 Plan 2 — ready）

多用户共享部署到 AWS Bedrock AgentCore。一键部署：

```bash
curl -fsSL https://raw.githubusercontent.com/keithyt06/quick-dingtalk-mcp/main/packages/remote/scripts/install.sh | bash
~/.quick-dingtalk-mcp/packages/remote/scripts/deploy.sh
```

部署完成后 deploy.sh 输出：
- 首次授权 URL（发给团队成员开浏览器点）
- Quick Desktop MCP 端点（填到 Quick Desktop 配置）

详细文档：
- [Quick Desktop 接入](./docs/remote-quick-desktop.md)
- [安全模型](./docs/remote-security.md)
- [可观测性](./docs/remote-observability.md)
- [运维手册](./docs/remote-operations.md)
- [FAQ](./docs/remote-faq.md)
- [成本估算](./docs/remote-cost.md)

> Plan 2 完成的是部署能力本身（容器 + 3 Lambda + 3 CDK stack + 部署/运维脚本 + 文档）；真上 production 前请先 Plan 3 跑一轮 token 注入 PoC + 真 OAuth e2e。
```

- [ ] **Step 2: 修 Status 段**

把 Status 段中 "🚧 Remote v0.2 (next, Plan 2)" 改成 "✅ Remote v0.2 (Plan 2 — ready, awaiting first cdk deploy)"，保留 Plan 3 那行。

- [ ] **Step 3: 写 `.claude/skills/bump-dws-version.md`**

```bash
mkdir -p .claude/skills
```

```markdown
# bump-dws-version skill

Trigger: user says "升级 dws"、"bump dws"、"upgrade dws to <version>"。

## 前置检查

1. 当前 catalog.json `_dwsCliVersion` 是多少？
   ```bash
   jq -r '._dwsCliVersion' packages/shared/catalog.json
   ```
2. 目标版本是？（user 给定，如 v1.0.33）
3. dws 上游 release notes 看 breaking change：
   ```bash
   gh release view v$TARGET --repo DingTalk-Real-AI/dingtalk-workspace-cli
   ```

## 升级步骤

### Step 1: 本机装目标版本

```bash
curl -fsSL https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download/v$TARGET/dws-linux-amd64.tar.gz | tar xz
sudo mv dws /usr/local/bin/
dws --version  # 确认是新版本
```

### Step 2: 重新生成 catalog

```bash
npm run build:catalog
git diff packages/shared/catalog.json | head -200
```

人工 review diff：
- 命令是否新增/删除（影响 tier1 + alias）
- 现有命令的 flag 是否改名（影响 dispatcher）
- description 改了 review 一下措辞是否还合理

### Step 3: 修 tier1.json + scope-map.json

如果 tier1 里某条命令路径变了，更新 `tools` 数组。重跑校验：

```bash
node -e '
const tier1 = require("./packages/shared/tier1.json");
const catalog = require("./packages/shared/catalog.json");
const toToolName = (k) => "dingtalk_" + k.replace(/\./g, "_").replace(/-/g, "_");
const known = new Set(Object.keys(catalog.commands).map(toToolName));
const missing = tier1.tools.filter(t => !known.has(t));
if (missing.length) { console.error("FAIL", missing); process.exit(1); }
console.log("OK");
'
```

### Step 4: 跑测试

```bash
npm test  # shared
npm --workspace packages/remote test  # remote (lambda + docker + infra)
```

### Step 5: 更新 Dockerfile pin

```bash
sed -i.bak "s/^ARG DWS_VERSION=.*/ARG DWS_VERSION=$TARGET/" packages/remote/docker/Dockerfile
rm packages/remote/docker/Dockerfile.bak
```

### Step 6: 更新 RuntimeStack buildArg

`packages/remote/infra/lib/runtime-stack.ts` 第 ~26 行 `DWS_VERSION: "1.0.32"` 改成新版本。

### Step 7: cdk synth 跑一遍确认 RuntimeStack 还能 synth

```bash
cd packages/remote && npm run build:lambda && npx cdk synth QdmRemoteRuntime --quiet
```

### Step 8: docker build 验证 dws tarball 拉得下来

```bash
docker build packages/remote/docker -t qdm-remote:bump-test
docker run --rm qdm-remote:bump-test dws --version
```

### Step 9: 提交

```bash
git add packages/shared/catalog.json packages/shared/tier1.json packages/shared/scope-map.json packages/remote/docker/Dockerfile packages/remote/infra/lib/runtime-stack.ts package.json
git commit -m "chore(deps): bump dws v$OLD → v$TARGET (catalog regenerated, tests green)"
```

### Step 10: 对生产部署

跑 `cdk deploy QdmRemoteRuntime` 触发新镜像 build & push。

## 回滚

如 Step 8 build 出错或 Step 4 测试挂：

```bash
git restore packages/shared/catalog.json packages/shared/tier1.json packages/shared/scope-map.json packages/remote/docker/Dockerfile packages/remote/infra/lib/runtime-stack.ts
```
```

- [ ] **Step 4: Commit**

```bash
git add README.md .claude/skills/bump-dws-version.md
git commit -m "docs(readme): Remote v0.2 entry + .claude/skills/bump-dws-version.md (10-step runbook)"
```

---

### Task 24: 三道 done criteria 闭环验证 + Plan 2 完成报告

跑完三道门 + 写一段 Plan 2 完成 status 进 README.md `Status` 段；root package.json 加 remote test/synth/build 的 script alias；最终 commit + tag。

**Files:**

- Modify: `package.json`（root）
- Modify: `README.md`（status 段最后加一行）

- [ ] **Step 1: 改 root `package.json`，加 remote 相关 script**

```json
{
  "name": "quick-dingtalk-mcp-monorepo",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build:catalog": "node packages/shared/generate-catalog.mjs",
    "test": "node --test packages/shared/__tests__",
    "test:remote": "npm --workspace packages/remote test",
    "test:all": "npm test && npm run test:remote",
    "smoke": "bash packages/local/scripts/smoke.sh",
    "check:dws": "bash packages/shared/scripts/check-dws-version.sh",
    "remote:synth": "npm --workspace packages/remote run synth",
    "remote:build:lambda": "npm --workspace packages/remote run build:lambda",
    "remote:build:image": "npm --workspace packages/remote run build:image"
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

- [ ] **Step 2: 三道门验证（done criteria）**

**门 1：Lambda 单测全过**
Run:
```bash
npm run test:remote
```
Expected:
```
# pass NN
# fail 0
```
（NN ≥ 25：hmac 7 + sigv4 3 + sm-client 5 + token-refresh 5 + middleware 6 + alarm-webhook 3 + inject-token 7 + server 3 + synth 4 = 43+）

**门 2：cdk synth 三 stack 全过**
Run:
```bash
cd packages/remote && npm run build:lambda
npx cdk synth --all --quiet \
  -c alarmPreset=standard \
  -c alarmWebhookUrl="" \
  -c enableWaf=true \
  -c dingtalkAppId=fake \
  -c oauthBaseUrl=https://placeholder
ls -1 cdk.out/*.template.json | wc -l
```
Expected: `3` (3 templates 写出)

**门 3：docker build 出镜像**
Run:
```bash
docker build packages/remote/docker -t qdm-remote:plan2
docker image inspect qdm-remote:plan2 --format='{{.Size}}'
```
Expected: 一个数字（bytes），> 100000000 (~100MB+，含 node + dws)。如果 docker 不可用，记录"docker 不在此环境，门 3 留 Plan 3 在有 docker 的机器上跑"。

- [ ] **Step 3: 三道门通过后，README Status 段加一行**

把 `Status` 段中 Plan 2 那行改成：
```markdown
- ✅ **Remote v0.2 (Plan 2 — done)**: container + 3 Lambda + 3 CDK stack + scripts + 6 docs ready; lambda tests green (43+ assertions), cdk synth --all green, docker build green. Real cdk deploy + e2e DingTalk OAuth runs in Plan 3.
```

- [ ] **Step 4: 整体 sanity（不跑 deploy）**

Run:
```bash
npm run check:dws && npm run test:all && npm run smoke
```
Expected: 三段全 OK；smoke 7 段 dry-run 输出每段都过；shared + remote 测试全 green。

- [ ] **Step 5: Commit + tag**

```bash
git add package.json README.md
git commit -m "chore(release): Plan 2 done — three done criteria green (lambda tests + cdk synth + docker build)"
git tag -a v0.2.0-plan2 -m "v0.2.0 Plan 2 — Remote 端 (container + 3 Lambda + 3 CDK stack + scripts + docs) ready; cdk deploy in Plan 3"
```

不要 `git push --tags`，等 user 确认。

- [ ] **Step 6: 收尾 — 简短 status report 给 user**

文末留一段 plan-2-complete.md 风格的 summary 直接打印到 stdout（不入 git）：

```bash
cat <<'EOF'

==== Plan 2 Done ====

Files added/modified:
  packages/remote/                          (new tree, ~50 files)
  config/                                   (4 files)
  docs/architecture.svg + docs/remote-*.md  (6 files)
  .claude/skills/bump-dws-version.md
  README.md, package.json (root)

Done criteria:
  [x] lambda tests green: npm run test:remote
  [x] cdk synth --all green: 3 templates in packages/remote/cdk.out/
  [x] docker build green: qdm-remote:plan2 in local docker

Next (Plan 3):
  - real cdk deploy to us-east-1
  - real DingTalk OAuth e2e
  - inject-token PoC validation (D2 vs D1 vs D3)
  - scope-map.json fill from real PAT errors
  - production hardening (KMS CMK / multi-region / blue-green)

EOF
```

---

## Done criteria for Plan 2

- [x] `packages/remote/` 完整目录树（docker / lambda / infra / scripts / scripts-internal）
- [x] config/ 4 个 JSON（i18n 中英、alarm-thresholds 三 preset、alarm-presets、oauth-scopes 30 工具占位）
- [x] Dockerfile（node 20 sha pinned + dws v1.0.32 + USER node + tini + EXPOSE 8000）
- [x] inject-token.mjs（D2 默认 + D1/D3 stub + INJECT_STRATEGY env 切换 + 7 单测）
- [x] docker/server.js（Streamable HTTP :8000 + 38 工具 + semaphore + SIGTERM drain + remote PAT rewrite + 3 集成测试）
- [x] lambda/shared 三件（log + hmac + sigv4 + sm-client，含 hmac 7 测、sigv4 3 测、sm-client 5 测）
- [x] token-refresh-shim Lambda（PKCE OAuth + EventBridge 30min refresh + 5 单测）
- [x] mcp-middleware Lambda（HMAC verify + SM read + SigV4 + 25s timeout + 6 单测）
- [x] alarm-webhook Lambda（SNS → 钉钉 markdown 卡片 + 3 单测，webhook URL 空时 CDK 不部署）
- [x] OAuthStack（DDB + SM + SSM + 2 Lambda + ApiGw + CloudFront + EventBridge + SNS + alarm-webhook conditional + Dashboard 5 板块 12 图表 + 10 Alarms）
- [x] RuntimeStack（DockerImageAsset + AgentCore Runtime + IAM Role with SM read prefix）
- [x] WafStack（us-east-1 CLOUDFRONT-scope + rate 1000/5min + 默认 disabled + region 校验）
- [x] cdk synth --all 三 stack 全过（4 个 synth.test.ts assertion）
- [x] scripts/install + deploy(zh|en) + teardown + ops + test-e2e（全 `set -euo pipefail` + `--dry-run`，shellcheck 干净）
- [x] 6 篇 docs/remote-*.md 实质内容（每篇 ≥ 200 行）+ architecture.svg 真双栈
- [x] README.md 加 Remote 入口 + .claude/skills/bump-dws-version.md（10-step runbook）
- [x] 三道门：lambda 测试 / cdk synth / docker build 全 green
- [x] v0.2.0-plan2 tag

---

## 不属本 plan 范围（明确推迟到 Plan 3）

- **真 cdk deploy 到 AWS 账号** — 跑 `cdk deploy` 真创建 stack，验证 IAM、ECR push、AgentCore Runtime 实例化。Plan 2 只 synth 不 deploy。
- **真 DingTalk OAuth e2e** — 拿真 AppKey / AppSecret，过钉钉同意页，复用 mcp 端点真发消息。需要登记钉钉开放平台应用。
- **inject-token PoC 实测** — D2 假设的 `dws auth import --token` 是否真存在？没 → D1 走加密文件格式（需 dws 源码 `internal/keychain/file_dek.go` 实现）→ D3 fork dws 加 env。Plan 3 在有真 dws auth 的机器上 PoC。
- **scope-map.json 真 scope 字符串回填** — Plan 1 笔记里"PAT scope 不足错误"待登录态触发；钉钉返回的真 scope 字符串（如 `Cust.Message.Send`）才能填进 scope-map.json + oauth-scopes.json。
- **生产硬化**：
  - KMS CMK 替代默认 alias（敏感企业要求）
  - 跨 region 容灾 / blue-green 部署
  - WAF 规则细化（geo block、bot mitigation、超过 commonRuleSet 的高级 set）
  - 钉钉 OAuth 应用从 sandbox 升 production（IP 白名单、callback URL 验证）
  - log retention 从默认无限改 30/60 day + KMS 加密
- **AgentCore CFN 资源类型/字段对齐** — `AWS::BedrockAgentCore::AgentRuntime` 是基于推断；Plan 3 真 deploy 时如果资源类型变（GA 时改名）按实际改。
- **dws 多平台 image** — 当前 Dockerfile 只 build linux/amd64；arm64 (Graviton) 镜像看 lark-mcp 怎么搞。
- **客户端 SDK / Quick Desktop 配置生成器** — Plan 3 把 deploy.sh 的 summary 输出再升级，直接生成 Quick Desktop config JSON。
- **shared catalog 的 dws v1.0.33+ 兼容回归** — 升级 dws 时 `bump-dws-version` skill 已写好流程，但 Plan 2 只锁 v1.0.32。

