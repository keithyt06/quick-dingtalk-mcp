import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { log } from "../shared/log.ts";
import { verifyMcpToken, signIncrAuthToken } from "../shared/hmac.ts";
import { signRequest } from "../shared/sigv4.ts";
import { getUserToken } from "../shared/sm-client.ts";

const REGION = process.env.AWS_REGION || "us-east-1";
const HMAC_KEY_PARAM = process.env.HMAC_KEY_PARAM!;
const AGENTCORE_RUNTIME_URL = process.env.AGENTCORE_RUNTIME_URL!;
const AGENTCORE_SERVICE = "bedrock-agentcore";
const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || "25000", 10);
const TOKEN_NEAR_EXPIRY_SEC = 60; // if expires_at - now < 60s, return 503

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

function unauth(reason: string): APIGatewayProxyResultV2 {
  log.warn("unauthorized", { reason });
  return {
    statusCode: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify({ error: "unauthorized", reason }),
  };
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
  if (userToken.expires_at - now < TOKEN_NEAR_EXPIRY_SEC) {
    return serverBusyOrRetry("token-near-expiry", 30);
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
    },
    body: upstreamText,
  };
};
