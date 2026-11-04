
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { Prisma } from "@/lib/generated/prisma/client";

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;

    // Protect platform-wide monitoring data.
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const now = new Date();

    const fiveMinutesAgo = new Date(
      now.getTime() - 5 * 60 * 1000
    );

    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    );

    const [
      eventsLast5Minutes,
      eventsLast24Hours,
      latestEvent,
      projectEventGroups,
      hourlyTrend,
    ] = await Promise.all([
      // Events ingested in the last 5 minutes.
      prismaOps.analyticsEvent.count({
        where: {
          createdAt: {
            gte: fiveMinutesAgo,
          },
        },
      }),

      // Events ingested in the last 24 hours.
      prismaOps.analyticsEvent.count({
        where: {
          createdAt: {
            gte: twentyFourHoursAgo,
          },
        },
      }),

      // Latest event recorded in the database.
      prismaOps.analyticsEvent.findFirst({
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          eventName: true,
          createdAt: true,
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),

      // Top projects by event volume in the last 24 hours.
      prismaOps.analyticsEvent.groupBy({
        by: ["projectId"],
        where: {
          createdAt: {
            gte: twentyFourHoursAgo,
          },
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            projectId: "desc",
          },
        },
        take: 10,
      }),

      // Events per hour over the last 24 hours.
      prismaOps.$queryRaw<
        { hour: Date; count: bigint }[]
      >(Prisma.sql`
        SELECT
          date_trunc('hour', "createdAt") AS hour,
          COUNT(*)::bigint AS count
        FROM "AnalyticsEvent"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
        GROUP BY date_trunc('hour', "createdAt")
        ORDER BY hour ASC
      `),
    ]);

    // Resolve project names for the project volume chart.
    const projectIds = projectEventGroups.map(
      (item) => item.projectId
    );

    const projects = projectIds.length
      ? await prismaOps.project.findMany({
          where: {
            id: {
              in: projectIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const projectNameMap = new Map(
      projects.map((project) => [
        project.id,
        project.name,
      ])
    );

    const projectVolumes = projectEventGroups.map((item) => ({
      projectId: item.projectId,
      projectName:
        projectNameMap.get(item.projectId) ?? "Unknown project",
      eventCount: item._count._all,
    }));

    return NextResponse.json({
      status: "success",
      generatedAt: now.toISOString(),

      metrics: {
        eventsLast5Minutes,
        eventsLast24Hours,
        latestEventAt:
          latestEvent?.createdAt.toISOString() ?? null,
      },

      latestEvent: latestEvent
        ? {
            id: latestEvent.id,
            eventName: latestEvent.eventName,
            createdAt: latestEvent.createdAt.toISOString(),
            project: latestEvent.project,
          }
        : null,

      hourlyTrend: hourlyTrend.map((item) => ({
        hour: item.hour.toISOString(),
        count: Number(item.count),
      })),

      projectVolumes,
    });
  } catch (error) {
    console.error("Ingestion monitoring API error:", error);

    return NextResponse.json(
      { error: "Failed to load ingestion monitoring data" },
      { status: 500 }
    );
  }
});
