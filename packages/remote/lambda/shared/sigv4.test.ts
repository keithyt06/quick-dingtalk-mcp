import { test } from "node:test";
import assert from "node:assert/strict";
import { signRequest } from "./sigv4.ts";

const fakeCreds = {
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret_test_xxx",
};

test("signRequest: adds Authorization header with AWS4-HMAC-SHA256", async () => {
  const signed = await signRequest({
    method: "POST",
    url: "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/test/invocations",
    headers: { "content-type": "application/json", host: "bedrock-agentcore.us-east-1.amazonaws.com" },
    body: '{"hello":"world"}',
    region: "us-east-1",
    service: "bedrock-agentcore",
    credentials: fakeCreds,
  });
  assert.match(signed.headers["authorization"], /^AWS4-HMAC-SHA256 Credential=AKIA_TEST/);
  assert.ok(signed.headers["x-amz-date"]);
  assert.ok(signed.headers["x-amz-content-sha256"]);
});

test("signRequest: deterministic given fixed time + creds", async () => {
  const fixedDate = new Date("2026-05-28T12:00:00Z");
  const opts = {
    method: "GET" as const,
    url: "https://example.us-east-1.amazonaws.com/foo",
    headers: { host: "example.us-east-1.amazonaws.com" },
    body: "",
    region: "us-east-1",
    service: "execute-api",
    credentials: fakeCreds,
    signingDate: fixedDate,
  };
  const a = await signRequest(opts);
  const b = await signRequest(opts);
  assert.equal(a.headers["authorization"], b.headers["authorization"]);
});

test("signRequest: AgentCore invoke URL — query goes in query, not path", async () => {
  // Regression for the live 403 SignatureDoesNotMatch on the AgentCore invoke
  // URL. Two bugs were folded together in the old code:
  //   path = u.pathname + u.search   (so `?qualifier=DEFAULT` leaked into the
  //                                    canonical PATH, encoding `?`/`=`)
  //   while query was ALSO passed separately.
  // The fix: path = u.pathname only; query carried via `query`. Verified
  // against botocore's canonical request (path double-escapes the ARN's
  // %3A→%253A under the default uriEscapePath=true; query is its own line).
  // Here we lock the behavioural contract: the SAME path with vs without the
  // query string must yield DIFFERENT signatures (proving the query is part of
  // the signed canonical query, not silently dropped), and signing is stable.
  const base = {
    method: "POST" as const,
    headers: { host: "bedrock-agentcore.us-east-1.amazonaws.com", "content-type": "application/json" },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
    region: "us-east-1",
    service: "bedrock-agentcore",
    credentials: fakeCreds,
    signingDate: new Date("2026-06-01T12:00:00Z"),
  };
  const pathOnly = "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A434465421667%3Aruntime%2Fqdm_remote-x/invocations";
  const withQuery = pathOnly + "?qualifier=DEFAULT";
  const a = await signRequest({ ...base, url: withQuery });
  const b = await signRequest({ ...base, url: withQuery });
  const noq = await signRequest({ ...base, url: pathOnly });
  assert.match(a.headers["authorization"], /^AWS4-HMAC-SHA256 Credential=AKIA_TEST/);
  assert.equal(a.headers["authorization"], b.headers["authorization"], "stable signature for same input");
  assert.notEqual(a.headers["authorization"], noq.headers["authorization"], "query must affect the signature");
});

test("signRequest: different body → different signature", async () => {
  const base = {
    method: "POST" as const,
    url: "https://example.us-east-1.amazonaws.com/foo",
    headers: { host: "example.us-east-1.amazonaws.com", "content-type": "application/json" },
    region: "us-east-1",
    service: "execute-api",
    credentials: fakeCreds,
    signingDate: new Date("2026-05-28T12:00:00Z"),
  };
  const a = await signRequest({ ...base, body: '{"a":1}' });
  const b = await signRequest({ ...base, body: '{"a":2}' });
  assert.notEqual(a.headers["authorization"], b.headers["authorization"]);
});
