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

// --- regression: per-request failure isolation + abort scoping ---

function spawnServer(envOverrides, port2) {
  const p = spawn("node", [SERVER], {
    env: {
      ...process.env,
      PORT: String(port2),
      DWS_BIN: fakeDws,
      DWS_CONFIG_DIR_BASE: tmpRoot,
      INJECT_STRATEGY: "d2",
      OAUTH_BASE_URL: "https://auth.example.com",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 5000);
    p.stderr.on("data", d => {
      if (String(d).includes("listening on")) { clearTimeout(t); resolve(); }
    });
  });
  return { proc: p, ready };
}

const callBody = (id, name, args = {}) =>
  JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n";
const userHeaders = {
  "X-User-Id": "test-user",
  "X-User-Access-Token": "fake-token",
  "Content-Type": "application/json",
};

test("provision failure must NOT crash the server (other users unaffected)", { timeout: 10_000 }, async () => {
  const port2 = port + 1;
  // INJECT_STRATEGY=d1 is a stub that throws — simulates any provisioning error.
  const { proc: p, ready } = spawnServer({ INJECT_STRATEGY: "d1" }, port2);
  try {
    await ready;
    const r = await fetch(`http://127.0.0.1:${port2}/`, {
      method: "POST", headers: userHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n",
    });
    const text = await r.text();
    assert.match(text, /server error/, "client should get a JSON-RPC error, not an empty stream");
    // The process must still be alive and serving.
    const ping = await fetch(`http://127.0.0.1:${port2}/ping`);
    assert.equal(ping.status, 200, "server must survive a provisioning failure");
  } finally {
    p.kill("SIGKILL");
    await new Promise(r => p.on("close", r));
  }
});

test("aborting request A must not kill request B's in-flight dws (per-request abort scoping)", { timeout: 15_000 }, async () => {
  const port2 = port + 2;
  // Fake dws: `auth login` (provisioning) is instant; tool calls sleep 1.5s.
  const slowDws = join(tmpRoot, "dws-slow.sh");
  await writeFile(slowDws, `#!/usr/bin/env bash\nif [[ "$1" == "auth" ]]; then exit 0; fi\nsleep 1.5\necho "SLOW-OK"\nexit 0\n`);
  await chmod(slowDws, 0o755);
  const { proc: p, ready } = spawnServer({ DWS_BIN: slowDws }, port2);
  try {
    await ready;
    // Request A: slow tools/call; will be aborted mid-flight.
    const ctrl = new AbortController();
    const a = fetch(`http://127.0.0.1:${port2}/`, {
      method: "POST", headers: userHeaders, signal: ctrl.signal,
      body: callBody(1, "dingtalk_contact_user_get_self"),
    }).then(r => r.text()).catch(() => "(aborted)");
    await new Promise(r => setTimeout(r, 300));
    // Request B: starts AFTER A, so a shared "last spawned process" handle now
    // points at B's dws. With the old module-level lastProc, aborting A killed
    // B's process. With per-request scoping, B must complete normally.
    const b = fetch(`http://127.0.0.1:${port2}/`, {
      method: "POST", headers: { ...userHeaders, "X-User-Id": "other-user" },
      body: callBody(2, "dingtalk_contact_user_get_self"),
    }).then(r => r.text());
    await new Promise(r => setTimeout(r, 300)); // let B spawn its dws
    ctrl.abort(); // A's connection drops → A's close handler fires
    const bText = await b;
    assert.match(bText, /SLOW-OK/, `request B's dws was killed by request A's abort: ${bText.slice(0, 300)}`);
    await a;
  } finally {
    p.kill("SIGKILL");
    await new Promise(r => p.on("close", r));
  }
});

test.after(async () => {
  if (proc) {
    proc.kill("SIGTERM");
    await new Promise(r => proc.on("close", r));
  }
  await rm(tmpRoot, { recursive: true, force: true });
});
