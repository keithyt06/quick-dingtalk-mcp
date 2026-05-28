// Structured JSON logger for Lambda. CloudWatch parses JSON automatically.
// Fields:
//   - level: "debug" | "info" | "warn" | "error"
//   - msg: human-readable message
//   - <any other key>: structured context
// Logs are emitted as one-line JSON via console.log/error.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function emit(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const record = { level, msg, ts: new Date().toISOString(), ...ctx };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => emit("info",  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => emit("warn",  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
