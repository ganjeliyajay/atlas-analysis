import { logger } from "@/lib/logger";

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "keyhash",
  "invitetoken",
  "sessiontoken",
  "privatekey",
  "clientsecret",
  "credential",
]);

function isSensitiveAuditKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    REDACTED_KEYS.has(normalized) ||
    normalized.includes("token") ||
    normalized.endsWith("secret") ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("apikey") ||
    normalized.includes("privatekey") ||
    normalized.includes("keyhash") ||
    normalized === "key" ||
    normalized.endsWith("key") ||
    normalized.includes("credential")
  );
}

function scrubAuditDetails(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubAuditDetails(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveAuditKey(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      result[key] = scrubAuditDetails(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export type AuditLogParams = {
  actorId: string;
  action: string;
  targetType: "organization" | "member" | "invitation" | "api_key" | "project";
  targetId: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

export type AuditLogClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

export async function createAuditLog(
  tx: AuditLogClient,
  params: AuditLogParams
): Promise<void> {
  const sanitizedDetails = {
    ...(params.details ? (scrubAuditDetails(params.details) as Record<string, unknown>) : {}),
    ...(params.requestId ? { requestId: params.requestId } : {}),
  };

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    // We execute raw INSERT without a RETURNING clause so that PostgreSQL
    // only requires INSERT permission on audit_logs. atlas_app is strictly
    // append-only (has NO SELECT permission on audit_logs).
    await tx.$executeRawUnsafe(
      `INSERT INTO "public"."audit_logs" ("id", "actorId", "action", "targetType", "targetId", "details", "createdAt") VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      id,
      params.actorId,
      params.action,
      params.targetType,
      params.targetId,
      JSON.stringify(sanitizedDetails),
      now
    );
  } catch (err) {
    logger.error("Failed to write audit log", {
      action: params.action,
      actorId: params.actorId,
      targetType: params.targetType,
      targetId: params.targetId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

