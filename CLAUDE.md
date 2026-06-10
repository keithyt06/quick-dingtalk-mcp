# CLAUDE.md

Guidance for Claude Code when working in this repository. The root workspace `CLAUDE.md`
(Karpathy coding guidelines: think before coding, simplicity first, surgical changes,
goal-driven execution) also applies — this file adds project-specific detail.

## What this project is

`quick-dingtalk-mcp` — an MCP server that wraps DingTalk's official CLI
([`dws`](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)) so an AI assistant
acts in DingTalk **as the real logged-in user** (your avatar and name in the group), not
as a bot. This is the whole point: DingTalk's own `open-dingtalk/dingtalk-mcp` only speaks
as a bot. `dws` authenticates over user-identity OAuth and is itself a thin client to
DingTalk's MCP gateway (`mcp-gw.dingtalk.com`), so this project is a shim that re-exposes
that capability to any MCP host.

Two delivery modes share one tool catalog:

- **Local** — run on your own machine, stdio to the host. Fastest start, personal use.
- **Remote** — one shared AWS deployment serving a whole team, per-user OAuth isolation.

Both expose the **same 38 tools** (30 named + `dingtalk_discover`/`dingtalk_invoke` +
6 deprecated aliases), covering IM, contacts, calendar, docs/drive, todo, DING,
attendance, OA approval, AI table, minutes, and mail.

## Monorepo layout

npm workspaces (`packages/*`), `"type": "module"`, Node ≥ 20 (remote needs ≥ 22.6).

- **`packages/shared/`** — the catalog + dispatch core; both servers depend on it.
  - `catalog.json` — **generated**, not hand-edited. All 261 `dws` commands, pinned to a
    `dws` version (`_dwsCliVersion`, currently `1.0.32`). Regenerate with
    `npm run build:catalog` (needs `dws` installed + authenticated), then commit the diff.
  - `tier1.json` — the 30 named tools + 6 aliases that get first-class MCP tools.
  - `scope-map.json`, `config/oauth-scopes.json` — DingTalk OAuth scope mapping.
  - `src/*.mjs` — `schema` (build MCP input schema), `dispatcher` (args → CLI flags),
    `search` (keyword search over catalog), `errors` (PAT error rewriting),
    `annotations`. Tested by `packages/shared/__tests__/*.test.mjs`.
- **`packages/local/`** — `server.mjs`, a single stdio MCP server that `execFile`s `dws`.
  Wires into Amazon Quick Desktop / Claude Desktop / Cursor. Docs in `docs/setup.md`,
  `docs/verification.md`; `scripts/smoke.sh`.
- **`packages/remote/`** — multi-user AWS deployment.
  - `infra/` — CDK (TypeScript via `--experimental-strip-types`). Stacks:
    `oauth-stack` (CloudFront, API GW, OAuth callback, DynamoDB, Secrets Manager, alarms),
    `runtime-stack` (Bedrock AgentCore Runtime container running `dws`), `waf-stack`
    (optional, CloudFront-scope, us-east-1). Entry: `infra/bin/app.ts`.
  - `lambda/` — `mcp-middleware` (verifies HMAC bearer token, loads the user's DingTalk
    token, SigV4-signs the request to AgentCore), `token-refresh-shim`, `alarm-webhook`,
    and `shared/` (hmac, sigv4, sm-client). Tests are `*.test.ts` colocated.
  - `docker/` — the Streamable-HTTP container: `server.js` dispatches MCP over HTTP,
    `inject-token.mjs` provisions a per-user `DWS_CONFIG_DIR` so each teammate's `dws`
    runs under their own identity.
  - `scripts/` — `install.sh`, `deploy.sh`, `ops.sh`, `teardown.sh`, `test-e2e.sh`.
- **`config/`** — shared, non-secret config consumed by both deploy scripts and CDK:
  `alarm-presets.json`, `alarm-thresholds.json` (standard/relaxed/strict), `i18n.json`
  (zh/en strings), `oauth-scopes.json`.
- **`docs/`** — remote deploy/operations/security/observability/cost/FAQ (index in
  `docs/README.md`). Public-facing: keep it free of internal dev history, real
  domains/account IDs, and date-stamped changelog prose.

## Commands

Run from repo root unless noted.

```bash
npm test                  # shared unit tests (node --test packages/shared/__tests__)
npm run test:remote       # remote tests (lambda unit + infra synth) — needs Node ≥ 22.6
npm run test:all          # both
npm run build:catalog     # regenerate catalog.json from local dws (then commit the diff)
npm run check:dws         # CI gate: catalog version must match installed dws
npm run smoke             # local server smoke test
npm run remote:synth      # cdk synth --all
npm run remote:build:lambda
npm run remote:build:image
```

`packages/remote` uses a separate `test:unit` / `test:infra` split (see its package.json).

## Conventions specific to this project

- **Never hand-edit `catalog.json`.** It is generated from `dws --help`. Change behavior in
  `generate-catalog.mjs` or upgrade `dws`, then `npm run build:catalog`. CI's
  `check:dws` fails if the committed catalog version drifts from the installed `dws`.
- **Every DingTalk message requires a `title`** (unlike Feishu) — the catalog/schema
  enforces this; don't strip it.
- **No secrets.** Real DingTalk AppKey/AppSecret, user tokens, AWS account IDs, KMS
  material — none go in the tree (root `CLAUDE.md` rule). `config/oauth-scopes.json`
  values are intentionally empty arrays; fill them only from real DingTalk error
  responses, never invented scope strings.
- **Shared changes ripple to both servers.** A change in `packages/shared` affects local
  *and* remote — run `npm run test:all` before assuming it's safe.
- **Remote region is selectable** via `AWS_REGION`/`CDK_DEFAULT_REGION` (default
  `us-east-1`; AgentCore must be available in the chosen region). The one hard lock:
  the optional WAF stack always deploys to `us-east-1` (CloudFront-scope WebACL is an
  AWS constraint) — keep that pin.
