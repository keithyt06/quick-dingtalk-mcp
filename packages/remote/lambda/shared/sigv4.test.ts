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
