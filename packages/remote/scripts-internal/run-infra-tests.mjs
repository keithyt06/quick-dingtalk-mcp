#!/usr/bin/env node
// Runs the infra/__tests__/*.test.ts suite.
//
// Why this exists: those tests import the CDK stacks (`../lib/*.ts`), which in
// turn `import { Stack, StackProps, ... } from "aws-cdk-lib"`. aws-cdk-lib is
// CommonJS with lazy getters, and Node's native --experimental-strip-types
// loader treats .ts as ESM and can't resolve those named exports
// (`SyntaxError: Named export 'StackProps' not found`) — even on Node 22.x.
// So `node --test --experimental-strip-types infra/__tests__/*.test.ts` fails
// at import time. We esbuild each test to CJS first (aws-cdk-lib/constructs stay
// external, resolved from node_modules at run time), then run it with node:test.
//
// The bundle is emitted NEXT TO the source test so (a) Node's module resolution
// walks up to the repo-root node_modules, and (b) import.meta.url — shimmed via
// --define to the source file's URL — keeps the test's config-dir path math
// valid. Temp bundles are cleaned up afterwards.

import { build } from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, "..", "infra", "__tests__");

const entries = (await readdir(testsDir)).filter((f) => f.endsWith(".test.ts"));
if (entries.length === 0) {
  console.error("no infra tests found");
  process.exit(0);
}

const bundles = [];
for (const name of entries) {
  const src = join(testsDir, name);
  const out = join(testsDir, `.${name.replace(/\.ts$/, "")}.bundle.cjs`);
  await build({
    entryPoints: [src],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: out,
    external: ["aws-cdk-lib", "constructs", "node:*"],
    define: { "import.meta.url": JSON.stringify(pathToFileURL(src).href) },
    sourcemap: false,
  });
  bundles.push(out);
}

const res = spawnSync(process.execPath, ["--test", ...bundles], { stdio: "inherit" });

await Promise.all(bundles.map((b) => rm(b, { force: true })));

process.exit(res.status ?? 1);
