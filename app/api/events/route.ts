import { prisma } from "@/lib/prisma"
import { hashLegacyApiKey, verifyApiKey } from "@/lib/api-keys"
import { eventHub } from "@/lib/analytics/event-hub"

import { hashIngestionPayload } from "@/lib/ingestion/idempotency"

import { withIngestionTenantContext } from "@/lib/db-context"

import { checkRateLimit } from "@/lib/rate-limit"

import { randomUUID } from "crypto"

import { NextResponse } from "next/server"

import { Prisma } from "@/lib/generated/prisma/client"

import { z } from "zod"

const MAX_BATCH_SIZE = 500

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

type IngestionErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "rate_limit_exceeded"
  | "invalid_json_body"
  | "invalid_event"
  | "invalid_batch"
  | "quota_exceeded"
  | "tenant_suspended"
  | "idempotency_conflict"
  | "internal_server_error"

type EventInput = {
  eventName: string

  userId?: string | null

  sessionId?: string | null

  properties?: Record<string, unknown> | null

  pageUrl?: string | null

  country?: string | null

  device?: string | null

  browser?: string | null
}

type IngestionResponse = {
  message: string

  accepted: number

  quota: {
    limit: number

    used: number

    remaining: number

    resetAt: string
  }
}

async function logIngestionError({
  errorCode,

  statusCode,

  projectId,

  organizationId,

  apiKeyHash,
}: {
  errorCode: IngestionErrorCode

  statusCode: number

  projectId: string

  organizationId: string

  apiKeyHash?: string | null
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
        })
      },
    )
  } catch (error) {
    // Error logging must never break ingestion responses.

    console.error("Failed to persist ingestion error log:", error)
  }
}

const eventSchema = z.object({
  eventName: z.string().trim().min(1).max(100).refine((value) => value !== "__all__", "This event name is reserved"),

  userId: z.string().nullable().optional(),

  sessionId: z.string().nullable().optional(),

  properties: z.record(z.string(), z.unknown()).nullable().optional(),

  pageUrl: z.string().nullable().optional(),

  country: z.string().nullable().optional(),

  device: z.string().nullable().optional(),

  browser: z.string().nullable().optional(),
})

const eventsArraySchema = z

  .array(eventSchema)

  .min(1)

  .max(MAX_BATCH_SIZE)

function getCurrentMonthStartUTC(): Date {
  const now = new Date()

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

function getNextMonthStartUTC(periodStart: Date): Date {
  return new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),

      periodStart.getUTCMonth() + 1,

      1,
    ),
  )
}

