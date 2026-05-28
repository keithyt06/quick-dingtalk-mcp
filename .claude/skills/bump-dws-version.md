# bump-dws-version skill

Trigger: user says "升级 dws"、"bump dws"、"upgrade dws to <version>".

## Pre-checks

1. Current catalog.json `_dwsCliVersion`?
   ```bash
   jq -r '._dwsCliVersion' packages/shared/catalog.json
   ```
2. Target version? (user-provided, e.g. v1.0.33)
3. Read upstream release notes for breaking changes:
   ```bash
   gh release view v$TARGET --repo DingTalk-Real-AI/dingtalk-workspace-cli
   ```

## Upgrade steps

### Step 1: install target version locally

```bash
curl -fsSL https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download/v$TARGET/dws-linux-amd64.tar.gz | tar xz
sudo mv dws /usr/local/bin/
dws --version  # confirm new version
```

### Step 2: regenerate catalog

```bash
npm run build:catalog
git diff packages/shared/catalog.json | head -200
```

Manually review the diff:
- Commands added/removed (affects tier1 + alias)
- Existing commands' flag renames (affects dispatcher)
- Description changes (review wording)

### Step 3: update tier1.json + scope-map.json if needed

If a tier1 command path moved, update the `tools` array. Re-run validation:

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

### Step 4: run tests

```bash
npm test  # shared
npm --workspace packages/remote test  # remote (lambda + docker + infra)
```

### Step 5: update Dockerfile pin

```bash
sed -i.bak "s/^ARG DWS_VERSION=.*/ARG DWS_VERSION=$TARGET/" packages/remote/docker/Dockerfile
rm packages/remote/docker/Dockerfile.bak
```

### Step 6: update RuntimeStack buildArg

`packages/remote/infra/lib/runtime-stack.ts`: change `DWS_VERSION: "1.0.32"` to the new version.

### Step 7: cdk synth check

```bash
cd packages/remote && npm run build:lambda && npx cdk synth QdmRemoteRuntime --quiet
```

### Step 8: docker build sanity

```bash
docker build packages/remote/docker -t qdm-remote:bump-test
docker run --rm qdm-remote:bump-test dws --version
```

### Step 9: commit

```bash
git add packages/shared/catalog.json packages/shared/tier1.json packages/shared/scope-map.json \
        packages/remote/docker/Dockerfile packages/remote/infra/lib/runtime-stack.ts package.json
git commit -m "chore(deps): bump dws v$OLD → v$TARGET (catalog regenerated, tests green)"
```

### Step 10: deploy

Run `cdk deploy QdmRemoteRuntime` to trigger image rebuild + ECR push. AgentCore Runtime auto-redeploys on image digest change.

## Rollback

If Step 8 build fails or Step 4 tests fail:

```bash
git restore packages/shared/catalog.json packages/shared/tier1.json packages/shared/scope-map.json \
            packages/remote/docker/Dockerfile packages/remote/infra/lib/runtime-stack.ts
```
