// OAuth 2.1 Authorization Server — pure helpers (no AWS/IO).
//
// The token-refresh-shim Lambda hosts a standard OAuth Authorization Server so
// MCP hosts (Amazon Quick) can authorize via their built-in OAuth wizard
// instead of the user hand-copying a Bearer. These are the side-effect-free
// pieces (metadata docs, PKCE check, client-credential parsing, token/id
// minting) split out so they can be unit-tested without DynamoDB or fetch.
//
// Layering (see docs/superpowers/notes/2026-05-30-dingtalk-oauth-field-audit.md §0):
//   OUTER (this server ⇄ Quick): standard OAuth 2.1 Authorization Code + PKCE (S256).
//   INNER (this server ⇄ DingTalk): clientSecret direct exchange, no PKCE — matches dws.
// This module is the OUTER half only.

import { createHash, randomBytes } from "node:crypto";

// --- token / id generation ---

// Opaque random tokens. base64url, no padding. Prefix tags the kind for log
// readability and to fail fast if one is presented where another is expected.
export function genOpaque(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export const genClientId = () => genOpaque("client", 16);
export const genClientSecret = () => genOpaque("cs", 32);
export const genAuthCode = () => genOpaque("code", 32);
export const genRefreshToken = () => genOpaque("rt", 32);
export const genSessionId = () => randomBytes(16).toString("base64url");

// --- PKCE (S256) verification, OUTER half ---
// Quick sends code_challenge at /authorize and code_verifier at /token.
// Valid iff base64url(sha256(verifier)) === challenge.
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  // Plain compare is fine: challenge is attacker-supplied at /authorize and
  // public; there is no secret to leak via timing here.
  return computed === challenge;
}

// --- client-credential parsing (RFC 6749 §2.3.1) ---
// Quick uses client_secret_basic (creds in `Authorization: Basic`); others may
// use client_secret_post (creds in body) or none (public client). Body wins;
// fall back to the Basic header. The secret is NOT verified anywhere — security
// rests on PKCE — but we must parse client_id to bind the session.
export function extractClientCredentials(
  headers: Record<string, string | undefined> | undefined,
  body: Record<string, unknown> | undefined,
): { clientId?: string; clientSecret?: string } {
  let clientId = (body?.client_id as string) || undefined;
  let clientSecret = (body?.client_secret as string) || undefined;

  if (!clientId) {
    const auth = headers?.["authorization"] || headers?.["Authorization"] || "";
    const m = /^Basic\s+(.+)$/i.exec(auth);
    if (m) {
      try {
        const decoded = Buffer.from(m[1], "base64").toString("utf8");
        const sep = decoded.indexOf(":");
        if (sep >= 0) {
          // RFC 6749 §2.3.1: id/secret are form-urlencoded before Basic-encoding.
          clientId = decodeURIComponent(decoded.slice(0, sep));
          clientSecret = decodeURIComponent(decoded.slice(sep + 1));
        }
      } catch {
        // leave undefined; caller reports invalid_client
      }
    }
  }
  return { clientId, clientSecret };
}

// --- metadata documents ---

// RFC 8414 Authorization Server Metadata.
export function authServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    scopes_supported: ["openid"],
  };
}

// RFC 9728 Protected Resource Metadata. The MCP endpoint returns 401 with a
// WWW-Authenticate header pointing here so the client can discover the AS.
export function protectedResourceMetadata(baseUrl: string, resource: string) {
  return {
    resource,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/`,
  };
}

// --- DCR (RFC 7591) ---
// Build the registration response from the client's request. Quick declares
// client_secret_basic and then VERIFIES that a secret came back, so we must
// issue a placeholder secret in that case — even though it is never checked.
export type DcrRequest = {
  redirect_uris?: unknown;
  client_name?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  scope?: unknown;
};

export type DcrResult =
  | { ok: false; error: string; error_description: string }
  | {
      ok: true;
      clientId: string;
      clientSecret: string; // "" when public client (none)
      redirectUris: string[];
      authMethod: string;
      grantTypes: string[];
      responseTypes: string[];
      clientName: string;
      response: Record<string, unknown>;
    };

export function buildDcrRegistration(
  body: DcrRequest,
  nowSec: number,
): DcrResult {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      error_description: "redirect_uris is required and must be a non-empty array",
    };
  }
  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(String(uri));
    } catch {
      return { ok: false, error: "invalid_redirect_uri", error_description: `invalid redirect_uri: ${uri}` };
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return {
        ok: false,
        error: "invalid_redirect_uri",
        error_description: `non-localhost redirect_uri must be https: ${uri}`,
      };
    }
  }

  const authMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "none";
  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.length
      ? (body.grant_types as string[])
      : ["authorization_code", "refresh_token"];
  const responseTypes =
    Array.isArray(body.response_types) && body.response_types.length
      ? (body.response_types as string[])
      : ["code"];
  const clientName =
    typeof body.client_name === "string" ? body.client_name : "MCP Client";

  const needsSecret =
    authMethod === "client_secret_basic" || authMethod === "client_secret_post";
  const clientId = genClientId();
  const clientSecret = needsSecret ? genClientSecret() : "";

  const response: Record<string, unknown> = {
    client_id: clientId,
    client_id_issued_at: nowSec,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
    client_name: clientName,
  };
  if (needsSecret) {
    response.client_secret = clientSecret;
    response.client_secret_expires_at = 0; // 0 = never expires (RFC 7591)
  }
  if (typeof body.scope === "string") response.scope = body.scope;

  return {
    ok: true,
    clientId,
    clientSecret,
    redirectUris: redirectUris.map(String),
    authMethod,
    grantTypes,
    responseTypes,
    clientName,
    response,
  };
}
