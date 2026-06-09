import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { log } from "../shared/log.ts";
import { verifyMcpToken, signIncrAuthToken } from "../shared/hmac.ts";
import { signRequest } from "../shared/sigv4.ts";
import { getUserToken, putUserToken, type UserToken } from "../shared/sm-client.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const HMAC_KEY_PARAM = process.env.HMAC_KEY_PARAM!;
const AGENTCORE_RUNTIME_URL = process.env.AGENTCORE_RUNTIME_URL!;
const AGENTCORE_SERVICE = "bedrock-agentcore";
const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000", 10);
const TOKEN_NEAR_EXPIRY_SEC = 60; // if expires_at - now < 60s, return 503
// 90 天闲置窗口:90 天内用过则永久续;超窗需重连。可用 env 覆盖。
const IDLE_WINDOW_SEC = parseInt(process.env.IDLE_WINDOW_SEC || String(90 * 86400), 10);
// last_active 写入节流:距上次写超过此秒数才再写一次(摊薄 SM 写入成本)。
const LAST_ACTIVE_THROTTLE_SEC = parseInt(process.env.LAST_ACTIVE_THROTTLE_SEC || String(86400), 10);
// 用于 idle-expired 的 hint(P1);mcp-middleware 可能未注入此 env,故可空。
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL || "";

let ssm: { send: (cmd: any) => Promise<any> } = new SSMClient({ region: REGION });
let credsProvider: () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> = defaultProvider();

export function _setClients(c: {
  ssm?: { send: (cmd: any) => Promise<any> };
  credsProvider?: () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;
}): void {
  if (c.ssm) ssm = c.ssm;
  if (c.credsProvider) credsProvider = c.credsProvider;
  cachedHmacKey = null;
}

let cachedHmacKey: string | null = null;

async function getHmacKey(): Promise<string> {
  if (cachedHmacKey) return cachedHmacKey;
  const r = await ssm.send(new GetParameterCommand({ Name: HMAC_KEY_PARAM, WithDecryption: true }));
  cachedHmacKey = r.Parameter!.Value!;
  return cachedHmacKey;
}

function unauth(reason: string, hint?: string): APIGatewayProxyResultV2 {
  log.warn("unauthorized", { reason });
  const body: Record<string, string> = { error: "unauthorized", reason };
  if (hint) body.hint = hint;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  // RFC 9728: point the MCP host at the protected-resource metadata so its OAuth
  // wizard can discover the authorization server and run DCR. Only emit when we
  // know our public base URL (OAUTH_BASE_URL may be unset in some envs).
  if (OAUTH_BASE_URL) {
    headers["www-authenticate"] =
      `Bearer resource_metadata="${OAUTH_BASE_URL}/.well-known/oauth-protected-resource"`;
  }
  return { statusCode: 401, headers, body: JSON.stringify(body) };
}

function serverBusyOrRetry(reason: string, retryAfter: number, status = 503): APIGatewayProxyResultV2 {
  return {
    statusCode: status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": String(retryAfter) },
    body: JSON.stringify({ error: "transient", reason }),
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const auth = event.headers?.["authorization"] || event.headers?.["Authorization"] || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return unauth("missing-bearer");
  const token = m[1].trim();

  let userId: string;
  try {
    const key = await getHmacKey();
    const v = verifyMcpToken(token, key);
    userId = v.userId;
  } catch (e: any) {
    return unauth(`token-${e.message}`);
  }

  const userToken = await getUserToken(userId);
  if (!userToken) return unauth("no-user-token");
  if (userToken.needs_reauth) return unauth("needs-reauth");
  const now = Math.floor(Date.now() / 1000);

  // 90 天闲置窗口:缺失 last_active 的旧记录视为「首次活跃」,放行并写入。
  if (typeof userToken.last_active === "number" && now - userToken.last_active >= IDLE_WINDOW_SEC) {
    const hint = OAUTH_BASE_URL
      ? `会话已闲置过期,请打开 ${OAUTH_BASE_URL}/authorize 重新授权并更新 token`
      : "会话已闲置过期,请重新打开授权页面更新 token";
    return unauth("idle-expired", hint);
  }

  if (userToken.expires_at - now < TOKEN_NEAR_EXPIRY_SEC) {
    return serverBusyOrRetry("token-near-expiry", 30);
  }

  // 节流更新 last_active:距上次超过阈值(或从未写过)才写一次。
  // 写前重读最新整条,只覆盖 last_active,把与刷新链路轮换 token 的竞态窗口
  // 压到毫秒级(spec §4.2;残留窗口被覆盖也只产生一次自愈的 503,无数据丢失)。
  if (userToken.last_active === undefined || now - userToken.last_active > LAST_ACTIVE_THROTTLE_SEC) {
    try {
      const fresh = await getUserToken(userId);
      // 重读为 null = secret 在本次请求中途被吊销(ops.sh revoke 删除)。
      // 不要回写,否则会经 putUserToken 的 CreateSecret 兜底「复活」已吊销用户。
      // 跳过即可:吊销保持吊销,本次请求仍放行(token 此刻仍有效)。
      if (fresh) {
        const updated: UserToken = { ...fresh, last_active: now };
        await putUserToken(userId, updated);
      }
    } catch (e: any) {
      // 写 last_active 失败不应阻断本次请求(下次再补)。
      log.warn("last_active write failed", { userId, err: e.message });
    }
  }

  // Mint a short-lived incrAuthToken for the runtime to use when generating
  // incremental-authorize URLs in PAT errors.
  const hmacKey = await getHmacKey();
  const incrToken = signIncrAuthToken({
    userId,
    scopes: [],
    expiresInSec: 600,
  }, hmacKey);

  // Sign request to AgentCore Runtime
  const creds = await credsProvider();
  let signed;
  try {
    signed = await signRequest({
      method: "POST",
      url: AGENTCORE_RUNTIME_URL,
      headers: {
        "content-type": "application/json",
        "x-user-id": userId,
        "x-user-access-token": userToken.access_token,
        "x-incr-auth-token": incrToken,
      },
      body: event.body || "",
      region: REGION,
      service: AGENTCORE_SERVICE,
      credentials: creds,
    });
  } catch (e: any) {
    log.error("sigv4 sign failed", { err: e.message });
    return { statusCode: 500, body: JSON.stringify({ error: "sign-failed" }) };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e.name === "AbortError") {
      return serverBusyOrRetry("upstream-timeout", 5, 504);
    }
    log.error("upstream call failed", { err: e.message });
    return { statusCode: 502, body: JSON.stringify({ error: "upstream-failed" }) };
  } finally {
    clearTimeout(t);
  }

  const upstreamText = await upstream.text();
  return {
    statusCode: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
      // AgentCore strips the container's own response headers (it only returns
      // its x-amzn-* set), so the Streamable HTTP `Mcp-Session-Id` the container
      // sets never reaches the client. Re-inject it here at the edge. Stable per
      // user (visible-ASCII), which is all the client needs to bind the session.
      "mcp-session-id": userId,
    },
    body: upstreamText,
  };
};
