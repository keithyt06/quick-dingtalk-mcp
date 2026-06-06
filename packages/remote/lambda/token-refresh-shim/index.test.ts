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
    if (op === "PutItemCommand") { ddbStore.set(cmd.input.Item.state.S, cmd.input.Item.payload.S); return {}; }
    if (op === "GetItemCommand") {
      const v = ddbStore.get(cmd.input.Key.state.S);
      return v ? { Item: { state: { S: cmd.input.Key.state.S }, payload: { S: v } } } : {};
    }
    if (op === "DeleteItemCommand") { ddbStore.delete(cmd.input.Key.state.S); return {}; }
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
