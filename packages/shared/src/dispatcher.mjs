import { normalizeFlagName } from "./schema.mjs";

export class InputError extends Error {
  constructor(message) {
    super(`InputError: ${message}`);
    this.name = "InputError";
  }
}

const ARG_TO_FLAG = {
  chat_id: "group",
  user_id: "user",
  open_dingtalk_id: "open-dingtalk-id",
};

function argKeyToFlagName(argKey) {
  if (ARG_TO_FLAG[argKey]) return ARG_TO_FLAG[argKey];
  return argKey.replace(/_/g, "-");
}

export function toCliArgs(command, args = {}) {
  const out = [...command.path, "-y", "-f", "json"];

  const flagDef = new Map();
  for (const f of command.flags || []) {
    flagDef.set(f.name, f);
  }

  // missing required check
  for (const f of command.flags || []) {
    if (!f.required) continue;
    const argKey = normalizeFlagName(f.name);
    if (args[argKey] == null || args[argKey] === "") {
      throw new InputError(`missing required arg: ${argKey}`);
    }
  }

  for (const [argKey, val] of Object.entries(args)) {
    if (val == null) continue;
    const flagName = argKeyToFlagName(argKey);
    const def = flagDef.get(flagName);
    if (!def) continue; // unknown arg — silently drop

    const cliFlag = `--${flagName}`;
    if (def.type === "bool") {
      if (val === true) out.push(cliFlag);
    } else if (def.type === "stringArray" || def.type === "stringSlice") {
      const arr = Array.isArray(val) ? val : [val];
      for (const v of arr) {
        out.push(cliFlag, String(v));
      }
    } else {
      out.push(cliFlag, String(val));
    }
  }
  return out;
}
