import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { formatUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { z } from "zod";

const querySchema = z.object({
  projectId: z.string().trim().optional(),
  range: z.enum(["today", "7d", "30d", "90d"]).default("7d"),
  search: z.string().trim().max(200).optional(),
  eventName: z.string().trim().max(200).optional(),
  userId: z.string().trim().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return date;
}

function parseEndDateExclusive(value: string): Date | null {
  const date = parseDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function escapeCsv(value: unknown): string {
  let text = "";

  if (value === null || value === undefined) {
    text = "";
  } else if (value instanceof Date) {
    text = formatUtcNaiveTimestamp(value);
  } else if (typeof value === "object") {
    text = JSON.stringify(value) ?? "";
  } else {
    text = String(value);
  }

  // Prevent spreadsheet formula injection attacks (CSV injection / DDE).
  if (/^[\s\t\r]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

type ExportEventRecord = {
  id: string;
  eventName: string;
  userId: string | null;
  sessionId: string | null;
  properties: unknown;
  pageUrl: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  createdAt: Date;
  projectId: string;
};

const csvHeaders = [
  "Event ID",
  "Event Name",
  "User ID",
  "Session ID",
  "Properties",
  "Page URL",
  "Country",
  "Device",
  "Browser",
  "Created At",
  "Project ID",
];

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    const userIdFromSession = session?.user?.id;

    if (!userIdFromSession) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const membership = await getActiveOrganizationForUser(userIdFromSession);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const url = new URL(request.url);

    const parsedQuery = querySchema.safeParse({
      projectId: url.searchParams.get("projectId") ?? undefined,
      range: url.searchParams.get("range") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      eventName: url.searchParams.get("eventName") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsedQuery.error.issues,
        },
        { status: 400 },
      );
    }

    const {
      projectId,
      range,
      search,
      eventName,
      userId: filterUserId,
      startDate,
      endDate,
    } = parsedQuery.data;

    if (Boolean(startDate) !== Boolean(endDate)) {
      return NextResponse.json(
        { error: "Both startDate and endDate are required for a custom range" },
        { status: 400 },
      );
    }

    const now = new Date();
    const rangeStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ));

    switch (range) {
      case "today":
        break;
      case "30d":
        rangeStart.setUTCDate(rangeStart.getUTCDate() - 29);
        break;
      case "90d":
        rangeStart.setUTCDate(rangeStart.getUTCDate() - 89);
        break;
      case "7d":
      default:
        rangeStart.setUTCDate(rangeStart.getUTCDate() - 6);
        break;
    }

    const parsedStartDate = startDate ? parseDate(startDate) : rangeStart;
    const parsedEndDateExclusive = endDate ? parseEndDateExclusive(endDate) : now;

    if (
      !parsedStartDate ||
      !parsedEndDateExclusive ||
      parsedStartDate >= parsedEndDateExclusive
    ) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    }

    if (projectId && projectId !== "All") {
      const projectExists = await withTenantContext(
        userIdFromSession,
        membership.organizationId,
        (tx) => tx.project.findFirst({
          where: { id: projectId, organizationId: membership.organizationId },
          select: { id: true },
        }),
      );
      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 },
        );
      }
    }

    const encoder = new TextEncoder();
    const safeTenantId = membership.organizationId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeDate = new Date().toISOString().slice(0, 10);
    const filename = `atlas-events-${safeTenantId}-${safeDate}.csv`;

    const CHUNK_SIZE = 1000;
    const MAX_EXPORT_RECORDS = 50000;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Send UTF-8 BOM and CSV header row first
          controller.enqueue(
            encoder.encode(
              "\uFEFF" + csvHeaders.map(escapeCsv).join(",") + "\r\n"
            )
          );

          await withTenantContext(
            userIdFromSession,
            membership.organizationId,
            async (tx) => {
              const where = {
                project: {
                  organizationId: membership.organizationId,
                },
                createdAt: {
                  gte: parsedStartDate,
                  lt: parsedEndDateExclusive,
                },
                ...(projectId && projectId !== "All" ? { projectId } : {}),
                ...(eventName
                  ? { eventName: { equals: eventName, mode: "insensitive" as const } }
                  : {}),
                ...(filterUserId
                  ? { userId: { contains: filterUserId, mode: "insensitive" as const } }
                  : {}),
                ...(search
                  ? {
                      OR: [
                        { eventName: { contains: search, mode: "insensitive" as const } },
                        { userId: { contains: search, mode: "insensitive" as const } },
                        { id: { equals: search } },
                      ],
                    }
                  : {}),
              };

              let exportedCount = 0;
              let lastCursorId: string | null = null;
              let hasMore = true;

              while (hasMore && exportedCount < MAX_EXPORT_RECORDS) {
                if (request.signal.aborted) return;
                const take = Math.min(CHUNK_SIZE, MAX_EXPORT_RECORDS - exportedCount);

                const events: ExportEventRecord[] = await tx.analyticsEvent.findMany({
                  where,
                  orderBy: [
                    { createdAt: "desc" },
                    { id: "desc" },
                  ],
                  take,
                  ...(lastCursorId
                    ? {
                        cursor: { id: lastCursorId },
                        skip: 1,
                      }
                    : {}),
                  select: {
                    id: true,
                    eventName: true,
                    userId: true,
                    sessionId: true,
                    properties: true,
                    pageUrl: true,
                    country: true,
                    device: true,
                    browser: true,
                    createdAt: true,
                    projectId: true,
                  },
                });

                if (events.length === 0) {
                  hasMore = false;
                  break;
                }

                lastCursorId = events[events.length - 1]?.id ?? null;
                exportedCount += events.length;

                const chunkLines = events
                  .map((event) =>
                    [
                      event.id,
                      event.eventName,
                      event.userId,
                      event.sessionId,
                      event.properties,
                      event.pageUrl,
                      event.country,
                      event.device,
                      event.browser,
                      event.createdAt,
                      event.projectId,
                    ]
                      .map(escapeCsv)
                      .join(",")
                  )
                  .join("\r\n") + "\r\n";

                controller.enqueue(encoder.encode(chunkLines));

                if (events.length < take) {
                  hasMore = false;
                }
              }

              controller.close();
            }
          );
        } catch (streamError) {
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-transform",
        "X-Export-Row-Limit": String(MAX_EXPORT_RECORDS),
        "X-Export-May-Be-Truncated": "true",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("CSV Export API Error:", error);

    return NextResponse.json(
      { error: "Failed to export analytics events" },
      { status: 500 },
    );
  }
});
