// dws error parser + rewriter.
//
// REAL FORMAT (dws v1.0.32, observed on real CLI):
//   stderr is valid JSON: { "error": { category, code, reason, message, hint, actions, ...} }
//   - category: "auth" | "permission" | "api" | ...
//   - reason: "not_authenticated" | "permission_required" | "missing_scope" | ...
//   - exit codes vary per category: unauth=2, PAT-scope=?, network=?
//
// SPEC §4.4 ASSUMPTION (kept for back-compat in case some dws version differs):
//   { "error": "permission_required", "missing_scopes": [...], "hint": "..." }
//
// parsePATError accepts both shapes; only returns a non-null object when the
// stderr genuinely indicates a permission failure (so callers can distinguish
// permission errors from auth/network/api errors).

export function isPATExitCode(code) {
  // dws's exit codes don't have a single canonical "PAT" value across
  // versions/categories — instead we treat any non-zero exit as a candidate
  // and let parsePATError disambiguate via the JSON body.
  return code !== 0 && code != null;
}

function isPermissionShape(obj) {
  if (!obj || typeof obj !== "object") return false;
  // Spec §4.4 flat shape
  if (obj.error === "permission_required") return true;
  // Real dws nested shape
  if (obj.error && typeof obj.error === "object") {
    const e = obj.error;
    if (e.category === "permission") return true;
    if (e.reason === "permission_required") return true;
    if (e.reason === "missing_scope") return true;
  }
  return false;
}

function extractScopes(obj) {
  if (!obj) return [];
  // flat
  if (Array.isArray(obj.missing_scopes)) return obj.missing_scopes;
  // nested
  if (obj.error && typeof obj.error === "object") {
    if (Array.isArray(obj.error.missing_scopes)) return obj.error.missing_scopes;
  }
  return [];
}

export function parsePATError(stderr) {
  if (!stderr) return null;
  let obj;
  try {
    obj = JSON.parse(stderr.trim());
  } catch {
    return null;
  }
  if (!isPermissionShape(obj)) return null;
  return {
    raw: obj,
    missing_scopes: extractScopes(obj),
  };
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
