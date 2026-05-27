// dws PAT (permission) error parser + rewriter.
// FIXTURE / FORMAT: spec §4.4 假设 stderr JSON 形态;Plan 1 Task 3 PoC Step 7
// 实测后回填到 docs/superpowers/notes/...,本模块的 fixture 也跟着替换。
// 防御性策略：parsePATError 任意 stderr 先 JSON.parse,失败则 null;
// 不假设字段名以外的内容。

export function isPATExitCode(code) {
  return code === 4;
}

export function parsePATError(stderr) {
  if (!stderr) return null;
  try {
    const obj = JSON.parse(stderr.trim());
    if (obj && obj.error === "permission_required") return obj;
    return null;
  } catch {
    return null;
  }
}

export function rewritePAT(patObj, { mode, authorizeUrlBuilder } = {}) {
  const scopes = patObj?.missing_scopes || [];
  const scopeList = scopes.length ? scopes.join(" ") : "";

  if (mode === "local") {
    const cmd = scopes.length
      ? `dws pat chmod ${scopes.join(" ")}`
      : `dws pat chmod <scope>`;
    return {
      error: "permission_required",
      missing_scopes: scopes,
      message: `钉钉权限不足。请在终端运行：${cmd}\n完成后重试。`,
    };
  }

  if (mode === "remote") {
    if (typeof authorizeUrlBuilder !== "function") {
      throw new Error("rewritePAT(remote): authorizeUrlBuilder is required");
    }
    const authorize_url = authorizeUrlBuilder(scopes);
    const scopeText = scopeList || "<scope>";
    return {
      error: "permission_required",
      missing_scopes: scopes,
      authorize_url,
      message: `需要新增钉钉权限：${scopeText}\n点击授权后重试：${authorize_url}`,
    };
  }

  throw new Error(`rewritePAT: unknown mode ${mode}`);
}
