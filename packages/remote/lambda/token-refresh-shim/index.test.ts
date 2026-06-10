import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.AWS_REGION = "us-east-1";
process.env.OAUTH_STATE_TABLE = "TEST_STATE";
process.env.HMAC_KEY_PARAM = "/test/hmac";
process.env.DINGTALK_APP_ID = "test-app";
process.env.DINGTALK_APP_SECRET_PARAM = "/test/secret";
process.env.OAUTH_BASE_URL = "https://auth.example.com";
process.env.DINGTALK_AUTHORIZE_URL = "https://login.dingtalk.com/oauth2/auth";
process.env.DINGTALK_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
process.env.DINGTALK_USER_ME_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

const SSM_KEY = "00".repeat(32);

// In-memory DDB
const ddbStore = new Map<string, any>();
const fakeDdb = {
  send: async (cmd: any) => {
    const op = cmd.constructor.name;
    if (op === "PutItemCommand") {
      // Store payload + ttl so ddbGet's in-code expiry check can be exercised.
      ddbStore.set(cmd.input.Item.state.S, { payload: cmd.input.Item.payload.S, ttl: cmd.input.Item.ttl?.N });
      return {};
    }
    if (op === "GetItemCommand") {
      const v = ddbStore.get(cmd.input.Key.state.S);
      if (!v) return {};
      return { Item: { state: { S: cmd.input.Key.state.S }, payload: { S: v.payload }, ...(v.ttl ? { ttl: { N: v.ttl } } : {}) } };
    }
    if (op === "DeleteItemCommand") {
      const k = cmd.input.Key.state.S;
      const v = ddbStore.get(k);
      ddbStore.delete(k);
      if (cmd.input.ReturnValues === "ALL_OLD" && v) {
        return { Attributes: { state: { S: k }, payload: { S: v.payload }, ...(v.ttl ? { ttl: { N: v.ttl } } : {}) } };
      }
      return {};
    }
    throw new Error(`unknown ddb op ${op}`);
  },
};

// In-memory SSM
const fakeSsm = {
  send: async (cmd: any) => {
    if (cmd.constructor.name === "GetParameterCommand") {
      if (cmd.input.Name === "/test/hmac") return { Parameter: { Value: SSM_KEY } };
      if (cmd.input.Name === "/test/secret") return { Parameter: { Value: "fake-app-secret" } };
    }
    throw new Error("unknown ssm op");
  },
};

// In-memory SM
const smStore = new Map<string, string>();
const smFake = {
  send: async (cmd: any) => {
    const op = cmd.constructor.name;
    if (op === "GetSecretValueCommand") {
      const v = smStore.get(cmd.input.SecretId);
      if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
      return { SecretString: v };
    }
    if (op === "PutSecretValueCommand") {
      if (!smStore.has(cmd.input.SecretId)) {
        const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e;
      }
      smStore.set(cmd.input.SecretId, cmd.input.SecretString);
      return {};
    }
    if (op === "CreateSecretCommand") { smStore.set(cmd.input.Name, cmd.input.SecretString); return {}; }
    if (op === "DeleteSecretCommand") { smStore.delete(cmd.input.SecretId); return {}; }
    if (op === "ListSecretsCommand") {
      return { SecretList: [...smStore.keys()].map(Name => ({ Name })) };
    }
    throw new Error(`unknown sm op ${op}`);
  },
};

