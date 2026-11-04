
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";
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
  const seconds = Math.floor(
    (Date.now() - date.getTime()) / 1000
  );

  if (seconds < 60) {
    return "Just now";
  }

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

export const GET = auth(async function GET(
  request,
  context: {
    params: Promise<{ projectId: string }>;
  }
) {
  try {
    // 1. Authenticate user
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const authUserId = session.user.id;

    // 2. Get project ID
    const { projectId } = await context.params;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // 3. Read query parameters
    const { searchParams } = new URL(request.url);

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

    // Analytics filters
    const eventNameFilter =
      searchParams.get("eventName")?.trim().slice(0, 200) ||
      null;

    const userIdFilter =
      searchParams.get("userId")?.trim().slice(0, 200) ||
      null;

    // 4. Find user's organization membership
    const membership = await withUserContext(
      authUserId,
      (tx) =>
        tx.organizationMember.findFirst({
          where: {
            userId: authUserId,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            organizationId: true,
          },
        })
    );

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // 5. Project validation and analytics inside tenant context
    const result = await withTenantContext(
      authUserId,
      membership.organizationId,
      async (tx) => {
        // Verify project belongs to user's organization
        const project = await tx.project.findFirst({
          where: {
            id: projectId,
            organizationId: membership.organizationId,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            platform: true,
            environment: true,
          },
        });

        if (!project) {
          return {
            projectNotFound: true as const,
          };
        }

        const startDate = getRangeStart(range);

        const previousStartDate = getPreviousRangeStart(
          startDate,
          range
        );

        // Build shared filter conditions
        const sharedFilters: Prisma.AnalyticsEventWhereInput = {
          ...(eventNameFilter
            ? { eventName: eventNameFilter }
            : {}),
          ...(userIdFilter
            ? { userId: userIdFilter }
            : {}),
        };

        // Current period filter
        const currentWhere: Prisma.AnalyticsEventWhereInput = {
          projectId: project.id,
          createdAt: {
            gte: startDate,
          },
          ...sharedFilters,
        };

        // Previous period filter
        const previousWhere: Prisma.AnalyticsEventWhereInput = {
          projectId: project.id,
          createdAt: {
            gte: previousStartDate,
            lt: startDate,
          },
          ...sharedFilters,
        };

        // SQL filters for daily chart
        const eventNameCondition = eventNameFilter
          ? Prisma.sql`AND "eventName" = ${eventNameFilter}`
          : Prisma.empty;

        const userIdCondition = userIdFilter
          ? Prisma.sql`AND "userId" = ${userIdFilter}`
          : Prisma.empty;

        // Fetch analytics
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
          tx.analyticsEvent.count({
            where: currentWhere,
          }),

          // Total events in previous period
          tx.analyticsEvent.count({
            where: previousWhere,
          }),

          // Distinct identified users in current period
          tx.analyticsEvent.groupBy({
            by: ["userId"],
            where: {
              ...currentWhere,
              userId: {
                not: null,
              },
            },
          }),

          // Distinct identified users in previous period
          tx.analyticsEvent.groupBy({
            by: ["userId"],
            where: {
              ...previousWhere,
              userId: {
                not: null,
              },
            },
          }),

          // Top events
          tx.analyticsEvent.groupBy({
            by: ["eventName"],
            where: currentWhere,
            _count: {
              _all: true,
            },
          }),

          // Recent events
          tx.analyticsEvent.findMany({
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
            },
          }),

          // Daily event volume
          tx.$queryRaw<
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
              ${eventNameCondition}
              ${userIdCondition}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY day ASC
          `),
        ]);

        const activeUsersCount = activeUsers.length;

        const previousActiveUsersCount =
          previousActiveUsers.length;

        // Events per user
        const eventsPerUser =
          activeUsersCount > 0
            ? Number(
                (totalEvents / activeUsersCount).toFixed(2)
              )
            : 0;

        // Average events per day
        const daysInRange: Record<Range, number> = {
          today: 1,
          "7d": 7,
          "30d": 30,
          "90d": 90,
        };

        const averageEventsPerDay = Number(
          (totalEvents / daysInRange[range]).toFixed(2)
        );

        // Project activity status
        const projectActivityStatus =
          totalEvents === 0
            ? "inactive"
            : totalEvents < 10
              ? "low"
              : "active";

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
                    (event.count / totalEvents) * 100
                  )
                : 0,
          }));

        // Format events over time
        const eventsOverTime = dailyEventCounts.map(
          (item) => ({
            date: item.day.toISOString().slice(0, 10),
            eventVolume: Number(item.count),
          })
        );

        // Format recent events
        const formattedRecentEvents = recentEvents.map(
          (event) => ({
            id: event.id,
            name: event.eventName,
            userId: event.userId,
            timestamp: event.createdAt.toISOString(),
            relativeTime: getRelativeTime(event.createdAt),
          })
        );

        return {
          projectNotFound: false as const,
          data: {
            project,
            range,

            filters: {
              eventName: eventNameFilter,
              userId: userIdFilter,
            },

            kpis: {
              totalEvents,
              activeUsers: activeUsersCount,
              eventsPerUser,
              averageEventsPerDay,
              projectActivityStatus,
            },

            changes: {
              totalEvents: getPercentageChange(
                totalEvents,
                previousTotalEvents
              ),

              activeUsers: getPercentageChange(
                activeUsersCount,
                previousActiveUsersCount
              ),
            },

            topEvents,
            eventsOverTime,
            recentEvents: formattedRecentEvents,
          },
        };
      }
    );

    if (result.projectNotFound) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // 6. Return analytics response
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("Project analytics API error:", error);

    return NextResponse.json(
      { error: "Failed to fetch project analytics" },
      { status: 500 }
    );
  }
});
