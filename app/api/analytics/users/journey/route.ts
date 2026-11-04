import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

    // 2. Organization membership
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: authUserId,
      },
      select: {
        organizationId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    // 3. Query parameters
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");
    const projectId = searchParams.get("projectId");
    const sessionId = searchParams.get("sessionId");

    const requestedPage = Number(searchParams.get("page") || 1);
    const requestedLimit = Number(searchParams.get("limit") || 100);

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "User ID is required",
        },
        { status: 400 }
      );
    }

    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 200)
        : 100;

    // 4. Validate project access
    if (projectId && projectId !== "All") {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
        select: {
          id: true,
          name: true,
        },
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

    // 5. Base event filter
    const baseWhere = {
      userId,
      project: {
        organizationId: membership.organizationId,
      },
      ...(projectId && projectId !== "All"
        ? { projectId }
        : {}),
    };

    // 6. Session filter
    const eventWhere = {
      ...baseWhere,
      ...(sessionId ? { sessionId } : {}),
    };

    // 7. Check whether user exists in this organization
    const totalEvents = await prisma.analyticsEvent.count({
      where: baseWhere,
    });

    if (totalEvents === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found or no events available",
        },
        { status: 404 }
      );
    }

    // 8. Total filtered events
    const filteredTotal = sessionId
      ? await prisma.analyticsEvent.count({
          where: eventWhere,
        })
      : totalEvents;

    // 9. Fetch user journey events
    const events = await prisma.analyticsEvent.findMany({
      where: eventWhere,

      select: {
        id: true,
        userId: true,
        sessionId: true,
        eventName: true,
        properties: true,
        pageUrl: true,
        country: true,
        device: true,
        browser: true,
        createdAt: true,

        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },

      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],

      skip: (page - 1) * limit,
      take: limit,
    });

    // 10. Convert events into chronological order
    const chronologicalEvents = [...events].reverse();

    // 11. Format events
    const formattedEvents = chronologicalEvents.map((event) => ({
      id: event.id,
      userId: event.userId,
      sessionId: event.sessionId,

      eventName: event.eventName,
      properties: event.properties,

      pageUrl: event.pageUrl,

      country: event.country || "Unknown",
      device: event.device || "Unknown",
      browser: event.browser || "Unknown",

      projectId: event.project.id,
      projectName: event.project.name,

      timestamp: event.createdAt.toISOString(),
    }));

    // 12. Build session summaries from fetched events
    const sessionMap = new Map<
      string,
      {
        sessionId: string;
        eventCount: number;
        startedAt: string;
        lastActivityAt: string;
        pages: Set<string>;
      }
    >();

    for (const event of formattedEvents) {
      if (!event.sessionId) continue;

      const existing = sessionMap.get(event.sessionId);

      if (!existing) {
        sessionMap.set(event.sessionId, {
          sessionId: event.sessionId,
          eventCount: 1,
          startedAt: event.timestamp,
          lastActivityAt: event.timestamp,
          pages: new Set(
            event.pageUrl ? [event.pageUrl] : []
          ),
        });
      } else {
        existing.eventCount += 1;
        existing.lastActivityAt = event.timestamp;

        if (event.pageUrl) {
          existing.pages.add(event.pageUrl);
        }
      }
    }

    const sessions = Array.from(sessionMap.values()).map(
      (session) => ({
        sessionId: session.sessionId,
        eventCount: session.eventCount,
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        uniquePages: session.pages.size,
        pages: Array.from(session.pages),
      })
    );

    // 13. User summary
    const firstEvent = await prisma.analyticsEvent.findFirst({
      where: baseWhere,
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const lastEvent = await prisma.analyticsEvent.findFirst({
      where: baseWhere,
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const uniqueSessions = new Set(
      formattedEvents
        .map((event) => event.sessionId)
        .filter((id): id is string => Boolean(id))
    );

    const uniquePages = new Set(
      formattedEvents
        .map((event) => event.pageUrl)
        .filter((url): url is string => Boolean(url))
    );

    // 14. Pagination
    const totalPages = Math.ceil(filteredTotal / limit);

    return NextResponse.json(
      {
        success: true,

        data: {
          user: {
            userId,
            firstSeen: firstEvent?.createdAt.toISOString() ?? null,
            lastSeen: lastEvent?.createdAt.toISOString() ?? null,
            totalEvents,
            totalSessions: uniqueSessions.size,
            totalPagesVisited: uniquePages.size,
          },

          sessions,

          events: formattedEvents,

          pagination: {
            page,
            limit,
            totalEvents: filteredTotal,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },

          filters: {
            projectId: projectId || "All",
            sessionId: sessionId || "All",
          },

          updatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("User Journey API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch user journey",
      },
      { status: 500 }
    );
  }
});