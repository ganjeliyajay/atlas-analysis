
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ACTIVE_WINDOW_MINUTES = 5;
const RECENT_ACTIVITY_LIMIT = 50;

export const GET = auth(async function GET(request) {
  try {
    // 1. Authentication
    const authUserId = request.auth?.user?.id;

    if (!authUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Organization access
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: authUserId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // 3. Project filter
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (projectId && projectId !== "All") {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
        select: { id: true },
      });

      if (!project) {
        return NextResponse.json(
          {
            success: false,
            error: "Project not found or access denied",
          },
          { status: 404 }
        );
      }
    }

    // 4. Five-minute activity window
    const now = new Date();

    const activeThreshold = new Date(
      now.getTime() - ACTIVE_WINDOW_MINUTES * 60 * 1000
    );

    const projectFilter = {
      project: {
        organizationId: membership.organizationId,
      },
      ...(projectId && projectId !== "All"
        ? { projectId }
        : {}),
    };

    const activeEventFilter = {
      ...projectFilter,
      createdAt: {
        gte: activeThreshold,
        lte: now,
      },
    };

    // 5. Database-level aggregation + recent activity feed
    const [
      activeUsers,
      activeSessions,
      countryGroups,
      totalActivities,
      events,
    ] = await Promise.all([
      // All unique identified users in the window
      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: {
          ...activeEventFilter,
          userId: { not: null },
        },
      }),

      // All unique sessions in the window
      prisma.analyticsEvent.groupBy({
        by: ["sessionId"],
        where: {
          ...activeEventFilter,
          sessionId: { not: null },
        },
      }),

      // All unique countries in the window
      prisma.analyticsEvent.groupBy({
        by: ["country"],
        where: {
          ...activeEventFilter,
          country: { not: null },
        },
      }),

      // Count every matching event, not just the latest 50
      prisma.analyticsEvent.count({
        where: activeEventFilter,
      }),

      // Latest 50 events for the activity feed
      prisma.analyticsEvent.findMany({
        where: activeEventFilter,
        select: {
          id: true,
          userId: true,
          sessionId: true,
          eventName: true,
          pageUrl: true,
          country: true,
          device: true,
          browser: true,
          createdAt: true,
          projectId: true,
          project: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: RECENT_ACTIVITY_LIMIT,
      }),
    ]);

    // 6. Format countries
    const countries = countryGroups
      .map((item) => item.country)
      .filter((country): country is string => Boolean(country))
      .sort();

    // 7. Format recent activity
    const activities = events.map((event) => ({
      id: event.id,
      userId: event.userId || "Anonymous",
      sessionId: event.sessionId,
      eventName: event.eventName,
      pageUrl: event.pageUrl,
      country: event.country || "Unknown",
      device: event.device || "Unknown",
      browser: event.browser || "Unknown",
      projectId: event.projectId,
      projectName: event.project.name,
      timestamp: event.createdAt.toISOString(),
    }));

    // 8. Response
    return NextResponse.json(
      {
        success: true,
        data: {
          activeUsers: activeUsers.length,
          activeSessions: activeSessions.length,
          totalActivities,
          uniqueCountries: countries.length,
          countries,
          activities,
          window: {
            minutes: ACTIVE_WINDOW_MINUTES,
            start: activeThreshold.toISOString(),
            end: now.toISOString(),
          },
          projectId: projectId || "All",
          updatedAt: now.toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Live User Activity API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch live user activity",
      },
      { status: 500 }
    );
  }
});
