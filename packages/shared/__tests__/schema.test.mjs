import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toToolName,
  buildInputSchema,
  normalizeFlagName,
} from "../src/schema.mjs";

test("toToolName: chat.message.send → dingtalk_chat_message_send", () => {
  assert.equal(toToolName("chat.message.send"), "dingtalk_chat_message_send");
});

test("toToolName: chat.message.list-topic-replies → dingtalk_chat_message_list_topic_replies", () => {
  assert.equal(
    toToolName("chat.message.list-topic-replies"),
    "dingtalk_chat_message_list_topic_replies"
  );
});

test("normalizeFlagName: --group → chat_id; --user → user_id; default kebab→snake", () => {
  assert.equal(normalizeFlagName("group"), "chat_id");
  assert.equal(normalizeFlagName("user"), "user_id");
  assert.equal(normalizeFlagName("open-dingtalk-id"), "open_dingtalk_id");
  assert.equal(normalizeFlagName("topic-id"), "topic_id");
});

test("buildInputSchema: chat.message.send shape", () => {
  const cmd = {
    path: ["chat", "message", "send"],
    description: "Send a chat message",
    flags: [
      { name: "group", type: "string", description: "group conversation id" },
      { name: "user", type: "string", description: "single-chat user id" },
      {
        name: "title",
        type: "string",
        description: "message title",
        required: true,
      },
      {
        name: "text",
        type: "string",
        description: "message body",
        required: true,
      },
      { name: "at-all", type: "bool", description: "@everyone in group" },
    ],
  };
  const schema = buildInputSchema(cmd);
  assert.equal(schema.type, "object");
  assert.ok(schema.properties.chat_id);
  assert.equal(schema.properties.chat_id.type, "string");
  assert.ok(schema.properties.user_id);
  assert.ok(schema.properties.title);
  assert.ok(schema.properties.text);
  assert.ok(schema.properties.at_all);
  assert.equal(schema.properties.at_all.type, "boolean");
  assert.deepEqual(schema.required.sort(), ["text", "title"]);
});

test("buildInputSchema: skips global cobra flags (-y, --dry-run, --help, -f)", () => {
  const cmd = {
    path: ["chat", "search"],
    description: "search chats",
    flags: [
      { name: "query", type: "string", required: true },
      { name: "yes", short: "y", type: "bool" },
      { name: "dry-run", type: "bool" },
      { name: "help", type: "bool" },
      { name: "format", short: "f", type: "string" },
    ],
  };
  const schema = buildInputSchema(cmd);
  assert.deepEqual(Object.keys(schema.properties), ["query"]);
});
