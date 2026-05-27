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
const readJson = (rel) =>
  JSON.parse(readFileSync(join(__dirname, "..", rel), "utf8"));

export const catalog = readJson("catalog.json");
export const tier1 = readJson("tier1.json");
export const scopeMap = readJson("scope-map.json");
