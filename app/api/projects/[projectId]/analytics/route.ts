
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { formatUtcNaiveTimestamp, normalizeUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { withTenantContext } from "@/lib/db-context";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const projectAnalyticsQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
  eventName: z.string().max(200).optional().nullable(),
  userId: z.string().max(255).optional().nullable(),
});

type Range = "today" | "7d" | "30d" | "90d";

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
    const { projectId: rawProjectId } = await context.params;
    const projectIdResult = z.string().trim().min(1, "Project ID is required").max(100).safeParse(rawProjectId);
    if (!projectIdResult.success) {
      return NextResponse.json(
        { error: projectIdResult.error.issues[0]?.message || "Invalid Project ID" },
        { status: 400 }
      );
    }
    const projectId = projectIdResult.data;

    // 3. Read query parameters
    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsedQuery = projectAnalyticsQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: parsedQuery.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { range, eventName: eventNameFilter, userId: userIdFilter } = parsedQuery.data;

    // 4. Find user's organization membership
    const membership = await getActiveOrganizationForUser(authUserId);

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

        const now = new Date();
        const startDate = getRangeStart(range, now);
        const currentDuration = now.getTime() - startDate.getTime();
        const previousStartDate = new Date(startDate.getTime() - currentDuration);

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
            lt: now,
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
          identifiedEvents,
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

          tx.analyticsEvent.count({
            where: { ...currentWhere, userId: { not: null } },
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
                (identifiedEvents / activeUsersCount).toFixed(2)
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
            date: item.day,
            eventVolume: Number(item.count),
          })
        );

        // Format recent events
        const formattedRecentEvents = recentEvents.map(
          (event) => ({
            id: event.id,
            name: event.eventName,
            userId: event.userId,
            timestamp: formatUtcNaiveTimestamp(event.createdAt),
            relativeTime: getRelativeTime(normalizeUtcNaiveTimestamp(event.createdAt)),
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
