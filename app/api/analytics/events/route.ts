
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user873+
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Get user's organization
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

    // 3. Read limit query parameter
    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(searchParams.get("limit") || "40", 10) || 40
      )
    );

    // 4. Fetch latest events for this organization only
    const events = await prisma.analyticsEvent.findMany({
      where: {
        project: {
          organizationId: membership.organizationId,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
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

    // 5. Return events in the shape expected by the Live page
    return NextResponse.json({
      success: true,
      data: {
        events: events.map((event) => ({
          id: String(event.id),
          eventName: event.eventName,
          externalUserId: event.userId,
          occurredAt: event.createdAt.toISOString(),
          properties: event.properties,
          sessionId: event.sessionId,
          pageUrl: event.pageUrl,
          country: event.country,
          device: event.device,
          browser: event.browser,
          projectId: event.projectId,
        })),
      },
    });
  } catch (error) {
    console.error("Live Analytics API Error:", error);

    return NextResponse.json(
      { error: "Failed to fetch live analytics events" },
      { status: 500 }
    );
  }
}
