import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
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
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const range = searchParams.get("range") || "7d";

    // 4. Calculate date range
    const now = new Date();
    const startDate = new Date(now);

    switch (range) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;

      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;

      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;

      case "7d":
      default:
        startDate.setDate(now.getDate() - 7);
        break;
    }

    // 5. Build database filter
    const where = {
      project: {
        organizationId: membership.organizationId,
      },
      createdAt: {
        gte: startDate,
        lte: now,
      },
      ...(projectId ? { projectId } : {}),
    };

    // 6. Fetch actual analytics events
    const events = await prisma.analyticsEvent.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
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

    // 7. Count total events
    const totalEvents = await prisma.analyticsEvent.count({
      where,
    });

    // 8. Count unique users
    const uniqueUsers = await prisma.analyticsEvent.findMany({
      where: {
        ...where,
        userId: {
          not: null,
        },
      },
      distinct: ["userId"],
      select: {
        userId: true,
      },
    });

    // 9. Count unique event names
    const uniqueEventNames = await prisma.analyticsEvent.findMany({
      where,
      distinct: ["eventName"],
      select: {
        eventName: true,
      },
    });

    // 10. Return actual database data
    return NextResponse.json({
      success: true,
      data: {
        events,
        totalEvents,
        activeUsers: uniqueUsers.length,
        uniqueEventNames: uniqueEventNames.length,
        range,
      },
    });
  } catch (error) {
    console.error("Analytics Events API Error:", error);

    return NextResponse.json(
      { error: "Failed to fetch analytics events" },
      { status: 500 }
    );
  }
}