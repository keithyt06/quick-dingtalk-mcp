import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  EventBridgeEvent,
  Context,
} from "aws-lambda";
import { createHash, randomBytes } from "node:crypto";
import { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { log } from "../shared/log.ts";
import { signMcpToken, verifyIncrAuthToken } from "../shared/hmac.ts";
import { getUserToken, putUserToken, listUserSecrets, type UserToken } from "../shared/sm-client.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const DDB_TABLE = process.env.OAUTH_STATE_TABLE!;
const HMAC_KEY_PARAM = process.env.HMAC_KEY_PARAM!;
const DINGTALK_APP_ID = process.env.DINGTALK_APP_ID!;
const DINGTALK_APP_SECRET_PARAM = process.env.DINGTALK_APP_SECRET_PARAM!;
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL!;
const DINGTALK_AUTHORIZE_URL = process.env.DINGTALK_AUTHORIZE_URL || "https://login.dingtalk.com/oauth2/auth";
const DINGTALK_TOKEN_URL = process.env.DINGTALK_TOKEN_URL || "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USER_ME_URL = process.env.DINGTALK_USER_ME_URL || "https://api.dingtalk.com/v1.0/contact/users/me";
const REFRESH_BUFFER_SEC = 60 * 60; // refresh if expires_at - now < 60min
// MCP Bearer 不带功能性过期 —— 有效性由 mcp-middleware 的「90 天活跃窗口」判定。
// 这里只保留一个远期硬上限(~13 个月 > 90 天窗口),作纵深防御:
// 即便活跃窗口逻辑失效,token 也终会自然过期,不会变成永久不可吊销的裸钥匙。
const MCP_TOKEN_MAX_LIFETIME_SEC = 400 * 86400;
// dws v1.0.32 requests `openid corpid` by default (auth/endpoints.go: DefaultScopes).
// `corpid` is needed for the enterprise context (corpId) most org-level APIs require.
const DEFAULT_SCOPES = (process.env.DEFAULT_SCOPES || "openid corpid").split(/[, ]+/).map(s => s.trim()).filter(Boolean);
const REFRESH_FAILURE_METRIC_NAMESPACE = "QuickDingtalkMcp/Remote";

let ddb: { send: (cmd: any) => Promise<any> } = new DynamoDBClient({ region: REGION });
let ssm: { send: (cmd: any) => Promise<any> } = new SSMClient({ region: REGION });

export function _setClients(c: { ddb?: { send: (cmd: any) => Promise<any> }; ssm?: { send: (cmd: any) => Promise<any> } }): void {
  if (c.ddb) ddb = c.ddb;
  if (c.ssm) ssm = c.ssm;
  cachedHmacKey = null;
  cachedAppSecret = null;
}

let cachedHmacKey: string | null = null;
let cachedAppSecret: string | null = null;

async function getHmacKey(): Promise<string> {
  if (cachedHmacKey) return cachedHmacKey;
  const r = await ssm.send(new GetParameterCommand({ Name: HMAC_KEY_PARAM, WithDecryption: true }));
  cachedHmacKey = r.Parameter!.Value!;
  return cachedHmacKey;
}

async function getDingtalkAppSecret(): Promise<string> {
  if (cachedAppSecret) return cachedAppSecret;
  const r = await ssm.send(new GetParameterCommand({ Name: DINGTALK_APP_SECRET_PARAM, WithDecryption: true }));
  cachedAppSecret = r.Parameter!.Value!;
  return cachedAppSecret;
}

// --- PKCE helpers ---
function pkceVerifier(): string {
  return randomBytes(48).toString("base64url");
}
function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// --- DDB state store ---
async function putState(state: string, payload: { verifier: string; scopes: string[]; uid?: string }): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5min
  await ddb.send(new PutItemCommand({
    TableName: DDB_TABLE,
    Item: {
      state: { S: state },
      payload: { S: JSON.stringify(payload) },
      ttl: { N: String(ttl) },
    },
  }));
}

