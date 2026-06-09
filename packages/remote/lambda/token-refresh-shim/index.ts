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
import {
  verifyPkceS256,
  extractClientCredentials,
  authServerMetadata,
  protectedResourceMetadata,
  buildDcrRegistration,
  genAuthCode,
  genRefreshToken,
  type DcrRequest,
} from "../shared/oauth.ts";

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
// OAuth 2.1 path (Quick wizard): short access + auto-refresh. access_token signs
// 1h; the host silently refreshes via refresh_token (90d). The 90-day idle
// window + 13-month hard ceiling in mcp-middleware still apply to both paths as
// defense-in-depth — OAuth just gives Quick a token it can rotate itself.
const OAUTH_ACCESS_TTL_SEC = parseInt(process.env.OAUTH_ACCESS_TTL_SEC || String(3600), 10);
const OAUTH_REFRESH_TTL_SEC = parseInt(process.env.OAUTH_REFRESH_TTL_SEC || String(90 * 86400), 10);
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
// `oauthSessionId` links a DingTalk round-trip back to an in-flight Quick OAuth
// session (present only on the standard OAuth path; absent on the HTML fallback).
type StatePayload = { verifier: string; scopes: string[]; uid?: string; oauthSessionId?: string };
async function putState(state: string, payload: StatePayload): Promise<void> {
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

async function consumeState(state: string): Promise<StatePayload | null> {
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
  // Reject past-ttl state in code (DynamoDB TTL sweep is best-effort/laggy).
  const ttl = r.Item.ttl?.N;
  if (ttl && Math.floor(Date.now() / 1000) > Number(ttl)) return null;
  return JSON.parse(payload);
}

// --- OAuth Authorization Server records (same OAuthStateTable, key-prefixed) ---
// We reuse the existing single-table + `state` partition key + `ttl` attribute.
// Record kinds are distinguished by key prefix; TTL varies per kind.
//   client#<id>  registered DCR client (redirect_uri allowlist) — long-lived
//   sess#<id>    in-flight Quick→gateway authorize session       — 10min
//   code#<v>     one-time mcp authorization_code                  — 5min
//   refresh#<v>  opaque refresh_token → userId                    — 90d
// The access_token is stateless HMAC (no record). The refresh_token IS stored
// (opaque) so it can be rotated: each use deletes the old record and writes a
// new one, which both refreshes the 90d TTL and makes a replayed old token fail.
type ClientRecord = { redirectUris: string[]; authMethod: string; clientName: string };
type OAuthSession = { clientId: string; redirectUri: string; codeChallenge: string; clientState: string; scope: string };
type McpCodeRecord = { userId: string; clientId: string; redirectUri: string; codeChallenge: string; scope: string };
type RefreshRecord = { userId: string; clientId: string; scope: string };

async function ddbPut(key: string, payload: unknown, ttlSec: number): Promise<void> {
  await ddb.send(new PutItemCommand({
    TableName: DDB_TABLE,
    Item: { state: { S: key }, payload: { S: JSON.stringify(payload) }, ttl: { N: String(Math.floor(Date.now() / 1000) + ttlSec) } },
  }));
}
async function ddbGet<T>(key: string): Promise<T | null> {
  const r = await ddb.send(new GetItemCommand({ TableName: DDB_TABLE, Key: { state: { S: key } } }));
  const payload = r.Item?.payload?.S;
  if (!payload) return null;
  // Enforce expiry in code, not just via DynamoDB's `ttl` attribute — TTL
  // deletion is best-effort and can lag hours, so an expired code/session/
  // refresh record may still be physically present. Treat past-ttl as absent.
  const ttl = r.Item?.ttl?.N;
  if (ttl && Math.floor(Date.now() / 1000) > Number(ttl)) return null;
  return JSON.parse(payload) as T;
}
async function ddbDelete(key: string): Promise<void> {
  await ddb.send(new DeleteItemCommand({ TableName: DDB_TABLE, Key: { state: { S: key } } }));
}

const putClient = (id: string, rec: ClientRecord) => ddbPut(`client#${id}`, rec, 400 * 86400);
const getClient = (id: string) => ddbGet<ClientRecord>(`client#${id}`);
const putOAuthSession = (id: string, rec: OAuthSession) => ddbPut(`sess#${id}`, rec, 600);
const getOAuthSession = (id: string) => ddbGet<OAuthSession>(`sess#${id}`);
const delOAuthSession = (id: string) => ddbDelete(`sess#${id}`);
const putMcpCode = (code: string, rec: McpCodeRecord) => ddbPut(`code#${code}`, rec, 300);
const getMcpCode = (code: string) => ddbGet<McpCodeRecord>(`code#${code}`);
const delMcpCode = (code: string) => ddbDelete(`code#${code}`);
const putRefresh = (tok: string, rec: RefreshRecord) => ddbPut(`refresh#${tok}`, rec, OAUTH_REFRESH_TTL_SEC);
const getRefresh = (tok: string) => ddbGet<RefreshRecord>(`refresh#${tok}`);
const delRefresh = (tok: string) => ddbDelete(`refresh#${tok}`);

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

// Validate a standard-OAuth /authorize request and persist its session.
// Returns { sessionId } on success or { error, error_description } on failure.
async function beginOAuthSession(
  qs: Record<string, string | undefined>,
): Promise<{ sessionId: string } | { error: string; error_description: string }> {
  const { client_id, redirect_uri, code_challenge, code_challenge_method, response_type, state: clientState, scope } = qs;
  if (response_type && response_type !== "code") {
    return { error: "unsupported_response_type", error_description: "only response_type=code" };
  }
  if (!client_id) return { error: "invalid_request", error_description: "missing client_id" };
  if (!redirect_uri) return { error: "invalid_request", error_description: "missing redirect_uri" };
  if (!code_challenge) return { error: "invalid_request", error_description: "PKCE required: missing code_challenge" };
  if (code_challenge_method && code_challenge_method !== "S256") {
    return { error: "invalid_request", error_description: "only code_challenge_method=S256" };
  }
  const client = await getClient(client_id);
  if (!client) return { error: "invalid_client", error_description: "unknown client_id" };
  if (!client.redirectUris.includes(redirect_uri)) {
    return { error: "invalid_request", error_description: "redirect_uri not in registered allowlist" };
  }
  const sessionId = randomBytes(16).toString("base64url");
  await putOAuthSession(sessionId, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    clientState: clientState || "",
    scope: scope || "openid",
  });
  return { sessionId };
}

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

  // Standard OAuth path: Quick (or any MCP host) sends client_id + redirect_uri
  // + code_challenge. We validate, persist an OAuth session, and thread its id
  // through `state` so the DingTalk callback can mint an mcp_code for Quick.
  // Absent these params → HTML fallback path (oauthSessionId stays undefined).
  //
  // Mutually exclusive with the incremental-auth (`?t=`) path: `?t=` sets userId
  // from a signed incr token WITHOUT a fresh DingTalk consent, so it must never
  // also open an OAuth session (that would mint an authorization_code for an
  // arbitrary client_id bound to that uid — a consent bypass). Incremental auth
  // is its own flow; if `?t=` is present we ignore any OAuth params.
  let oauthSessionId: string | undefined;
  if (!qs.t && (qs.client_id || qs.code_challenge || qs.redirect_uri)) {
    const err = await beginOAuthSession(qs);
    if ("error" in err) {
      return { statusCode: 400, headers: { "cache-control": "no-store" }, body: JSON.stringify(err) };
    }
    oauthSessionId = err.sessionId;
  }

  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const state = randomBytes(16).toString("base64url");
  await putState(state, { verifier, scopes, uid: userId, oauthSessionId });

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

  // Standard OAuth path: mint a one-time mcp_code bound to this user + the
  // session's client/redirect/PKCE, then 302 back to Quick's redirect_uri.
  // Quick exchanges the code at /token (verifying PKCE) for access+refresh.
  if (stateData.oauthSessionId) {
    const session = await getOAuthSession(stateData.oauthSessionId);
    if (!session) return { statusCode: 400, body: "oauth session expired" };
    const code = genAuthCode();
    await putMcpCode(code, {
      userId,
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      scope: session.scope,
    });
    await delOAuthSession(stateData.oauthSessionId);
    const redirect = new URL(session.redirectUri);
    redirect.searchParams.set("code", code);
    if (session.clientState) redirect.searchParams.set("state", session.clientState);
    return { statusCode: 302, headers: { location: redirect.toString(), "cache-control": "no-store" }, body: "" };
  }

  // Fallback path (browser opened /authorize directly, no OAuth host): hand back
  // a long-lived Bearer to paste manually. These users can't auto-refresh, so
  // the token keeps the 13-month ceiling + relies on the idle window.
  const hmacKey = await getHmacKey();
  const mcpToken = signMcpToken({ userId, expiresInSec: MCP_TOKEN_MAX_LIFETIME_SEC }, hmacKey);

  const html = `<!doctype html><meta charset="utf-8"><title>授权成功</title>
<style>body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 16px}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}pre{background:#f4f4f4;padding:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}</style>
<h1>钉钉授权成功</h1>
<p>把下面这一行复制到 Quick Desktop 的 <code>Authorization</code> header（或 MCP 配置的 <code>token</code> 字段）：</p>
<pre>Bearer ${mcpToken}</pre>
<p>只要在用就长期有效，无需反复授权；仅当连续 90 天未使用才需重新跑一次授权。</p>`;
  return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: html };
}

