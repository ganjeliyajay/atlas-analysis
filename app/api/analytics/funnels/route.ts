
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";

type FunnelConfig = {
  id: string;
  name: string;
  steps: string[];
};

type FunnelEvent = {
  eventName: string;
  createdAt: Date;
};

const RANGE_DAYS: Record<string, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const ALLOWED_WINDOWS = [1, 7, 30] as const;

function calculateFunnel(
  eventsByUser: Map<string, FunnelEvent[]>,
  steps: string[],
  windowDays: number,
) {
  const counts = new Array<number>(steps.length).fill(0);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  for (const events of eventsByUser.values()) {
    let currentStep = 0;
    let firstStepTime: Date | null = null;
    let previousStepTime: Date | null = null;

    for (const event of events) {
      if (currentStep === 0) {
        if (event.eventName !== steps[0]) continue;

        firstStepTime = event.createdAt;
        previousStepTime = event.createdAt;
        currentStep = 1;
        continue;
      }

      if (!firstStepTime || !previousStepTime) break;

      const elapsed =
        event.createdAt.getTime() - firstStepTime.getTime();

      if (elapsed > windowMs) break;

      if (event.createdAt.getTime() < previousStepTime.getTime()) {
        continue;
      }

      if (event.eventName === steps[currentStep]) {
        previousStepTime = event.createdAt;
        currentStep++;

        if (currentStep >= steps.length) break;
      }
    }

    for (let index = 0; index < currentStep; index++) {
      counts[index] = (counts[index] ?? 0) + 1;
    }
  }

  const totalUsers = counts[0] ?? 0;
  const convertedUsers = counts[counts.length - 1] ?? 0;

  const funnelSteps = steps.map((eventName, index) => {
    const users = counts[index] ?? 0;
    const previousUsers =
      index === 0 ? users : counts[index - 1] ?? 0;

    const conversionFromStart =
      totalUsers > 0
        ? Number(((users / totalUsers) * 100).toFixed(2))
        : 0;

    const conversionFromPrevious =
      previousUsers > 0
        ? Number(((users / previousUsers) * 100).toFixed(2))
        : 0;

    const dropOffUsers =
      index === 0 ? 0 : Math.max(previousUsers - users, 0);

    const dropOffRate =
      previousUsers > 0
        ? Number(((dropOffUsers / previousUsers) * 100).toFixed(2))
        : 0;

    return {
      eventName,
      users,
      conversionFromStart,
      conversionFromPrevious,
      dropOffUsers,
      dropOffRate,
    };
  });

  const overallConversionRate =
    totalUsers > 0
      ? Number(((convertedUsers / totalUsers) * 100).toFixed(2))
      : 0;

  return {
    totalUsers,
    convertedUsers,
    overallConversionRate,
    overallDropOffRate: Number(
      (100 - overallConversionRate).toFixed(2),
    ),
    steps: funnelSteps,
  };
}