async function consumeState(state: string): Promise<{ verifier: string; scopes: string[]; uid?: string } | null> {
  const r = await ddb.send(new GetItemCommand({
    TableName: DDB_TABLE,
    Key: { state: { S: state } },
  }));
  if (!r.Item) return null;
  await ddb.send(new DeleteItemCommand({
    TableName: DDB_TABLE,
    Key: { state: { S: state } },
  }));
  const payload = r.Item.payload?.S;
  if (!payload) return null;
  return JSON.parse(payload);
}

// --- DingTalk OAuth ---
async function exchangeCodeForToken(code: string, verifier: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const appSecret = await getDingtalkAppSecret();
  const r = await fetch(DINGTALK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: DINGTALK_APP_ID,
      clientSecret: appSecret,
      code,
      codeVerifier: verifier,
      grantType: "authorization_code",
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DingTalk token exchange failed: ${r.status} ${t}`);
  }
  const j = await r.json() as any;
  return {
    access_token: j.accessToken,
    refresh_token: j.refreshToken,
    // dws v1.0.32 parses `expiresIn` (oauth_helpers.go: parseTokenResponse);
    // casdoor's older provider uses `expireIn`. Accept both to avoid an
    // undefined → NaN expires_at that would make every call look near-expiry.
    // Confirm the live field name once a real token round-trips (see
    // docs/superpowers/notes/2026-05-30-dingtalk-oauth-field-audit.md §1.2).
    expires_in: j.expiresIn ?? j.expireIn,
    scope: j.scope || "",
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const appSecret = await getDingtalkAppSecret();
  const r = await fetch(DINGTALK_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId: DINGTALK_APP_ID,
      clientSecret: appSecret,
      refreshToken,
      grantType: "refresh_token",
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DingTalk refresh failed: ${r.status} ${t}`);
  }
  const j = await r.json() as any;
  return {
    access_token: j.accessToken,
    refresh_token: j.refreshToken,
    expires_in: j.expiresIn ?? j.expireIn, // see exchangeCodeForToken note
    scope: j.scope || "",
  };
}

async function fetchUserId(accessToken: string): Promise<string> {
  const r = await fetch(DINGTALK_USER_ME_URL, {
    method: "GET",
    headers: { "x-acs-dingtalk-access-token": accessToken },
  });
  if (!r.ok) throw new Error(`DingTalk user/me failed: ${r.status}`);
  const j = await r.json() as any;
  return j.unionId || j.userid || j.openId || j.userId;
}

