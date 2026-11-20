import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

export interface SentryScope {
  userId?: string;
  tenantId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sentry = {
  isConfigured(): boolean {
    return Boolean(dsn && dsn.startsWith("https://"));
  },

  captureException(error: unknown, scope?: SentryScope): string {
    const eventId = this.isConfigured()
      ? Sentry.captureException(error, {
          user: scope?.userId ? { id: scope.userId } : undefined,
          tags: {
            tenantId: scope?.tenantId ?? "none",
            ...scope?.tags,
          },
          extra: scope?.extra,
        })
      : `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.error("Application error captured", {
      eventId,
      error,
      tenantId: scope?.tenantId,
      userId: scope?.userId,
      tags: scope?.tags,
      extra: scope?.extra,
    });

    return eventId;
  },

  captureMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
    scope?: SentryScope
  ): string {
    const eventId = this.isConfigured()
      ? Sentry.captureMessage(message, {
          level,
          user: scope?.userId ? { id: scope.userId } : undefined,
          tags: {
            tenantId: scope?.tenantId ?? "none",
            ...scope?.tags,
          },
          extra: scope?.extra,
        })
      : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    logger.info(`Sentry message: ${message}`, {
      eventId,
      level,
      tenantId: scope?.tenantId,
      userId: scope?.userId,
      extra: scope?.extra,
    });

    return eventId;
  },
};
