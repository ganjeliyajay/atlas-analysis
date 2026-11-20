import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  jobName?: string;
  jobExecutionId?: string;
  error?: unknown;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "apikeyplaintext",
  "keyhash",
  "hash",
  "sessionsecret",
  "nextauth_secret",
]);

/**
 * Recursively deep-redacts sensitive fields from objects before logging.
 */
function sanitizeForLogging(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[Truncated: Max Depth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // Redact Bearer tokens in headers or strings
    if (value.toLowerCase().startsWith("bearer ")) {
      return "Bearer [REDACTED]";
    }
    // Redact raw API keys (e.g. atlas_live_...)
    if (value.startsWith("atlas_live_")) {
      return `${value.slice(0, 15)}...[REDACTED]`;
    }
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "development" ? value.stack : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isSensitive =
        SENSITIVE_KEYS.has(lower) ||
        lower.includes("token") ||
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("cookie") ||
        lower.includes("apikey") ||
        lower.includes("keyhash");

      if (isSensitive) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitizeForLogging(v, depth + 1);
      }
    }
    return sanitized;
  }

  return value;
}

function outputLog(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const sanitizedContext = context ? sanitizeForLogging(context) : {};

  const entry = {
    timestamp,
    level,
    message,
    ...(typeof sanitizedContext === "object" && sanitizedContext !== null
      ? (sanitizedContext as Record<string, unknown>)
      : {}),
  };

  const json = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "debug":
      if (process.env.NODE_ENV === "development" || process.env.LOG_LEVEL === "debug") {
        console.debug(json);
      }
      break;
    case "info":
    default:
      console.log(json);
      break;
  }
}

export const logger = {
  createRequestId(): string {
    return `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  },

  debug(message: string, context?: LogContext) {
    outputLog("debug", message, context);
  },

  info(message: string, context?: LogContext) {
    outputLog("info", message, context);
  },

  warn(message: string, context?: LogContext) {
    outputLog("warn", message, context);
  },

  error(message: string, context?: LogContext) {
    outputLog("error", message, context);
  },
};

