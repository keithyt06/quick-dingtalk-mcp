import { test } from "node:test";
import assert from "node:assert/strict";
import { searchCatalog } from "../src/search.mjs";

const fakeCatalog = {
  commands: {
    "chat.message.send": {
      path: ["chat", "message", "send"],
      description: "Send a chat message",
    },
    "chat.message.list": {
      path: ["chat", "message", "list"],
      description: "List messages",
    },
    "calendar.event.create": {
      path: ["calendar", "event", "create"],
      description: "Create calendar event",
    },
    "drive.file.create": {
      path: ["drive", "file", "create"],
      description: "Create drive file",
    },
  },
};

test("searchCatalog: keyword in description", () => {
  const r = searchCatalog(fakeCatalog, { query: "calendar" });
  assert.equal(r.length, 1);
  assert.equal(r[0].tool_name, "dingtalk_calendar_event_create");
});

test("searchCatalog: keyword matches multiple, sorted by tier1 then path length", () => {
  const r = searchCatalog(fakeCatalog, { query: "create" });
  assert.equal(r.length, 2);
  assert.ok(r.find((x) => x.tool_name === "dingtalk_calendar_event_create"));
  assert.ok(r.find((x) => x.tool_name === "dingtalk_drive_file_create"));
});

test("searchCatalog: limit caps results", () => {
  const r = searchCatalog(fakeCatalog, { query: "" }, { limit: 2 });
  assert.equal(r.length, 2);
});

test("searchCatalog: empty query returns top-N", () => {
  const r = searchCatalog(fakeCatalog, {}, { limit: 100 });
  assert.equal(r.length, 4);
});

test("searchCatalog: result item shape", () => {
  const r = searchCatalog(fakeCatalog, { query: "send" });
  assert.equal(r[0].tool_name, "dingtalk_chat_message_send");
  assert.ok(r[0].description.includes("Send"));
  assert.deepEqual(r[0].path, ["chat", "message", "send"]);
});
