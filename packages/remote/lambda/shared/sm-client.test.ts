import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const calls: { op: string; args: any }[] = [];
const store = new Map<string, string>();

const fakeClient = {
  send: async (cmd: { __op: string; input: any }) => {
    calls.push({ op: cmd.__op, args: cmd.input });
    if (cmd.__op === "GetSecretValueCommand") {
      const v = store.get(cmd.input.SecretId);
      if (!v) { const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e; }
      return { SecretString: v };
    }
    if (cmd.__op === "PutSecretValueCommand") {
      if (!store.has(cmd.input.SecretId)) {
        const e: any = new Error("not found"); e.name = "ResourceNotFoundException"; throw e;
      }
      store.set(cmd.input.SecretId, cmd.input.SecretString);
      return { VersionId: "v1" };
    }
    if (cmd.__op === "CreateSecretCommand") {
      store.set(cmd.input.Name, cmd.input.SecretString);
      return { ARN: `arn:fake:${cmd.input.Name}` };
    }
    if (cmd.__op === "DeleteSecretCommand") {
      store.delete(cmd.input.SecretId);
      return {};
    }
    if (cmd.__op === "ListSecretsCommand") {
      return {
        SecretList: [...store.keys()].map(name => ({ Name: name })),
      };
    }
    throw new Error(`unknown op ${cmd.__op}`);
  },
};

const { _setClient, getUserToken, putUserToken, deleteUserToken, listUserSecrets, secretIdFor } =
  await import("./sm-client.ts");

beforeEach(() => {
  store.clear();
  calls.length = 0;
  _setClient(fakeClient as any);
});

test("secretIdFor: prefixed by quick-dingtalk-mcp/users/", () => {
  assert.equal(secretIdFor("user-1"), "quick-dingtalk-mcp/users/user-1");
});

test("putUserToken then getUserToken returns same payload", async () => {
  await putUserToken("u1", { access_token: "a", refresh_token: "r", expires_at: 9999, scope: "" });
  const r = await getUserToken("u1");
  assert.equal(r!.access_token, "a");
  assert.equal(r!.refresh_token, "r");
});

test("getUserToken: not-found returns null", async () => {
  const r = await getUserToken("u-none");
  assert.equal(r, null);
});

test("deleteUserToken removes the secret", async () => {
  await putUserToken("u2", { access_token: "x", refresh_token: "y", expires_at: 1, scope: "" });
  await deleteUserToken("u2");
  const r = await getUserToken("u2");
  assert.equal(r, null);
});

test("listUserSecrets: returns user ids stripped of prefix", async () => {
  await putUserToken("a", { access_token: "1", refresh_token: "2", expires_at: 0, scope: "" });
  await putUserToken("b", { access_token: "1", refresh_token: "2", expires_at: 0, scope: "" });
  const ids = await listUserSecrets();
  assert.deepEqual(ids.sort(), ["a", "b"]);
});
