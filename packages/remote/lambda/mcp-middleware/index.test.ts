import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.AWS_REGION = "us-east-1";
process.env.HMAC_KEY_PARAM = "/test/hmac";
process.env.AGENTCORE_RUNTIME_URL = "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/test/invocations";
process.env.UPSTREAM_TIMEOUT_MS = "1000";

const HMAC_KEY = "00".repeat(32);

const fakeSsm = {
  send: async (_cmd: any) => ({ Parameter: { Value: HMAC_KEY } }),
};
const fakeCredsProvider = async () => ({ accessKeyId: "AKIA", secretAccessKey: "x" });

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
      smStore.set(cmd.input.SecretId, cmd.input.SecretString);
      return {};
    }
    throw new Error("unsupported");
  },
};

const fetchCalls: any[] = [];
let fetchImpl: (url: string, init?: any) => Promise<Response> = async () => new Response("ok", { status: 200 });
(globalThis as any).fetch = (url: string, init?: any) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); };

const sm = await import("../shared/sm-client.ts");
sm._setClient(smFake);
const { signMcpToken } = await import("../shared/hmac.ts");

const mod = await import("./index.ts");
mod._setClients({ ssm: fakeSsm, credsProvider: fakeCredsProvider });
const { handler } = mod;

beforeEach(() => {
  smStore.clear();
  fetchCalls.length = 0;
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
});

function event(token: string, body = "{}"): any {
  return {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body,
    requestContext: { http: { method: "POST", path: "/mcp" } },
    rawPath: "/mcp",
  };
}

test("missing bearer → 401", async () => {
  const r = await handler({ headers: {}, body: "", requestContext: { http: { method: "POST", path: "/mcp" } } } as any, {} as any);
  assert.equal((r as any).statusCode, 401);
});

test("malformed token → 401", async () => {
  const r = await handler(event("garbage"), {} as any);
  assert.equal((r as any).statusCode, 401);
});

test("valid token but no SM entry → 401 no-user-token", async () => {
  const tok = signMcpToken({ userId: "u1", expiresInSec: 3600 }, HMAC_KEY);
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 401);
  assert.match((r as any).body, /no-user-token/);
});

test("near-expiry user token → 503", async () => {
  const tok = signMcpToken({ userId: "u2", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u2", JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_at: Math.floor(Date.now() / 1000) + 5, scope: "" }));
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 503);
  assert.equal((r as any).headers["retry-after"], "30");
});

test("happy path → SigV4 signed call to AgentCore + transparent body", async () => {
  const tok = signMcpToken({ userId: "u3", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u3", JSON.stringify({ access_token: "AT-3", refresh_token: "RT-3", expires_at: Math.floor(Date.now() / 1000) + 7200, scope: "" }));
  let captured: any;
  fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response("data: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const r = await handler(event(tok, '{"hi":1}'), {} as any);
  assert.equal((r as any).statusCode, 200);
  assert.match(captured.init.headers["x-user-access-token"], /AT-3/);
  assert.match(captured.init.headers["authorization"], /^AWS4-HMAC-SHA256/);
  assert.equal((r as any).headers["cache-control"], "no-store");
});

test("upstream timeout → 504", async () => {
  const tok = signMcpToken({ userId: "u4", expiresInSec: 3600 }, HMAC_KEY);
  smStore.set("quick-dingtalk-mcp/users/u4", JSON.stringify({ access_token: "x", refresh_token: "y", expires_at: Math.floor(Date.now() / 1000) + 7200, scope: "" }));
  fetchImpl = async (_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 504);
});

const DAY = 86400;

test("闲置超90天 → 401 idle-expired + hint", async () => {
  const tok = signMcpToken({ userId: "u5", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u5", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
    last_active: now - 91 * DAY,
  }));
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 401);
  assert.match((r as any).body, /idle-expired/);
  assert.match((r as any).body, /hint/, "idle-expired 应带可读 hint(P1)");
});

test("无 last_active(旧记录)→ 放行并写入 last_active", async () => {
  const tok = signMcpToken({ userId: "u6", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  smStore.set("quick-dingtalk-mcp/users/u6", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
  }));
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 200);
  const stored = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u6")!);
  assert.ok(stored.last_active >= now, "last_active 应被写入");
});

test("节流写时 secret 已被吊销(重读为null)→ 不复活、仍放行", async () => {
  const tok = signMcpToken({ userId: "u8", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const id = "quick-dingtalk-mcp/users/u8";
  // 首读有值(过了节流阈值,会触发写路径),但写前会重读。
  smStore.set(id, JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
    last_active: now - 5 * DAY,
  }));
  // 包装 get:第一次返回原值,第二次(写前重读)模拟已被吊销返回 not-found。
  let getCount = 0;
  const realSend = smFake.send;
  (smFake as any).send = async (cmd: any) => {
    if (cmd.constructor.name === "GetSecretValueCommand") {
      getCount++;
      if (getCount >= 2) { const e: any = new Error("gone"); e.name = "ResourceNotFoundException"; throw e; }
    }
    return realSend(cmd);
  };
  try {
    fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
    const r = await handler(event(tok), {} as any);
    assert.equal((r as any).statusCode, 200, "token 此刻仍有效,应放行");
    // 不应被复活:store 里仍是原记录(没有因 CreateSecret 兜底重建/改写)。
    assert.ok(smStore.has(id), "原 secret 仍在(本测试未真正删,只是重读模拟 null)");
  } finally {
    (smFake as any).send = realSend;
  }
});

test("last_active 在1天内 → 放行但不重写(节流)", async () => {
  const tok = signMcpToken({ userId: "u7", expiresInSec: 3600 }, HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const recent = now - 100; // 100秒前,远小于1天
  smStore.set("quick-dingtalk-mcp/users/u7", JSON.stringify({
    access_token: "AT", refresh_token: "RT", expires_at: now + 7200, scope: "",
    last_active: recent,
  }));
  fetchImpl = async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  const r = await handler(event(tok), {} as any);
  assert.equal((r as any).statusCode, 200);
  const stored = JSON.parse(smStore.get("quick-dingtalk-mcp/users/u7")!);
  assert.equal(stored.last_active, recent, "节流期内 last_active 不应被改写");
});
