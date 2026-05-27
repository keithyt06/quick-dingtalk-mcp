import { test } from "node:test";
import assert from "node:assert/strict";
import { toCliArgs } from "../src/dispatcher.mjs";

const sendCmd = {
  path: ["chat", "message", "send"],
  flags: [
    { name: "group", type: "string" },
    { name: "user", type: "string" },
    { name: "title", type: "string", required: true },
    { name: "text", type: "string", required: true },
    { name: "at-all", type: "bool" },
    { name: "at-users", type: "string" },
  ],
};

test("toCliArgs: group send", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc_abc",
    title: "T",
    text: "hello",
  });
  assert.deepEqual(args, [
    "chat",
    "message",
    "send",
    "-y",
    "-f",
    "json",
    "--group",
    "oc_abc",
    "--title",
    "T",
    "--text",
    "hello",
  ]);
});

test("toCliArgs: single-chat send via user_id", () => {
  const args = toCliArgs(sendCmd, {
    user_id: "uid_x",
    title: "T",
    text: "hi",
  });
  assert.deepEqual(args, [
    "chat",
    "message",
    "send",
    "-y",
    "-f",
    "json",
    "--user",
    "uid_x",
    "--title",
    "T",
    "--text",
    "hi",
  ]);
});

test("toCliArgs: bool true → flag with no value; false → omitted", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc",
    title: "t",
    text: "x",
    at_all: true,
  });
  assert.ok(args.includes("--at-all"));
  assert.equal(
    args.indexOf("--at-all"),
    args.length - 1,
    "bool flag is appended without value"
  );

  const args2 = toCliArgs(sendCmd, {
    chat_id: "oc",
    title: "t",
    text: "x",
    at_all: false,
  });
  assert.ok(!args2.includes("--at-all"));
});

test("toCliArgs: number args stringified", () => {
  const listCmd = {
    path: ["chat", "message", "list"],
    flags: [
      { name: "group", type: "string" },
      { name: "limit", type: "int" },
    ],
  };
  const args = toCliArgs(listCmd, { chat_id: "oc", limit: 50 });
  assert.deepEqual(args, [
    "chat",
    "message",
    "list",
    "-y",
    "-f",
    "json",
    "--group",
    "oc",
    "--limit",
    "50",
  ]);
});

test("toCliArgs: missing required flag throws InputError", () => {
  assert.throws(
    () => toCliArgs(sendCmd, { chat_id: "oc" }),
    /InputError/
  );
});

test("toCliArgs: stringArray drops null/undefined/empty elements", () => {
  const cmd = {
    path: ["x"],
    flags: [{ name: "users", type: "stringArray" }],
  };
  const args = toCliArgs(cmd, { users: ["a", null, "", undefined, "b"] });
  // only --users a and --users b survive
  const userOccurrences = args.filter((x) => x === "--users").length;
  assert.equal(userOccurrences, 2, "two --users entries");
  assert.ok(args.includes("a"));
  assert.ok(args.includes("b"));
  assert.ok(!args.includes("null"), "literal 'null' must not appear");
});

test("toCliArgs: unknown arg key is ignored, not passed", () => {
  const args = toCliArgs(sendCmd, {
    chat_id: "oc",
    title: "t",
    text: "x",
    unrelated_field: "junk",
  });
  assert.ok(!args.includes("--unrelated-field"));
  assert.ok(!args.includes("junk"));
});