// Stub global fetch for DingTalk API
const fetchCalls: { url: string; init?: any }[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("not-stubbed", { status: 500 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

const sm = await import("../shared/sm-client.ts");
sm._setClient(smFake);

const mod = await import("./index.ts");
mod._setClients({ ddb: fakeDdb, ssm: fakeSsm });
const { handler } = mod;
const { signIncrAuthToken } = await import("../shared/hmac.ts");

import { createHash, randomBytes } from "node:crypto";
const ev = (method: string, path: string, opts: any = {}) => ({
  rawPath: path,
  requestContext: { http: { path, method } },
  queryStringParameters: opts.qs,
  body: opts.body,
  headers: opts.headers || {},
  isBase64Encoded: false,
}) as any;
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

beforeEach(() => {
  ddbStore.clear();
  smStore.clear();
  fetchCalls.length = 0;
});

test("/authorize: returns 302 with proper state in DDB", async () => {
  const r = await handler(
    { rawPath: "/authorize", requestContext: { http: { path: "/authorize", method: "GET" } }, queryStringParameters: {} } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 302);
  const loc = (r as any).headers.location as string;
  assert.match(loc, /^https:\/\/login\.dingtalk\.com/);
  assert.match(loc, /code_challenge=/);
  assert.match(loc, /state=/);
  // dws forces prompt=consent and scope=openid corpid (auth/endpoints.go).
  assert.match(loc, /prompt=consent/);
  const scope = new URL(loc).searchParams.get("scope");
  assert.equal(scope, "openid corpid");
  assert.equal(ddbStore.size, 1);
});

test("/callback: full happy path → SM stores token + html with mcp token", async () => {
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) {
      // dws v1.0.32 returns `expiresIn` (with s). Use it here so the test
      // pins the correct field name, not the old `expireIn` typo.
      return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "openid" }), { status: 200 });
    }
    if (url.includes("contact/users/me")) {
      return new Response(JSON.stringify({ unionId: "uid-42" }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };
  await handler(
    { rawPath: "/authorize", requestContext: { http: { path: "/authorize", method: "GET" } }, queryStringParameters: {} } as any,
    {} as any,
  );
  const state = [...ddbStore.keys()][0];

  const r = await handler(
    { rawPath: "/callback", requestContext: { http: { path: "/callback", method: "GET" } }, queryStringParameters: { code: "abc", state } } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 200);
  assert.match(((r as any).body as string), /Bearer /);
  assert.equal(smStore.size, 1);
  // expires_at must be a finite number ~now+7200, not NaN (the `expireIn` typo
  // produced now+undefined = NaN → every later call looked "near expiry").
  const stored = JSON.parse([...smStore.values()][0]);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Number.isFinite(stored.expires_at), "expires_at must be finite");
  assert.ok(stored.expires_at > now + 7000 && stored.expires_at <= now + 7200, `expires_at ~now+7200, got ${stored.expires_at - now}`);
});

test("/callback: user/me returns no id → 500, token NOT stored under 'undefined'", async () => {
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "openid" }), { status: 200 });
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({}), { status: 200 }); // no id fields
    return new Response("nope", { status: 404 });
  };
  await handler(ev("GET", "/authorize", { qs: {} }), {} as any);
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;
  const cb = await handler(ev("GET", "/callback", { qs: { code: "c", state: dingState } }), {} as any);
  assert.equal((cb as any).statusCode, 500);
  assert.equal(smStore.size, 0, "nothing must be stored when user id is missing");
});

test("/callback: unknown state → 400", async () => {
  const r = await handler(
    { rawPath: "/callback", requestContext: { http: { path: "/callback", method: "GET" } }, queryStringParameters: { code: "x", state: "nonexistent" } } as any,
    {} as any,
  );
  assert.equal((r as any).statusCode, 400);
});

test("EventBridge refresh: only refreshes near-expiry users", async () => {
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u1", JSON.stringify({ access_token: "old", refresh_token: "rt1", expires_at: now + 100, scope: "" }));
  smStore.set("quick-dingtalk-mcp/users/u2", JSON.stringify({ access_token: "still-good", refresh_token: "rt2", expires_at: now + 7200, scope: "" }));

  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "NEW", refreshToken: "RT-new", expireIn: 7200, scope: "" }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };

  const r = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r as any).refreshed, 2);
  const u1 = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u1")!);
  assert.equal(u1.access_token, "NEW");
});

