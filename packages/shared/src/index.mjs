import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export {
  toToolName,
  normalizeFlagName,
  buildInputSchema,
} from "./schema.mjs";
export { toCliArgs, InputError } from "./dispatcher.mjs";
export { searchCatalog } from "./search.mjs";
export {
  rewritePAT,
  parsePATError,
  isPATExitCode,
} from "./errors.mjs";
export { annotationsFor } from "./annotations.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readJson(rel, fixHint) {
  const path = join(__dirname, "..", rel);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `[@quick-dingtalk-mcp/shared] missing ${rel} at ${path}\n` +
          `  → ${fixHint}`
      );
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[@quick-dingtalk-mcp/shared] invalid JSON in ${rel}: ${err.message}`
    );
  }
}

export const catalog = readJson(
  "catalog.json",
  "run `npm run build:catalog` on a machine with dws installed and authenticated"
);
export const tier1 = readJson(
  "tier1.json",
  "this file is committed to the repo; if it's missing your checkout is broken"
);
export const scopeMap = readJson(
  "scope-map.json",
  "this file is committed to the repo; if it's missing your checkout is broken"
);
