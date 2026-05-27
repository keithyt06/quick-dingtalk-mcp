const FLAG_RENAME = {
  group: "chat_id",
  user: "user_id",
};

const GLOBAL_FLAGS = new Set([
  "yes",
  "y",
  "dry-run",
  "help",
  "h",
  "format",
  "f",
  "verbose",
  "v",
  "config",
  "no-color",
  "quiet",
  "jq",
]);

export function toToolName(canonicalPath) {
  return "dingtalk_" + canonicalPath.replace(/\./g, "_").replace(/-/g, "_");
}

export function normalizeFlagName(dwsFlagName) {
  if (FLAG_RENAME[dwsFlagName]) return FLAG_RENAME[dwsFlagName];
  return dwsFlagName.replace(/-/g, "_");
}

function flagToJsonSchema(flag) {
  const map = {
    string: "string",
    int: "number",
    int64: "number",
    float64: "number",
    bool: "boolean",
    stringArray: "array",
    stringSlice: "array",
  };
  const baseType = map[flag.type] || "string";
  const prop = { type: baseType };
  if (flag.description) prop.description = flag.description;
  if (baseType === "array") {
    prop.items = { type: "string" };
  }
  return prop;
}

export function buildInputSchema(command) {
  const props = {};
  const required = [];
  for (const flag of command.flags || []) {
    if (GLOBAL_FLAGS.has(flag.name)) continue;
    const name = normalizeFlagName(flag.name);
    props[name] = flagToJsonSchema(flag);
    if (flag.required) required.push(name);
  }
  const schema = { type: "object", properties: props };
  if (required.length) schema.required = required;
  return schema;
}
