// quick-dingtalk-mcp Remote — Streamable HTTP server.
//
// Structure: borrowed from lark-mcp-on-agentcore/agentcore-runtime/server.js.
// Pattern: HTTP POST `/` is the MCP transport; we read newline-delimited
// JSON-RPC requests off the body, dispatch through shared catalog, then write
// SSE-style `data: <json>\n\n` responses back. GET /ping is liveness.
//
// Per-request lifecycle:
//   1. mcp-middleware Lambda has already verified HMAC + sig'd request; the
//      body arrives with X-User-Access-Token + X-Incr-Auth-Token headers.
//   2. provisionUserConfig(uid, accessToken) sets up DWS_CONFIG_DIR for this user.
//   3. Acquire one slot from semaphore (max MAX_CONCURRENT).
//   4. dispatch tool call → execFile dws → stdout/stderr → MCP response.
//   5. teardownUserConfig only on session-end (we keep it warm during the
//      request to avoid per-call setup); for stateless runs set
//      TEARDOWN_PER_REQUEST=1.

import http from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { provisionUserConfig, teardownUserConfig } from "./inject-token.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- shared (loaded relative to /app/shared after Dockerfile COPY) ---
function loadSharedJson(name) {
  return JSON.parse(readFileSync(join(__dirname, "shared", name), "utf8"));
}
const catalog = loadSharedJson("catalog.json");
const tier1 = loadSharedJson("tier1.json");
const sharedSrc = await import(join(__dirname, "shared", "src", "index.mjs"));
const {
  toToolName, buildInputSchema, toCliArgs, InputError,
  searchCatalog, rewritePAT, parsePATError, isPATExitCode, annotationsFor, toolDescription,
} = sharedSrc;

// --- config ---
const PORT = parseInt(process.env.PORT || "8000", 10);
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || "10", 10);
const DWS_BIN = process.env.DWS_BIN || "dws";
const EXEC_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS || "60000", 10);
const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const AGENTCODE = process.env.DINGTALK_DWS_AGENTCODE || "quick-dingtalk-mcp";
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL || "";
const TEARDOWN_PER_REQUEST = process.env.TEARDOWN_PER_REQUEST === "1";

// --- tool list (38) ---
const TOOL_NAME_TO_KEY = new Map();
for (const key of Object.keys(catalog.commands)) {
  TOOL_NAME_TO_KEY.set(toToolName(key), key);
}
const aliasMap = tier1.aliases;

function findCommandByToolName(name) {
  const realName = aliasMap[name] || name;
  const key = TOOL_NAME_TO_KEY.get(realName);
  if (!key) return null;
  return { key, cmd: catalog.commands[key], realName };
}

function buildToolList() {
  const tools = [];
  for (const toolName of tier1.tools) {
    const found = findCommandByToolName(toolName);
    if (!found) continue;
    tools.push({
      name: toolName,
      description: toolDescription(found.cmd),
      inputSchema: buildInputSchema(found.cmd),
      annotations: annotationsFor(found.cmd),
    });
  }
  for (const [aliasName, realName] of Object.entries(aliasMap)) {
    const found = findCommandByToolName(realName);
    if (!found) continue;
    tools.push({
      name: aliasName,
      description: `[deprecated, use ${realName}] ${toolDescription(found.cmd)}`,
      inputSchema: buildInputSchema(found.cmd),
      annotations: annotationsFor(found.cmd),
    });
  }
  tools.push({
    name: "dingtalk_discover",
    description: "搜索 dws catalog 命令；返回 tool_name + 简介。先 discover、再 invoke。",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
  });
  tools.push({
    name: "dingtalk_invoke",
    description: "按 dingtalk_discover 给出的 tool_name 调用对应命令。",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        args: { type: "object" },
      },
      required: ["tool_name"],
    },
  });
  return tools;
}
const TOOLS = buildToolList();

