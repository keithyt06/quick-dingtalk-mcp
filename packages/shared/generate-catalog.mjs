#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const DWS = process.env.DWS_BIN || "dws";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "catalog.json");

async function dws(...args) {
  const { stdout, stderr } = await execFileAsync(DWS, args, {
    timeout: 10_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  return stdout || stderr;
}

async function getDwsVersion() {
  const out = await dws("--version");
  const m = out.match(/v(\d+\.\d+\.\d+(?:[\w.-]+)?)/);
  if (!m) throw new Error("can't parse dws version: " + out);
  return m[1];
}

// dws v1.0.32 --help structure (observed):
//
// At the root:
//   Discovered MCP Services:
//     aiapp        ...
//     ...
//   Usage:
//     dws <service> [command] [flags]
//   Utility Commands:
//     api          ...
//     auth         ...
//
// At nested levels (standard cobra):
//   Available Commands:
//     send        ...
//     list        ...
//
// We harvest from any of these section headers. The root's "Utility Commands"
// section contains things like auth/cache/config/doctor/plugin which are NOT
// DingTalk product capabilities and must be excluded from the catalog.
const SUBCOMMAND_SECTION = /^(Available Commands|Discovered MCP Services|Utility Commands):/i;
const STOP_SECTION = /^(Usage|Aliases|Examples|Flags|Global Flags|Use ".*" for more):/i;

// Top-level utility commands we never want in catalog (per spec — only the
// dingtalk product commands should be exposed as MCP tools).
const ROOT_UTILITY_BLOCKLIST = new Set([
  "api", "auth", "cache", "completion", "config", "doctor", "help",
  "plugin", "recovery", "schema", "skill", "version", "upgrade",
]);

function parseSubcommands(helpText, { isRoot = false } = {}) {
  const lines = helpText.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (SUBCOMMAND_SECTION.test(line)) {
      const isUtility = /^Utility Commands:/i.test(line);
      i++;
      let sawData = false;
      while (i < lines.length) {
        const sub = lines[i];
        if (!sub.trim()) {
          // Leading blank lines after a section header are common; allow.
          // Once we've seen real data, a blank line ends the block.
          if (sawData) {
            i++;
            break;
          }
          i++;
          continue;
        }
        if (STOP_SECTION.test(sub) || SUBCOMMAND_SECTION.test(sub)) break;
        const m = sub.match(/^\s+(\S+)\s+(.*)$/);
        if (m) {
          sawData = true;
          const name = m[1];
          // Always skip help/completion (cobra meta).
          if (name !== "help" && name !== "completion") {
            // At the root, skip Utility Commands entirely — they aren't
            // DingTalk product capabilities.
            if (!(isRoot && (isUtility || ROOT_UTILITY_BLOCKLIST.has(name)))) {
              out.push({ name, description: m[2].trim() });
            }
          }
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out;
}

// Flags: section parser
//       --foo string   description (default "x")
//   -y, --yes          description
function parseFlags(helpText) {
  const lines = helpText.split("\n");
  const start = lines.findIndex((l) => /^Flags:/i.test(l));
  if (start < 0) return [];
  const flags = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    if (/^[A-Z]/.test(line)) break;
    const m = line.match(
      /^\s*(-(\w),\s*)?--([\w-]+)(?:\s+(\w+))?\s+(.+?)(?:\s+\(default .*\))?$/
    );
    if (!m) continue;
    const [, , short, name, type, desc] = m;
    if (name === "help") continue;
    flags.push({
      name,
      short: short || null,
      type: type || "bool",
      description: desc.trim(),
      // dws v1.0.32 marks required fields with "(必填" or "必填" in Chinese
      // descriptions; some flags also use the English "required" word.
      required: /\brequired\b|必填/i.test(desc),
    });
  }
  return flags;
}

// Cobra --help structure for any command/leaf:
//   <short description, 1 line>
//   <blank>
//   [<long description, 1+ lines, may span paragraphs separated by blanks>]
//   <blank>
//   Usage:
//     ...
//   Aliases / Examples / Available Commands / Flags / ...
//
// We harvest from the first non-blank line until we hit a section header
// (Usage / Aliases / Examples / Available Commands / Flags / Global Flags /
// Use ...). Paragraph blank lines inside the body are collapsed to single
// spaces so the result fits one MCP description string.
function extractDescription(helpText) {
  const SECTION_HEADER = /^(Usage|Aliases|Examples|Available Commands|Flags|Global Flags|Use ".*" for more)/i;
  const lines = helpText.split("\n");
  let started = false;
  const buf = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      if (!line) continue;
      if (SECTION_HEADER.test(line)) break;
      started = true;
      buf.push(line);
      continue;
    }
    if (SECTION_HEADER.test(line)) break;
    if (!line) {
      // paragraph separator inside the body — collapse to single space
      if (buf.length && buf[buf.length - 1] !== "") buf.push("");
      continue;
    }
    buf.push(line);
  }
  // collapse internal blank markers to " " and join
  return buf.map((s) => (s === "" ? " " : s)).join(" ").replace(/\s+/g, " ").trim();
}

async function walk(path) {
  const help = await dws(...path, "--help");
  const subs = parseSubcommands(help, { isRoot: false });
  if (subs.length === 0) {
    return [
      {
        path,
        description: extractDescription(help),
        flags: parseFlags(help),
      },
    ];
  }
  const out = [];
  for (const sub of subs) {
    const children = await walk([...path, sub.name]);
    out.push(...children);
  }
  return out;
}

function canonicalPath(pathArr) {
  return pathArr.join(".");
}

async function main() {
  const version = await getDwsVersion();
  console.error(`Generating catalog for dws ${version}...`);
  const top = await dws("--help");
  const groups = parseSubcommands(top, { isRoot: true });
  const commands = {};
  for (const g of groups) {
    console.error(`  ${g.name} ...`);
    const leaves = await walk([g.name]);
    for (const leaf of leaves) {
      commands[canonicalPath(leaf.path)] = leaf;
    }
  }
  const out = {
    _dwsCliVersion: version,
    _scopeMapVersion: "1",
    _generatedAt: new Date().toISOString(),
    commands,
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.error(
    `Wrote ${Object.keys(commands).length} commands → ${OUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
