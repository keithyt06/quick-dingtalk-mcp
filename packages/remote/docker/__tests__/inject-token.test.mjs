// packages/remote/docker/__tests__/inject-token.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Force d2 strategy + use a stub dws for spawn capture.
process.env.INJECT_STRATEGY = "d2";

const tmpRoot = await mkdtemp(join(tmpdir(), "qdm-inject-"));
process.env.DWS_CONFIG_DIR_BASE = tmpRoot;

// Provide a fake dws binary that records the args + exits 0.
const fakeDws = join(tmpRoot, "dws-fake.sh");
await writeFile(
  fakeDws,
  `#!/usr/bin/env bash\nset -e\necho "FAKE-DWS: $*" >> "${tmpRoot}/dws-calls.log"\nexit 0\n`,
);
await chmod(fakeDws, 0o755);
process.env.DWS_BIN = fakeDws;

const { provisionUserConfig, teardownUserConfig, _internals } = await import("../inject-token.mjs");

test("provisionUserConfig: returns absolute path under DWS_CONFIG_DIR_BASE", async () => {
  const dir = await provisionUserConfig("user-1", "fake-jwt-token");
  assert.ok(dir.startsWith(tmpRoot), `dir ${dir} should be under ${tmpRoot}`);
  assert.ok(dir.endsWith("user-1"), `dir ${dir} should end with user id`);
  const s = await stat(dir);
  assert.ok(s.isDirectory());
});

test("provisionUserConfig: idempotent — second call same uid returns same path, no error", async () => {
  const a = await provisionUserConfig("user-1", "fake-jwt-token");
  const b = await provisionUserConfig("user-1", "fake-jwt-token-2");
  assert.equal(a, b);
});

test("provisionUserConfig (d2): spawns dws auth import with --token", async () => {
  await provisionUserConfig("user-2", "jwt-xyz");
  const log = await readFile(`${tmpRoot}/dws-calls.log`, "utf8");
  assert.match(log, /auth import/);
  assert.match(log, /--token jwt-xyz/);
});

test("teardownUserConfig: removes user dir", async () => {
  await provisionUserConfig("user-3", "jwt");
  await teardownUserConfig("user-3");
  await assert.rejects(stat(join(tmpRoot, "user-3")));
});

test("INJECT_STRATEGY=d1 → throws not-implemented", async () => {
  const orig = process.env.INJECT_STRATEGY;
  process.env.INJECT_STRATEGY = "d1";
  await assert.rejects(
    () => _internals.provisionD1("user-x", "tok"),
    /not implemented/i,
  );
  process.env.INJECT_STRATEGY = orig;
});

test("INJECT_STRATEGY=d3 → throws not-implemented", async () => {
  const orig = process.env.INJECT_STRATEGY;
  process.env.INJECT_STRATEGY = "d3";
  await assert.rejects(
    () => _internals.provisionD3("user-x", "tok"),
    /not implemented/i,
  );
  process.env.INJECT_STRATEGY = orig;
});

test("INJECT_STRATEGY=unknown → throws unknown-strategy", async () => {
  process.env.INJECT_STRATEGY = "d99";
  await assert.rejects(
    () => provisionUserConfig("user-y", "tok"),
    /unknown INJECT_STRATEGY/i,
  );
  process.env.INJECT_STRATEGY = "d2";
});

test.after(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});
