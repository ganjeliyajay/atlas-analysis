
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

type Range = "today" | "7d" | "30d" | "90d";
type ExportFormat = "csv" | "json";

function getRangeStart(range: Range): Date {
  const start = new Date();

  switch (range) {
    case "today":
      start.setHours(start.getHours() - 24);
      break;

    case "7d":
      start.setDate(start.getDate() - 7);
      break;

    case "30d":
      start.setDate(start.getDate() - 30);
      break;

    case "90d":
      start.setDate(start.getDate() - 90);
      break;
  }

  return start;
}

function escapeCsv(value: unknown): string {
  let text = "";

  if (value === null || value === undefined) {
    text = "";
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "object") {
    text = JSON.stringify(value) ?? "";
  } else {
    text = String(value);
  }

  // Prevent spreadsheet formula injection.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export const GET = auth(async function GET(request, context) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { projectId } = await context.params;
    const searchParams = new URL(request.url).searchParams;

    const rangeParam = searchParams.get("range");

    const allowedRanges: Range[] = [
      "today",
      "7d",
      "30d",
      "90d",
    ];

    const range: Range = allowedRanges.includes(
      rangeParam as Range
    )
      ? (rangeParam as Range)
      : "30d";

    const formatParam = searchParams.get("format");

    const format: ExportFormat =
      formatParam === "csv" ? "csv" : "json";

    const eventNameFilter =
      searchParams.get("eventName")?.trim().slice(0, 200) || null;

    const userIdFilter =
      searchParams.get("userId")?.trim().slice(0, 200) || null;

    // Find user's organization.
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        organizationId: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Verify project ownership.
    const project = await prisma.project.findFirst({
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
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    const startDate = getRangeStart(range);

    const where: Prisma.AnalyticsEventWhereInput = {
      projectId: project.id,
      createdAt: {
        gte: startDate,
      },
      ...(eventNameFilter
        ? { eventName: eventNameFilter }
        : {}),
      ...(userIdFilter
        ? { userId: userIdFilter }
        : {}),
    };

    const [
      totalEvents,
      activeUsers,
      groupedEvents,
      dailyEventCounts,
      recentEvents,
    ] = await Promise.all([
      prisma.analyticsEvent.count({ where }),

      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: {
          ...where,
          userId: {
            not: null,
          },
        },
      }),

      prisma.analyticsEvent.groupBy({
        by: ["eventName"],
        where,
        _count: {
          _all: true,
        },
      }),

      prisma.$queryRaw<
        Array<{
          day: Date;
          count: bigint;
        }>
      >(Prisma.sql`
        SELECT
          DATE_TRUNC('day', "createdAt") AS day,
          COUNT(*)::bigint AS count
        FROM "AnalyticsEvent"
        WHERE "projectId" = ${project.id}
          AND "createdAt" >= ${startDate}
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

      prisma.analyticsEvent.findMany({
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

    const eventsOverTime = dailyEventCounts.map((item) => ({
      date: item.day.toISOString().slice(0, 10),
      eventVolume: Number(item.count),
    }));

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
                (totalEvents / activeUsers.length).toFixed(2)
              )
            : 0,
      },
      eventsOverTime,
      topEvents,
      recentEvents: recentEvents.map((event) => ({
        id: event.id,
        eventName: event.eventName,
        userId: event.userId,
        createdAt: event.createdAt.toISOString(),
      })),
      exportLimits: {
        recentEventsLimit: 1000,
        note: "Recent events are limited to the latest 1000 records.",
      },
    };

    if (format === "csv") {
      const rows: unknown[][] = [
        [
          "Section",
          "Name",
          "Count",
          "Percentage",
          "Date",
          "User ID",
          "Event ID",
        ],
      ];

      rows.push([
        "Project",
        project.name,
        "",
        "",
        "",
        "",
        "",
      ]);

      rows.push([
        "KPI",
        "Total Events",
        totalEvents,
        "",
        "",
        "",
        "",
      ]);

      rows.push([
        "KPI",
        "Active Users",
        activeUsers.length,
        "",
        "",
        "",
        "",
      ]);

      for (const event of eventsOverTime) {
        rows.push([
          "Events Over Time",
          "",
          event.eventVolume,
          "",
          event.date,
          "",
          "",
        ]);
      }

      for (const event of topEvents) {
        rows.push([
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
        rows.push([
          "Recent Event",
          event.eventName,
          "",
          "",
          event.createdAt,
          event.userId ?? "",
          event.id,
        ]);
      }

      const csv = rows
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");

      return new Response(`\uFEFF${csv}`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${project.slug}-analytics-${range}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

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
