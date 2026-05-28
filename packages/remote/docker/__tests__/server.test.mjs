// packages/remote/docker/__tests__/server.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile, chmod, rm, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "..", "server.js");

// shared/ folder is at packages/shared (sibling). Server resolves it via
// `<__dirname>/shared` — at runtime in the container the Dockerfile copies it
// in. For local tests we symlink.
const localShared = join(__dirname, "..", "shared");
try { await lstat(localShared); } catch {
  await symlink(join(__dirname, "..", "..", "..", "shared"), localShared, "dir").catch(() => {});
}

const tmpRoot = await mkdtemp(join(tmpdir(), "qdm-server-"));
// Fake dws that prints args
const fakeDws = join(tmpRoot, "dws-fake.sh");
await writeFile(fakeDws, `#!/usr/bin/env bash\necho "FAKE: $*"\nexit 0\n`);
await chmod(fakeDws, 0o755);

let proc, port = 18000 + Math.floor(Math.random() * 1000);

test("server starts on port and responds to /ping", { timeout: 10_000 }, async () => {
  proc = spawn("node", [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      DWS_BIN: fakeDws,
      DWS_CONFIG_DIR_BASE: tmpRoot,
      INJECT_STRATEGY: "d2",
      OAUTH_BASE_URL: "https://auth.example.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", d => process.stderr.write(`[server] ${d}`));
  // Wait for "listening on"
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 5000);
    proc.stderr.on("data", d => {
      if (String(d).includes("listening on")) { clearTimeout(t); resolve(); }
    });
  });

  const r = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
});

test("tools/list returns 38 tools", { timeout: 10_000 }, async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n";
  const r = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    headers: {
      "X-User-Id": "test-user",
      "X-User-Access-Token": "fake-token",
      "Content-Type": "application/json",
    },
    body,
  });
  assert.equal(r.status, 200);
  const text = await r.text();
  // SSE-style: "data: {...}\n\n"
  const match = text.match(/^data: (.+)$/m);
  assert.ok(match, `expected SSE data line, got: ${text.slice(0, 200)}`);
  const rpc = JSON.parse(match[1]);
  assert.equal(rpc.result.tools.length, 38);
  const names = rpc.result.tools.map(t => t.name);
  assert.ok(names.includes("dingtalk_discover"));
  assert.ok(names.includes("dingtalk_invoke"));
  assert.ok(names.includes("dingtalk_send_message")); // alias
});

test("missing X-User-Id returns 401", { timeout: 5_000 }, async () => {
  const r = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n",
  });
  assert.equal(r.status, 401);
});

test.after(async () => {
  if (proc) {
    proc.kill("SIGTERM");
    await new Promise(r => proc.on("close", r));
  }
  await rm(tmpRoot, { recursive: true, force: true });
});