// --- semaphore ---
class Semaphore {
  constructor(n) { this.n = n; this.q = []; }
  async acquire() {
    if (this.n > 0) { this.n--; return; }
    await new Promise(r => this.q.push(r));
  }
  release() {
    if (this.q.length > 0) { const r = this.q.shift(); r(); }
    else this.n++;
  }
  get queueDepth() { return this.q.length; }
}
const sem = new Semaphore(MAX_CONCURRENT);

// --- shutdown drain ---
let shuttingDown = false;
let activeRequests = 0;

// --- authorize URL builder for incremental-auth ---
function buildAuthorizeUrl(scopes, incrAuthToken) {
  if (!OAUTH_BASE_URL) {
    return `<OAUTH_BASE_URL not set>`;
  }
  const u = new URL("/authorize", OAUTH_BASE_URL);
  if (scopes && scopes.length) u.searchParams.set("extra_scope", scopes.join(" "));
  if (incrAuthToken) u.searchParams.set("t", incrAuthToken);
  return u.toString();
}

// --- main dispatch ---
async function dispatchToolCall(name, args, env) {
  if (name === "dingtalk_discover") {
    const results = searchCatalog(catalog, args, { tier1: tier1.tools });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
  if (name === "dingtalk_invoke") {
    if (!args.tool_name) throw new InputError("tool_name 必填");
    return await dispatchToolCall(args.tool_name, args.args || {}, env);
  }
  const found = findCommandByToolName(name);
  if (!found) throw new InputError(`未知工具: ${name}`);
  const cliArgs = toCliArgs(found.cmd, args);
  return await runDws(cliArgs, env);
}

function runDws(cliArgs, env) {
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const proc = execFile(DWS_BIN, cliArgs, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      env,
    });
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    proc.on("close", code => {
      if (code === 0) {
        const out = stdout.trim() || stderr.trim() || "(empty response)";
        resolve({ content: [{ type: "text", text: out }] });
      } else {
        const err = new Error(`dws exit=${code}`);
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });
    proc.on("error", reject);
    // expose for caller-side abort
    runDws.lastProc = proc;
  });
}

function errorResult(err, incrAuthToken) {
  if (err instanceof InputError) {
    return { content: [{ type: "text", text: err.message }], isError: true };
  }
  if (isPATExitCode(err.code)) {
    const pat = parsePATError(err.stderr);
    if (pat) {
      const rewritten = rewritePAT(pat, {
        mode: "remote",
        authorizeUrlBuilder: scopes => buildAuthorizeUrl(scopes, incrAuthToken),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(rewritten, null, 2) }],
        isError: true,
      };
    }
  }
  const parts = [err.message];
  if (err.stderr) parts.push(`stderr: ${err.stderr}`);
  return { content: [{ type: "text", text: `Error: ${parts.join("\n")}` }], isError: true };
}

