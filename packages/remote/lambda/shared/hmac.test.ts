import { test } from "node:test";
import assert from "node:assert/strict";
import { signMcpToken, verifyMcpToken, signIncrAuthToken, verifyIncrAuthToken } from "./hmac.ts";

const KEY = "0".repeat(64); // 32-byte hex key

test("signMcpToken: returns base64url uid:exp:sig string", () => {
  const t = signMcpToken({ userId: "user-1", expiresInSec: 3600 }, KEY);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test("verifyMcpToken: round trip", () => {
  const t = signMcpToken({ userId: "user-2", expiresInSec: 3600 }, KEY);
  const r = verifyMcpToken(t, KEY);
  assert.equal(r.userId, "user-2");
  assert.ok(r.expiresAt > Math.floor(Date.now() / 1000));
});

test("verifyMcpToken: tampered sig rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  const parts = t.split(".");
  const bad = `${parts[0]}.${parts[1]}.tampered`;
  assert.throws(() => verifyMcpToken(bad, KEY), /signature mismatch/);
});

test("verifyMcpToken: expired rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: -10 }, KEY);
  assert.throws(() => verifyMcpToken(t, KEY), /expired/);
});

test("verifyMcpToken: wrong key rejected", () => {
  const t = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  assert.throws(() => verifyMcpToken(t, "1".repeat(64)), /signature mismatch/);
});

test("signIncrAuthToken / verifyIncrAuthToken: round trip with scopes", () => {
  const t = signIncrAuthToken({ userId: "u", scopes: ["a", "b"], expiresInSec: 600 }, KEY);
  const r = verifyIncrAuthToken(t, KEY);
  assert.equal(r.userId, "u");
  assert.deepEqual(r.scopes, ["a", "b"]);
});

test("verifyIncrAuthToken: cross-key with verifyMcpToken — must reject (different domain prefix)", () => {
  const mcp = signMcpToken({ userId: "u", expiresInSec: 3600 }, KEY);
  assert.throws(() => verifyIncrAuthToken(mcp, KEY), /signature mismatch|wrong token type/);
});