function getRateLimitHeaders(rateLimit: {
  limit: number;
  remaining: number;
  reset: number;
}) {
  return {
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
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
    let rateLimitHeaders: Record<string, string> = {
      "X-RateLimit-Limit": "10000",
      "X-RateLimit-Remaining": "10000",
      "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
    };

    // 1. Read API key only from Authorization header. Credentials in query
    // strings can leak into proxy/access logs and browser history.
    const authorization = request.headers.get("authorization")

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid API key" },

        { status: 401 },
      )
    }

    const apiKey = authorization.slice(7).trim()

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },

        { status: 401 },
      )
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
      return NextResponse.json(
        { error: "Payload exceeds the 1 MB limit" },
        { status: 413 },
      )
    }

    // 2. Hash API key to match the stored hash.

    // Stable fingerprint is used for rate limiting and legacy-key lookup.
    // Dedicated API keys are verified against salted scrypt hashes below.
    apiKeyHash = hashLegacyApiKey(apiKey)

    // 3. Resolve project and organization using secure SECURITY DEFINER procedures (no global ops role needed).
    let project: {
      id: string;
      organizationId: string;
      organization: {
        eventQuota: number; status: string;
      };
    } | null = null;

    type ApiKeyCandidate = {
      id: string;
      organizationId: string;
      projectId: string | null;
      keyPrefix: string;
      keyHash: string;
      revokedAt: Date | null;
      expiresAt: Date | null;
      eventQuota: number;
      status: string;
    };

    const prefix23 = apiKey.slice(0, 23);
    const prefix17 = apiKey.slice(0, 17);

    const apiKeyCandidates = await prisma.$queryRaw<ApiKeyCandidate[]>(Prisma.sql`
      SELECT * FROM lookup_api_key_for_ingestion(${prefix23}, ${prefix17})
    `);

    const apiKeyRecord = apiKeyCandidates.find((candidate) =>
      verifyApiKey(apiKey, candidate.keyHash),
    ) ?? null;

    if (apiKeyRecord) {
      if (apiKeyRecord.revokedAt) {
        return NextResponse.json(
          { error: "API key has been revoked" },
          { status: 401, headers: rateLimitHeaders }
        );
      }

      if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
        return NextResponse.json(
          { error: "API key has expired" },
          { status: 401, headers: rateLimitHeaders }
        );
      }

      const resolvedOrganizationId = apiKeyRecord.organizationId;
      organizationId = resolvedOrganizationId;

      if (apiKeyRecord.projectId) {
        projectId = apiKeyRecord.projectId;
      } else {
        const defaultProject = await withIngestionTenantContext(
          resolvedOrganizationId,
          async (tx) =>
            tx.project.findFirst({
              where: { organizationId: resolvedOrganizationId },
              select: { id: true },
              orderBy: { createdAt: "asc" },
            })
        );
        projectId = defaultProject?.id ?? null;
      }

      if (projectId) {
        project = {
          id: projectId,
          organizationId: resolvedOrganizationId,
          organization: {
            eventQuota: apiKeyRecord.eventQuota,
            status: apiKeyRecord.status,
          },
        };
      }
    } else {
      // Fallback: check legacy Project.apiKeyHash for backward compatibility
      type LegacyProjectCandidate = {
        id: string;
        organizationId: string;
        eventQuota: number;
        status: string;
      };

      const legacyCandidates = apiKeyHash
        ? await prisma.$queryRaw<LegacyProjectCandidate[]>(Prisma.sql`
            SELECT * FROM lookup_legacy_project_for_ingestion(${apiKeyHash})
          `)
        : [];
      const legacyProject = legacyCandidates[0] ?? null;

      if (legacyProject) {
        projectId = legacyProject.id;
        organizationId = legacyProject.organizationId;
        project = {
          id: legacyProject.id,
          organizationId: legacyProject.organizationId,
          organization: {
            eventQuota: legacyProject.eventQuota,
            status: legacyProject.status,
          },
        };
      }
    }

    if (!project || !projectId || !organizationId) {
      return NextResponse.json(
        { error: "Invalid API key" },
        {
          status: 401,
          headers: rateLimitHeaders,
        }
      );
    }

    if (project.organization.status === "suspended") {
      await logIngestionError({
        errorCode: "tenant_suspended",
        statusCode: 403,
        projectId,
        organizationId,
        apiKeyHash,
      });

      return NextResponse.json(
        {
          error: "tenant_suspended",
          message: "Organization tenant is suspended. Event ingestion is disabled.",
        },
        {
          status: 403,
          headers: rateLimitHeaders,
        }
      );
    }

    const validOrgId = organizationId;
    const validProjectId = projectId;

    const projectMetadata = await withIngestionTenantContext(
      validOrgId,
      (tx) => tx.project.findFirst({
        where: { id: validProjectId, organizationId: validOrgId },
        select: { name: true },
      }),
    );

    if (!projectMetadata) {
      return NextResponse.json(
        { error: "Project not found for API key" },
        { status: 401, headers: rateLimitHeaders },
      );
    }

    // 5. Parse JSON body.

    const reader = request.body?.getReader();
    const bodyChunks: Uint8Array[] = [];
    let bodyByteLength = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        bodyByteLength += value.byteLength;
        if (bodyByteLength > 1_048_576) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Payload exceeds the 1 MB limit" },
            { status: 413, headers: rateLimitHeaders },
          );
        }
        bodyChunks.push(value);
      }
    }

    const bodyBytes = new Uint8Array(bodyByteLength);
    let bodyOffset = 0;
    for (const chunk of bodyChunks) {
      bodyBytes.set(chunk, bodyOffset);
      bodyOffset += chunk.byteLength;
    }
    const rawBody = new TextDecoder().decode(bodyBytes);

    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }

    if (body === null) {
      await logIngestionError({
        errorCode: "invalid_json_body",

        statusCode: 400,

        projectId,

        organizationId,

        apiKeyHash,
      })

      return NextResponse.json(
        { error: "Invalid JSON body" },

        {
          status: 400,

          headers: rateLimitHeaders,
        },
      )
    }

    let rawEvents: unknown

    if (Array.isArray(body)) {
      rawEvents = body
    } else if (typeof body === "object" && body !== null && "events" in body) {
      rawEvents = (body as { events: unknown }).events
    } else {
      rawEvents = [body]
    }

    // 6. Validate event batch.

    const parsed = eventsArraySchema.safeParse(rawEvents)

    if (!parsed.success) {
      await logIngestionError({
        errorCode: "invalid_event",

        statusCode: 400,

        projectId,

        organizationId,

        apiKeyHash,
      })

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
        },
      )
    }

    const events: EventInput[] = parsed.data

    if (events.length > MAX_BATCH_SIZE) {
      await logIngestionError({
        errorCode: "invalid_batch",

        statusCode: 400,

        projectId,

        organizationId,

        apiKeyHash,
      })

      return NextResponse.json(
        {
          error: `Maximum batch size is ${MAX_BATCH_SIZE} events`,
        },

        {
          status: 400,

          headers: rateLimitHeaders,
        },
      )
    }

    // 7. Consume one shared PostgreSQL token per accepted event.
    // This is organization-scoped and consistent across application instances.
    const rateLimit = await checkRateLimit({
      organizationId,
      key: `ingest:${apiKeyHash}`,
      requestedTokens: events.length,
    })
    rateLimitHeaders = getRateLimitHeaders(rateLimit)

    if (!rateLimit.success) {
      await logIngestionError({
        errorCode: "rate_limit_exceeded",
        statusCode: 429,
        projectId,
        organizationId,
        apiKeyHash,
      })

      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: "Event ingestion rate limit exceeded.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(Math.max(1, rateLimit.retryAfterSeconds)),
          },
        },
      )
    }

    // 8. Idempotency-Key is optional.

    idempotencyKey = request.headers.get("idempotency-key")?.trim() || null

    if (idempotencyKey && idempotencyKey.length > 255) {
      return NextResponse.json(
        {
          error: "Idempotency-Key must be 255 characters or fewer",
        },

        {
          status: 400,

          headers: rateLimitHeaders,
        },
      )
    }

    incomingPayloadHash = hashIngestionPayload(events)

    // 9. Prepare monthly quota period.

    const periodStart = getCurrentMonthStartUTC()

    const resetAt = getNextMonthStartUTC(periodStart)

    const quota = project.organization.eventQuota

    // 10. Atomically reserve idempotency, quota and insert events.

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
          })
        }

        // Atomically increment monthly quota.

        const usageIncrement = await tx.$queryRaw<{ eventCount: number }[]>`

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

        `

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
          })

          return {
            quotaExceeded: true as const,

            used: usage?.eventCount ?? 0,
          }
        }

        if (idempotencyKey) {
          // Reserve only after quota succeeds. A duplicate-key race rolls
          // back the quota increment because both operations share this transaction.
          await tx.ingestionIdempotencyKey.create({
            data: {
              projectId: project.id,
              key: idempotencyKey,
              payloadHash: incomingPayloadHash!,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          })
        }

        // Assign stable event IDs/timestamps before insertion so the post-commit
        // live notification refers to the exact records that were persisted.
        const persistedEvents = events.map((event) => ({
          id: randomUUID(),
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
          createdAt: new Date(),
          projectId: project.id,
        }));

        const createdEvents = await tx.analyticsEvent.createMany({
          data: persistedEvents,
        });

        const currentUsed = usageIncrement[0]?.eventCount ?? 0;

        const responseBody: IngestionResponse = {
          message: "Events ingested successfully",

          accepted: createdEvents.count,

          quota: {
            limit: quota,

            used: currentUsed,

            remaining: Math.max(
              0,

              quota - currentUsed,
            ),

            resetAt: resetAt.toISOString(),
          },
        }

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
          })
        }

        return {
          quotaExceeded: false as const,
          responseBody,
          used: currentUsed,
          broadcastEvents: persistedEvents.map((event) => ({
            id: event.id,
            eventName: event.eventName,
            userId: event.userId,
            sessionId: event.sessionId,
            properties: event.properties,
            pageUrl: event.pageUrl,
            country: event.country,
            device: event.device,
            browser: event.browser,
            createdAt: event.createdAt.toISOString(),
            projectId: project.id,
            projectName: projectMetadata.name,
          })),
        }
      },
    )

    // 11. Return quota exceeded response.

    if (result.quotaExceeded) {
      await logIngestionError({
        errorCode: "quota_exceeded",

        statusCode: 429,

        projectId,

        organizationId,

        apiKeyHash,
      })

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
        },
      )
    }

    // Broadcast only after the database transaction commits. This prevents
    // SSE consumers from observing events that may later roll back.
    for (const event of result.broadcastEvents) {
      try {
        eventHub.publish(organizationId, event);
      } catch (broadcastError) {
        // The database commit is authoritative. A broken SSE listener must
        // not turn a successful ingestion into a retryable HTTP failure.
        console.error("Live event broadcast failed:", broadcastError);
      }
    }

    // 12. Return accepted response.

    return NextResponse.json(result.responseBody, {
      status: 202,

      headers: {
        ...rateLimitHeaders,

        "X-Event-Quota-Limit": String(quota),

        "X-Event-Quota-Used": String(result.used),

        "X-Event-Quota-Remaining": String(Math.max(0, quota - result.used)),

        "X-Event-Quota-Reset": resetAt.toISOString(),
      },
    })
  } catch (error) {
    // 13. Handle duplicate idempotency key.

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
            })
          },
        )

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
            })

            return NextResponse.json(
              {
                error:
                  "Idempotency key was already used with a different payload",
              },

              { status: 409 },
            )
          }

          // Same key and payload: return stored response.

          if (existing.response) {
            return NextResponse.json(
              {
                ...(existing.response as Record<string, unknown>),

                duplicate: true,
              },

              { status: 202 },
            )
          }
        }
      } catch (duplicateError) {
        console.error(
          "Idempotency replay lookup error:",

          duplicateError,
        )
      }
    }

    console.error("Event ingestion error:", {
      error,

      message: error instanceof Error ? error.message : String(error),

      stack: error instanceof Error ? error.stack : undefined,
    })

    if (projectId && organizationId) {
      await logIngestionError({
        errorCode: "internal_server_error",

        statusCode: 500,

        projectId,

        organizationId,

        apiKeyHash,
      })
    }

    return NextResponse.json(
      { error: "Internal server error" },

      { status: 500 },
    )
  }
}
