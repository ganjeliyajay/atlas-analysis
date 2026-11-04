
import { prismaOps } from "@/lib/prisma-ops";
import { withIngestionTenantContext } from "@/lib/db-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const MAX_BATCH_SIZE = 500;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

type IngestionErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "rate_limit_exceeded"
  | "invalid_json_body"
  | "invalid_event"
  | "invalid_batch"
  | "quota_exceeded"
  | "idempotency_conflict"
  | "internal_server_error";

type EventInput = {
  eventName: string;
  userId?: string | null;
  sessionId?: string | null;
  properties?: Record<string, unknown> | null;
  pageUrl?: string | null;
  country?: string | null;
  device?: string | null;
  browser?: string | null;
};

type IngestionResponse = {
  message: string;
  accepted: number;
  quota: {
    limit: number;
    used: number;
    remaining: number;
    resetAt: string;
  };
};

async function logIngestionError({
  errorCode,
  statusCode,
  projectId,
  organizationId,
  apiKeyHash,
}: {
  errorCode: IngestionErrorCode;
  statusCode: number;
  projectId: string;
  organizationId: string;
  apiKeyHash?: string | null;
}) {
  try {
    await withIngestionTenantContext(
      organizationId,
      async (tx) => {
        await tx.ingestionErrorLog.create({
          data: {
            errorCode,
            statusCode,
            projectId,
            apiKeyHash: apiKeyHash ?? null,
            method: "POST",
            endpoint: "/api/events",
          },
        });
      }
    );
  } catch (error) {
    // Error logging must never break ingestion responses.
    console.error("Failed to persist ingestion error log:", error);
  }
}

const eventSchema = z.object({
  eventName: z.string().trim().min(1).max(100),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
  pageUrl: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  device: z.string().nullable().optional(),
  browser: z.string().nullable().optional(),
});

const eventsArraySchema = z
  .array(eventSchema)
  .min(1)
  .max(MAX_BATCH_SIZE);

function getCurrentMonthStartUTC(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
}

function getNextMonthStartUTC(periodStart: Date): Date {
  return new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      1
    )
  );
}

