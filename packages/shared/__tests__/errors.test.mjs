import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rewritePAT,
  parsePATError,
  isPATExitCode,
} from "../src/errors.mjs";

// Spec §4.4 flat shape (kept for back-compat)
const flatShape = `{"error":"permission_required","missing_scopes":["Contact.User.Read","Calendar.Event.Write"],"hint":"原始 dws hint"}`;

// Real dws v1.0.32 nested shape (observed via PoC, see docs/superpowers/notes/...)
// Permission category — predicted form pending live PAT capture.
const nestedShapePermission = `{
  "error": {
    "category": "permission",
    "code": 4,
    "reason": "permission_required",
    "message": "权限不足",
    "hint": "缺少 Cust.Message.Send",
    "missing_scopes": ["Cust.Message.Send", "Calendar.Event.Read"],
    "actions": ["dws pat chmod Cust.Message.Send"]
  }
}`;

// Real dws v1.0.32 unauthenticated (NOT a PAT error — should NOT match)
const nestedShapeUnauth = `{"error":{"actions":["dws auth login"],"category":"auth","code":2,"hint":"运行 'dws auth login' 完成登录后重试","message":"未登录，请先执行 dws auth login","reason":"not_authenticated"}}`;

test("isPATExitCode: any non-zero exit is a PAT candidate (real dws varies by category)", () => {
  assert.equal(isPATExitCode(1), true);
  assert.equal(isPATExitCode(2), true);
  assert.equal(isPATExitCode(4), true);
  assert.equal(isPATExitCode(0), false);
  assert.equal(isPATExitCode(null), false);
  assert.equal(isPATExitCode(undefined), false);
});

test("parsePATError: spec §4.4 flat shape recognized", () => {
  const r = parsePATError(flatShape);
  assert.ok(r);
  assert.ok(Array.isArray(r.missing_scopes));
  assert.ok(r.missing_scopes.length > 0);
});

test("parsePATError: real dws nested permission shape recognized", () => {
  const r = parsePATError(nestedShapePermission);
  assert.ok(r);
  assert.ok(Array.isArray(r.missing_scopes));
  assert.ok(r.missing_scopes.includes("Cust.Message.Send"));
});

test("parsePATError: nested unauthenticated shape NOT a PAT (returns null)", () => {
  // unauth is a separate concern — caller treats it differently (re-auth flow)
  // not as a scope-grant flow.
  assert.equal(parsePATError(nestedShapeUnauth), null);
});

test("parsePATError: 非 JSON → null", () => {
  assert.equal(parsePATError("Error: random text"), null);
});

test("parsePATError: empty / nullish stderr → null", () => {
  assert.equal(parsePATError(""), null);
  assert.equal(parsePATError(null), null);
  assert.equal(parsePATError(undefined), null);
});

test("rewritePAT mode=local (flat shape input via parsePATError)", () => {
  const parsed = parsePATError(flatShape);
  const out = rewritePAT(parsed, { mode: "local" });
  assert.match(out.message, /dws pat chmod\s+\S+/);
  for (const s of parsed.missing_scopes) {
    assert.ok(out.message.includes(s));
  }
});

test("rewritePAT mode=local (nested shape input via parsePATError)", () => {
  const parsed = parsePATError(nestedShapePermission);
  const out = rewritePAT(parsed, { mode: "local" });
  assert.match(out.message, /dws pat chmod\s+\S+/);
  assert.ok(out.message.includes("Cust.Message.Send"));
});

test("rewritePAT mode=remote: scopes 透传给 builder, URL 进 message", () => {
  const parsed = parsePATError(nestedShapePermission);
  let receivedScopes = null;
  const out = rewritePAT(parsed, {
    mode: "remote",
    authorizeUrlBuilder: (scopes) => {
      receivedScopes = scopes;
      return `https://auth.example.com/authorize?extra_scope=${scopes.join(",")}&t=hmac2`;
    },
  });
  assert.deepEqual(receivedScopes, parsed.missing_scopes);
  assert.match(out.authorize_url, /^https:\/\/auth\.example\.com\/authorize\?/);
  assert.match(out.message, /点击授权/);
});

test("rewritePAT: 没 missing_scopes 也别炸", () => {
  const out = rewritePAT(
    { missing_scopes: [] },
    { mode: "local" }
  );
  assert.match(out.message, /权限/);
});
