import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  CreateSecretCommand,
  DeleteSecretCommand,
  ListSecretsCommand,
} from "@aws-sdk/client-secrets-manager";

export type UserToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  scope: string;
  needs_reauth?: boolean;
  last_active?: number; // unix seconds — 最后一次成功调用;mcp-middleware 维护,缺失视为首次活跃
};

const PREFIX = "quick-dingtalk-mcp/users/";

let client: { send: (cmd: any) => Promise<any> } = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });

export function _setClient(c: { send: (cmd: any) => Promise<any> }): void {
  client = c;
}

export function secretIdFor(userId: string): string {
  return `${PREFIX}${userId}`;
}

// Wrap commands so the mock can identify them by __op (the in-memory mock above
// expects __op set; real SDK clients ignore extra fields).
function wrap(op: string, input: any): any {
  const real = (() => {
    switch (op) {
      case "GetSecretValueCommand":  return new GetSecretValueCommand(input);
      case "PutSecretValueCommand":  return new PutSecretValueCommand(input);
      case "CreateSecretCommand":    return new CreateSecretCommand(input);
      case "DeleteSecretCommand":    return new DeleteSecretCommand(input);
      case "ListSecretsCommand":     return new ListSecretsCommand(input);
      default: throw new Error(`unknown op ${op}`);
    }
  })();
  (real as any).__op = op;
  (real as any).input = input;
  return real;
}

export async function getUserToken(userId: string): Promise<UserToken | null> {
  try {
    const r = await client.send(wrap("GetSecretValueCommand", { SecretId: secretIdFor(userId) }));
    if (!r.SecretString) return null;
    return JSON.parse(r.SecretString) as UserToken;
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") return null;
    throw e;
  }
}

export async function putUserToken(userId: string, token: UserToken): Promise<void> {
  const id = secretIdFor(userId);
  const body = JSON.stringify(token);
  try {
    await client.send(wrap("PutSecretValueCommand", { SecretId: id, SecretString: body }));
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") {
      await client.send(wrap("CreateSecretCommand", { Name: id, SecretString: body }));
      return;
    }
    throw e;
  }
}

export async function deleteUserToken(userId: string): Promise<void> {
  await client.send(wrap("DeleteSecretCommand", {
    SecretId: secretIdFor(userId),
    ForceDeleteWithoutRecovery: false, // AWS default 30-day recovery window (no RecoveryWindowInDays); teardown can force-delete
  }));
}

export async function listUserSecrets(): Promise<string[]> {
  const r = await client.send(wrap("ListSecretsCommand", {
    Filters: [{ Key: "name", Values: [PREFIX] }],
    MaxResults: 100,
  }));
  const list = (r.SecretList || []) as { Name?: string }[];
  return list
    .map(s => s.Name)
    .filter((n): n is string => !!n && n.startsWith(PREFIX))
    .map(n => n.slice(PREFIX.length));
}
