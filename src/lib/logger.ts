import "server-only";

/**
 * Minimal structured server-side logger.
 *
 * Emits one JSON object per line so CloudWatch Logs Insights can query fields
 * directly once the app runs in AWS. Deliberately dependency-free — swap the
 * `emit` implementation for pino/winston later without touching call sites.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

/** Keys whose values are never written to logs, at any nesting depth. */
const REDACTED_KEYS = new Set([
  "databaseurl",
  "database_url",
  "password",
  "secret",
  "token",
  "authorization",
  "awsaccesskeyid",
  "aws_access_key_id",
  "awssecretaccesskey",
  "aws_secret_access_key",
  "accesskeyid",
  "secretaccesskey",
  "sessiontoken",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(entry, depth + 1),
    ]),
  );
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context: redact(context) as LogContext } : {}),
  };

  const line = JSON.stringify(payload);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Normalizes a thrown value into something safe and useful to log. */
export function describeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "UnknownError", message: String(error) };
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== "production") emit("debug", message, context);
  },
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