test("EventBridge refresh: failure marks needs_reauth", async () => {
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/uf", JSON.stringify({ access_token: "x", refresh_token: "rt-bad", expires_at: now + 100, scope: "" }));
  fetchImpl = async () => new Response("invalid_grant", { status: 400 });
  const r = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r as any).failed, 1);
  const uf = JSON.parse(smStore.get("quick-dingtalk-mcp/users/uf")!);
  assert.equal(uf.needs_reauth, true);
});

test("EventBridge refresh: TRANSIENT failure (5xx/network) must NOT mark needs_reauth", async () => {
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/ut5", JSON.stringify({ access_token: "x", refresh_token: "rt-ok", expires_at: now + 100, scope: "" }));
  // DingTalk having a bad minute is not a revoked grant — the user must not be
  // force-logged-out; next 30-min run retries with the same refresh_token.
  fetchImpl = async () => new Response("upstream blew up", { status: 503 });
  const r1 = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r1 as any).failed, 1);
  let u = JSON.parse(smStore.get("quick-dingtalk-mcp/users/ut5")!);
  assert.notEqual(u.needs_reauth, true, "5xx must not set needs_reauth");

  // Network-level failure (fetch rejects) — same rule.
  fetchImpl = async () => { throw new Error("ECONNRESET"); };
  const r2 = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r2 as any).failed, 1);
  u = JSON.parse(smStore.get("quick-dingtalk-mcp/users/ut5")!);
  assert.notEqual(u.needs_reauth, true, "network error must not set needs_reauth");

  // DingTalk recovers → refresh succeeds with the preserved refresh_token.
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "NEW", refreshToken: "RT-new", expiresIn: 7200, scope: "" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  const r3 = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r3 as any).refreshed, 1);
  u = JSON.parse(smStore.get("quick-dingtalk-mcp/users/ut5")!);
  assert.equal(u.access_token, "NEW");
});

test("E1: refresh 成功后保留 last_active(否则90天窗口失效)", async () => {
  const now = Math.floor(Date.now() / 1000);
  const la = now - 1000;
  smStore.set("quick-dingtalk-mcp/users/ue1", JSON.stringify({
    access_token: "OLD", refresh_token: "rt-e1", expires_at: now + 100, scope: "x", last_active: la,
  }));
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) {
      return new Response(JSON.stringify({ accessToken: "NEW", refreshToken: "RT-new", expiresIn: 7200, scope: "x" }), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };
  const r = await handler({ source: "aws.events" } as any, {} as any);
  assert.equal((r as any).refreshed, 1);
  const stored = JSON.parse(smStore.get("quick-dingtalk-mcp/users/ue1")!);
  assert.equal(stored.access_token, "NEW", "token 应已轮换");
  assert.equal(stored.last_active, la, "last_active 必须被保留");
});

// ---------------- Standard OAuth 2.1 Authorization Server ----------------

test("GET /.well-known/oauth-authorization-server: RFC 8414 metadata", async () => {
  const r = await handler(ev("GET", "/.well-known/oauth-authorization-server"), {} as any);
  assert.equal((r as any).statusCode, 200);
  const m = JSON.parse((r as any).body);
  assert.equal(m.issuer, "https://auth.example.com");
  assert.equal(m.token_endpoint, "https://auth.example.com/token");
  assert.equal(m.registration_endpoint, "https://auth.example.com/register");
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
});

test("GET /.well-known/oauth-protected-resource: RFC 9728 metadata", async () => {
  const r = await handler(ev("GET", "/.well-known/oauth-protected-resource"), {} as any);
  assert.equal((r as any).statusCode, 200);
  const m = JSON.parse((r as any).body);
  assert.deepEqual(m.authorization_servers, ["https://auth.example.com"]);
});

