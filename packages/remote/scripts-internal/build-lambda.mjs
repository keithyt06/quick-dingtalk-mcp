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
  console.error(`built ${name} -> ${out}/index.cjs`);
}
