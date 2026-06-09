import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  verifyPkceS256,
  extractClientCredentials,
  authServerMetadata,
  protectedResourceMetadata,
  buildDcrRegistration,
  genClientId,
  genRefreshToken,
} from "./oauth.ts";

test("verifyPkceS256: matching verifier/challenge passes, mismatch fails", () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(verifier, "wrong"), false);
  assert.equal(verifyPkceS256("", challenge), false);
  assert.equal(verifyPkceS256(verifier, ""), false);
});

test("extractClientCredentials: body takes precedence", () => {
  const r = extractClientCredentials({}, { client_id: "c1", client_secret: "s1" });
  assert.equal(r.clientId, "c1");
  assert.equal(r.clientSecret, "s1");
});

test("extractClientCredentials: falls back to Basic header (Quick)", () => {
  // client_id="amazon", secret="sec ret" (urlencoded), base64'd
  const basic = Buffer.from(`amazon:${encodeURIComponent("sec ret")}`).toString("base64");
  const r = extractClientCredentials({ authorization: `Basic ${basic}` }, {});
  assert.equal(r.clientId, "amazon");
  assert.equal(r.clientSecret, "sec ret");
});

test("extractClientCredentials: none → undefined", () => {
  const r = extractClientCredentials({}, {});
  assert.equal(r.clientId, undefined);
  assert.equal(r.clientSecret, undefined);
});

test("authServerMetadata: RFC 8414 shape, S256 + DCR advertised", () => {
  const m = authServerMetadata("https://gw.example.com");
  assert.equal(m.issuer, "https://gw.example.com");
  assert.equal(m.authorization_endpoint, "https://gw.example.com/authorize");
  assert.equal(m.token_endpoint, "https://gw.example.com/token");
  assert.equal(m.registration_endpoint, "https://gw.example.com/register");
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.ok(m.grant_types_supported.includes("refresh_token"));
  assert.ok(m.token_endpoint_auth_methods_supported.includes("client_secret_basic"));
});

test("protectedResourceMetadata: RFC 9728 shape points at AS", () => {
  const m = protectedResourceMetadata("https://gw.example.com", "https://gw.example.com/mcp");
  assert.equal(m.resource, "https://gw.example.com/mcp");
  assert.deepEqual(m.authorization_servers, ["https://gw.example.com"]);
});

test("buildDcrRegistration: client_secret_basic gets a placeholder secret", () => {
  const r = buildDcrRegistration(
    { redirect_uris: ["https://x.quicksight.aws.amazon.com/sn/oauthcallback"], token_endpoint_auth_method: "client_secret_basic" },
    1000,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.clientId.startsWith("client_"));
  assert.ok(r.clientSecret.length > 0, "basic client must get a secret");
  assert.equal(r.response.client_secret, r.clientSecret);
  assert.equal(r.response.client_secret_expires_at, 0);
});

test("buildDcrRegistration: public client (none) gets no secret", () => {
  const r = buildDcrRegistration(
    { redirect_uris: ["https://x/cb"], token_endpoint_auth_method: "none" },
    1000,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.clientSecret, "");
  assert.equal(r.response.client_secret, undefined);
});

test("buildDcrRegistration: missing/empty redirect_uris → error", () => {
  const r1 = buildDcrRegistration({}, 1000);
  assert.equal(r1.ok, false);
  const r2 = buildDcrRegistration({ redirect_uris: [] }, 1000);
  assert.equal(r2.ok, false);
});

test("buildDcrRegistration: non-https non-localhost redirect → error", () => {
  const r = buildDcrRegistration({ redirect_uris: ["http://evil.example.com/cb"] }, 1000);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.error, "invalid_redirect_uri");
});

test("buildDcrRegistration: localhost http allowed (dev)", () => {
  const r = buildDcrRegistration({ redirect_uris: ["http://localhost:8080/cb"] }, 1000);
  assert.equal(r.ok, true);
});

test("gen helpers produce prefixed unique tokens", () => {
  assert.notEqual(genClientId(), genClientId());
  assert.ok(genRefreshToken().startsWith("rt_"));
});