// --- HTTP route handlers ---
async function handleAuthorize(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  let scopes = DEFAULT_SCOPES;
  let userId: string | undefined;

  // Incremental auth path: ?t=<incrAuthToken>&extra_scope=...
  if (qs.t) {
    const key = await getHmacKey();
    try {
      const v = verifyIncrAuthToken(qs.t, key);
      userId = v.userId;
      scopes = [...new Set([...DEFAULT_SCOPES, ...(qs.extra_scope || "").split(/[, ]+/).filter(Boolean), ...v.scopes])];
    } catch (e: any) {
      log.warn("invalid incrAuthToken", { err: e.message });
      return { statusCode: 400, body: "invalid token" };
    }
  } else if (qs.extra_scope) {
    scopes = [...new Set([...DEFAULT_SCOPES, ...qs.extra_scope.split(/[, ]+/).filter(Boolean)])];
  }

  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const state = randomBytes(16).toString("base64url");
  await putState(state, { verifier, scopes, uid: userId });

  const u = new URL(DINGTALK_AUTHORIZE_URL);
  u.searchParams.set("client_id", DINGTALK_APP_ID);
  u.searchParams.set("redirect_uri", `${OAUTH_BASE_URL}/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scopes.join(" "));
  u.searchParams.set("state", state);
  // dws forces prompt=consent (auth/oauth_helpers.go: buildAuthURL) so DingTalk
  // always shows the consent page rather than silently skipping it.
  u.searchParams.set("prompt", "consent");
  // NOTE: dws's own flow is NOT PKCE — it uses clientSecret direct exchange.
  // We keep code_challenge for now; whether DingTalk accepts/requires PKCE here
  // is pending live validation (audit note §1.3). If it rejects, drop these two.
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return { statusCode: 302, headers: { location: u.toString(), "cache-control": "no-store" }, body: "" };
}

async function handleCallback(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters || {};
  if (!qs.code || !qs.state) return { statusCode: 400, body: "missing code or state" };
  const stateData = await consumeState(qs.state);
  if (!stateData) return { statusCode: 400, body: "state expired or unknown" };

  let token;
  try {
    token = await exchangeCodeForToken(qs.code, stateData.verifier);
  } catch (e: any) {
    log.error("token exchange failed", { err: e.message });
    return { statusCode: 502, body: "DingTalk token exchange failed" };
  }

  const userId = stateData.uid || await fetchUserId(token.access_token);
  const expiresAt = Math.floor(Date.now() / 1000) + token.expires_in;
  const userToken: UserToken = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt,
    scope: token.scope,
  };
  await putUserToken(userId, userToken);

  const hmacKey = await getHmacKey();
  const mcpToken = signMcpToken({ userId, expiresInSec: MCP_TOKEN_MAX_LIFETIME_SEC }, hmacKey);

  const html = `<!doctype html><meta charset="utf-8"><title>授权成功</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}</style>
<h1>钉钉授权成功</h1>
<p>把下面这一行复制到 Quick Desktop 的 <code>Authorization</code> header（或 MCP 配置的 <code>token</code> 字段）：</p>
<pre>Bearer ${mcpToken}</pre>
<p>有效期 24 小时；过期后再次跑授权即可。</p>`;
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
}

async function handleRefreshOne(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await getUserToken(userId);
  if (!t) return { ok: false, reason: "not-found" };
  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at - now > REFRESH_BUFFER_SEC) return { ok: true, reason: "skip-not-expiring" };
  try {
    const newT = await refreshAccessToken(t.refresh_token);
    const expiresAt = Math.floor(Date.now() / 1000) + newT.expires_in;
    await putUserToken(userId, {
      ...t, // 保留 last_active 等字段;窗口判定依赖它(spec §4.7)
      access_token: newT.access_token,
      refresh_token: newT.refresh_token,
      expires_at: expiresAt,
      scope: newT.scope || t.scope,
    });
    return { ok: true };
  } catch (e: any) {
    log.error("refresh failed", { userId, err: e.message });
    await putUserToken(userId, { ...t, needs_reauth: true });
    return { ok: false, reason: e.message };
  }
}

// --- main entry ---
export const handler = async (
  event: APIGatewayProxyEventV2 | EventBridgeEvent<string, unknown>,
  _context: Context,
): Promise<APIGatewayProxyResultV2 | { ok: boolean; refreshed: number; failed: number }> => {
  // EventBridge scheduled event
  if ("source" in event && event.source === "aws.events") {
    log.info("scheduled refresh start");
    const users = await listUserSecrets();
    let refreshed = 0, failed = 0;
    for (const uid of users) {
      const r = await handleRefreshOne(uid);
      if (r.ok) refreshed++; else failed++;
    }
    log.info("scheduled refresh done", { refreshed, failed });
    // Emit failed metric for CW alarm
    if (failed > 0) {
      console.log(JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{ Namespace: REFRESH_FAILURE_METRIC_NAMESPACE, Dimensions: [[]], Metrics: [{ Name: "RefreshFailureUsers", Unit: "Count" }] }],
        },
        RefreshFailureUsers: failed,
      }));
    }
    return { ok: failed === 0, refreshed, failed };
  }

  // API Gateway HTTP API event
  const apiEvent = event as APIGatewayProxyEventV2;
  const path = apiEvent.requestContext?.http?.path || apiEvent.rawPath || "";
  const method = apiEvent.requestContext?.http?.method || "GET";

  try {
    if (method === "GET" && path.endsWith("/authorize")) return await handleAuthorize(apiEvent);
    if (method === "GET" && path.endsWith("/callback")) return await handleCallback(apiEvent);
    return { statusCode: 404, body: "not found" };
  } catch (e: any) {
    log.error("handler error", { err: e.message, path, method });
    return { statusCode: 500, body: "internal error" };
  }
};

// Internal exports for tests
export const _internals = {
  pkceVerifier,
  pkceChallenge,
  putState,
  consumeState,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchUserId,
  handleAuthorize,
  handleCallback,
  handleRefreshOne,
};
