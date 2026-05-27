import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rewritePAT,
  parsePATError,
  isPATExitCode,
} from "../src/errors.mjs";

// ⚠️ FIXTURE: spec §4.4 占位假设格式。
// Plan 1 Task 3 PAT 实测完成后，从
// docs/superpowers/notes/2026-05-27-poc-token-injection.md
// "PAT 错误格式实测" 段直接复制实测的 stderr 替换此常量。
const stderrJSON = `{"error":"permission_required","missing_scopes":["Contact.User.Read","Calendar.Event.Write"],"hint":"原始 dws hint"}`;
const PAT_EXIT = 4; // 实测确认；不是 4 就改

test("isPATExitCode: PAT_EXIT → true; 其它 → false", () => {
  assert.equal(isPATExitCode(PAT_EXIT), true);
  assert.equal(isPATExitCode(0), false);
  assert.equal(isPATExitCode(1), false);
});

test("parsePATError: 结构化 stderr → 至少含 missing_scopes 字段", () => {
  const r = parsePATError(stderrJSON);
  assert.ok(r, "parsed result is not null");
  assert.ok(Array.isArray(r.missing_scopes), "missing_scopes is an array");
  assert.ok(r.missing_scopes.length > 0, "has at least one missing scope");
});

test("parsePATError: 非 JSON → null", () => {
  assert.equal(parsePATError("Error: random text"), null);
});

test("rewritePAT mode=local: 输出 dws pat chmod 提示且含 missing scopes", () => {
  const parsed = parsePATError(stderrJSON);
  const out = rewritePAT(parsed, { mode: "local" });
  assert.match(
    out.message,
    /dws pat chmod\s+\S+/,
    "message contains dws pat chmod cmd"
  );
  for (const s of parsed.missing_scopes) {
    assert.ok(out.message.includes(s), `message contains scope ${s}`);
  }
  assert.deepEqual(out.missing_scopes, parsed.missing_scopes);
});

test("rewritePAT mode=remote: 输出授权 URL,scopes 透传给 builder", () => {
  const parsed = parsePATError(stderrJSON);
  let receivedScopes = null;
  const out = rewritePAT(parsed, {
    mode: "remote",
    authorizeUrlBuilder: (scopes) => {
      receivedScopes = scopes;
      return `https://auth.example.com/authorize?extra_scope=${scopes.join(",")}&t=hmac2`;
    },
  });
  assert.deepEqual(
    receivedScopes,
    parsed.missing_scopes,
    "builder receives scopes verbatim, no transformation"
  );
  assert.match(out.authorize_url, /^https:\/\/auth\.example\.com\/authorize\?/);
  assert.match(out.message, /点击授权/);
});

test("rewritePAT: 没 missing_scopes 也别炸", () => {
  const out = rewritePAT(
    { error: "permission_required" },
    { mode: "local" }
  );
  assert.match(out.message, /权限/);
});