// --- OAuth Authorization Server endpoints ---
function jsonResult(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, any> {
  const raw = event.body || "";
  const ct = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();
  const decoded = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  if (!decoded) return {};
  if (ct.includes("application/json")) {
    try { return JSON.parse(decoded); } catch { return {}; }
  }
  // form-urlencoded (Quick's /token uses this)
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(decoded)) out[k] = v;
  return out;
}

// RFC 7591 Dynamic Client Registration.
async function handleRegister(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event) as DcrRequest;
  const r = buildDcrRegistration(body, Math.floor(Date.now() / 1000));
  if (!r.ok) return jsonResult(400, { error: r.error, error_description: r.error_description });
  await putClient(r.clientId, { redirectUris: r.redirectUris, authMethod: r.authMethod, clientName: r.clientName });
  log.info("DCR registered", { clientId: r.clientId, authMethod: r.authMethod });
  return jsonResult(201, r.response);
}

// OAuth 2.1 Token endpoint: authorization_code + refresh_token grants.
async function handleToken(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  const grant = body.grant_type;
  const { clientId } = extractClientCredentials(event.headers, body);
  const hmacKey = await getHmacKey();

  if (grant === "authorization_code") {
    const { code, redirect_uri, code_verifier } = body;
    if (!code || !clientId || !redirect_uri || !code_verifier) {
      return jsonResult(400, { error: "invalid_request", error_description: "missing code/client_id/redirect_uri/code_verifier" });
    }
    const rec = await getMcpCode(code);
    if (!rec) return jsonResult(400, { error: "invalid_grant", error_description: "authorization_code invalid or expired" });
    if (rec.clientId !== clientId) return jsonResult(400, { error: "invalid_client", error_description: "client_id mismatch" });
    if (rec.redirectUri !== redirect_uri) return jsonResult(400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
    if (!verifyPkceS256(code_verifier, rec.codeChallenge)) {
      return jsonResult(400, { error: "invalid_grant", error_description: "PKCE verification failed" });
    }
    await delMcpCode(code); // one-time
    const access_token = signMcpToken({ userId: rec.userId, expiresInSec: OAUTH_ACCESS_TTL_SEC }, hmacKey);
    const refresh_token = genRefreshToken();
    await putRefresh(refresh_token, { userId: rec.userId, clientId, scope: rec.scope });
    log.info("token issued (authorization_code)", { userId: rec.userId, clientId });
    return jsonResult(200, { access_token, token_type: "Bearer", expires_in: OAUTH_ACCESS_TTL_SEC, refresh_token, scope: rec.scope });
  }

  if (grant === "refresh_token") {
    const { refresh_token } = body;
    if (!refresh_token) return jsonResult(400, { error: "invalid_request", error_description: "missing refresh_token" });
    // Require client_id and bind it to the token's owning client — same as the
    // authorization_code grant. Without this, a leaked refresh_token could be
    // rotated by anyone presenting no client identity at all (the old
    // `clientId && …` short-circuit skipped the check when client_id was absent).
    if (!clientId) return jsonResult(400, { error: "invalid_client", error_description: "missing client_id" });
    const rrec = await getRefresh(refresh_token);
    if (!rrec) return jsonResult(400, { error: "invalid_grant", error_description: "refresh_token invalid, expired, or already used" });
    if (rrec.clientId !== clientId) {
      return jsonResult(400, { error: "invalid_client", error_description: "client_id mismatch" });
    }
    // Revocation check: if the user's DingTalk token was revoked (ops.sh) or
    // flagged, deny — the access token would be useless anyway.
    const ut = await getUserToken(rrec.userId);
    if (!ut || ut.needs_reauth) {
      await delRefresh(refresh_token);
      return jsonResult(400, { error: "invalid_grant", error_description: "user re-authorization required" });
    }
    // Rotate: invalidate the presented token, issue a fresh one. A replayed old
    // token then fails (getRefresh returns null) — OAuth 2.1 reuse detection.
    await delRefresh(refresh_token);
    const access_token = signMcpToken({ userId: rrec.userId, expiresInSec: OAUTH_ACCESS_TTL_SEC }, hmacKey);
    const newRefresh = genRefreshToken();
    await putRefresh(newRefresh, { userId: rrec.userId, clientId: rrec.clientId, scope: rrec.scope });
    log.info("token refreshed", { userId: rrec.userId, clientId: rrec.clientId });
    return jsonResult(200, { access_token, token_type: "Bearer", expires_in: OAUTH_ACCESS_TTL_SEC, refresh_token: newRefresh, scope: rrec.scope || ut.scope || "openid" });
  }

  return jsonResult(400, { error: "unsupported_grant_type", error_description: "only authorization_code and refresh_token" });
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
    // OAuth Authorization Server metadata (RFC 8414 / 9728) — GET, public.
    if (method === "GET" && path.endsWith("/.well-known/oauth-authorization-server")) {
      return jsonResult(200, authServerMetadata(OAUTH_BASE_URL));
    }
    if (method === "GET" && path.includes("/.well-known/oauth-protected-resource")) {
      return jsonResult(200, protectedResourceMetadata(OAUTH_BASE_URL, `${OAUTH_BASE_URL}/mcp`));
    }
    if (method === "POST" && path.endsWith("/register")) return await handleRegister(apiEvent);
    if (method === "POST" && path.endsWith("/token")) return await handleToken(apiEvent);
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
  handleRegister,
  handleToken,
  beginOAuthSession,
};
