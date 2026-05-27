// Verify extractDescription parsing logic against representative
// `dws --help` shapes. We import via dynamic eval since generate-catalog.mjs
// is a script (no exports). Read it, extract the function, eval in isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, "..", "generate-catalog.mjs"),
  "utf8"
);

// pull the function out by name; we only need the pure parsing fn for tests
const match = src.match(
  /function extractDescription\(helpText\) \{[\s\S]*?\n\}/
);
if (!match) throw new Error("could not locate extractDescription in generate-catalog.mjs");
const extractDescription = new Function(
  "helpText",
  match[0].replace(/^function extractDescription\(helpText\) \{/, "") .replace(/\}$/, "")
);

test("extractDescription: single short description, then Usage", () => {
  const help = `Send a chat message

Usage:
  dws chat message send [flags]

Flags:
  --group string   ...
`;
  assert.equal(extractDescription(help), "Send a chat message");
});

test("extractDescription: short + long multi-line block", () => {
  const help = `Send a chat message as the current user.

This command supports both group and direct messages. You must
provide exactly one of --group, --user, or --open-dingtalk-id.
Title is required (DingTalk API contract).

Usage:
  dws chat message send [flags]
`;
  const out = extractDescription(help);
  assert.ok(out.startsWith("Send a chat message as the current user."));
  assert.ok(out.includes("group and direct messages"));
  assert.ok(out.includes("Title is required"));
  assert.ok(!out.includes("Usage"));
});

test("extractDescription: respects Available Commands as section header", () => {
  const help = `Manage chat messages.

Available Commands:
  send    Send a message
  list    List messages
`;
  assert.equal(extractDescription(help), "Manage chat messages.");
});

test("extractDescription: empty help → empty string", () => {
  assert.equal(extractDescription(""), "");
});

test("extractDescription: leading blank lines skipped", () => {
  const help = `

Send a chat message

Usage:
`;
  assert.equal(extractDescription(help), "Send a chat message");
});
