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
  });

  // SignatureV4 expects a HttpRequest-like shape.
  const req = {
    method: args.method,
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    path: u.pathname + (u.search || ""),
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