// --- HTTP transport ---
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", c => {
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function handleMcpRequest(req, res) {
  const userId = req.headers["x-user-id"] || "";
  const accessToken = req.headers["x-user-access-token"] || "";
  const incrAuthToken = req.headers["x-incr-auth-token"] || "";
  if (!userId || !accessToken) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "missing X-User-Id or X-User-Access-Token" }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.statusCode = e.statusCode || 400;
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  // Parse the (newline-delimited) JSON-RPC payload up front so we can honour the
  // Streamable HTTP contract: a POST whose body is ONLY notifications/responses
  // (no JSON-RPC requests with an `id`) must get 202 Accepted with no body — NOT
  // an SSE stream. Quick (and any spec-compliant client) sends
  // `notifications/initialized` right after initialize; replying to it with an
  // SSE body makes the client treat the handshake as failed → stays "Configured,
  // not Connected". (MCP 2025-03-26 transports §"Sending Messages to the Server".)
  const rpcs = body.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const hasRequest = rpcs.some(r => r && r.id !== undefined && r.method !== undefined);
  if (rpcs.length > 0 && !hasRequest) {
    res.statusCode = 202;
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }

  let configDir;
  await sem.acquire();
  activeRequests++;
  let aborted = false;
  req.on("close", () => { aborted = true; if (runDws.lastProc) runDws.lastProc.kill("SIGTERM"); });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  // Streamable HTTP session id. Stable per user (visible-ASCII only, per spec).
  // Clients echo this on subsequent requests; returning it on every response is
  // allowed and lets the client confirm the session is established.
  res.setHeader("Mcp-Session-Id", userId);

  try {
    configDir = await provisionUserConfig(userId, accessToken);
    const env = {
      ...process.env,
      DWS_CONFIG_DIR: configDir,
      // dws stores the encrypted token blob + DEK under StorageDir, which
      // defaults to ~/.local/share/dws-cli — NOT under DWS_CONFIG_DIR. Without
      // a per-user DWS_KEYCHAIN_DIR every user's token collides in one dir
      // (cross-user token bleed). Pin it under the per-user config dir.
      // (dws keychain_linux.go: StorageDir honours DWS_KEYCHAIN_DIR override.)
      DWS_KEYCHAIN_DIR: configDir,
      DINGTALK_DWS_AGENTCODE: AGENTCODE,
      DWS_DISABLE_KEYCHAIN: "1",
    };

    // Iterate the pre-parsed JSON-RPC messages (see top of handler).
    for (const rpc of rpcs) {
      if (aborted) break;
      // Skip any notifications/responses mixed into a batch that also has
      // requests — only requests (with an id) get a response.
      if (rpc.id === undefined) continue;
      let response;
      try {
        if (rpc.method === "initialize") {
          // Echo the client's requested protocolVersion when present (Quick
          // negotiates 2025-03-26); fall back to a known-good version.
          const clientPV = rpc.params && rpc.params.protocolVersion;
          response = {
            jsonrpc: "2.0", id: rpc.id,
            result: {
              protocolVersion: clientPV || "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "quick-dingtalk-mcp-remote", version: "0.2.0" },
            },
          };
        } else if (rpc.method === "tools/list") {
          response = { jsonrpc: "2.0", id: rpc.id, result: { tools: TOOLS } };
        } else if (rpc.method === "tools/call") {
          const { name, arguments: args = {} } = rpc.params || {};
          let result;
          try {
            result = await dispatchToolCall(name, args, env);
          } catch (e) {
            result = errorResult(e, incrAuthToken);
          }
          response = { jsonrpc: "2.0", id: rpc.id, result };
        } else {
          response = { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `method not found: ${rpc.method}` } };
        }
      } catch (e) {
        response = { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: e.message } };
      }
      writeSSE(res, response);
    }
  } finally {
    res.end();
    activeRequests--;
    sem.release();
    if (TEARDOWN_PER_REQUEST && configDir) {
      teardownUserConfig(userId).catch(() => {});
    }
  }
}

// --- HTTP server ---
const server = http.createServer(async (req, res) => {
  if (shuttingDown) {
    res.statusCode = 503;
    res.setHeader("Retry-After", "5");
    res.end("draining");
    return;
  }
  if (req.method === "GET" && req.url === "/ping") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, queue_depth: sem.queueDepth, active: activeRequests }));
    return;
  }
  if (req.method === "POST") {
    await handleMcpRequest(req, res);
    return;
  }
  res.statusCode = 405;
  res.end("method not allowed");
});

server.listen(PORT, () => {
  console.error(`qdm-remote listening on :${PORT} (max_concurrent=${MAX_CONCURRENT}, dws=${DWS_BIN})`);
});

// --- SIGTERM drain ---
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`SIGTERM — draining (${activeRequests} active)...`);
  server.close(() => {
    console.error("HTTP server closed.");
    process.exit(0);
  });
  // Hard timeout: 30s grace for in-flight requests.
  setTimeout(() => {
    console.error("Drain timeout, forcing exit.");
    process.exit(1);
  }, 30_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
