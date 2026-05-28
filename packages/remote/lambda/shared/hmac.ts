// HMAC-SHA256 token sign/verify for MCP and incremental-auth tokens.
//
// Token format: base64url(domain).base64url(payload-json).hex(sig)
// We bind a "domain" prefix to defend against cross-token confusion.
//
// MCP token domain  : "mcp"
// Incr-auth domain  : "incr"
//
// Payload (JSON): { d: domain, uid, exp, scopes? }

import { createHmac, timingSafeEqual } from "node:crypto";

type SignArgs = {
  userId: string;
  expiresInSec: number;
};

type IncrSignArgs = SignArgs & {
  scopes: string[];
};

type VerifiedMcp = {
  userId: string;
  expiresAt: number;
};

type VerifiedIncr = VerifiedMcp & {
  scopes: string[];
};

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(domain: string, payloadJson: string, key: string): string {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(`${domain}:${payloadJson}`)
    .digest("hex");
}

function timingEqStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function signMcpToken(args: SignArgs, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + args.expiresInSec;
  const payload = { d: "mcp", uid: args.userId, exp };
  const json = JSON.stringify(payload);
  const sig = sign("mcp", json, key);
  return [b64url("mcp"), b64url(json), sig].join(".");
}

export function verifyMcpToken(token: string, key: string): VerifiedMcp {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [d, p, s] = parts;
  const domain = b64urlDecode(d).toString("utf8");
  if (domain !== "mcp") throw new Error("wrong token type");
  const json = b64urlDecode(p).toString("utf8");
  const expectedSig = sign("mcp", json, key);
  if (!timingEqStr(expectedSig, s)) throw new Error("signature mismatch");
  let payload: { d: string; uid: string; exp: number };
  try { payload = JSON.parse(json); } catch { throw new Error("malformed payload"); }
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return { userId: payload.uid, expiresAt: payload.exp };
}

export function signIncrAuthToken(args: IncrSignArgs, key: string): string {
  const exp = Math.floor(Date.now() / 1000) + args.expiresInSec;
  const payload = { d: "incr", uid: args.userId, exp, scopes: args.scopes };
  const json = JSON.stringify(payload);
  const sig = sign("incr", json, key);
  return [b64url("incr"), b64url(json), sig].join(".");
}

export function verifyIncrAuthToken(token: string, key: string): VerifiedIncr {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [d, p, s] = parts;
  const domain = b64urlDecode(d).toString("utf8");
  if (domain !== "incr") throw new Error("wrong token type");
  const json = b64urlDecode(p).toString("utf8");
  const expectedSig = sign("incr", json, key);
  if (!timingEqStr(expectedSig, s)) throw new Error("signature mismatch");
  let payload: { d: string; uid: string; exp: number; scopes: string[] };
  try { payload = JSON.parse(json); } catch { throw new Error("malformed payload"); }
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return { userId: payload.uid, expiresAt: payload.exp, scopes: payload.scopes || [] };
}