export const POST = auth(async function POST(request) {
  try {
    const userId = request.auth?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = await request.json();

    const {
      funnels,
      projectId,
      range = "30d",
      conversionWindowDays = 7,
    } = body as {
      funnels?: FunnelConfig[];
      projectId?: string;
      range?: string;
      conversionWindowDays?: number;
    };

    if (!Array.isArray(funnels) || funnels.length < 2 || funnels.length > 4) {
      return NextResponse.json(
        { success: false, error: "Provide between 2 and 4 funnels" },
        { status: 400 },
      );
    }

    if (!(range in RANGE_DAYS)) {
      return NextResponse.json(
        { success: false, error: "Invalid date range" },
        { status: 400 },
      );
    }

    if (
      !ALLOWED_WINDOWS.includes(
        conversionWindowDays as (typeof ALLOWED_WINDOWS)[number],
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Conversion window must be 1, 7, or 30 days",
        },
        { status: 400 },
      );
    }

    const validFunnels = funnels.map((funnel) => ({
      ...funnel,
      id: String(funnel.id || ""),
      name: String(funnel.name || "").trim(),
      steps: Array.isArray(funnel.steps)
        ? funnel.steps.map((step) => String(step).trim()).filter(Boolean)
        : [],
    }));

    for (const funnel of validFunnels) {
      if (!funnel.id || !funnel.name) {
        return NextResponse.json(
          { success: false, error: "Every funnel needs an ID and name" },
          { status: 400 },
        );
      }

      if (funnel.steps.length < 2 || funnel.steps.length > 10) {
        return NextResponse.json(
          {
            success: false,
            error: `Funnel "${funnel.name}" must contain 2 to 10 steps`,
          },
          { status: 400 },
        );
      }

      if (
        funnel.steps.some((step) => step.length > 100) ||
        new Set(funnel.steps).size !== funnel.steps.length
      ) {
        return NextResponse.json(
          {
            success: false,
            error: `Funnel "${funnel.name}" has invalid or duplicate steps`,
          },
          { status: 400 },
        );
      }
    }

    if (
      new Set(validFunnels.map((funnel) => funnel.id)).size !==
      validFunnels.length
    ) {
      return NextResponse.json(
        { success: false, error: "Funnel IDs must be unique" },
        { status: 400 },
      );
    }

    const membership = await withUserContext(userId, async (tx) => {
      return tx.organizationMember.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      });
    });

    if (!membership) {
      return NextResponse.json({
        success: true,
        data: {
          funnels: [],
          bestPerformingFunnel: null,
          range,
          conversionWindowDays,
        },
      });
    }

    return await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        const projects = await tx.project.findMany({
          where: {
            organizationId: membership.organizationId,
            ...(projectId && projectId !== "All" ? { id: projectId } : {}),
          },
          select: {
            id: true,
          },
        });

        const projectIds = projects.map((project) => project.id);

        if (projectId && projectId !== "All" && projectIds.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: "Project not found or access denied",
            },
            { status: 404 },
          );
        }

        if (projectIds.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              funnels: validFunnels.map((funnel) => ({
                id: funnel.id,
                name: funnel.name,
                ...calculateFunnel(
                  new Map<string, FunnelEvent[]>(),
                  funnel.steps,
                  conversionWindowDays,
                ),
              })),
              bestPerformingFunnel: null,
              range,
              conversionWindowDays,
            },
          });
        }

        const now = new Date();
        const startDate = new Date(now);

        if (range === "today") {
          startDate.setHours(0, 0, 0, 0);
        } else {
          startDate.setDate(startDate.getDate() - (RANGE_DAYS[range] ?? 7));
        }

        const allEventNames = Array.from(
          new Set(validFunnels.flatMap((funnel) => funnel.steps)),
        );

        const events = await tx.analyticsEvent.findMany({
          where: {
            projectId: { in: projectIds },
            eventName: { in: allEventNames },
            userId: { not: null },
            createdAt: {
              gte: startDate,
              lte: now,
            },
          },
          select: {
            userId: true,
            eventName: true,
            createdAt: true,
          },
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" },
          ],
        });

        const results = validFunnels.map((funnel) => {
          const funnelEventsByUser = new Map<string, FunnelEvent[]>();
          const allowedSteps = new Set(funnel.steps);

          for (const event of events) {
            if (!event.userId || !allowedSteps.has(event.eventName)) {
              continue;
            }

            const userEvents =
              funnelEventsByUser.get(event.userId) ?? [];

            userEvents.push({
              eventName: event.eventName,
              createdAt: event.createdAt,
            });

            funnelEventsByUser.set(event.userId, userEvents);
          }

          return {
            id: funnel.id,
            name: funnel.name,
            ...calculateFunnel(
              funnelEventsByUser,
              funnel.steps,
              conversionWindowDays,
            ),
          };
        });

        const rankedFunnels = [...results].sort(
          (a, b) =>
            b.overallConversionRate - a.overallConversionRate,
        );

        const topFunnel = rankedFunnels[0];
        const bestPerformingFunnel =
          topFunnel && topFunnel.totalUsers > 0
            ? {
                id: topFunnel.id,
                name: topFunnel.name,
                conversionRate: topFunnel.overallConversionRate,
              }
            : null;

        return NextResponse.json(
          {
            success: true,
            data: {
              funnels: results,
              bestPerformingFunnel,
              range,
              conversionWindowDays,
              projectId: projectId || "All",
              updatedAt: new Date().toISOString(),
            },
          },
          {
            headers: { "Cache-Control": "no-store, max-age=0" },
          },
        );
      },
    );
  } catch (error) {
    console.error("Funnel comparison API error:", error);

    return NextResponse.json(
      { success: false, error: "Failed to compare funnels" },
      { status: 500 },
    );
  }
});
