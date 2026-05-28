// dws per-user config provisioner.
//
// SPEC §8.4 — frozen interface:
//   provisionUserConfig(userId, accessToken) -> Promise<configDir>
//   teardownUserConfig(userId) -> Promise<void>
//
// Strategies (selected by env INJECT_STRATEGY = d1 | d2 | d3, default d2):
//   D2: spawn `dws auth import --token=<jwt>` to let dws write its own config.
//       Assumes such a subcommand exists; verified by Plan 3 PoC.
//   D1: write encrypted oauth-token.enc directly using dws's file-DEK format.
//       STUB — Plan 3 implements after reading internal/keychain/file_dek.go.
//   D3: depend on a forked dws supporting DWS_USER_ACCESS_TOKEN env var.
//       STUB — Plan 3 implements if D2 + D1 both fail.
//
// See docs/superpowers/notes/2026-05-27-poc-token-injection.md for D1 details.

import { spawn } from "node:child_process";
import { mkdir, rm, access } from "node:fs/promises";
import { constants as fsConsts } from "node:fs";
import { join } from "node:path";

const DWS_BIN = process.env.DWS_BIN || "dws";
const CONFIG_BASE = process.env.DWS_CONFIG_DIR_BASE || "/var/dws/users";

function userDir(userId) {
  // userId is sanitized upstream (mcp-middleware verifies HMAC token); still
  // strip any path traversal characters defensively.
  const safe = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CONFIG_BASE, safe);
}

async function exists(path) {
  try {
    await access(path, fsConsts.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function spawnDws(args, env, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(DWS_BIN, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    const t = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`dws ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on("close", code => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`dws ${args.join(" ")} exit=${code}: ${stderr || stdout}`));
    });
    proc.on("error", err => { clearTimeout(t); reject(err); });
  });
}

// --- D2: spawn `dws auth import --token=<jwt>` ---
async function provisionD2(userId, accessToken) {
  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });
  const env = {
    ...process.env,
    DWS_CONFIG_DIR: dir,
    DWS_DISABLE_KEYCHAIN: "1",
  };
  await spawnDws(["auth", "import", "--token", accessToken], env);
  return dir;
}

// --- D1: write encrypted oauth-token.enc directly ---
async function provisionD1(_userId, _accessToken) {
  // STUB — see docs/superpowers/notes/2026-05-27-poc-token-injection.md §D1.
  // Implementation outline (Plan 3):
  //   1. Read or generate <configDir>/dek (32 random bytes if missing)
  //   2. JSON-encode { access_token, refresh_token, expires_at, scope }
  //   3. AES-256-GCM encrypt with dek + 12B random IV; output [iv|ciphertext|tag]
  //   4. Write to <configDir>/oauth-token.enc
  //   5. Verify by spawning `dws auth status` and asserting authenticated=true
  throw new Error("inject-token D1 strategy not implemented (PoC pending; see PoC notes)");
}

// --- D3: forked dws with DWS_USER_ACCESS_TOKEN env ---
async function provisionD3(userId, accessToken) {
  // STUB — depends on a forked dws build that reads DWS_USER_ACCESS_TOKEN.
  // Implementation outline (Plan 3):
  //   1. mkdir -p <userDir>
  //   2. return <userDir>; the caller passes DWS_USER_ACCESS_TOKEN=<jwt> per
  //      execFile invocation, no provisioning step needed
  void userId; void accessToken;
  throw new Error("inject-token D3 strategy not implemented (requires forked dws; see PoC notes)");
}

export async function provisionUserConfig(userId, accessToken) {
  if (!userId) throw new Error("provisionUserConfig: userId required");
  if (!accessToken) throw new Error("provisionUserConfig: accessToken required");
  const strategy = (process.env.INJECT_STRATEGY || "d2").toLowerCase();
  switch (strategy) {
    case "d2": return await provisionD2(userId, accessToken);
    case "d1": return await provisionD1(userId, accessToken);
    case "d3": return await provisionD3(userId, accessToken);
    default:
      throw new Error(`unknown INJECT_STRATEGY: ${strategy} (expected d1|d2|d3)`);
  }
}

export async function teardownUserConfig(userId) {
  if (!userId) return;
  const dir = userDir(userId);
  if (await exists(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
}

// internal exports for tests
export const _internals = { provisionD1, provisionD2, provisionD3, userDir };
