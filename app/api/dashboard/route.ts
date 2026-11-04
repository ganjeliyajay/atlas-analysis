import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

type Range = "today" | "7d" | "30d" | "90d" | "custom";

function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}


function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}


function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getRangeStart(range: Range) {
  const now = new Date();
  const start = new Date(now);

  switch (range) {
    case "today":
      start.setHours(0, 0, 0, 0);
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

    case "custom":
      start.setDate(start.getDate() - 30);
      break;
  }

  return start;
}

function getPreviousRangeStart(startDate: Date, range: Range) {
  const previousStart = new Date(startDate);

  switch (range) {
    case "today":
      previousStart.setHours(previousStart.getHours() - 24);
      break;
    case "7d":
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    case "30d":
      previousStart.setDate(previousStart.getDate() - 30);
      break;
    case "90d":
      previousStart.setDate(previousStart.getDate() - 90);
      break;
    case "custom":
      previousStart.setDate(previousStart.getDate() - 30);
      break;
  }

  return previousStart;
}

function getPercentageChange(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function getRelativeTime(date: Date) {
  
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d ago`;
}

function emptyAnalytics(
  range: Range,
  projectId: string,
  eventName: string,
  userId: string,
) {
  return {
    range,
    filters: {
      projectId,
      eventName,
      userId,
    },
    kpis: {
      totalEvents: 0,
      activeUsers: 0,
    },
    changes: {
      totalEvents: 0,
      activeUsers: 0,
    },
    topEvents: [],
    eventsOverTime: [],
    activeUsersOverTime: [],
    recentEvents: [],
  };
}

export const GET = auth(async function GET(request) {
  try {
    // Authenticate user
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);

    // Validate date range
    const rangeParam = searchParams.get("range");

    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");

    const hasAnyCustomDate = Boolean(customStartDate || customEndDate);
    const hasCustomDateRange =
      isValidDate(customStartDate) &&
      isValidDate(customEndDate);

    if (hasAnyCustomDate && !hasCustomDateRange) {
      return NextResponse.json(
        { error: "Both startDate and endDate must be valid dates in YYYY-MM-DD format" },
        { status: 400 },
      );
    }

    const allowedRanges: Range[] = [
      "today",
      "7d",
      "30d",
      "90d",
      "custom",
    ];

    const requestedRange = allowedRanges.includes(rangeParam as Range)
      ? (rangeParam as Range)
      : "30d";

    if (requestedRange === "custom" && !hasCustomDateRange) {
      return NextResponse.json(
        { error: "Custom range requires startDate and endDate" },
        { status: 400 },
      );
    }

    const range: Range = hasCustomDateRange ? "custom" : requestedRange;

    const customStart = hasCustomDateRange
      ? parseDateOnly(customStartDate)
      : null;
    const customEndExclusive = hasCustomDateRange
      ? addDays(parseDateOnly(customEndDate), 1)
      : null;

    if (
      customStart &&
      customEndExclusive &&
      customStart.getTime() >= customEndExclusive.getTime()
    ) {
      return NextResponse.json(
        { error: "startDate must be on or before endDate" },
        { status: 400 },
      );
    }

    // Optional project filter
    const requestedProjectId = searchParams.get("projectId") || "All";

    // Optional event name filter
    const eventName = (searchParams.get("eventName") || "").trim().slice(0, 200);

    // Optional user ID filter
    const userId = (searchParams.get("userId") || "").trim().slice(0, 200);

    // Find user's organization membership
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id, },
      orderBy: { createdAt: "asc", },
      select: { organizationId: true, },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Get projects belonging to this organization
    const organizationProjects = await prisma.project.findMany({
      where: {
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    // No projects in organization
    if (organizationProjects.length === 0) {
      return NextResponse.json(
        emptyAnalytics(
          range,
          requestedProjectId,
          eventName,
          userId,
        ),
      );
    }

    let projectIds = organizationProjects.map(
      (project) => project.id,
    );

    // Validate requested project belongs to organization
    if (
      requestedProjectId &&
      requestedProjectId !== "All"
    ) {
      const selectedProject = organizationProjects.find(
        (project) => project.id === requestedProjectId,
      );

      if (!selectedProject) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }

      projectIds = [selectedProject.id];
    }

    const now = new Date();
    const startDate = customStart ?? getRangeStart(range);
    const endDateExclusive = customEndExclusive ?? now;

    const currentDuration =
      endDateExclusive.getTime() - startDate.getTime();

    const previousStartDate = hasCustomDateRange
      ? new Date(startDate.getTime() - currentDuration)
      : range === "today"
        ? new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
        : getPreviousRangeStart(startDate, range);

    const previousEndDateExclusive =
      range === "today" && !hasCustomDateRange
        ? new Date(previousStartDate.getTime() + currentDuration)
        : startDate;

    // Current period filter
    const currentWhere: Prisma.AnalyticsEventWhereInput = {
      projectId: {
        in: projectIds,
      },
      createdAt: {
        gte: startDate,
        lt: endDateExclusive,
      },
      ...(eventName
        ? {
          eventName: {
            contains: eventName,
            mode: "insensitive",
          },
        }
        : {}),
      ...(userId
        ? {
          userId: {
            contains: userId,
            mode: "insensitive",
          },
        }
        : {}),
    };

    // Previous period filter
    const previousWhere: Prisma.AnalyticsEventWhereInput = {
      projectId: {
        in: projectIds,
      },
      createdAt: {
        gte: previousStartDate,
        lt: previousEndDateExclusive,
      },
      ...(eventName
        ? {
          eventName: {
            contains: eventName,
            mode: "insensitive",
          },
        }
        : {}),
      ...(userId
        ? {
          userId: {
            contains: userId,
            mode: "insensitive",
          },
        }
        : {}),
    };

    // Daily chart SQL filters
    const eventNameSql = eventName
      ? Prisma.sql`AND "eventName" ILIKE ${`%${eventName}%`}`
      : Prisma.empty;

    const userIdSql = userId
      ? Prisma.sql`AND "userId" ILIKE ${`%${userId}%`}`
      : Prisma.empty;

    // Fetch analytics metrics
    const [
      totalEvents,
      previousTotalEvents,
      activeUsers,
      previousActiveUsers,
      groupedEvents,
      recentEvents,
      dailyEventCounts,
      dailyActiveUserCounts,
    ] = await Promise.all([
      // Total events in selected period
      prisma.analyticsEvent.count({
        where: currentWhere,
      }),

      // Total events in previous period
      prisma.analyticsEvent.count({
        where: previousWhere,
      }),

      // Distinct identified users in current period
      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: {
          ...currentWhere,
          userId: {
            not: null,
          },
        },
      }),

      // Distinct identified users in previous period
      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: {
          ...previousWhere,
          userId: {
            not: null,
          },
        },
      }),

      // Top events in selected project(s)
      prisma.analyticsEvent.groupBy({
        by: ["eventName"],
        where: currentWhere,
        _count: {
          _all: true,
        },
      }),

      // Latest events in selected project(s)
      prisma.analyticsEvent.findMany({
        where: currentWhere,
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        select: {
          id: true,
          eventName: true,
          userId: true,
          createdAt: true,
          project: {
            select: {
              name: true,
            },
          },
        },
      }),

      // Daily event volume using PostgreSQL aggregation
      prisma.$queryRaw<
        Array<{
          day: Date;
          count: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', "createdAt") AS day,
          COUNT(*)::bigint AS count
        FROM "AnalyticsEvent"
        WHERE "projectId" IN (${Prisma.join(projectIds)})
          AND "createdAt" >= ${startDate}
          AND "createdAt" < ${endDateExclusive}
          ${eventNameSql}
          ${userIdSql}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY day ASC
      `,

      // Daily distinct identified users using PostgreSQL aggregation
      prisma.$queryRaw<
        Array<{
          day: Date;
          count: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', "createdAt") AS day,
          COUNT(DISTINCT "userId")::bigint AS count
        FROM "AnalyticsEvent"
        WHERE "projectId" IN (${Prisma.join(projectIds)})
          AND "createdAt" >= ${startDate}
          AND "createdAt" < ${endDateExclusive}
          AND "userId" IS NOT NULL
          ${eventNameSql}
          ${userIdSql}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY day ASC
      `,
    ]);

    const activeUsersCount = activeUsers.length;
    const previousActiveUsersCount =
      previousActiveUsers.length;

    // Format top events
    const topEvents = groupedEvents
      .map((event) => ({
        name: event.eventName,
        count: event._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((event) => ({
        ...event,
        percentage:
          totalEvents > 0
            ? Math.round(
              (event.count / totalEvents) * 100,
            )
            : 0,
      }));

    // Format events over time
    const eventsOverTime = dailyEventCounts.map((item) => ({
      date: item.day.toISOString().slice(0, 10),
      eventVolume: Number(item.count),
    }));

    // Format daily active users
    const activeUsersOverTime = dailyActiveUserCounts.map((item) => ({
      date: item.day.toISOString().slice(0, 10),
      activeUsers: Number(item.count),
    }));

    // Format recent events
    const formattedRecentEvents = recentEvents.map(
      (event) => ({
        id: event.id,
        name: event.eventName,
        userId: event.userId,
        projectName: event.project.name,
        timestamp: event.createdAt.toISOString(),
        relativeTime: getRelativeTime(event.createdAt),
      }),
    );

    return NextResponse.json({
      range,

      // Active filters
      filters: {
        projectId: requestedProjectId,
        eventName,
        userId,
        startDate: startDate.toISOString(),
        endDate: new Date(endDateExclusive.getTime() - 1).toISOString(),
      },

      kpis: {
        totalEvents,
        activeUsers: activeUsersCount,
      },

      changes: {
        totalEvents: getPercentageChange(
          totalEvents,
          previousTotalEvents,
        ),
        activeUsers: getPercentageChange(
          activeUsersCount,
          previousActiveUsersCount,
        ),
      },

      topEvents,
      eventsOverTime,
      activeUsersOverTime,
      recentEvents: formattedRecentEvents,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);

    return NextResponse.json(
      { error: "Failed to fetch dashboard analytics" },
      { status: 500 },
    );
  }
});