test("POST /register: DCR returns client_id + placeholder secret (basic)", async () => {
  const r = await handler(ev("POST", "/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://x.quicksight.aws.amazon.com/sn/oauthcallback"], token_endpoint_auth_method: "client_secret_basic" }),
  }), {} as any);
  assert.equal((r as any).statusCode, 201);
  const body = JSON.parse((r as any).body);
  assert.ok(body.client_id.startsWith("client_"));
  assert.ok(body.client_secret.length > 0);
  // Client record persisted in DDB under client# prefix
  assert.ok([...ddbStore.keys()].some((k) => k.startsWith("client#")));
});

// Helper: register a client + run /authorize to get an mcp_code back via callback.
async function runAuthCodeFlow(challenge: string) {
  const reg = await handler(ev("POST", "/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://quick.example.com/cb"], token_endpoint_auth_method: "client_secret_basic" }),
  }), {} as any);
  const clientId = JSON.parse((reg as any).body).client_id as string;

  const auth = await handler(ev("GET", "/authorize", {
    qs: { client_id: clientId, redirect_uri: "https://quick.example.com/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "quickstate" },
  }), {} as any);
  assert.equal((auth as any).statusCode, 302);
  // DingTalk state is the only raw (no #) key just written
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;

  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "openid" }), { status: 200 });
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({ unionId: "uid-oauth" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  const cb = await handler(ev("GET", "/callback", { qs: { code: "ding-code", state: dingState } }), {} as any);
  return { clientId, cb };
}

test("OAuth flow: /authorize→/callback 302s back to Quick with code+state", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { cb } = await runAuthCodeFlow(challenge);
  assert.equal((cb as any).statusCode, 302);
  const loc = new URL((cb as any).headers.location);
  assert.equal(loc.origin + loc.pathname, "https://quick.example.com/cb");
  assert.ok(loc.searchParams.get("code"));
  assert.equal(loc.searchParams.get("state"), "quickstate");
  // user DingTalk token stored; a one-time code# persisted
  assert.equal(smStore.size, 1);
  assert.ok([...ddbStore.keys()].some((k) => k.startsWith("code#")));
});

