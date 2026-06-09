import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annotationsFor,
  isIrreversible,
  toolDescription,
} from "../src/annotations.mjs";

const cmd = (path, description = "do a thing") => ({ path, description });

test("annotationsFor: read verbs → readOnlyHint", () => {
  assert.deepEqual(annotationsFor(cmd(["chat", "message", "list"])), {
    readOnlyHint: true,
  });
  assert.deepEqual(annotationsFor(cmd(["contact", "user", "get-self"])), {
    readOnlyHint: true,
  });
});

test("annotationsFor: write verbs → destructiveHint", () => {
  assert.deepEqual(annotationsFor(cmd(["chat", "message", "send"])), {
    destructiveHint: true,
  });
});

test("isIrreversible: delete/remove/revoke/reject/recall/quit/cancel", () => {
  assert.equal(isIrreversible(cmd(["todo", "task", "delete"])), true);
  assert.equal(isIrreversible(cmd(["chat", "group", "members", "remove"])), true);
  assert.equal(isIrreversible(cmd(["oa", "approval", "revoke"])), true);
  assert.equal(isIrreversible(cmd(["oa", "approval", "reject"])), true);
  assert.equal(isIrreversible(cmd(["chat", "message", "recall"])), true);
  assert.equal(isIrreversible(cmd(["chat", "group", "quit"])), true);
  assert.equal(isIrreversible(cmd(["minutes", "upload", "cancel"])), true);
  // verb-prefix form (recall-by-bot, remove-user)
  assert.equal(isIrreversible(cmd(["chat", "message", "recall-by-bot"])), true);
});

test("isIrreversible: safe verbs → false", () => {
  assert.equal(isIrreversible(cmd(["chat", "message", "send"])), false);
  assert.equal(isIrreversible(cmd(["chat", "message", "list"])), false);
  assert.equal(isIrreversible(cmd(["calendar", "event", "create"])), false);
  // "list-mentions" must not match on a "remove"/"recall" substring
  assert.equal(isIrreversible(cmd(["chat", "message", "list-mentions"])), false);
});

test("toolDescription: irreversible command gets confirmation prefix", () => {
  const d = toolDescription(cmd(["todo", "task", "delete"], "Delete a todo task"));
  assert.match(d, /不可逆操作/);
  assert.match(d, /必须先向用户说明/);
  assert.ok(d.endsWith("Delete a todo task"));
});

test("toolDescription: safe command returns description unchanged", () => {
  const original = "Send a chat message";
  assert.equal(
    toolDescription(cmd(["chat", "message", "send"], original)),
    original
  );
});
