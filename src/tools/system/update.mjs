/**
 * 系统自更新 tool
 *
 * 让 AI agent 可以通过 MCP 协议发现并执行 MCP 服务的自我更新。
 * 不走 dws CLI，直接执行本地更新脚本。
 *
 * 关键设计：
 * - tool name 使用 "system_" 前缀，让 agent 更容易识别为系统管理类能力
 * - description 同时包含中英文关键词，提升 agent 的语义匹配率
 * - 提供 check_update + self_update 两步式工作流
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { WRITE_IDEMPOTENT, READ_ONLY } from "../../framework/annotations.mjs";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..", "..");
const SCRIPTS_DIR = resolve(PROJECT_ROOT, "scripts");
const UPDATE_TIMEOUT_MS = 120_000; // 更新超时 2 分钟
const UPDATE_BRANCH = "safe-mode"; // 固定从此分支拉取更新

/**
 * 检测当前操作系统并返回对应的更新脚本路径和执行命令
 */
function getUpdateCommand(options = {}) {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    const script = resolve(SCRIPTS_DIR, "update.ps1");
    const cmd = "powershell";
    const cmdArgs = ["-ExecutionPolicy", "Bypass", "-File", script];
    if (options.upgradeDws) cmdArgs.push("-UpgradeDws");
    if (options.force) cmdArgs.push("-Force");
    return { cmd, args: cmdArgs, script };
  } else {
    const script = resolve(SCRIPTS_DIR, "update.sh");
    const cmd = "bash";
    const cmdArgs = [script];
    if (options.upgradeDws) cmdArgs.push("--upgrade-dws");
    if (options.force) cmdArgs.push("--force");
    return { cmd, args: cmdArgs, script };
  }
}

/**
 * 获取当前版本信息（git commit + branch）
 */
async function getVersionInfo() {
  try {
    const { stdout: branch } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: PROJECT_ROOT,
      timeout: 5000,
    });
    const { stdout: commit } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: PROJECT_ROOT,
      timeout: 5000,
    });
    const { stdout: log } = await execFileAsync("git", ["log", "--oneline", "-5"], {
      cwd: PROJECT_ROOT,
      timeout: 5000,
    });
    return {
      branch: branch.trim(),
      commit: commit.trim(),
      recentCommits: log.trim(),
      updateBranch: UPDATE_BRANCH,
    };
  } catch {
    return { branch: "unknown", commit: "unknown", recentCommits: "", updateBranch: UPDATE_BRANCH };
  }
}

export default [
  // ─── 检查更新状态 ──────────────────────────────────────
  {
    name: "dingtalk_check_update",
    description:
      "Check if this MCP server (quick-dingtalk-mcp) has available updates. " +
      "Shows current version, branch, recent commits, and whether remote has new commits. " +
      "Use this tool when the user asks about version, update status, or wants to know if the server is up-to-date. " +
      "检查 MCP 服务是否有可用更新，显示当前版本信息。",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    _customExecutor: true,
    async execute() {
      const versionInfo = await getVersionInfo();

      // 检查远程是否有更新（固定对比 origin/safe-mode）
      let updateAvailable = "unknown";
      let behindCount = 0;
      try {
        await execFileAsync("git", ["fetch", "origin", UPDATE_BRANCH], {
          cwd: PROJECT_ROOT,
          timeout: 15000,
        });
        const { stdout } = await execFileAsync(
          "git",
          ["rev-list", "--count", `HEAD..origin/${UPDATE_BRANCH}`],
          { cwd: PROJECT_ROOT, timeout: 5000 }
        );
        behindCount = parseInt(stdout.trim(), 10) || 0;
        updateAvailable = behindCount > 0 ? "yes" : "no";
      } catch {
        updateAvailable = "check_failed";
      }

      const lines = [
        `## quick-dingtalk-mcp Version Info`,
        ``,
        `- Current branch: ${versionInfo.branch}`,
        `- Update branch: ${UPDATE_BRANCH}`,
        `- Current commit: ${versionInfo.commit}`,
        ``,
        `### Recent commits:`,
        versionInfo.recentCommits,
        ``,
        `### Update available: ${updateAvailable === "yes" ? `YES (${behindCount} commits behind origin/${UPDATE_BRANCH})` : updateAvailable === "no" ? "NO (already up-to-date)" : "CHECK FAILED (network issue?)"}`,
      ];

      if (updateAvailable === "yes") {
        lines.push(
          ``,
          `### Next step:`,
          `Call the \`dingtalk_self_update\` tool to update to the latest version.`
        );
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  },

  // ─── 执行自我更新 ──────────────────────────────────────
  {
    name: "dingtalk_self_update",
    description:
      "Update this MCP server (quick-dingtalk-mcp) to the latest version. " +
      "Performs git pull + npm install to fetch and apply updates. " +
      "Use this tool when the user asks to update/upgrade the MCP server, or after dingtalk_check_update shows updates are available. " +
      "The MCP server needs to be restarted after update to load new code. " +
      "更新 MCP 服务到最新版本（git pull + npm install），更新后需重启服务。",
    annotations: WRITE_IDEMPOTENT,
    inputSchema: {
      type: "object",
      properties: {
        upgrade_dws: {
          type: "boolean",
          description:
            "Whether to also upgrade the dws CLI tool (default: false). " +
            "是否同时升级 dws CLI（默认 false）",
          default: false,
        },
        force: {
          type: "boolean",
          description:
            "Force reset to remote latest version, discarding local changes (default: false). " +
            "强制重置到远程最新版本，丢弃本地修改（默认 false）",
          default: false,
        },
      },
      additionalProperties: false,
    },
    _customExecutor: true,
    async execute(args = {}) {
      const options = {
        upgradeDws: args.upgrade_dws === true,
        force: args.force === true,
      };

      const { cmd, args: cmdArgs, script } = getUpdateCommand(options);

      // 检查脚本是否存在
      if (!existsSync(script)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Update script not found: ${script}\nPlease ensure the project is complete.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
          cwd: PROJECT_ROOT,
          timeout: UPDATE_TIMEOUT_MS,
          maxBuffer: 5 * 1024 * 1024,
          env: { ...process.env, FORCE_COLOR: "0" },
        });

        const output = (stdout || "").trim() + "\n" + (stderr || "").trim();
        const result = output.trim();

        return {
          content: [
            {
              type: "text",
              text: result + "\n\n⚠️ Note: Please restart the MCP server to load the updated code.",
            },
          ],
        };
      } catch (err) {
        const parts = [`Update failed: ${err.message}`];
        if (err.stdout) parts.push(`stdout: ${err.stdout.trim()}`);
        if (err.stderr) parts.push(`stderr: ${err.stderr.trim()}`);
        return {
          content: [{ type: "text", text: parts.join("\n") }],
          isError: true,
        };
      }
    },
  },
];