function hashPayload(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function getRateLimitHeaders(rateLimit: {
  limit: number;
  remaining: number;
  reset: number;
}) {
  return {
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-Ratelimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(rateLimit.reset),
  };
}

export async function POST(request: Request) {
  let projectId: string | null = null;
  let organizationId: string | null = null;
  let apiKeyHash: string | null = null;
  let incomingPayloadHash: string | null = null;
  let idempotencyKey: string | null = null;

  try {
    // 1. Read API key from Authorization header or sendBeacon query.
    const url = new URL(request.url);
    const queryApiKey = url.searchParams.get("apiKey");

    const authorization =
      request.headers.get("authorization") ??
      (queryApiKey ? `Bearer ${queryApiKey}` : null);

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid API key" },
        { status: 401 }
      );
    }

    const apiKey = authorization.slice(7).trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 401 }
      );
    }

    // 2. Hash API key to match the stored hash.
    apiKeyHash = createHash("sha256")
      .update(apiKey)
      .digest("hex");

    // 3. Rate limit.
    const rateLimit = checkRateLimit({
      key: `ingest:${apiKeyHash}`,
      limit: 120,
      windowMs: 60000,
    });

    const rateLimitHeaders = getRateLimitHeaders(rateLimit);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please slow down." },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(
              Math.max(
                1,
                rateLimit.reset - Math.floor(Date.now() / 1000)
              )
            ),
          },
        }
      );
    }

    // 4. Resolve project using the dedicated read-only operations client.
    const project = await prismaOps.project.findUnique({
      where: {
        apiKeyHash,
      },
      select: {
        id: true,
        organizationId: true,
        organization: {
          select: {
            eventQuota: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Invalid API key" },
        {
          status: 401,
          headers: rateLimitHeaders,
        }
      );
    }

    projectId = project.id;
    organizationId = project.organizationId;

    // 5. Parse JSON body.
    const body = await request.json().catch(() => null);

    if (body === null) {
      await logIngestionError({
        errorCode: "invalid_json_body",
        statusCode: 400,
        projectId,
        organizationId,
        apiKeyHash,
      });

      return NextResponse.json(
        { error: "Invalid JSON body" },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    let rawEvents: unknown;

    if (Array.isArray(body)) {
      rawEvents = body;
    } else if (
      typeof body === "object" &&
      body !== null &&
      "events" in body
    ) {
      rawEvents = (body as { events: unknown }).events;
    } else {
      rawEvents = [body];
    }

    // 6. Validate event batch.
    const parsed = eventsArraySchema.safeParse(rawEvents);

    if (!parsed.success) {
      await logIngestionError({
        errorCode: "invalid_event",
        statusCode: 400,
        projectId,
        organizationId,
        apiKeyHash,
      });

      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    const events: EventInput[] = parsed.data;

    if (events.length > MAX_BATCH_SIZE) {
      await logIngestionError({
        errorCode: "invalid_batch",
        statusCode: 400,
        projectId,
        organizationId,
        apiKeyHash,
      });

      return NextResponse.json(
        {
          error: `Maximum batch size is ${MAX_BATCH_SIZE} events`,
        },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    // 7. Idempotency-Key is optional.
    idempotencyKey =
      request.headers.get("idempotency-key")?.trim() || null;

    if (idempotencyKey && idempotencyKey.length > 255) {
      return NextResponse.json(
        {
          error: "Idempotency-Key must be 255 characters or fewer",
        },
        {
          status: 400,
          headers: rateLimitHeaders,
        }
      );
    }

    incomingPayloadHash = hashPayload(events);

    // 8. Prepare monthly quota period.
    const periodStart = getCurrentMonthStartUTC();
    const resetAt = getNextMonthStartUTC(periodStart);
    const quota = project.organization.eventQuota;

    // 9. Atomically reserve idempotency, quota and insert events.
    const result = await withIngestionTenantContext(
      organizationId,
      async (tx) => {
        if (idempotencyKey) {
          // Allow an expired key to be reused.
          await tx.ingestionIdempotencyKey.deleteMany({
            where: {
              projectId: project.id,
              key: idempotencyKey,
              expiresAt: {
                lte: new Date(),
              },
            },
          });

          // Unique constraint prevents concurrent duplicate reservations.
          await tx.ingestionIdempotencyKey.create({
            data: {
              projectId: project.id,
              key: idempotencyKey,
              payloadHash: incomingPayloadHash!,
              expiresAt: new Date(
                Date.now() + IDEMPOTENCY_TTL_MS
              ),
            },
          });
        }

        // Atomically increment monthly quota.
        const usageIncrement = await tx.$queryRaw<
          { eventCount: number }[]
        >`
          INSERT INTO "OrganizationUsage" (
            "id",
            "organizationId",
            "periodStart",
            "eventCount",
            "createdAt",
            "updatedAt"
          )
          SELECT
            ${randomUUID()},
            org."id",
            ${periodStart},
            ${events.length},
            NOW(),
            NOW()
          FROM "Organization" AS org
          WHERE org."id" = ${project.organizationId}
            AND org."eventQuota" >= ${events.length}
          ON CONFLICT ("organizationId", "periodStart")
          DO UPDATE SET
            "eventCount" =
              "OrganizationUsage"."eventCount" + ${events.length},
            "updatedAt" = NOW()
          WHERE
            "OrganizationUsage"."eventCount" + ${events.length}
            <= (
              SELECT "eventQuota"
              FROM "Organization"
              WHERE "id" = ${project.organizationId}
            )
          RETURNING "eventCount"
        `;

        // No row returned means quota has been reached.
        if (usageIncrement.length === 0) {
          const usage = await tx.organizationUsage.findUnique({
            where: {
              organizationId_periodStart: {
                organizationId: project.organizationId,
                periodStart,
              },
            },
            select: {
              eventCount: true,
            },
          });

          return {
            quotaExceeded: true as const,
            used: usage?.eventCount ?? 0,
          };
        }

        // Insert all events in one database operation.
        const createdEvents = await tx.analyticsEvent.createMany({
          data: events.map((event) => ({
            eventName: event.eventName,
            userId: event.userId ?? null,
            sessionId: event.sessionId ?? null,
            properties:
              event.properties === undefined || event.properties === null
                ? undefined
                : (event.properties as Prisma.InputJsonValue),
            pageUrl: event.pageUrl ?? null,
            country: event.country ?? null,
            device: event.device ?? null,
            browser: event.browser ?? null,
            projectId: project.id,
          })),
        });

        const responseBody: IngestionResponse = {
          message: "Events ingested successfully",
          accepted: createdEvents.count,
          quota: {
            limit: quota,
            used: usageIncrement[0].eventCount,
            remaining: Math.max(
              0,
              quota - usageIncrement[0].eventCount
            ),
            resetAt: resetAt.toISOString(),
          },
        };

        // Store response for idempotent replay.
        if (idempotencyKey) {
          await tx.ingestionIdempotencyKey.update({
            where: {
              projectId_key: {
                projectId: project.id,
                key: idempotencyKey,
              },
            },
            data: {
              response: responseBody as Prisma.InputJsonValue,
            },
          });
        }

        return {
          quotaExceeded: false as const,
          responseBody,
          used: usageIncrement[0].eventCount,
        };
      }
    );

    // 10. Return quota exceeded response.
    if (result.quotaExceeded) {
      await logIngestionError({
        errorCode: "quota_exceeded",
        statusCode: 429,
        projectId,
        organizationId,
        apiKeyHash,
      });

      return NextResponse.json(
        {
          error: "quota_exceeded",
          message: "Monthly event quota has been reached.",
          quota,
          used: result.used,
          remaining: Math.max(0, quota - result.used),
          resetAt: resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "X-Event-Quota-Limit": String(quota),
            "X-Event-Quota-Used": String(result.used),
            "X-Event-Quota-Remaining": "0",
            "X-Event-Quota-Reset": resetAt.toISOString(),
          },
        }
      );
    }

    // 11. Return accepted response.
    return NextResponse.json(result.responseBody, {
      status: 202,
      headers: {
        ...rateLimitHeaders,
        "X-Event-Quota-Limit": String(quota),
        "X-Event-Quota-Used": String(result.used),
        "X-Event-Quota-Remaining": String(
          Math.max(0, quota - result.used)
        ),
        "X-Event-Quota-Reset": resetAt.toISOString(),
      },
    });
  } catch (error) {
    // 12. Handle duplicate idempotency key.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "P2002" &&
      projectId &&
      organizationId &&
      idempotencyKey
    ) {
      try {
        const existing = await withIngestionTenantContext(
          organizationId,
          async (tx) => {
            return tx.ingestionIdempotencyKey.findUnique({
              where: {
                projectId_key: {
                  projectId: projectId!,
                  key: idempotencyKey!,
                },
              },
            });
          }
        );

        if (existing && existing.expiresAt > new Date()) {
          // Same key but different payload is a conflict.
          if (
            incomingPayloadHash &&
            existing.payloadHash !== incomingPayloadHash
          ) {
            await logIngestionError({
              errorCode: "idempotency_conflict",
              statusCode: 409,
              projectId,
              organizationId,
              apiKeyHash,
            });

            return NextResponse.json(
              {
                error:
                  "Idempotency key was already used with a different payload",
              },
              { status: 409 }
            );
          }

          // Same key and payload: return stored response.
          if (existing.response) {
            return NextResponse.json(
              {
                ...(existing.response as Record<string, unknown>),
                duplicate: true,
              },
              { status: 202 }
            );
          }
        }
      } catch (duplicateError) {
        console.error(
          "Idempotency replay lookup error:",
          duplicateError
        );
      }
    }

    console.error("Event ingestion error:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (projectId && organizationId) {
      await logIngestionError({
        errorCode: "internal_server_error",
        statusCode: 500,
        projectId,
        organizationId,
        apiKeyHash,
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
