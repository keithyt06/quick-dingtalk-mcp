import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";

export type SignedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

export type SignArgs = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  headers: Record<string, string>;
  body?: string;
  region: string;
  service: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  signingDate?: Date;
};

export async function signRequest(args: SignArgs): Promise<SignedRequest> {
  const u = new URL(args.url);
  const headers = { ...args.headers, host: u.host };
  const body = args.body ?? "";

  const signer = new SignatureV4({
    service: args.service,
    region: args.region,
    credentials: args.credentials,
    sha256: Sha256,
    // Keep the default uriEscapePath=true. The AgentCore invoke path carries the
    // runtime ARN as an already-encoded segment (…/runtimes/arn%3A…%2Fqdm…/…),
    // and SigV4 (matching botocore, verified 2026-06-01) re-escapes it to
    // %253A/%252F in the canonical request — AgentCore expects exactly that
    // double-escaped canonical path.
  });

  // SignatureV4 expects a HttpRequest-like shape. CRITICAL: `path` must NOT
  // include the query string — pass it only via `query`. Earlier this used
  // `u.pathname + u.search`, which folded `?qualifier=DEFAULT` into the
  // canonical path (encoding `?`/`=`) while ALSO passing `query`, so the
  // canonical request didn't match AgentCore's and every call 403'd.
  const req = {
    method: args.method,
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    path: u.pathname,
    headers,
    body,
    query: Object.fromEntries(u.searchParams.entries()),
  };

  const signed = await signer.sign(req as any, {
    signingDate: args.signingDate,
  });

  return {
    method: args.method,
    url: args.url,
    headers: signed.headers as Record<string, string>,
    body,
  };
}
