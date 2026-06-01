#!/usr/bin/env node
// Bundles each lambda/<name>/index.ts into dist/<name>/index.cjs via esbuild,
// AND the CDK app (infra/bin/app.ts) into infra/bin/app.bundle.cjs.
// Run before `cdk synth`/`cdk deploy` so Code.fromAsset has something to read
// and `cdk` has a runnable app entry.
//
// Why bundle the CDK app: infra/cdk.json's app command can't be a plain
// `node --experimental-strip-types bin/app.ts` — even on Node 22.x that fails
// with `Named export 'StackProps' not found` because aws-cdk-lib is CommonJS
// with lazy getters and the native TS/ESM loader can't see those named exports.
// Pre-bundling to CJS sidesteps the loader entirely and runs on any Node.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  console.error(`built ${name} -> ${out}/index.cjs`);
}

// CDK app bundle. aws-cdk-lib/constructs stay external (resolved from
// node_modules at run time). import.meta.url is shimmed to the source file's
// location so app.ts's config-dir path math still resolves.
const appEntry = join(root, "infra", "bin", "app.ts");
const appOut = join(root, "infra", "bin", "app.bundle.cjs");
await build({
  entryPoints: [appEntry],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: appOut,
  external: ["aws-cdk-lib", "constructs"],
  define: { "import.meta.url": JSON.stringify(pathToFileURL(appEntry).href) },
  sourcemap: false,
});
console.error(`built cdk-app -> ${appOut}`);
