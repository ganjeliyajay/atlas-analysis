import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import {
  executePostgreSqlFunnel,
  emptyFunnelResult,
} from "@/lib/analytics/funnel-engine";
import { z } from "zod";

const RANGE_DAYS: Record<string, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const ALLOWED_WINDOWS = [1, 7, 30] as const;

const funnelQuerySchema = z.object({
  steps: z
    .string()
    .min(1, "steps parameter is required")
    .max(605)
    .transform((str) => str.split(",").map((step) => step.trim()).filter(Boolean))
    .refine((arr) => arr.length >= 2 && arr.length <= 6, {
      message: "Funnel must contain between 2 and 6 steps.",
    })
    .refine((arr) => arr.every((step) => step.length <= 100), {
      message: "Each funnel event name must be 100 characters or fewer.",
    })
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Funnel steps must be unique.",
    }),
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  conversionWindowDays: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : 7))
    .refine((val) => ALLOWED_WINDOWS.includes(val as (typeof ALLOWED_WINDOWS)[number]), {
      message: "Conversion window must be 1, 7, 14, or 30 days.",
    }),
  projectId: z.string().max(100).default("All"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must use YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must use YYYY-MM-DD").optional(),
});

const postFunnelSchema = z.object({
  funnels: z.array(
    z.object({
      id: z.string().min(1, "Funnel ID is required"),
      name: z.string().trim().min(1, "Funnel name is required").max(100),
      steps: z.array(z.string().trim().min(1).max(100)).min(2).max(6)
        .refine((steps) => new Set(steps).size === steps.length, {
          message: "Funnel steps must be unique.",
        }),
    })
  ).min(1).max(6),
  projectId: z.string().max(100).optional().default("All"),
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).default("30d"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conversionWindowDays: z.number().refine((val) => ALLOWED_WINDOWS.includes(val as (typeof ALLOWED_WINDOWS)[number]), {
    message: "Conversion window must be 1, 7, 14, or 30 days",
  }).default(7),
});

function parseUtcDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Dates must use YYYY-MM-DD format.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date is not a valid calendar date.");
  }
  return date;
}

function getDateBounds(range: string, startParam?: string, endParam?: string) {
  if (Boolean(startParam) !== Boolean(endParam)) {
    throw new Error("Both startDate and endDate are required for a custom range.");
  }

  if (range === "custom" && (!startParam || !endParam)) {
    throw new Error("Custom range requires startDate and endDate.");
  }

  if (startParam && endParam) {
    const start = parseUtcDate(startParam);
    const end = parseUtcDate(endParam);
    if (start > end) throw new Error("startDate must be on or before endDate.");
    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { start, endExclusive };
  }

  const days = RANGE_DAYS[range] || 30;
  const now = new Date();
  const start = range === "today"
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, endExclusive: now };
}

export const GET = auth(async function GET(request) {
  try {
    const userId = request.auth?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsedQuery = funnelQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return NextResponse.json({
        success: false,
        error: parsedQuery.error.issues[0]?.message || "Invalid funnel query parameters.",
      }, { status: 400 });
    }

    const { steps, range, conversionWindowDays, projectId, startDate, endDate } = parsedQuery.data;

    let bounds: ReturnType<typeof getDateBounds>;
    try {
      bounds = getDateBounds(range, startDate, endDate);
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid date range.",
      }, { status: 400 });
    }

    const membership = await getActiveOrganizationForUser(userId);

    if (!membership) {
      const empty = emptyFunnelResult(steps);
      return NextResponse.json({
        success: true,
        funnel: empty.steps,
        totalUsers: 0,
        convertedUsers: 0,
        conversionWindowDays,
        range: { startDate: bounds.start.toISOString(), endDate: bounds.endExclusive.toISOString() },
      });
    }

    return await withTenantContext(userId, membership.organizationId, async (tx) => {
      const projects = await tx.project.findMany({
        where: {
          organizationId: membership.organizationId,
          ...(projectId !== "All" ? { id: projectId } : {}),
        },
        select: { id: true },
      });

      const projectIds = projects.map((project) => project.id);
      if (projectId !== "All" && projectIds.length === 0) {
        return NextResponse.json({ success: false, error: "Project not found or access denied." }, { status: 404 });
      }

      // Execute optimized PostgreSQL Funnel Engine
      const result = await executePostgreSqlFunnel(
        tx,
        projectIds,
        steps,
        bounds.start,
        bounds.endExclusive,
        conversionWindowDays,
      );

      return NextResponse.json({
        success: true,
        funnel: result.steps.map((step) => ({
          eventName: step.eventName,
          users: step.users,
          conversionFromStart: step.conversionFromStart,
          conversionFromPrevious: step.conversionFromPrevious,
          dropOffFromPrevious: step.dropOffUsers,
          dropOffRate: step.dropOffRate,
        })),
        totalUsers: result.totalUsers,
        convertedUsers: result.convertedUsers,
        overallConversionRate: result.overallConversionRate,
        overallDropOffRate: result.overallDropOffRate,
        conversionWindowDays,
        range: {
          startDate: bounds.start.toISOString(),
          endDate: new Date(bounds.endExclusive.getTime() - 1).toISOString(),
        },
      }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    });
  } catch (error) {
    console.error("Funnel analytics API error:", error);
    return NextResponse.json({ success: false, error: "Failed to calculate funnel analytics." }, { status: 500 });
  }
});

export const POST = auth(async function POST(request) {
  try {
    const userId = request.auth?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsedBody = postFunnelSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({
        success: false,
        error: parsedBody.error.issues[0]?.message || "Invalid funnel request body.",
      }, { status: 400 });
    }

    const { funnels, projectId, range, startDate, endDate, conversionWindowDays } = parsedBody.data;

    let dateBounds: ReturnType<typeof getDateBounds>;
    try {
      dateBounds = getDateBounds(range, startDate, endDate);
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : "Invalid date range",
      }, { status: 400 });
    }

    const membership = await getActiveOrganizationForUser(userId);

    if (!membership) {
      return NextResponse.json({
        success: true,
        results: [],
        bestPerformingFunnel: null,
        range,
        conversionWindowDays,
      });
    }

    return await withTenantContext(userId, membership.organizationId, async (tx) => {
      const projects = await tx.project.findMany({
        where: {
          organizationId: membership.organizationId,
          ...(projectId && projectId !== "All" ? { id: projectId } : {}),
        },
        select: { id: true },
      });

      const projectIds = projects.map((project) => project.id);
      if (projectId && projectId !== "All" && projectIds.length === 0) {
        return NextResponse.json({ success: false, error: "Project not found or access denied" }, { status: 404 });
      }

      // Execute each funnel via PostgreSQL engine
      const results = [];
      for (const funnel of funnels) {
        const result = await executePostgreSqlFunnel(
          tx,
          projectIds,
          funnel.steps,
          dateBounds.start,
          dateBounds.endExclusive,
          conversionWindowDays,
        );

        results.push({
          id: funnel.id,
          name: funnel.name,
          ...result,
        });
      }

      let bestPerformingFunnel: (typeof results)[0] | null = null;
      for (const result of results) {
        if (!bestPerformingFunnel || result.overallConversionRate > bestPerformingFunnel.overallConversionRate) {
          bestPerformingFunnel = result;
        }
      }

      return NextResponse.json({
        success: true,
        results,
        bestPerformingFunnel,
        range,
        conversionWindowDays,
      });
    });
  } catch (error) {
    console.error("Multi-funnel API error:", error);
    return NextResponse.json({ success: false, error: "Failed to compare conversion funnels" }, { status: 500 });
  }
});
