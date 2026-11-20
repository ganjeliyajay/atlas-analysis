
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { formatUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { withTenantContext } from "@/lib/db-context";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

type Range = "today" | "7d" | "30d" | "90d";
type ExportFormat = "csv" | "json";

function getRangeStart(range: Range, now: Date): Date {
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  switch (range) {
    case "today":
      break;
    case "7d":
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case "30d":
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    case "90d":
      start.setUTCDate(start.getUTCDate() - 89);
      break;
  }
  return start;
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

  // Prevent spreadsheet formula injection.
  if (/^[\s\t\r]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export const GET = auth(async function GET(request, context) {
  try {
    // 1. Authentication
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const authUserId = session.user.id;

    // 2. Route parameters
    const { projectId } = await context.params;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // 3. Query parameters
    const searchParams = new URL(request.url).searchParams;

    const rangeParam = searchParams.get("range") ?? "30d";
    const rangeResult = z.enum(["today", "7d", "30d", "90d"]).safeParse(rangeParam);
    if (!rangeResult.success) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }
    const range: Range = rangeResult.data;

    const formatParam = searchParams.get("format") ?? "json";
    const formatResult = z.enum(["csv", "json"]).safeParse(formatParam);
    if (!formatResult.success) {
      return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
    }
    const format: ExportFormat = formatResult.data;

    const eventNameFilter =
      searchParams.get("eventName")?.trim().slice(0, 200) ||
      null;

    const userIdFilter =
      searchParams.get("userId")?.trim().slice(0, 200) ||
      null;

    // 4. Find user's organization
    const membership = await getActiveOrganizationForUser(authUserId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 5. Project validation and export queries
    const result = await withTenantContext(
      authUserId,
      membership.organizationId,
      async (tx) => {
        // Verify project ownership
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            organizationId: membership.organizationId,
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

        if (!project) {
          return {
            projectNotFound: true as const,
          };
        }

        const now = new Date();
        const startDate = getRangeStart(range, now);

        const where: Prisma.AnalyticsEventWhereInput = {
          projectId: project.id,
          createdAt: {
            gte: startDate,
            lt: now,
          },
          ...(eventNameFilter
            ? { eventName: eventNameFilter }
            : {}),
          ...(userIdFilter
            ? { userId: userIdFilter }
            : {}),
        };

        // Fetch analytics
        const [
          totalEvents,
          identifiedEvents,
          activeUsers,
          groupedEvents,
          dailyEventCounts,
          recentEvents,
        ] = await Promise.all([
          tx.analyticsEvent.count({ where }),

          tx.analyticsEvent.count({
            where: { ...where, userId: { not: null } },
          }),

          tx.analyticsEvent.groupBy({
            by: ["userId"],
            where: {
              ...where,
              userId: {
                not: null,
              },
            },
          }),

          tx.analyticsEvent.groupBy({
            by: ["eventName"],
            where,
            _count: {
              _all: true,
            },
          }),

          // Daily event volume
          tx.$queryRaw<
            Array<{
              day: string;
              count: bigint;
            }>
          >(Prisma.sql`
            SELECT
              TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
              COUNT(*)::bigint AS count
            FROM "AnalyticsEvent"
            WHERE "projectId" = ${project.id}
              AND "createdAt" >= ${startDate}
              AND "createdAt" < ${now}
              ${
                eventNameFilter
                  ? Prisma.sql`AND "eventName" = ${eventNameFilter}`
                  : Prisma.empty
              }
              ${
                userIdFilter
                  ? Prisma.sql`AND "userId" = ${userIdFilter}`
                  : Prisma.empty
              }
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY day ASC
          `),

          tx.analyticsEvent.findMany({
            where,
            orderBy: {
              createdAt: "desc",
            },
            take: 1000,
            select: {
              id: true,
              eventName: true,
              userId: true,
              createdAt: true,
            },
          }),
        ]);

        const eventsOverTime = dailyEventCounts.map(
          (item) => ({
            date: item.day,
            eventVolume: Number(item.count),
          })
        );

        const topEvents = groupedEvents
          .map((event) => ({
            name: event.eventName,
            count: event._count._all,
            percentage:
              totalEvents > 0
                ? Math.round(
                    (event._count._all / totalEvents) * 100
                  )
                : 0,
          }))
          .sort((a, b) => b.count - a.count);

        const exportData = {
          project,
          exportedAt: new Date().toISOString(),
          range,
          filters: {
            eventName: eventNameFilter,
            userId: userIdFilter,
          },
          kpis: {
            totalEvents,
            activeUsers: activeUsers.length,
            eventsPerUser:
              activeUsers.length > 0
                ? Number(
                    (identifiedEvents / activeUsers.length).toFixed(2)
                  )
                : 0,
          },
          eventsOverTime,
          topEvents,
          recentEvents: recentEvents.map((event) => ({
            id: event.id,
            eventName: event.eventName,
            userId: event.userId,
            createdAt: formatUtcNaiveTimestamp(event.createdAt),
          })),
          exportLimits: {
            recentEventsLimit: 1000,
            note: "Recent events are limited to the latest 1000 records.",
          },
        };

        return {
          projectNotFound: false as const,
          project,
          totalEvents,
          activeUsersCount: activeUsers.length,
          exportData,
        };
      }
    );

    if (result.projectNotFound) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    const {
      project,
      totalEvents,
      activeUsersCount,
      exportData,
    } = result;

    // 6. Streaming CSV export
    if (format === "csv") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("\uFEFF"));
          const pushRow = (row: unknown[]) => {
            controller.enqueue(encoder.encode(row.map(escapeCsv).join(",") + "\r\n"));
          };

          pushRow([
            "Section",
            "Name",
            "Count",
            "Percentage",
            "Date",
            "User ID",
            "Event ID",
          ]);

          pushRow([
            "Project",
            project.name,
            "",
            "",
            "",
            "",
            "",
          ]);

          pushRow([
            "KPI",
            "Total Events",
            totalEvents,
            "",
            "",
            "",
            "",
          ]);

          pushRow([
            "KPI",
            "Active Users",
            activeUsersCount,
            "",
            "",
            "",
            "",
          ]);

          for (const event of exportData.eventsOverTime) {
            pushRow([
              "Events Over Time",
              "",
              event.eventVolume,
              "",
              event.date,
              "",
              "",
            ]);
          }

          for (const event of exportData.topEvents) {
            pushRow([
              "Top Event",
              event.name,
              event.count,
              `${event.percentage}%`,
              "",
              "",
              "",
            ]);
          }

          for (const event of exportData.recentEvents) {
            pushRow([
              "Recent Event",
              event.eventName,
              "",
              "",
              event.createdAt,
              event.userId ?? "",
              event.id,
            ]);
          }

          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${project.slug}-analytics-${range}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // 7. JSON export
    return new Response(
      JSON.stringify(exportData, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${project.slug}-analytics-${range}.json"`,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Project analytics export error:", error);

    return NextResponse.json(
      { error: "Failed to export project analytics" },
      { status: 500 }
    );
  }
});
