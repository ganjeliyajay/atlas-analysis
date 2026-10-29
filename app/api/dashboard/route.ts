
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

type Range = "today" | "7d" | "30d" | "90d";

function getRangeStart(range: Range) {
  const now = new Date();
  const start = new Date(now);

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
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function emptyAnalytics(range: Range) {
  return {
    range,
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
    recentEvents: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Validate date range
    const rangeParam = request.nextUrl.searchParams.get("range");

    const allowedRanges: Range[] = [
      "today",
      "7d",
      "30d",
      "90d",
    ];

    const range: Range = allowedRanges.includes(
      rangeParam as Range,
    )
      ? (rangeParam as Range)
      : "30d";

    // Optional project filter
    const requestedProjectId =
      request.nextUrl.searchParams.get("projectId");

    // Find user's organization membership
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
      return NextResponse.json(emptyAnalytics(range));
    }

    let projectIds = organizationProjects.map(
      (project) => project.id,
    );

    // If a projectId is provided, ensure it belongs to
    // the user's organization before filtering analytics.
    if (requestedProjectId) {
      const selectedProject = organizationProjects.find(
        (project) => project.id === requestedProjectId,
      );

      if (!selectedProject) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 },
        );
      }

      // Selected project only
      projectIds = [selectedProject.id];
    }

    const startDate = getRangeStart(range);

    const previousStartDate = getPreviousRangeStart(
      startDate,
      range,
    );

    // Current period filter
    const currentWhere: Prisma.AnalyticsEventWhereInput = {
      projectId: {
        in: projectIds,
      },
      createdAt: {
        gte: startDate,
      },
    };

    // Previous period filter
    const previousWhere: Prisma.AnalyticsEventWhereInput = {
      projectId: {
        in: projectIds,
      },
      createdAt: {
        gte: previousStartDate,
        lt: startDate,
      },
    };

    // Fetch analytics metrics
    const [
      totalEvents,
      previousTotalEvents,
      activeUsers,
      previousActiveUsers,
      groupedEvents,
      recentEvents,
      dailyEventCounts,
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
        where: {
          projectId: {
            in: projectIds,
          },
        },
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
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY day ASC
      `,
    ]);

    const activeUsersCount = activeUsers.length;
    const previousActiveUsersCount = previousActiveUsers.length;

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
            ? Math.round((event.count / totalEvents) * 100)
            : 0,
      }));

    // Format events over time
    const eventsOverTime = dailyEventCounts.map((item) => ({
      date: item.day.toISOString().slice(0, 10),
      eventVolume: Number(item.count),
    }));

    const formattedRecentEvents = recentEvents.map((event) => ({
      id: event.id,
      name: event.eventName,
      userId: event.userId,
      projectName: event.project.name,
      timestamp: event.createdAt.toISOString(),
      relativeTime: getRelativeTime(event.createdAt),
    }));

    return NextResponse.json({
      range,
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
      recentEvents: formattedRecentEvents,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);

    return NextResponse.json(
      { error: "Failed to fetch dashboard analytics" },
      { status: 500 },
    );
  }
}