test("POST /token authorization_code: valid PKCE → access+refresh", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:anysecret`).toString("base64");

  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  assert.equal((r as any).statusCode, 200);
  const tok = JSON.parse((r as any).body);
  assert.equal(tok.token_type, "Bearer");
  assert.ok(tok.access_token && tok.refresh_token);
  assert.equal(tok.expires_in, 3600);
  // code consumed (one-time)
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("code#")));
});

test("POST /token authorization_code: wrong PKCE verifier → invalid_grant", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: "WRONG-verifier" }),
  }), {} as any);
  assert.equal((r as any).statusCode, 400);
  assert.equal(JSON.parse((r as any).body).error, "invalid_grant");
});

test("POST /token refresh_token: rotates, denies revoked user", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  const first = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  const rt = JSON.parse((first as any).body).refresh_token as string;

  // refresh succeeds while user token is healthy
  const r2 = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "refresh_token", refresh_token: rt }),
  }), {} as any);
  assert.equal((r2 as any).statusCode, 200);
  assert.ok(JSON.parse((r2 as any).body).access_token);

  // simulate revocation (ops.sh deletes the user secret) → refresh denied
  smStore.clear();
  const r3 = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "refresh_token", refresh_token: rt }),
  }), {} as any);
  assert.equal((r3 as any).statusCode, 400);
  assert.equal(JSON.parse((r3 as any).body).error, "invalid_grant");
});

test("/authorize without OAuth params → HTML fallback still works", async () => {
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "openid" }), { status: 200 });
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({ unionId: "uid-fallback" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  await handler(ev("GET", "/authorize", { qs: {} }), {} as any);
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;
  const cb = await handler(ev("GET", "/callback", { qs: { code: "c", state: dingState } }), {} as any);
  assert.equal((cb as any).statusCode, 200);
  assert.match((cb as any).body as string, /Bearer /);
});

test("POST /token: unsupported grant → 400", async () => {
  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ grant_type: "password" }),
  }), {} as any);
  assert.equal((r as any).statusCode, 400);
  assert.equal(JSON.parse((r as any).body).error, "unsupported_grant_type");
});

// ---- code review backlog fixes (2026-06-09) ----

test("review#4: refresh_token without client_id → 400 (no anonymous rotation)", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  const first = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  const rt = JSON.parse((first as any).body).refresh_token as string;
  // refresh with NO Authorization header / no client_id must be rejected
  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ grant_type: "refresh_token", refresh_token: rt }),
  }), {} as any);
  assert.equal((r as any).statusCode, 400);
  assert.equal(JSON.parse((r as any).body).error, "invalid_client");
});

test("review#3: ?t= incremental-auth never opens an OAuth session (no consent-bypass code mint)", async () => {
  // Seed a user + a valid incrAuthToken for them.
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/victim", JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "openid" }));
  const incr = signIncrAuthToken({ userId: "victim", scopes: [], expiresInSec: 600 }, SSM_KEY);
  // Register an attacker-controlled client.
  const reg = await handler(ev("POST", "/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://attacker.example.com/cb"], token_endpoint_auth_method: "client_secret_basic" }),
  }), {} as any);
  const attackerClient = JSON.parse((reg as any).body).client_id as string;

  // Craft /authorize with BOTH ?t= and OAuth params.
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "AT2", refreshToken: "RT2", expiresIn: 7200, scope: "openid" }), { status: 200 });
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({ unionId: "victim" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  const challenge = createHash("sha256").update(randomBytes(48).toString("base64url")).digest("base64url");
  await handler(ev("GET", "/authorize", {
    qs: { t: incr, client_id: attackerClient, redirect_uri: "https://attacker.example.com/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "x" },
  }), {} as any);
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;
  // No OAuth session should have been created (mutual exclusion with ?t=).
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("sess#")), "?t= must not open an OAuth session");
  // Callback must NOT 302 to the attacker with a code — falls through to HTML.
  const cb = await handler(ev("GET", "/callback", { qs: { code: "dc", state: dingState } }), {} as any);
  assert.equal((cb as any).statusCode, 200, "incremental-auth callback must not redirect a code to a client");
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("code#")), "no mcp_code minted on ?t= path");
});

test("review#1: past-ttl code is rejected in code even if DynamoDB hasn't swept it", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  // Register a client so the code redemption gets past client_id checks.
  const reg = await handler(ev("POST", "/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://q.example.com/cb"], token_endpoint_auth_method: "client_secret_basic" }),
  }), {} as any);
  const clientId = JSON.parse((reg as any).body).client_id as string;
  // Inject a code# record whose ttl is already in the past (DynamoDB hasn't
  // physically deleted it yet). ddbGet must treat it as absent.
  ddbStore.set("code#stale", {
    payload: JSON.stringify({ userId: "u", clientId, redirectUri: "https://q.example.com/cb", codeChallenge: challenge, scope: "openid" }),
    ttl: String(Math.floor(Date.now() / 1000) - 10),
  });
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code: "stale", redirect_uri: "https://q.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  assert.equal((r as any).statusCode, 400);
  assert.equal(JSON.parse((r as any).body).error, "invalid_grant");
});

test("review#6: failed PKCE attempt burns the code — retry with correct verifier also fails", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  // First attempt: wrong verifier → invalid_grant AND the code must be burned.
  const bad = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: "WRONG" }),
  }), {} as any);
  assert.equal((bad as any).statusCode, 400);
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("code#")), "code must be deleted on ANY redemption attempt");
  // Second attempt with the CORRECT verifier must now fail (single-use).
  const retry = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  assert.equal((retry as any).statusCode, 400);
  assert.equal(JSON.parse((retry as any).body).error, "invalid_grant");
});

test("review#7: expired OAuth session at /callback → 400 with NOTHING persisted (no user token, no code)", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const reg = await handler(ev("POST", "/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://quick.example.com/cb"], token_endpoint_auth_method: "client_secret_basic" }),
  }), {} as any);
  const clientId = JSON.parse((reg as any).body).client_id as string;
  await handler(ev("GET", "/authorize", {
    qs: { client_id: clientId, redirect_uri: "https://quick.example.com/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" },
  }), {} as any);
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;
  // Simulate slow consent: the sess# record expired and was swept.
  const sessKey = [...ddbStore.keys()].find((k) => k.startsWith("sess#"))!;
  ddbStore.delete(sessKey);
  let dingTokenExchanged = false;
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) { dingTokenExchanged = true; return new Response(JSON.stringify({ accessToken: "AT", refreshToken: "RT", expiresIn: 7200, scope: "openid" }), { status: 200 }); }
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({ unionId: "uid-slow" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  const cb = await handler(ev("GET", "/callback", { qs: { code: "dc", state: dingState } }), {} as any);
  assert.equal((cb as any).statusCode, 400);
  assert.equal(smStore.size, 0, "DingTalk token must NOT be stored when the OAuth session is dead");
  assert.equal(dingTokenExchanged, false, "DingTalk code must not even be exchanged");
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("code#")), "no mcp_code minted");
});

test("review#9: refresh_token denied + burned when user idle past 90-day window", async () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { clientId, cb } = await runAuthCodeFlow(challenge);
  const code = new URL((cb as any).headers.location).searchParams.get("code")!;
  const basic = Buffer.from(`${clientId}:x`).toString("base64");
  const first = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "authorization_code", code, redirect_uri: "https://quick.example.com/cb", code_verifier: verifier }),
  }), {} as any);
  const rt = JSON.parse((first as any).body).refresh_token as string;
  // Mark the user idle > 90 days (same field mcp-middleware checks).
  const now = Math.floor(Date.now() / 1000);
  const id = "quick-dingtalk-mcp/users/uid-oauth";
  const ut = JSON.parse(smStore.get(id)!);
  smStore.set(id, JSON.stringify({ ...ut, last_active: now - 91 * 86400 }));
  const r = await handler(ev("POST", "/token", {
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body: form({ grant_type: "refresh_token", refresh_token: rt }),
  }), {} as any);
  assert.equal((r as any).statusCode, 400);
  assert.match(JSON.parse((r as any).body).error_description, /idle-expired/);
  assert.ok(![...ddbStore.keys()].some((k) => k.startsWith("refresh#")), "refresh token must be burned");
});

test("incr-auth callback: consenting account ≠ session uid → 400, token NOT overwritten", async () => {
  // Victim already has a stored token; an incr re-auth for victim is completed
  // by a DIFFERENT DingTalk account — must be rejected, victim token untouched.
  const now = Math.floor(Date.now() / 1000);
  const victimId = "quick-dingtalk-mcp/users/victim-uid";
  smStore.set(victimId, JSON.stringify({ access_token: "VICTIM-AT", refresh_token: "VICTIM-RT", expires_at: now + 7200, scope: "openid" }));
  const incr = signIncrAuthToken({ userId: "victim-uid", scopes: [], expiresInSec: 600 }, SSM_KEY);
  await handler(ev("GET", "/authorize", { qs: { t: incr } }), {} as any);
  const dingState = [...ddbStore.keys()].find((k) => !k.includes("#"))!;
  fetchImpl = async (url) => {
    if (url.includes("oauth2/userAccessToken")) return new Response(JSON.stringify({ accessToken: "OTHER-AT", refreshToken: "OTHER-RT", expiresIn: 7200, scope: "openid" }), { status: 200 });
    if (url.includes("contact/users/me")) return new Response(JSON.stringify({ unionId: "someone-else" }), { status: 200 });
    return new Response("nope", { status: 404 });
  };
  const cb = await handler(ev("GET", "/callback", { qs: { code: "dc", state: dingState } }), {} as any);
  assert.equal((cb as any).statusCode, 400);
  const stored = JSON.parse(smStore.get(victimId)!);
  assert.equal(stored.access_token, "VICTIM-AT", "victim's token must not be overwritten by another account's consent");
});
